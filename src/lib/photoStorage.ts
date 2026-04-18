/**
 * IndexedDB wrapper for photo blob storage.
 * 메타데이터는 localStorage(Zustand) 관리, 여기는 이미지 Blob만 저장.
 */

const DB_NAME = "upnext_photos";
const DB_VERSION = 1;
const STORE_NAME = "photos";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function withStore(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<unknown> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

// === 키 형식: "{photoId}_{type}" ===
// type: "photo" | "thumbnail" | "signature"

export async function savePhotoBlobs(
  id: string,
  photo: Blob,
  thumbnail: Blob,
  signature: Blob,
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.put(photo, `${id}_photo`);
  store.put(thumbnail, `${id}_thumbnail`);
  store.put(signature, `${id}_signature`);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getPhotoBlob(id: string): Promise<Blob | null> {
  return (await withStore("readonly", (s) => s.get(`${id}_photo`))) as Blob | null;
}

export async function getThumbnailBlob(id: string): Promise<Blob | null> {
  return (await withStore("readonly", (s) => s.get(`${id}_thumbnail`))) as Blob | null;
}

export async function getSignatureBlob(id: string): Promise<Blob | null> {
  return (await withStore("readonly", (s) => s.get(`${id}_signature`))) as Blob | null;
}

/** 단일 blob 갱신 — Edit 모드에서 signature 만 교체 시 사용 */
export async function updateSignatureBlob(id: string, signature: Blob): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.put(signature, `${id}_signature`);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function deletePhotoBlobs(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.delete(`${id}_photo`);
  store.delete(`${id}_thumbnail`);
  store.delete(`${id}_signature`);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * 로그아웃 시 전체 사진 blob wipe. IndexedDB 의 DB 자체를 delete.
 * Phase 11c R4 보안 수정 — 사용자 간 기기 공유 시 이전 유저 사진 노출 방지.
 */
export async function clearAllPhotoStorage(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve(); // best-effort
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

// === 이미지 압축 유틸 ===

/** dataURL → 리사이즈 + JPEG 압축 → Blob */
export function compressImage(
  dataUrl: string,
  maxWidth: number,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        quality,
      );
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/** dataURL(PNG) → Blob */
export function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then((r) => r.blob());
}

/** Blob → object URL (컴포넌트에서 <img src>용) */
export function blobToUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}
