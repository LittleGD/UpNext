"use client";

/**
 * Up Hero — Phase 7: PhotoTalismanPicker.
 *
 * EquipmentInventory 의 "사진 부적 만들기" CTA 에서 열림.
 * 미바인딩 photo 그리드 (폴라로이드 썸네일 3-col) 에서 하나 선택 →
 * 80 코인 지불 확인 → 랜덤 rarity 로 Equipment 생성 → reveal.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useGrowthStore } from "@/store/useGrowthStore";
import { getThumbnailBlob, blobToUrl } from "@/lib/photoStorage";
import { isPhotoBound, PHOTO_TALISMAN_RITUAL_COST } from "@/lib/photoTalisman";
import type { PhotoMeta } from "@/types/growth";
import type { Equipment } from "@/types/uphero";
import {
  GB,
  EASE_OUT,
  gbClass,
  GB_LEGEND,
  GB_UNIQUE,
  GB_RARE,
} from "@/lib/upHeroPalette";
import { useSound } from "@/hooks/useSound";
import PixelIcon from "@/components/icons/PixelIcon";

interface PhotoTalismanPickerProps {
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export default function PhotoTalismanPicker({
  onClose,
  onNotify,
}: PhotoTalismanPickerProps) {
  const photos = useGrowthStore((s) => s.photoMetas);
  const coins = useUpHeroStore((s) => s.coins);
  const inventory = useUpHeroStore((s) => s.inventory);
  const equipped = useUpHeroStore((s) => s.hero.equipped);
  const bindPhotoAsTalisman = useUpHeroStore((s) => s.bindPhotoAsTalisman);
  const { play } = useSound();

  const [mounted, setMounted] = useState(false);
  const [revealedItem, setRevealedItem] = useState<Equipment | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // 아직 바인딩 안 된 photo 만 — 바인딩된 photo 는 inventory 에 photoId 로 존재
  const availablePhotos = useMemo(
    () => photos.filter((p) => !isPhotoBound(p.id, inventory, equipped)),
    [photos, inventory, equipped],
  );

  const canAfford = coins >= PHOTO_TALISMAN_RITUAL_COST;

  const onBind = (photo: PhotoMeta) => {
    if (!canAfford) {
      play("cancel");
      onNotify(`코인 부족 (${PHOTO_TALISMAN_RITUAL_COST} 필요)`);
      return;
    }
    if (
      !confirm(
        `이 사진을 부적으로 만들까요?\n\n비용: ${PHOTO_TALISMAN_RITUAL_COST} 코인\nRarity: 랜덤 (일반/희귀/고유/전설)\n\n* 한 번 바인딩되면 재롤 불가`,
      )
    ) {
      return;
    }
    const result = bindPhotoAsTalisman(photo.id);
    if (result.ok && result.newItem) {
      play("collect");
      setRevealedItem(result.newItem);
    } else {
      play("cancel");
      onNotify(result.error ?? "실패");
    }
  };

  if (typeof window === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        background: GB.darkest,
        color: GB.light,
        opacity: mounted ? 1 : 0,
        transition: `opacity 200ms ${EASE_OUT}`,
        paddingTop: "calc(env(safe-area-inset-top) + 10px)",
        paddingBottom: "calc(max(env(safe-area-inset-bottom), 24px) + 10px)",
      }}
    >
      {/* === Header === */}
      <header
        className="px-3 py-2.5 flex items-center gap-3 shrink-0"
        style={{ borderBottom: `1px solid ${GB.dark}` }}
      >
        <button
          type="button"
          onClick={onClose}
          className="typo-caption inline-flex items-center gap-1 rounded"
          style={{
            minHeight: 40,
            padding: "8px 12px",
            background: `${GB.dark}cc`,
            border: `1px solid ${GB.light}`,
            color: GB.light,
          }}
        >
          <PixelIcon name="ChevronLeft" size={14} color={GB.light} />
          뒤로
        </button>
        <div className="flex flex-col leading-tight flex-1">
          <div className="typo-caption" style={{ color: GB.lightest }}>
            사진 부적 — 바인딩 의식
          </div>
          <div className={`typo-caption ${gbClass.textDim} tabular-nums`}>
            {availablePhotos.length} / {photos.length} 바인딩 가능 · 의식{" "}
            {PHOTO_TALISMAN_RITUAL_COST} 코인
          </div>
        </div>
      </header>

      {/* === Body === */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {availablePhotos.length === 0 ? (
          <div
            className={`typo-caption ${gbClass.textDim} text-center py-10`}
          >
            {photos.length === 0
              ? "챌린지를 완료하고 사진을 찍어보세요"
              : "이미 모든 사진이 부적이 되었어요"}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {availablePhotos.map((p) => (
              <PhotoThumb
                key={p.id}
                photo={p}
                onClick={() => onBind(p)}
                disabled={!canAfford}
              />
            ))}
          </div>
        )}
      </div>

      {/* === Reveal modal === */}
      {revealedItem && (
        <RitualReveal
          item={revealedItem}
          onClose={() => {
            setRevealedItem(null);
          }}
        />
      )}
    </div>,
    document.body,
  );
}

/* ────────────────────────────────────────── */

/** 썸네일 한 장 — IndexedDB 에서 blob 가져와 URL 로 렌더 */
function PhotoThumb({
  photo,
  onClick,
  disabled,
}: {
  photo: PhotoMeta;
  onClick: () => void;
  disabled?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    getThumbnailBlob(photo.id)
      .then((blob) => {
        if (!active) return;
        if (blob) {
          objectUrl = blobToUrl(blob);
          setUrl(objectUrl);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.id]);

  const dateLabel = new Date(photo.timestamp).toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
  });

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col rounded overflow-hidden text-left"
      style={{
        aspectRatio: "184/223",
        background: GB.dark,
        border: `1px solid ${GB.light}`,
        opacity: disabled ? 0.5 : 1,
        transition: `transform 120ms ${EASE_OUT}`,
      }}
    >
      <div
        className="flex-1 relative"
        style={{ background: url ? "transparent" : `${GB.darkest}` }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={photo.challengeTitle}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <div
            className={`absolute inset-0 flex items-center justify-center typo-micro ${gbClass.textDim}`}
          >
            …
          </div>
        )}
      </div>
      <div
        className="px-1.5 py-1 flex flex-col"
        style={{
          background: GB.darkest,
          borderTop: `1px solid ${GB.dark}`,
        }}
      >
        <div
          className="typo-micro truncate"
          style={{ color: GB.lightest, letterSpacing: "0.03em" }}
        >
          {photo.challengeTitle}
        </div>
        <div
          className={`typo-micro tabular-nums ${gbClass.textDim}`}
        >
          {dateLabel}
        </div>
      </div>
    </button>
  );
}

/* ────────────────────────────────────────── */

function RitualReveal({
  item,
  onClose,
}: {
  item: Equipment;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const rarityColor =
    item.rarity === "legend"
      ? GB_LEGEND
      : item.rarity === "unique"
        ? GB_UNIQUE
        : item.rarity === "rare"
          ? GB_RARE
          : GB.light;

  const rarityLabel = {
    normal: "일반",
    rare: "희귀",
    unique: "고유",
    legend: "전설",
  }[item.rarity];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: `${GB.darkest}ee`,
        opacity: mounted ? 1 : 0,
        transition: `opacity 220ms ${EASE_OUT}`,
      }}
    >
      <div
        className="w-full max-w-sm rounded-md overflow-hidden"
        style={{
          background: GB.darkest,
          border: `1px solid ${rarityColor}`,
          transform: mounted ? "scale(1)" : "scale(0.94)",
          opacity: mounted ? 1 : 0,
          transition: `transform 260ms ${EASE_OUT}, opacity 220ms ${EASE_OUT}`,
        }}
      >
        <div
          className="px-4 py-4 text-center flex flex-col items-center gap-2"
          style={{
            borderBottom: `1px solid ${GB.dark}`,
            background: `linear-gradient(180deg, ${rarityColor}22 0%, transparent 100%)`,
          }}
        >
          <div
            className="typo-caption"
            style={{ color: rarityColor, letterSpacing: "0.08em" }}
          >
            {rarityLabel}
          </div>
          <div className="typo-heading" style={{ color: GB.lightest }}>
            {item.name}
          </div>
        </div>
        <div className="px-4 py-4 flex flex-col gap-2.5 typo-caption">
          <div className="flex flex-col gap-1">
            <div className={gbClass.textDim}>스탯</div>
            {Object.entries(item.stats).map(([k, v]) => (
              <div key={k} style={{ color: GB.lightest }}>
                {k.toUpperCase()} +{v}
              </div>
            ))}
          </div>
          {item.flavor && (
            <div className={`${gbClass.textDim} leading-relaxed pt-1`}>
              {item.flavor}
            </div>
          )}
        </div>
        <div
          className="px-4 py-3"
          style={{ borderTop: `1px solid ${GB.dark}` }}
        >
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded typo-caption"
            style={{
              background: GB.lightest,
              color: GB.darkest,
              border: `1px solid ${GB.lightest}`,
            }}
          >
            인벤토리로
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
