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

/**
 * Phase 13 review Critical #3 — photoMetas localStorage cap.
 *   사진 자체는 IndexedDB 에 blob 으로 저장되고 metadata 만 localStorage 에
 *   들어가지만, 1 년 이상 사용자의 metadata 배열이 수백 entry 넘어가면
 *   `saveToStorage` 호출마다 대형 JSON serialization → 성능 ↓.
 *   가장 오래된 사진의 blob 도 함께 정리.
 */
export const PHOTO_METAS_CAP = 500;

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
    // Phase 13 review C#3 — legacy 사용자 초과분 절삭 + blob 정리.
    //   idempotent. cap 이하면 변화 없음.
    let photoMetas = saved?.photoMetas ?? [];
    if (photoMetas.length > PHOTO_METAS_CAP) {
      const dropped = photoMetas.slice(PHOTO_METAS_CAP);
      photoMetas = photoMetas.slice(0, PHOTO_METAS_CAP);
      for (const d of dropped) {
        deletePhotoBlobs(d.id).catch(() => {});
      }
      saveToStorage(STORAGE_KEY, { photoMetas });
    }
    set({ photoMetas, isLoaded: true });
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

    // Phase 13 review C#3 — ring-buffer cap. 최신 500 장만 유지.
    //   오버된 오래된 entry 의 IndexedDB blob 도 같이 정리 (fire-and-forget;
    //   실패해도 meta 삭제 우선).
    let updatedMetas = [meta, ...photoMetas];
    if (updatedMetas.length > PHOTO_METAS_CAP) {
      const dropped = updatedMetas.slice(PHOTO_METAS_CAP);
      updatedMetas = updatedMetas.slice(0, PHOTO_METAS_CAP);
      for (const d of dropped) {
        deletePhotoBlobs(d.id).catch(() => {});
      }
    }
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

    // Phase 13 review Critical — photo 삭제 시 UpHero 쪽 orphan cascade 정리.
    //   이 photo 를 photoId 로 바인딩한 equipment (사진 부적) 들은 삭제된 photo
    //   블롭을 참조해 썸네일 로드 실패 + 스킬 계속 발동 상태가 됨.
    //   inventory 에서 필터 + equipped slot 에서 unequip.
    //   dynamic import 로 circular ref 회피 (useGrowthStore.ts ← useUpHeroStore.ts
    //   의존이 이미 있으므로 반대 방향은 runtime require).
    import("./useUpHeroStore")
      .then((mod) => {
        const s = mod.useUpHeroStore.getState();
        // inventory 에서 해당 photoId 참조 장비 제거.
        const filteredInv = s.inventory.filter((eq) => eq.photoId !== photoId);
        // equipped 에서 해당 photoId 슬롯 해제 (talisman 이 일반적이지만 안전히
        //   모든 슬롯 스캔).
        const newEquipped = { ...s.hero.equipped };
        let anyUnequipped = false;
        for (const slot of Object.keys(newEquipped) as Array<
          keyof typeof newEquipped
        >) {
          if (newEquipped[slot]?.photoId === photoId) {
            delete newEquipped[slot];
            anyUnequipped = true;
          }
        }
        const invChanged = filteredInv.length !== s.inventory.length;
        if (!invChanged && !anyUnequipped) return;
        mod.useUpHeroStore.setState({
          inventory: filteredInv,
          hero: anyUnequipped
            ? { ...s.hero, equipped: newEquipped }
            : s.hero,
        });
        // Persist pickPersisted 가 필요하지만 setState 후 useUpHeroStore 의
        //   internal save hook 이 없어서 수동 save. 여기선 간단히 saveToStorage
        //   직접 호출은 안 하고 다음 action 이 저장하도록 맡김 (idempotent).
      })
      .catch(() => {});
  },
}));
