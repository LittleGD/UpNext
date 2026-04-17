import { create } from "zustand";
import type { PhotoMeta, CapturePhase, Sticker } from "@/types/growth";
import { saveToStorage, loadFromStorage } from "@/lib/storage";
import {
  savePhotoBlobs,
  deletePhotoBlobs,
  compressImage,
  dataUrlToBlob,
  updateSignatureBlob,
} from "@/lib/photoStorage";

interface GrowthState {
  photoMetas: PhotoMeta[];
  isLoaded: boolean;

  // 캡처 플로우
  pendingCaptureCardId: string | null;
  capturePhase: CapturePhase;
}

interface GrowthActions {
  initialize: () => void;

  // 캡처 플로우
  startCapture: (cardId: string) => void;
  setCapturePhase: (phase: CapturePhase) => void;
  savePhoto: (
    imageDataUrl: string,
    signatureDataUrl: string,
    memo: string,
    challengeTitle: string,
    category: import("@/types/card").Category,
    stickers?: Sticker[],
  ) => Promise<PhotoMeta | null>;
  skipCapture: () => void;
  cancelCapture: () => void;

  // 편집
  updatePhotoSignature: (photoId: string, signatureDataUrl: string) => Promise<void>;
  updatePhotoMemo: (photoId: string, memo: string) => void;
  updatePhotoStickers: (photoId: string, stickers: Sticker[]) => void;

  // 관리
  deletePhoto: (photoId: string) => void;
}

type GrowthStore = GrowthState & GrowthActions;

const STORAGE_KEY = "growth";

export const useGrowthStore = create<GrowthStore>((set, get) => ({
  photoMetas: [],
  isLoaded: false,
  pendingCaptureCardId: null,
  capturePhase: "idle",

  initialize() {
    const saved = loadFromStorage<{ photoMetas: PhotoMeta[] }>(STORAGE_KEY);
    set({
      photoMetas: saved?.photoMetas ?? [],
      isLoaded: true,
    });
  },

  startCapture(cardId) {
    set({ pendingCaptureCardId: cardId, capturePhase: "camera" });
  },

  setCapturePhase(phase) {
    set({ capturePhase: phase });
  },

  async savePhoto(imageDataUrl, signatureDataUrl, memo, challengeTitle, category, stickers) {
    const { pendingCaptureCardId, photoMetas } = get();
    if (!pendingCaptureCardId) return null;

    set({ capturePhase: "saving" });

    const now = Date.now();
    const d = new Date(now);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const id = `vp_${dateStr}_${pendingCaptureCardId}_${now}`;

    // 이미지 압축
    const [photoBlob, thumbnailBlob, signatureBlob] = await Promise.all([
      compressImage(imageDataUrl, 800, 0.7),
      compressImage(imageDataUrl, 150, 0.5),
      dataUrlToBlob(signatureDataUrl),
    ]);

    // IndexedDB에 Blob 저장
    await savePhotoBlobs(id, photoBlob, thumbnailBlob, signatureBlob);

    // 메타 생성
    const meta: PhotoMeta = {
      id,
      challengeCardId: pendingCaptureCardId,
      challengeTitle,
      category,
      date: dateStr,
      timestamp: now,
      memo: memo.slice(0, 200),
      stickers: stickers && stickers.length > 0 ? stickers : undefined,
    };

    const updatedMetas = [meta, ...photoMetas];
    set({
      photoMetas: updatedMetas,
      pendingCaptureCardId: null,
      capturePhase: "idle",
    });

    saveToStorage(STORAGE_KEY, { photoMetas: updatedMetas });
    return meta;
  },

  skipCapture() {
    set({ pendingCaptureCardId: null, capturePhase: "idle" });
  },

  cancelCapture() {
    set({ pendingCaptureCardId: null, capturePhase: "idle" });
  },

  async updatePhotoSignature(photoId, signatureDataUrl) {
    // 사인 만 교체 (사진/메타는 그대로). Edit 모드에서 사용.
    const signatureBlob = await dataUrlToBlob(signatureDataUrl);
    await updateSignatureBlob(photoId, signatureBlob);
    // photoMetas 자체는 변하지 않으므로 store 업데이트 불필요.
    // signatureUrl 캐시만 PhotoDetailModal 에서 다시 fetch 하면 됨.
  },

  updatePhotoMemo(photoId, memo) {
    const updated = get().photoMetas.map((m) =>
      m.id === photoId ? { ...m, memo: memo.slice(0, 200) } : m,
    );
    set({ photoMetas: updated });
    saveToStorage(STORAGE_KEY, { photoMetas: updated });
  },

  updatePhotoStickers(photoId, stickers) {
    const updated = get().photoMetas.map((m) =>
      m.id === photoId ? { ...m, stickers: stickers.length > 0 ? stickers : undefined } : m,
    );
    set({ photoMetas: updated });
    saveToStorage(STORAGE_KEY, { photoMetas: updated });
  },

  deletePhoto(photoId) {
    const updated = get().photoMetas.filter((m) => m.id !== photoId);
    set({ photoMetas: updated });
    saveToStorage(STORAGE_KEY, { photoMetas: updated });
    deletePhotoBlobs(photoId).catch(() => {});
  },
}));
