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

  return (
    <motion.button
      variants={fadeInUp}
      onClick={onTap}
      className="flex flex-col text-left active:scale-[0.96] transition-transform"
    >
      {/* 미니 폴라로이드 프레임 */}
      <div
        className="rounded-[2px] overflow-hidden"
        style={{ backgroundColor: frameBg, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}
      >
        {/* 사진 */}
        <div className="m-[4px] mb-0 aspect-square bg-bg-elevated overflow-hidden relative">
          {thumbUrl ? (
            <>
              <img
                src={thumbUrl}
                alt=""
                className="w-full h-full object-cover block"
                draggable={false}
                style={{ filter: KODAK_FILM_FILTER }}
              />
              {/* 필름 그레인 */}
              <div
                className="absolute inset-0 pointer-events-none mix-blend-overlay"
                style={{
                  backgroundImage: FILM_GRAIN_URL,
                  backgroundSize: "80px 80px",
                  opacity: 0.28,
                }}
              />
              {/* 빈티지 비네팅 */}
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
        {/* 서명 영역 */}
        <div className="h-5 mx-[4px] mb-[4px] flex items-center justify-center overflow-hidden">
          {sigUrl && (
            <img src={sigUrl} alt="" className="h-full w-full object-contain opacity-60" draggable={false} />
          )}
        </div>
      </div>
      {/* 라벨 */}
      <div className="mt-1 flex items-center justify-between w-full">
        <span className="typo-micro text-text-tertiary truncate max-w-[75%]">
          {meta.challengeTitle}
        </span>
        <span className="typo-micro text-text-tertiary/60 tabular-nums">{dateStr}</span>
      </div>
    </motion.button>
  );
}

// === EmptySlot ===
function EmptySlot() {
  return (
    <motion.div variants={fadeInUp} className="flex flex-col">
      <div className="aspect-[3/4] rounded-[2px] border border-dashed border-text-tertiary/15 flex items-center justify-center">
        <PixelIcon name="Camera" size={14} color="var(--text-tertiary)" />
      </div>
      <div className="mt-1 h-3" />
    </motion.div>
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

  const COLS = 3;
  const ROWS = 3;
  const PER_SHEET = COLS * ROWS;
  const remainder = photoMetas.length % PER_SHEET;
  const emptyCount = remainder === 0 ? 0 : PER_SHEET - remainder;

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
          {Array.from({ length: emptyCount }, (_, i) => (
            <EmptySlot key={`empty-${i}`} />
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
