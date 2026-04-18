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
import { TALISMAN_SKILLS } from "@/lib/talismanSkills";
import { useTranslation } from "@/hooks/useTranslation";
import { equipmentNameById } from "@/lib/upHeroI18n";

/** Phase 11b — skill id → 표시 이름 (없으면 id 그대로). */
function talismanSkillName(id: string): string {
  return TALISMAN_SKILLS[id]?.name ?? id;
}

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
    height: 96,
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
  const { t, language } = useTranslation();
  const dim = DIMENSIONS[size];
  const rarityColor = RARITY_COLOR[equipment.rarity];
  const clickable = !!onClick;
  const localizedEqName = equipmentNameById(
    equipment.baseId ?? "",
    equipment.name,
    language,
  );

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

      {/* 이름 — Phase 8a: mt-auto → mt-1.5 고정 spacing.
           line-clamp-2 로 3줄 이상 wrap 방지, 카드간 bottom alignment 통일. */}
      <div
        className={`${dim.nameClass} mt-1.5 leading-tight overflow-hidden`}
        style={{
          color: selected ? GB.lightest : rarityColor,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {localizedEqName}
      </div>

      {/* 스탯 (sm 에선 1개만, md/lg 에선 전체) — mt-auto 로 바닥 정렬 */}
      {statEntries.length > 0 && (
        <div className={`${dim.statClass} mt-auto tabular-nums`}>
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

      {/* Phase 11b — talisman skill chip. md/lg 에서만 표기 (sm 은 공간 부족). */}
      {size !== "sm" &&
        equipment.talismanSkills &&
        equipment.talismanSkills.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-0.5">
            {equipment.talismanSkills.map((id) => (
              <span
                key={id}
                className="typo-micro px-1 py-0.5 rounded-sm"
                style={{
                  fontSize: 9,
                  background: `${GB.lightest}22`,
                  color: GB.lightest,
                  border: `1px solid ${GB.lightest}66`,
                  letterSpacing: "0.02em",
                }}
              >
                ✦ {talismanSkillName(id)}
              </span>
            ))}
          </div>
        )}

      {/* Phase 11a — 좌상단 enhance level chip (+1~+10).
           name 에 이미 " +N" 이 붙어있지만 line-clamp 로 가려질 수 있어
           별도 chip 으로 강조. +10 은 legend 톤. */}
      {(equipment.enhanceLevel ?? 0) > 0 && !selected && (
        <div
          className="absolute top-1 left-1 typo-micro tabular-nums px-1 rounded-sm pointer-events-none"
          style={{
            background:
              (equipment.enhanceLevel ?? 0) >= 10
                ? "#e8b887" // GB_LEGEND
                : `${GB.darkest}dd`,
            color:
              (equipment.enhanceLevel ?? 0) >= 10 ? GB.darkest : GB.lightest,
            border: `1px solid ${
              (equipment.enhanceLevel ?? 0) >= 10 ? "#e8b887" : rarityColor
            }`,
            fontSize: 9,
            letterSpacing: "0.03em",
            lineHeight: 1.3,
          }}
          aria-label={`강화 +${equipment.enhanceLevel}`}
        >
          +{equipment.enhanceLevel}
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
    // Phase 11c R4 — rarity / enhance level / stats 를 SR 에 전달.
    //   R2 수정: "선택됨" 을 aria-label 에서 제거 (aria-pressed 와 중복 공지 방지).
    //   stats 는 legend 는 모든 affix 포함 (최대 5개), 그 외 상위 3개.
    const rarityLabel = t(`uphero.rarity.${equipment.rarity}` as const);
    const enhance = equipment.enhanceLevel ?? 0;
    const statLimit = equipment.rarity === "legend" ? 5 : 3;
    const statsBrief = statEntries
      .slice(0, statLimit)
      .map(([k, v]) => `${STAT_LABEL[k] ?? k} ${v}`)
      .join(", ");
    const srLabel = [
      rarityLabel,
      localizedEqName,
      enhance > 0 ? `강화 +${enhance}` : null,
      statsBrief,
    ]
      .filter(Boolean)
      .join(", ");
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={srLabel}
        aria-pressed={selected ? true : undefined}
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
      alt=""
      aria-hidden="true"
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
