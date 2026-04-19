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
        // 유저 피드백 (iOS Safari) — tx.onabort 미처리 시 quota / private mode
        //   에서 promise 가 영영 settle 안 됨 → savePhoto 가 hang → 모달 stuck.
        tx.onabort = () => reject(tx.error ?? new Error("IndexedDB tx aborted"));
        tx.oncomplete = () => db.close();
      }),
  );
}

/**
 * dataURL → Uint8Array (synchronous, iOS Safari 친화).
 *
 * 유저 피드백 (iOS Safari) — `fetch(dataUrl)` 는 iOS 15-16 에서 큰 dataURL
 *   (>5MB) 에 대해 가끔 빈 Blob 반환 + private mode 에서 throw.
 *   동기 atob 로 변환하면 fetch 우회 + 메모리 효율성 ↑ (1회 alloc).
 */
function dataUrlToBytes(dataUrl: string): { buffer: ArrayBuffer; mimeType: string } {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx < 0) throw new Error("Invalid dataURL: no comma");
  const header = dataUrl.slice(0, commaIdx);
  const body = dataUrl.slice(commaIdx + 1);
  const mimeMatch = /data:([^;]+)/.exec(header);
  const mimeType = mimeMatch?.[1] ?? "application/octet-stream";
  const isBase64 = /;base64/i.test(header);
  // ArrayBuffer 직접 반환 — Blob([buffer]) 는 항상 ArrayBuffer 받음.
  //   Uint8Array 반환 시 TS 가 ArrayBufferLike 로 widen 해 Blob constructor
  //   거부함 (SharedArrayBuffer 가능성).
  const source = isBase64 ? atob(body) : decodeURIComponent(body);
  const buffer = new ArrayBuffer(source.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < source.length; i++) bytes[i] = source.charCodeAt(i);
  return { buffer, mimeType };
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
    // 유저 피드백 (iOS Safari) — quota 초과 / private mode 시 onabort 발생.
    //   미처리 시 promise 영영 settle 안 됨 → savePhoto hang → 모달 stuck.
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("savePhotoBlobs aborted")); };
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
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("updateSignatureBlob aborted")); };
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
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("deletePhotoBlobs aborted")); };
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

/**
 * dataURL → 리사이즈 + JPEG 압축 → Blob.
 *
 * Phase 13 review — 성능 개선. 이전엔 `Image.src = dataUrl` 로 디코드 →
 *   큰 원본 (10MB+) 에서 OOM + 메인 스레드 블로킹. 이제 `createImageBitmap`
 *   우선 사용 (off-thread decode + resize option 제공).
 *   미지원 브라우저는 `Image` fallback 유지.
 *
 *   추가 안전장치: `resizeQuality: "high"` + JPEG output 에 흰 배경 fill
 *   (alpha 채널이 있는 PNG 가 JPEG 로 변환되면 검은색 filler 되는 문제 방지).
 */
export async function compressImage(
  dataUrl: string,
  maxWidth: number,
  quality: number,
): Promise<Blob> {
  // 유저 피드백 (iOS Safari) — `fetch(dataUrl)` 가 큰 dataURL 에서 빈 Blob
  //   반환 / private mode throw → createImageBitmap 이 받자마자 InvalidStateError
  //   → savePhoto reject → 모달 stuck. 동기 atob 변환으로 우회.
  const { buffer, mimeType } = dataUrlToBytes(dataUrl);
  const srcBlob = new Blob([buffer], { type: mimeType });

  let bitmap: ImageBitmap | null = null;
  try {
    if (typeof createImageBitmap === "function") {
      // createImageBitmap 은 off-thread decode 지원. resizeWidth 옵션으로
      //   브라우저 native downscale (고품질 lanczos-like).
      try {
        bitmap = await createImageBitmap(srcBlob, {
          resizeWidth: maxWidth,
          resizeQuality: "high",
        });
      } catch {
        // 옵션 미지원 구형 브라우저 fallback (iOS Safari < 16.4).
        try {
          bitmap = await createImageBitmap(srcBlob);
        } catch {
          // createImageBitmap 자체 실패 — Image fallback 으로 떨어짐.
          bitmap = null;
        }
      }
    }

    if (bitmap) {
      const scale = Math.min(1, maxWidth / bitmap.width);
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context not available");
      // alpha → JPEG 변환 시 검은색 방지 (흰 배경 먼저).
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
          "image/jpeg",
          quality,
        );
      });
    }

    // Fallback — createImageBitmap 미지원. 기존 Image 방식.
    return await new Promise<Blob>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context not available"));
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
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
  } finally {
    // ImageBitmap 메모리 해제 (브라우저 GC 전에 명시적 close).
    bitmap?.close();
  }
}

/**
 * dataURL(PNG) → Blob.
 *
 * 유저 피드백 (iOS Safari) — `fetch(dataUrl)` 가 일부 iOS 환경에서 빈 Blob
 *   반환 / 비동기 hang. 동기 atob 로 변환 후 Promise wrap → API 호환 유지.
 */
export function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  try {
    const { buffer, mimeType } = dataUrlToBytes(dataUrl);
    return Promise.resolve(new Blob([buffer], { type: mimeType }));
  } catch (e) {
    return Promise.reject(e);
  }
}

/** Blob → object URL (컴포넌트에서 <img src>용) */
export function blobToUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}
