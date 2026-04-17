"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import { useGrowthStore } from "@/store/useGrowthStore";
import { getThumbnailBlob, getSignatureBlob, blobToUrl } from "@/lib/photoStorage";
import { KODAK_FILM_FILTER, FILM_GRAIN_URL, VINTAGE_VIGNETTE } from "@/lib/photoFilter";
import { useTranslation } from "@/hooks/useTranslation";
import PixelIcon from "@/components/icons/PixelIcon";
import PhotoDetailModal from "./PhotoDetailModal";
import StickerLayer from "./StickerLayer";
import type { PhotoMeta } from "@/types/growth";

// === ArchiveSlot — 미니 폴라로이드 프레임 ===
function ArchiveSlot({ meta, onTap }: { meta: PhotoMeta; onTap: () => void }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [sigUrl, setSigUrl] = useState<string | null>(null);

  useEffect(() => {
    const urls: string[] = [];
    getThumbnailBlob(meta.id).then((blob) => {
      if (blob) { const u = blobToUrl(blob); urls.push(u); setThumbUrl(u); }
    });
    getSignatureBlob(meta.id).then((blob) => {
      if (blob) { const u = blobToUrl(blob); urls.push(u); setSigUrl(u); }
    });
    return () => urls.forEach(URL.revokeObjectURL);
  }, [meta.id]);

  // 프레임 베이스 컬러 — PolaroidFrame.tsx pickVariant() 와 동일 hash.
  // 60% Frame5 (#f9f8f5 near-white) / 40% Frame1-4 (#f2f1ee beige).
  // 디테일뷰의 PolaroidFrame 과 베이스 컬러 일치 → 썸네일↔디테일 시각 연속성.
  const h = ((meta.timestamp * 2654435761) >>> 0) % 100;
  const frameBg = h >= 40 ? "#f9f8f5" : "#f2f1ee";

  // 날짜 포맷
  const d = new Date(meta.timestamp);
  const dateStr = `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;

  // 폴라로이드 비율 (184/223) 그대로 — 디테일 뷰와 동일 proportions.
  // 사인은 폴라로이드 전체를 덮고, 스티커는 % 좌표라 자동 정렬됨.
  return (
    <motion.button
      variants={fadeInUp}
      onClick={onTap}
      className="flex flex-col text-left active:scale-[0.96] transition-transform"
    >
      {/* 미니 폴라로이드 — aspect 184/223 */}
      <div
        className="relative w-full"
        style={{
          aspectRatio: "184 / 223",
          backgroundColor: frameBg,
          borderRadius: 2,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          overflow: "hidden",
        }}
      >
        {/* 사진 — Figma 좌표 비율 (15/14 / 154x157 of 184x223) */}
        <div
          className="absolute overflow-hidden bg-bg-elevated"
          style={{
            left: "8.15%",
            top: "6.28%",
            width: "83.70%",
            height: "70.40%",
          }}
        >
          {thumbUrl ? (
            <>
              <img
                src={thumbUrl}
                alt=""
                className="w-full h-full object-cover block"
                draggable={false}
                style={{ filter: KODAK_FILM_FILTER }}
              />
              <div
                className="absolute inset-0 pointer-events-none mix-blend-overlay"
                style={{
                  backgroundImage: FILM_GRAIN_URL,
                  backgroundSize: "80px 80px",
                  opacity: 0.28,
                }}
              />
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: VINTAGE_VIGNETTE }}
              />
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="skeleton w-6 h-6 rounded-sm" />
            </div>
          )}
        </div>

        {/* 사인 오버레이 — 폴라로이드 전체를 덮음 (캡처 시 그렸던 영역과 일치) */}
        {sigUrl && (
          <img
            src={sigUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[5]"
            draggable={false}
          />
        )}

        {/* 스티커 오버레이 — meta.stickers 의 % 좌표 그대로 (반응형) */}
        {meta.stickers && meta.stickers.length > 0 && (
          <StickerLayer stickers={meta.stickers} editable={false} />
        )}
      </div>

      {/* 라벨 — 날짜만, 챌린지 제목은 디테일 모달에서 표시 */}
      <div className="mt-1 flex items-center justify-end w-full">
        <span className="typo-micro text-text-tertiary/60 tabular-nums">{dateStr}</span>
      </div>
    </motion.button>
  );
}

// === ArchiveSheet ===
export default function ArchiveSheet() {
  const photoMetas = useGrowthStore((s) => s.photoMetas);
  const { t, language } = useTranslation();
  const [selectedMeta, setSelectedMeta] = useState<PhotoMeta | null>(null);

  if (photoMetas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
        <PixelIcon name="Camera" size={32} color="var(--text-tertiary)" />
        <p className="typo-body text-text-tertiary text-center">
          {t("playground.archive.empty")}
        </p>
      </div>
    );
  }

  return (
    <>
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="space-y-6"
      >
        <div className="grid grid-cols-3 gap-3">
          {photoMetas.map((meta) => (
            <ArchiveSlot key={meta.id} meta={meta} onTap={() => setSelectedMeta(meta)} />
          ))}
        </div>
        <p className="typo-micro text-text-tertiary text-center">
          {t(
            // 영어만 단/복수 분기, 다른 언어는 단일 키 (수량사 차이 없음)
            language === "en" && photoMetas.length !== 1
              ? "playground.archive.photoCountPlural"
              : "playground.archive.photoCount",
            { count: photoMetas.length },
          )}
        </p>
      </motion.div>

      {/* 사진 상세 모달 */}
      {selectedMeta && (
        <PhotoDetailModal meta={selectedMeta} onClose={() => setSelectedMeta(null)} />
      )}
    </>
  );
}
