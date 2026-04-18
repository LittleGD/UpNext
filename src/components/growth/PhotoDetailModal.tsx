"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { getPhotoBlob, getSignatureBlob, blobToUrl } from "@/lib/photoStorage";
import { useTranslation } from "@/hooks/useTranslation";
import { useGrowthStore } from "@/store/useGrowthStore";
import { useSound } from "@/hooks/useSound";
import { compositePolaroid, sharePolaroid } from "@/lib/polaroidComposite";
import PolaroidFrame from "./PolaroidFrame";
import PolaroidFlip from "./PolaroidFlip";
import PolaroidTilt from "./PolaroidTilt";
import MemoEditor from "./MemoEditor";
import SignatureCanvas from "./SignatureCanvas";
import StickerLayer from "./StickerLayer";
import DecorationToolbar, { INK_COLORS } from "./DecorationToolbar";
import PixelIcon from "@/components/icons/PixelIcon";
import type { PhotoMeta, Sticker } from "@/types/growth";

interface Props {
  meta: PhotoMeta;
  onClose: () => void;
}

/**
 * PhotoDetailModal — 앨범에서 사진 탭 시 / Capture Done 직후에 표시되는 디테일 뷰.
 *
 * 구조:
 *   - 챌린지 제목/날짜 (상단)
 *   - 폴라로이드 (PolaroidTilt + PolaroidFlip — drag/click 으로 앞뒤 전환)
 *   - 플립 버튼 (Memo / Photo) — PolaroidTilt 밖, 별도 영역 (틸트 영향 X)
 *   - 액션 버튼 (Edit / Share / Close)
 *
 * 메모: 뒷면이 보이는 동안 자동 편집 가능 (debounced auto-save).
 * Edit 모드: 사인 캔버스 + 스티커 + 툴바를 다시 활성화.
 * Share: 폴라로이드 + 사인 + 스티커를 합성해 PNG 로 Web Share API.
 *
 * z-index 60 — 페이지 상단 헤더(z-50)보다 위에 위치.
 */
export default function PhotoDetailModal({ meta, onClose }: Props) {
  const { t } = useTranslation();
  const { play } = useSound();
  const updatePhotoSignature = useGrowthStore((s) => s.updatePhotoSignature);
  const updatePhotoMemo = useGrowthStore((s) => s.updatePhotoMemo);
  const updatePhotoStickers = useGrowthStore((s) => s.updatePhotoStickers);
  const deletePhoto = useGrowthStore((s) => s.deletePhoto);
  // Phase 13 review Critical #1 — 사진 삭제 확인 다이얼로그 state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedSignature, setEditedSignature] = useState<string | null>(null);
  const [editedStickers, setEditedStickers] = useState<Sticker[]>(meta.stickers ?? []);
  const [editPenColor, setEditPenColor] = useState<string>(INK_COLORS[0]);
  const [editPenWidth, setEditPenWidth] = useState<number>(1.0);
  const [isSharing, setIsSharing] = useState(false);

  // 메모 — 뒷면에서 편집 가능 (debounced auto-save)
  const [memoDraft, setMemoDraft] = useState(meta.memo);
  const memoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setMemoDraft(meta.memo);
  }, [meta.memo]);
  const handleMemoChange = useCallback(
    (value: string) => {
      setMemoDraft(value);
      if (memoSaveTimer.current) clearTimeout(memoSaveTimer.current);
      memoSaveTimer.current = setTimeout(() => {
        updatePhotoMemo(meta.id, value);
      }, 600); // debounce 600ms
    },
    [meta.id, updatePhotoMemo],
  );
  // Unmount 시 pending save flush
  useEffect(() => {
    return () => {
      if (memoSaveTimer.current) {
        clearTimeout(memoSaveTimer.current);
        // 마지막 입력 즉시 저장 (cleanup)
      }
    };
  }, []);

  // Stickers — 뷰잉 모드에서도 직접 drag 가능
  const [stickers, setStickers] = useState<Sticker[]>(meta.stickers ?? []);
  useEffect(() => {
    setStickers(meta.stickers ?? []);
  }, [meta.stickers]);
  const handleStickersChange = useCallback(
    (next: Sticker[]) => {
      setStickers(next);
      updatePhotoStickers(meta.id, next);
    },
    [meta.id, updatePhotoStickers],
  );

  // Blob/URL 로드 — sigVersion 으로 Edit 후 다시 fetch 트리거
  const [sigVersion, setSigVersion] = useState(0);
  useEffect(() => {
    const urls: string[] = [];
    Promise.all([getPhotoBlob(meta.id), getSignatureBlob(meta.id)]).then(([photo, sig]) => {
      if (photo) {
        setPhotoBlob(photo);
        const u = blobToUrl(photo);
        urls.push(u);
        setPhotoUrl(u);
      }
      if (sig) {
        setSignatureBlob(sig);
        const u = blobToUrl(sig);
        urls.push(u);
        setSignatureUrl(u);
      }
    });
    return () => urls.forEach(URL.revokeObjectURL);
  }, [meta.id, sigVersion]);

  // ── Edit 모드 ──
  const handleEdit = useCallback(() => {
    play("select");
    setEditedSignature(null);
    setEditedStickers(stickers);
    setIsFlipped(false); // Edit 은 앞면에서만
    setIsEditing(true);
  }, [play, stickers]);

  const handleEditCancel = useCallback(() => {
    play("select");
    setIsEditing(false);
    setEditedSignature(null);
    setEditedStickers(stickers);
  }, [play, stickers]);

  const handleEditSave = useCallback(async () => {
    play("collect");
    if (editedSignature) {
      await updatePhotoSignature(meta.id, editedSignature);
      setSigVersion((v) => v + 1);
    }
    if (editedStickers !== stickers) {
      handleStickersChange(editedStickers);
    }
    setIsEditing(false);
    setEditedSignature(null);
  }, [editedSignature, editedStickers, stickers, meta.id, updatePhotoSignature, handleStickersChange, play]);

  const handleAddSticker = useCallback(
    (type: "emoji" | "image", content: string, position?: { x: number; y: number }) => {
      setEditedStickers((prev) => [
        ...prev,
        {
          id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          type,
          content,
          x: position?.x ?? 50,
          y: position?.y ?? 50,
          rotation: (Math.random() - 0.5) * 20,
          scale: 1,
          zIndex: content === "upnext-logo" ? 999 : prev.length + 1,
        },
      ]);
    },
    [],
  );

  // ── Share — 합성 후 Web Share API ──
  const handleShare = useCallback(async () => {
    if (!photoBlob || isSharing) return;
    setIsSharing(true);
    play("select");
    try {
      const blob = await compositePolaroid({
        photoBlob,
        signatureBlob,
        timestamp: meta.timestamp,
      });
      await sharePolaroid(blob, `polaroid-${meta.date}.png`);
    } catch (err) {
      console.error("[PhotoDetailModal] share failed", err);
    } finally {
      setIsSharing(false);
    }
  }, [photoBlob, signatureBlob, meta.timestamp, meta.date, isSharing, play]);

  // 마운트 후에만 portal 렌더 — SSR safe
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!photoUrl || !mounted) return null;

  // ⚠ Portal 로 document.body 에 직접 마운트 — 페이지 헤더 (sticky z-10) 가 만든
  // stacking context 를 escape 해야 backdrop 이 헤더 위로 올라감.
  // 로컬 마운트 시 modal 이 main 컨테이너의 stacking context 안에 갇혀서 z:60 이어도
  // 헤더가 위로 비치는 버그를 막음.
  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md px-4 py-8 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 40, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 40, opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", duration: 0.5, bounce: 0.18 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[320px] flex flex-col gap-3"
        >
          {/* 챌린지 제목 + 날짜 (상단) */}
          <div className="text-center">
            <h2 className="typo-body text-text-primary">{meta.challengeTitle}</h2>
            <p className="typo-micro text-text-tertiary tabular-nums mt-0.5">{meta.date}</p>
          </div>

          {/* ── 편집 모드 ── */}
          {isEditing ? (
            <>
              {/* data-sticker-target — DecorationToolbar drag-drop 대상 */}
              <div
                className="w-full max-w-[300px] mx-auto relative"
                data-sticker-target
              >
                <PolaroidFrame imageSrc={photoUrl} timestamp={meta.timestamp} />
                <div className="absolute inset-0 z-[5]">
                  <SignatureCanvas
                    width={300}
                    height={363}
                    initialDataUrl={signatureUrl}
                    inkColor={editPenColor}
                    widthMultiplier={editPenWidth}
                    onSignatureChange={setEditedSignature}
                    className="w-full h-full"
                  />
                </div>
                <StickerLayer
                  stickers={editedStickers}
                  editable
                  onChange={setEditedStickers}
                  className="z-10"
                />
              </div>
              <DecorationToolbar
                selectedColor={editPenColor}
                onColorChange={setEditPenColor}
                selectedWidth={editPenWidth}
                onWidthChange={setEditPenWidth}
                onAddSticker={handleAddSticker}
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleEditCancel}
                  data-no-flip
                  className="flex-1 py-3 rounded-xl bg-bg-elevated text-text-secondary typo-body active:scale-[0.97] transition-transform"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleEditSave}
                  data-no-flip
                  className="flex-1 py-3 rounded-xl bg-accent text-bg-primary typo-body active:scale-[0.97] transition-transform"
                >
                  {t("common.done")}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* ── 뷰잉 모드 ──
                  PolaroidTilt 안에 PolaroidFlip 만 둠. 플립 버튼 / 액션 버튼은 밖에 배치 —
                  틸트 회전이 버튼에 영향 안 주도록. */}
              <PolaroidTilt autoHint>
                <PolaroidFlip
                  flipped={isFlipped}
                  onFlip={setIsFlipped}
                  front={
                    <div className="relative">
                      <PolaroidFrame imageSrc={photoUrl} timestamp={meta.timestamp} />
                      {signatureUrl && (
                        <img
                          src={signatureUrl}
                          alt=""
                          className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[5]"
                          draggable={false}
                        />
                      )}
                      {/* 스티커 오버레이 — 뷰잉 모드는 read-only.
                          Edit 모드에서만 드래그/변형 가능. 사진 둘러보다 실수로 옮기는 것 방지. */}
                      <StickerLayer
                        stickers={stickers}
                        className="z-10"
                      />
                    </div>
                  }
                  back={
                    // ⚠ 의도적으로 data-no-tilt/no-flip 안 붙임.
                    // textarea 자체는 PolaroidTilt/Flip 의 selector ("textarea, ...")
                    // 로 자동 차단됨 → margin 영역 (textarea 밖 = 폴라로이드 frame edge)
                    // 에서는 tilt/flip 정상 동작 → 사진 둘러보며 sticker 같이 자연스러움.
                    <MemoEditor value={memoDraft} onChange={handleMemoChange} />
                  }
                />
              </PolaroidTilt>

              {/* 플립 버튼 — PolaroidTilt 밖. 클릭으로도 플립 가능 (드래그 외) */}
              <div className="flex justify-center">
                <button
                  onClick={() => { play("select"); setIsFlipped((v) => !v); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-elevated text-text-secondary typo-caption active:scale-95 transition-transform"
                  aria-label={isFlipped ? "Show photo" : "Show memo"}
                >
                  <PixelIcon name="Redo" size={12} color="currentColor" />
                  <span>{isFlipped ? "Photo" : "Memo"}</span>
                </button>
              </div>

              {/* 액션 영역 — Edit / Share / Close (모두 동일 너비로 시각 대칭 확보) */}
              <div className="flex items-center justify-center gap-2 mt-1">
                <button
                  onClick={handleEdit}
                  className="flex items-center justify-center gap-1.5 min-w-[86px] px-4 py-2.5 rounded-full bg-bg-elevated text-text-secondary typo-caption active:scale-95 transition-transform"
                  aria-label="Edit"
                >
                  <PixelIcon name="PenSquare" size={12} color="currentColor" />
                  <span>Edit</span>
                </button>
                <button
                  onClick={handleShare}
                  disabled={isSharing}
                  className="flex items-center justify-center gap-1.5 min-w-[86px] px-4 py-2.5 rounded-full bg-bg-elevated text-text-secondary typo-caption active:scale-95 transition-transform disabled:opacity-50"
                  aria-label="Share"
                >
                  <PixelIcon name="Send" size={12} color="currentColor" />
                  <span>{isSharing ? "..." : "Share"}</span>
                </button>
                <button
                  onClick={() => {
                    play("select");
                    setShowDeleteConfirm(true);
                  }}
                  className="flex items-center justify-center gap-1.5 min-w-[86px] px-4 py-2.5 rounded-full bg-bg-elevated typo-caption active:scale-95 transition-transform"
                  style={{ color: "#e88b7a" }}
                  aria-label="Delete photo"
                >
                  <PixelIcon name="Trash" size={12} color="#e88b7a" />
                  <span>Delete</span>
                </button>
                <button
                  onClick={onClose}
                  className="flex items-center justify-center gap-1.5 min-w-[86px] px-4 py-2.5 rounded-full bg-bg-elevated text-text-secondary typo-caption active:scale-95 transition-transform"
                  aria-label="Close"
                >
                  <PixelIcon name="Cancel" size={12} color="currentColor" />
                  <span>Close</span>
                </button>
              </div>
            </>
          )}

          {/* Phase 13 review Critical #1 — 사진 삭제 확인 다이얼로그.
                 확인 시 deletePhoto → IndexedDB blob + metadata 정리 후 모달 close.
                 `isPhotoBound` 체크는 UI 레이어 밖 (부적 바인딩된 사진은
                 useGrowthStore.deletePhoto 내부에서 처리).
                 modal-in-modal 간단 렌더 — GbConfirm 포팅 대신 inline. */}
          {showDeleteConfirm && (
            <div
              className="fixed inset-0 flex items-center justify-center z-[70]"
              style={{ background: "rgba(0, 0, 0, 0.7)" }}
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowDeleteConfirm(false);
              }}
            >
              <div
                className="mx-4 p-5 rounded-xl max-w-sm"
                style={{ background: "#1a1f1f", border: "1px solid #e88b7a" }}
              >
                <div
                  className="typo-body mb-2"
                  style={{ color: "#e88b7a", fontWeight: 600 }}
                >
                  사진을 삭제할까요?
                </div>
                <div
                  className="typo-caption mb-4"
                  style={{ color: "rgba(255,255,255,0.7)" }}
                >
                  복구할 수 없어요. 바인딩된 부적도 함께 정리됩니다.
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="typo-caption px-4 py-2 rounded active:scale-95 transition-transform"
                    style={{
                      background: "transparent",
                      color: "rgba(255,255,255,0.7)",
                      border: "1px solid rgba(255,255,255,0.2)",
                    }}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      play("cancel");
                      deletePhoto(meta.id);
                      setShowDeleteConfirm(false);
                      onClose();
                    }}
                    className="typo-caption px-4 py-2 rounded active:scale-95 transition-transform"
                    style={{
                      background: "#e88b7a",
                      color: "#000",
                      border: "1px solid #e88b7a",
                      fontWeight: 600,
                    }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
