"use client";

import { useEffect, useState, useCallback } from "react";
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
import PixelIcon from "@/components/icons/PixelIcon";
import type { PhotoMeta } from "@/types/growth";

interface Props {
  meta: PhotoMeta;
  onClose: () => void;
}

export default function PhotoDetailModal({ meta, onClose }: Props) {
  const { t } = useTranslation();
  const { play } = useSound();
  const updatePhotoSignature = useGrowthStore((s) => s.updatePhotoSignature);

  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedSignature, setEditedSignature] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);

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

  // Edit 모드 진입 — 현재 사인을 SignatureCanvas 의 initialDataUrl 로 전달
  const handleEdit = useCallback(() => {
    play("select");
    setEditedSignature(null);
    setIsEditing(true);
  }, [play]);

  const handleEditCancel = useCallback(() => {
    play("select");
    setIsEditing(false);
    setEditedSignature(null);
  }, [play]);

  const handleEditSave = useCallback(async () => {
    if (!editedSignature) {
      // 변경 없음 — 그냥 닫기
      setIsEditing(false);
      return;
    }
    play("collect");
    await updatePhotoSignature(meta.id, editedSignature);
    setIsEditing(false);
    setEditedSignature(null);
    setSigVersion((v) => v + 1); // 사인 다시 fetch
  }, [editedSignature, meta.id, updatePhotoSignature, play]);

  // Share — 폴라로이드 합성 후 Web Share API
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

  if (!photoUrl) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md px-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 40, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 40, opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", duration: 0.5, bounce: 0.18 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[320px] flex flex-col gap-4"
        >
          {/* 챌린지 제목 — 폴라로이드 위에, 디테일 모달에서만 노출 */}
          <div className="text-center">
            <h2 className="typo-body text-text-primary">{meta.challengeTitle}</h2>
            <p className="typo-micro text-text-tertiary tabular-nums mt-0.5">{meta.date}</p>
          </div>

          {/* 폴라로이드 — 편집 모드 OR 뷰잉 모드 */}
          {isEditing ? (
            // 편집 모드 — 사인 캔버스 오버레이 + 별도 액션 버튼
            <div className="w-full max-w-[300px] mx-auto">
              <div className="relative">
                <PolaroidFrame imageSrc={photoUrl} timestamp={meta.timestamp} />
                <div className="absolute inset-0 z-[5]">
                  <SignatureCanvas
                    width={300}
                    height={363}
                    initialDataUrl={signatureUrl}
                    onSignatureChange={setEditedSignature}
                    className="w-full h-full"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleEditCancel}
                  className="flex-1 py-3 rounded-xl bg-bg-elevated text-text-secondary typo-body active:scale-[0.97] transition-transform"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleEditSave}
                  className="flex-1 py-3 rounded-xl bg-accent text-bg-primary typo-body active:scale-[0.97] transition-transform"
                >
                  {t("playground.capture.save")}
                </button>
              </div>
            </div>
          ) : (
            // 뷰잉 모드 — Tilt + Flip + 액션 버튼들
            <PolaroidTilt autoHint>
              <PolaroidFlip
                flipped={isFlipped}
                onFlip={setIsFlipped}
                showFlipHint
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
                  </div>
                }
                back={<MemoEditor value={meta.memo} onChange={() => {}} readOnly />}
              />
            </PolaroidTilt>
          )}

          {/* 액션 영역 — Edit / Share / Close (편집 모드에서는 숨김) */}
          {!isEditing && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <button
                onClick={handleEdit}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-bg-elevated text-text-secondary typo-caption active:scale-95 transition-transform"
                aria-label="Edit"
              >
                <PixelIcon name="PenSquare" size={12} color="currentColor" />
                <span>Edit</span>
              </button>
              <button
                onClick={handleShare}
                disabled={isSharing}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-bg-elevated text-text-secondary typo-caption active:scale-95 transition-transform disabled:opacity-50"
                aria-label="Share"
              >
                <PixelIcon name="Send" size={12} color="currentColor" />
                <span>{isSharing ? "..." : "Share"}</span>
              </button>
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-bg-elevated text-text-secondary typo-caption active:scale-95 transition-transform"
                aria-label="Close"
              >
                <PixelIcon name="Cancel" size={12} color="currentColor" />
                <span>Close</span>
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
