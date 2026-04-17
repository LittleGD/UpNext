import { create } from "zustand";
import type { PhotoMeta, CapturePhase, TreePosition } from "@/types/growth";
import { getTreeStage } from "@/types/growth";
import { saveToStorage, loadFromStorage } from "@/lib/storage";
import {
  savePhotoBlobs,
  deletePhotoBlobs,
  compressImage,
  dataUrlToBlob,
  updateSignatureBlob,
} from "@/lib/photoStorage";
import { useGameStore } from "./useGameStore";

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
  ) => Promise<void>;
  skipCapture: () => void;
  cancelCapture: () => void;

  // 편집
  updatePhotoSignature: (photoId: string, signatureDataUrl: string) => Promise<void>;

  // 관리
  deletePhoto: (photoId: string) => void;
}

type GrowthStore = GrowthState & GrowthActions;

const STORAGE_KEY = "growth";

/** 다음 빈 나무 위치 계산 */
function nextTreePosition(metas: PhotoMeta[]): TreePosition {
  // 가지별 슬롯 수: 가지 0부터 순서대로 채움
  const filled = new Map<number, number>();
  for (const m of metas) {
    if (m.treePosition) {
      const count = filled.get(m.treePosition.branchIndex) ?? 0;
      filled.set(m.treePosition.branchIndex, count + 1);
    }
  }

  // 가장 적게 채워진 가지 찾기, 없으면 새 가지
  const stage = getTreeStage(metas.length);
  const maxBranches =
    stage === "seed" ? 1
    : stage === "sprout" ? 2
    : stage === "sapling" ? 4
    : stage === "young" ? 6
    : stage === "mature" ? 8
    : 10;

  let minBranch = 0;
  let minCount = Infinity;
  for (let b = 0; b < maxBranches; b++) {
    const count = filled.get(b) ?? 0;
    if (count < minCount) {
      minCount = count;
      minBranch = b;
    }
  }

  return { branchIndex: minBranch, slot: filled.get(minBranch) ?? 0 };
}

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

  async savePhoto(imageDataUrl, signatureDataUrl, memo, challengeTitle, category) {
    const { pendingCaptureCardId, photoMetas } = get();
    if (!pendingCaptureCardId) return;

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
    const treePosition = nextTreePosition(photoMetas);
    const meta: PhotoMeta = {
      id,
      challengeCardId: pendingCaptureCardId,
      challengeTitle,
      category,
      date: dateStr,
      timestamp: now,
      memo: memo.slice(0, 200),
      treePosition,
    };

    const updatedMetas = [meta, ...photoMetas];
    set({
      photoMetas: updatedMetas,
      pendingCaptureCardId: null,
      capturePhase: "idle",
    });

    saveToStorage(STORAGE_KEY, { photoMetas: updatedMetas });
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

  deletePhoto(photoId) {
    const updated = get().photoMetas.filter((m) => m.id !== photoId);
    set({ photoMetas: updated });
    saveToStorage(STORAGE_KEY, { photoMetas: updated });
    deletePhotoBlobs(photoId).catch(() => {});
  },
}));
