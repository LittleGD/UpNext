"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import { useGrowthStore } from "@/store/useGrowthStore";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { getThumbnailBlob, getSignatureBlob, blobToUrl } from "@/lib/photoStorage";
import { KODAK_FILM_FILTER, FILM_GRAIN_URL, VINTAGE_VIGNETTE } from "@/lib/photoFilter";
import { useTranslation } from "@/hooks/useTranslation";
import PixelIcon from "@/components/icons/PixelIcon";
import PhotoDetailModal from "./PhotoDetailModal";
import StickerLayer from "./StickerLayer";
import type { PhotoMeta } from "@/types/growth";

// === ArchiveSlot — 미니 폴라로이드 프레임 ===
function ArchiveSlot({
  meta,
  onTap,
  bound,
}: {
  meta: PhotoMeta;
  onTap: () => void;
  /** Phase 7 polish — Up Hero 의 부적으로 바인딩된 사진. 표시 overlay */
  bound: boolean;
}) {
  const { t } = useTranslation();
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

        {/* Phase 7 polish — 부적으로 바인딩된 사진 표시.
             우상단 corner 에 작은 원형 배지 + Sparkle 아이콘. */}
        {bound && (
          <div
            className="absolute top-1 right-1 rounded-full flex items-center justify-center z-[10]"
            style={{
              width: 20,
              height: 20,
              background: "#cdf564",
              boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
            }}
            aria-label={t("photo.archive.boundBadge")}
            title={t("photo.archive.boundBadge")}
          >
            <PixelIcon name="Sparkle" size={12} color="#0a1f0a" />
          </div>
        )}
      </div>

      {/* 라벨 — 날짜만, 챌린지 제목은 디테일 모달에서 표시.
           Phase 9a — text-text-tertiary/60 → text-text-secondary 로 변경.
           이전 색 (#484848 × 0.6 opacity) 이 #0A0A0A 배경 대비 1.8:1 수준이라
           실질적으로 안 보임. 디자인 토큰 #9a9a9a 로 올려 5:1+ 확보. */}
      <div className="mt-1 flex items-center justify-end w-full">
        <span className="typo-micro text-text-secondary tabular-nums">{dateStr}</span>
      </div>
    </motion.button>
  );
}

// === ArchiveSheet ===
export default function ArchiveSheet() {
  const photoMetas = useGrowthStore((s) => s.photoMetas);
  const { t, language } = useTranslation();
  const [selectedMeta, setSelectedMeta] = useState<PhotoMeta | null>(null);

  // Phase 7 polish — Up Hero 의 부적으로 바인딩된 photo id 집합.
  // inventory + equipped 양쪽에서 photoId 를 긁어 Set 으로 효율적 lookup.
  // 두 개의 store slice 를 따로 구독해 memo 로 Set 조립 (새 Set 을 selector
  // 반환값으로 주면 매 render 마다 identity 가 달라져 re-render 유발).
  const inventory = useUpHeroStore((s) => s.inventory);
  const equipped = useUpHeroStore((s) => s.hero.equipped);
  const boundPhotoIds = useMemo(() => {
    const ids = new Set<string>();
    for (const eq of inventory) {
      if (eq.photoId) ids.add(eq.photoId);
    }
    for (const eq of Object.values(equipped)) {
      if (eq?.photoId) ids.add(eq.photoId);
    }
    return ids;
  }, [inventory, equipped]);

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
        {/* Phase 9a — 앨범 탭과 사진 사이 공간 확보.
             기존엔 탭 바로 아래에 폴라로이드가 붙어서 답답했음. py-4 로 숨통. */}
        <div className="grid grid-cols-3 gap-3 pt-1">
          {photoMetas.map((meta) => (
            <ArchiveSlot
              key={meta.id}
              meta={meta}
              onTap={() => setSelectedMeta(meta)}
              bound={boundPhotoIds.has(meta.id)}
            />
          ))}
        </div>
        {/* Phase 9a — "사진 N장" 문구 삭제 (정보 가치 낮음, 그리드 자체로 전달됨). */}
      </motion.div>

      {/* 사진 상세 모달 */}
      {selectedMeta && (
        <PhotoDetailModal meta={selectedMeta} onClose={() => setSelectedMeta(null)} />
      )}
    </>
  );
}
