"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { springSnappy } from "@/lib/motion";
import { getPhotoBlob, getSignatureBlob, blobToUrl } from "@/lib/photoStorage";
import { useTranslation } from "@/hooks/useTranslation";
import PolaroidFrame from "./PolaroidFrame";
import PolaroidFlip from "./PolaroidFlip";
import PolaroidTilt from "./PolaroidTilt";
import MemoEditor from "./MemoEditor";
import PixelIcon from "@/components/icons/PixelIcon";
import type { PhotoMeta } from "@/types/growth";

interface Props {
  meta: PhotoMeta;
  onClose: () => void;
}

export default function PhotoDetailModal({ meta, onClose }: Props) {
  const { t } = useTranslation();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    const urls: string[] = [];
    Promise.all([
      getPhotoBlob(meta.id),
      getSignatureBlob(meta.id),
    ]).then(([photo, sig]) => {
      if (photo) {
        const u = blobToUrl(photo);
        urls.push(u);
        setPhotoUrl(u);
      }
      if (sig) {
        const u = blobToUrl(sig);
        urls.push(u);
        setSignatureUrl(u);
      }
    });
    return () => urls.forEach(URL.revokeObjectURL);
  }, [meta.id]);

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
          className="w-full max-w-[320px] space-y-4"
        >
          <PolaroidTilt autoHint>
          <PolaroidFlip
            flipped={isFlipped}
            onFlip={setIsFlipped}
            front={
              <PolaroidFrame imageSrc={photoUrl} timestamp={meta.timestamp}>
                {signatureUrl && (
                  <img
                    src={signatureUrl}
                    alt=""
                    className="w-full h-[50px] object-contain"
                    draggable={false}
                  />
                )}
              </PolaroidFrame>
            }
            back={
              <div className="bg-[#f5f2eb] rounded-[3px] shadow-lg mx-auto max-w-[300px] min-h-[280px] p-4">
                {/* 읽기 전용 메모 */}
                <div
                  className="min-h-[220px]"
                  style={{
                    backgroundImage: "repeating-linear-gradient(transparent, transparent 23px, #d4c9b8 23px, #d4c9b8 24px)",
                    backgroundPosition: "0 8px",
                  }}
                >
                  <p
                    className="text-[#2a2a2a] leading-[24px] pt-[9px] typo-body whitespace-pre-wrap"
                    style={{ fontFamily: "'April16', sans-serif" }}
                  >
                    {meta.memo || "—"}
                  </p>
                </div>
              </div>
            }
          />
          </PolaroidTilt>

          {/* 메타 정보 */}
          <div className="flex items-center justify-between px-2">
            <span className="typo-caption text-text-secondary">{meta.challengeTitle}</span>
            <span className="typo-micro text-text-tertiary">{meta.date}</span>
          </div>

          {/* 닫기 */}
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-bg-elevated text-text-secondary typo-body text-center active:scale-[0.97]"
          >
            {t("common.confirm")}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
