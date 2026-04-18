"use client";

/**
 * Up Hero — EquipmentCard.
 *
 * 단일 장비 카드. rarity 오라 (RarityTexture 재활용) + pixel icon + 이름 + 스탯 + 플레이버.
 *
 * 크기 variant:
 *  - "sm": 그리드용 컴팩트 (80×100)
 *  - "md": 상세 뷰 (120×160)
 *  - "lg": 드롭 reveal 등 임팩트 (180×240)
 *
 * interaction: onClick/onTap 이 있으면 press scale(0.97) 피드백.
 */

import { useEffect, useState, type CSSProperties } from "react";
import type { Equipment } from "@/types/uphero";
import RarityTexture from "@/components/cards/RarityTexture";
import PixelIcon from "@/components/icons/PixelIcon";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import { getThumbnailBlob, blobToUrl } from "@/lib/photoStorage";

export type EquipmentCardSize = "sm" | "md" | "lg";

interface EquipmentCardProps {
  equipment: Equipment;
  size?: EquipmentCardSize;
  /** 선택됨 (장착중 등) — 테두리 강조 */
  selected?: boolean;
  /** 클릭 가능 여부 */
  onClick?: () => void;
  style?: CSSProperties;
  className?: string;
}

const DIMENSIONS: Record<
  EquipmentCardSize,
  {
    width: number;
    height: number;
    iconSize: number;
    nameClass: string;
    statClass: string;
    padding: string;
  }
> = {
  sm: {
    width: 80,
    height: 100,
    iconSize: 28,
    nameClass: "typo-micro",
    statClass: "typo-micro",
    padding: "6px 6px 8px",
  },
  md: {
    width: 120,
    height: 160,
    iconSize: 42,
    nameClass: "typo-caption",
    statClass: "typo-caption",
    padding: "10px 10px 12px",
  },
  lg: {
    width: 180,
    height: 240,
    iconSize: 64,
    nameClass: "typo-body",
    statClass: "typo-caption",
    padding: "14px 14px 16px",
  },
};

/** rarity → GB 톤 컬러 */
const RARITY_COLOR: Record<Equipment["rarity"], string> = {
  normal: GB.light,
  rare: "#a5c8db",
  unique: "#cdb887",
  legend: "#e8b887",
};

/** 스탯 key 를 한국어로 */
const STAT_LABEL: Record<string, string> = {
  str: "STR",
  int: "INT",
  vit: "VIT",
  dex: "DEX",
  agi: "AGI",
  crit: "CRIT",
};

export default function EquipmentCard({
  equipment,
  size = "md",
  selected,
  onClick,
  style,
  className,
}: EquipmentCardProps) {
  const dim = DIMENSIONS[size];
  const rarityColor = RARITY_COLOR[equipment.rarity];
  const clickable = !!onClick;

  // 스탯 entries — stats 객체에서 값 있는 키만
  const statEntries = Object.entries(equipment.stats).filter(
    ([, v]) => v != null && v !== 0,
  );

  const content = (
    <div
      className={`eq-card relative overflow-hidden rounded-md ${className ?? ""}`}
      style={{
        width: dim.width,
        height: dim.height,
        padding: dim.padding,
        background: `${GB.dark}cc`,
        border: `1px solid ${selected ? GB.lightest : rarityColor}`,
        color: GB.light,
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      {/* rarity 오라 layer — 기존 카드 시스템과 동일 */}
      <RarityTexture rarity={equipment.rarity} borderRadius={8} />

      {/* 상단: 아이콘 (photo 부적이면 썸네일) + rarity accent dot */}
      <div className="flex items-start justify-between">
        {equipment.photoId ? (
          <PhotoThumb photoId={equipment.photoId} size={dim.iconSize + 4} />
        ) : (
          <PixelIcon
            name={equipment.iconName}
            size={dim.iconSize}
            color={rarityColor}
          />
        )}
        {equipment.rarity !== "normal" && (
          <div
            className="rounded-full shrink-0"
            style={{
              width: 6,
              height: 6,
              background: rarityColor,
              boxShadow: `0 0 4px ${rarityColor}`,
              marginTop: 2,
            }}
          />
        )}
      </div>

      {/* 이름 */}
      <div
        className={`${dim.nameClass} mt-auto leading-tight`}
        style={{ color: selected ? GB.lightest : rarityColor }}
      >
        {equipment.name}
      </div>

      {/* 스탯 (sm 에선 1개만, md/lg 에선 전체) */}
      {statEntries.length > 0 && (
        <div className={`${dim.statClass} mt-1 tabular-nums`}>
          {(size === "sm" ? statEntries.slice(0, 1) : statEntries).map(
            ([k, v]) => (
              <div key={k} style={{ color: GB.light }}>
                <span style={{ color: GB.lightest }}>
                  {k === "crit" ? `+${v}%` : `+${v}`}
                </span>{" "}
                {STAT_LABEL[k] ?? k.toUpperCase()}
              </div>
            ),
          )}
        </div>
      )}

      {/* 선택됨 배지 */}
      {selected && (
        <div
          className="absolute top-1 right-1 typo-micro px-1.5 py-0.5 rounded"
          style={{
            background: GB.lightest,
            color: GB.darkest,
            letterSpacing: "0.05em",
          }}
        >
          E
        </div>
      )}
    </div>
  );

  if (clickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="eq-card-btn"
        style={{ background: "transparent", padding: 0 }}
      >
        {content}
        <style jsx>{`
          .eq-card-btn {
            transition: transform 120ms ${EASE_OUT};
          }
          .eq-card-btn:active {
            transform: scale(0.97);
          }
        `}</style>
      </button>
    );
  }
  return content;
}

/* ────────────────────────────────────────── */

/**
 * Phase 7 — 사진 부적의 썸네일.
 * IndexedDB 에서 blob 을 가져와 URL 렌더. 로딩 중 dim placeholder.
 */
function PhotoThumb({ photoId, size }: { photoId: string; size: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    getThumbnailBlob(photoId)
      .then((blob) => {
        if (!active || !blob) return;
        objectUrl = blobToUrl(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId]);

  if (!url) {
    return (
      <div
        className="rounded-sm"
        style={{
          width: size,
          height: size,
          background: `${GB.dark}cc`,
          border: `1px solid ${GB.light}80`,
        }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="photo talisman"
      className="rounded-sm"
      style={{
        width: size,
        height: size,
        objectFit: "cover",
        border: `1px solid ${GB.light}`,
      }}
    />
  );
}
