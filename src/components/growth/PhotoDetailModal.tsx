"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { getPhotoBlob, getSignatureBlob, blobToUrl } from "@/lib/photoStorage";
import { useTranslation } from "@/hooks/useTranslation";
import { useGrowthStore } from "@/store/useGrowthStore";
import { ALL_CARDS } from "@/data/cards";
import { cardTitle } from "@/i18n";
import { useSound } from "@/hooks/useSound";
import { useModalA11y } from "@/hooks/useModalA11y";
import { compositePolaroid, sharePolaroid } from "@/lib/polaroidComposite";
import PolaroidFrame from "./PolaroidFrame";
import PolaroidFlip from "./PolaroidFlip";
import PolaroidTilt from "./PolaroidTilt";
import MemoEditor from "./MemoEditor";
import KeyboardAccessoryBar from "@/components/common/KeyboardAccessoryBar";
import SignatureCanvas from "./SignatureCanvas";
import StickerLayer from "./StickerLayer";
import DecorationToolbar, { INK_COLORS } from "./DecorationToolbar";
import PixelIcon from "@/components/icons/PixelIcon";
import GbConfirm from "@/components/uphero/GbConfirm";
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
  const { t, language } = useTranslation();
  const { play } = useSound();
  const updatePhotoSignature = useGrowthStore((s) => s.updatePhotoSignature);
  const updatePhotoMemo = useGrowthStore((s) => s.updatePhotoMemo);
  const updatePhotoStickers = useGrowthStore((s) => s.updatePhotoStickers);
  const deletePhoto = useGrowthStore((s) => s.deletePhoto);
  // Phase 13 review Critical #1 — 사진 삭제 확인 다이얼로그 state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Modal a11y — Esc 닫기 / focus trap / scroll lock / focus restore.
  //   showDeleteConfirm 이 열려있을 때는 Esc/trap 을 sub-dialog 에 양보.
  const containerRef = useRef<HTMLDivElement>(null);
  useModalA11y(containerRef, onClose, { disabled: showDeleteConfirm });

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
  // 유저 피드백 #4 — Edit 모드 지우개 토글.
  const [editEraseMode, setEditEraseMode] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  // 유저 피드백 #6 — 공유 결과 토스트. success / saved (download fallback) /
  //   cancelled / failed 4종. 2s 후 자동 해제.
  const [shareToast, setShareToast] = useState<
    { kind: "success" | "saved" | "cancelled" | "failed"; msg: string } | null
  >(null);
  const shareToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showShareToast = useCallback(
    (kind: "success" | "saved" | "cancelled" | "failed", msg: string) => {
      if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
      setShareToast({ kind, msg });
      shareToastTimerRef.current = setTimeout(() => setShareToast(null), 2000);
    },
    [],
  );
  useEffect(() => () => {
    if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
  }, []);

  // 메모 — 뒷면에서 편집 가능 (debounced auto-save)
  const [memoDraft, setMemoDraft] = useState(meta.memo);
  const memoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 메모 focus 상태 — 폴라로이드 tilt/gyro 비활성화 + accessory bar 노출 트리거.
  const [memoFocused, setMemoFocused] = useState(false);
  // focus 진입 시점의 값을 스냅샷 — "취소" 누르면 여기로 rollback.
  const memoFocusSnapshotRef = useRef("");
  const memoTextareaRef = useRef<HTMLTextAreaElement>(null);
  // Phase 13 review Critical — unmount cleanup 시 pending draft 가 있으면
  //   즉시 flush. 이전엔 clearTimeout 만 해서 600ms 내 close 하면 최신 입력
  //   유실. ref 로 최신 draft / photoId 추적.
  const memoDraftRef = useRef(memoDraft);
  memoDraftRef.current = memoDraft;
  const memoPhotoIdRef = useRef(meta.id);
  memoPhotoIdRef.current = meta.id;
  const memoOriginalRef = useRef(meta.memo);
  useEffect(() => {
    setMemoDraft(meta.memo);
    memoOriginalRef.current = meta.memo;
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
  // Unmount 시 pending save flush — 최신 draft 를 즉시 저장.
  useEffect(() => {
    return () => {
      if (memoSaveTimer.current) {
        clearTimeout(memoSaveTimer.current);
        const latest = memoDraftRef.current;
        if (latest !== memoOriginalRef.current) {
          // debounce 대기 중이던 값이 원본과 다르면 즉시 저장.
          updatePhotoMemo(memoPhotoIdRef.current, latest);
        }
      }
    };
  }, [updatePhotoMemo]);

  // meta.challengeTitle 은 촬영 시점의 한국어 스냅샷이라 언어 전환해도 안 바뀜.
  //   challengeCardId 로 ALL_CARDS 다국어 title 조회. 카드가 없어진 경우 (legacy)
  //   는 challengeTitle 스냅샷으로 fallback.
  const displayTitle = useMemo(() => {
    const card = ALL_CARDS.find((c) => c.id === meta.challengeCardId);
    if (!card) return meta.challengeTitle;
    return cardTitle(card, language);
  }, [meta.challengeCardId, meta.challengeTitle, language]);

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
  //   Phase 13 review Critical — 공유 PNG 에 스티커 포함. 이전엔 뷰/썸네일에
  //   보이던 스티커가 공유 이미지에선 사라져 유저가 가장 공들인 데코가 유실됨.
  //   저장된 stickers (meta.stickers) 를 composite 에 전달.
  const handleShare = useCallback(async () => {
    if (!photoBlob || isSharing) return;
    setIsSharing(true);
    play("select");
    try {
      const blob = await compositePolaroid({
        photoBlob,
        signatureBlob,
        timestamp: meta.timestamp,
        stickers: meta.stickers,
      });
      // 유저 피드백 #6 — 공유 결과에 따라 토스트.
      //   - shared+share: "공유 완료"
      //   - shared+download: "이미지가 저장되었어요"
      //   - !shared+share (AbortError): "공유 취소"
      const result = await sharePolaroid(blob, `polaroid-${meta.date}.png`);
      if (result.shared) {
        if (result.method === "share") {
          showShareToast("success", t("photo.detail.share.success"));
        } else {
          showShareToast("saved", t("photo.detail.share.saved"));
        }
      } else {
        // 유저가 네이티브 share sheet 에서 취소
        showShareToast("cancelled", t("photo.detail.share.cancelled"));
      }
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[PhotoDetailModal] share failed", err);
      }
      showShareToast("failed", t("photo.detail.share.failed"));
    } finally {
      setIsSharing(false);
    }
  }, [
    photoBlob,
    signatureBlob,
    meta.timestamp,
    meta.stickers,
    meta.date,
    isSharing,
    play,
    t,
    showShareToast,
  ]);

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
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("photo.detail.ariaLabel")}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md px-4 py-8 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 40, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          // Phase 13 design review — exit 비대칭 가속 (rule #14).
          //   enter: spring ~500ms / exit: ease-in 180ms — 닫기는 결단력 있게.
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ type: "spring", duration: 0.5, bounce: 0.18 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[320px] flex flex-col gap-3"
        >
          {/* 챌린지 제목 + 날짜 (상단) */}
          <div className="text-center">
            <h2 className="typo-body text-text-primary">{displayTitle}</h2>
            <p className="typo-micro text-text-tertiary tabular-nums mt-0.5">{meta.date}</p>
          </div>

          {/* ── 편집 모드 ── */}
          {isEditing ? (
            <>
              {/* data-sticker-target — DecorationToolbar drag-drop 대상.
                   유저 피드백 #2 — overflow:hidden 으로 스티커가 폴라로이드 밖
                   으로 튀어나오지 않게 클립. */}
              <div
                className="w-full max-w-[300px] mx-auto relative"
                style={{ overflow: "hidden", borderRadius: 12 }}
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
                    eraseMode={editEraseMode}
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
                eraseMode={editEraseMode}
                onEraseToggle={setEditEraseMode}
                onAddSticker={handleAddSticker}
              />
              {/* 유저 피드백 #4 — 스티커 hint */}
              {editedStickers.length > 0 && (
                <div
                  className="typo-micro text-center"
                  style={{
                    color: "rgba(255, 255, 255, 0.5)",
                    letterSpacing: "0.01em",
                  }}
                >
                  {t("playground.capture.stickerHint")}
                </div>
              )}
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
              <PolaroidTilt autoHint enabled={!memoFocused}>
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
                    <MemoEditor
                      ref={memoTextareaRef}
                      value={memoDraft}
                      onChange={handleMemoChange}
                      onFocus={() => {
                        memoFocusSnapshotRef.current = memoDraft;
                        setMemoFocused(true);
                      }}
                      onBlur={() => setMemoFocused(false)}
                    />
                  }
                />
              </PolaroidTilt>

              {/* 플립 버튼 — PolaroidTilt 밖. 클릭으로도 플립 가능 (드래그 외) */}
              <div className="flex justify-center">
                <button
                  onClick={() => { play("select"); setIsFlipped((v) => !v); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-elevated text-text-secondary typo-caption active:scale-[0.97] transition-transform duration-160 ease-[cubic-bezier(0.23,1,0.32,1)]"
                  aria-label={t(
                    isFlipped
                      ? "photo.detail.flip.aria.toPhoto"
                      : "photo.detail.flip.aria.toMemo",
                  )}
                >
                  <PixelIcon name="Redo" size={12} color="currentColor" />
                  <span>
                    {t(
                      isFlipped
                        ? "photo.detail.flip.toPhoto"
                        : "photo.detail.flip.toMemo",
                    )}
                  </span>
                </button>
              </div>

              {/* 액션 영역 — Edit / Share / Delete / Close. Phase 13 review:
                   모바일 narrow viewport (360px) 에서도 4 버튼이 오버플로우
                   하지 않도록 gap-1.5 + min-w-[72px] 로 압축. */}
              <div className="flex items-center justify-center gap-1.5 mt-1">
                <button
                  onClick={handleEdit}
                  className="flex items-center justify-center gap-1 min-w-[72px] px-3 py-2.5 rounded-full bg-bg-elevated text-text-secondary typo-caption active:scale-[0.97] transition-transform duration-160 ease-[cubic-bezier(0.23,1,0.32,1)]"
                  aria-label={t("photo.detail.action.edit")}
                >
                  <PixelIcon name="PenSquare" size={12} color="currentColor" />
                  <span>{t("photo.detail.action.edit")}</span>
                </button>
                <button
                  onClick={handleShare}
                  disabled={isSharing}
                  aria-busy={isSharing}
                  className="flex items-center justify-center gap-1 min-w-[72px] px-3 py-2.5 rounded-full bg-bg-elevated text-text-secondary typo-caption active:scale-[0.97] transition-transform duration-160 ease-[cubic-bezier(0.23,1,0.32,1)] disabled:opacity-50"
                  aria-label={t("photo.detail.action.share")}
                >
                  <PixelIcon name="Send" size={12} color="currentColor" />
                  <span>
                    {isSharing
                      ? t("photo.detail.action.sharing")
                      : t("photo.detail.action.share")}
                  </span>
                </button>
                <button
                  onClick={() => {
                    play("select");
                    setShowDeleteConfirm(true);
                  }}
                  className="flex items-center justify-center gap-1 min-w-[72px] px-3 py-2.5 rounded-full bg-bg-elevated typo-caption active:scale-[0.97] transition-transform duration-160 ease-[cubic-bezier(0.23,1,0.32,1)]"
                  style={{ color: "#e88b7a" }}
                  aria-label={t("photo.detail.action.delete")}
                >
                  <PixelIcon name="Trash" size={12} color="#e88b7a" />
                  <span>{t("photo.detail.action.delete")}</span>
                </button>
                <button
                  onClick={onClose}
                  className="flex items-center justify-center gap-1 min-w-[72px] px-3 py-2.5 rounded-full bg-bg-elevated text-text-secondary typo-caption active:scale-[0.97] transition-transform duration-160 ease-[cubic-bezier(0.23,1,0.32,1)]"
                  aria-label={t("photo.detail.action.close")}
                >
                  <PixelIcon name="Cancel" size={12} color="currentColor" />
                  <span>{t("photo.detail.action.close")}</span>
                </button>
              </div>
            </>
          )}

          {/* Phase 13 review Critical — 삭제 확인은 GbConfirm (디자인 시스템 일관성
              + focus trap + ESC + a11y alertdialog 모두 내장). 기존 인라인 modal
              은 z-index race / focus 누락 / i18n 하드코딩 문제 다수. */}
          <GbConfirm
            open={showDeleteConfirm}
            danger
            title={t("photo.detail.deleteConfirm.title")}
            body={t("photo.detail.deleteConfirm.body")}
            confirmLabel={t("photo.detail.deleteConfirm.confirm")}
            cancelLabel={t("photo.detail.deleteConfirm.cancel")}
            onCancel={() => setShowDeleteConfirm(false)}
            onConfirm={() => {
              play("cancel");
              deletePhoto(meta.id);
              setShowDeleteConfirm(false);
              onClose();
            }}
          />
        </motion.div>
      </motion.div>
      {/* 유저 피드백 #6 — 공유 결과 토스트. 2초 auto-hide. aria-live=polite 로
           스크린리더도 읽어줌. 색상은 kind 로 구분: success/saved = 성공,
           cancelled = 중립, failed = 경고. */}
      <AnimatePresence>
        {shareToast && (
          <motion.div
            key={shareToast.kind + shareToast.msg}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="fixed left-1/2 -translate-x-1/2 z-[110] px-4 py-2.5 rounded-xl typo-caption pointer-events-none"
            style={{
              bottom: "calc(env(safe-area-inset-bottom) + 24px)",
              background:
                shareToast.kind === "failed"
                  ? "rgba(180, 60, 60, 0.95)"
                  : "rgba(30, 30, 30, 0.92)",
              color: "white",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
            }}
          >
            {shareToast.msg}
          </motion.div>
        )}
      </AnimatePresence>
      {/* 키보드 액세서리 바 — memo 편집 중에만 노출. 확인 = 현재 값 유지하며 blur
           (debounce 가 최종 저장 처리); 취소 = snapshot 으로 rollback 후 blur. */}
      <KeyboardAccessoryBar
        visible={memoFocused}
        onDone={() => {
          memoTextareaRef.current?.blur();
        }}
        onCancel={() => {
          handleMemoChange(memoFocusSnapshotRef.current);
          memoTextareaRef.current?.blur();
        }}
      />
    </AnimatePresence>,
    document.body,
  );
}
