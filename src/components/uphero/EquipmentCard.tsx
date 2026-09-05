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
import { getEnhanceTitle, type Equipment } from "@/types/uphero";
import RarityTexture from "@/components/cards/RarityTexture";
import PixelIcon from "@/components/icons/PixelIcon";
import { GB, EASE_OUT, GB_LEGEND } from "@/lib/upHeroPalette";
import { getThumbnailBlob, blobToUrl } from "@/lib/photoStorage";
import { TALISMAN_SKILLS } from "@/lib/talismanSkills";
import { useTranslation } from "@/hooks/useTranslation";
import { equipmentNameById, skillName } from "@/lib/upHeroI18n";
import type { Language } from "@/types/game";

/** Phase 11b — skill id → 표시 이름 (없으면 id 그대로).
 *   i18n: `uphero.skill.<id>.name` 키가 dict 에 있으면 언어별, 없으면 Korean fallback. */
function talismanSkillName(id: string, language: Language): string {
  const fallback = TALISMAN_SKILLS[id]?.name ?? id;
  return skillName(id, fallback, language);
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

/**
 * Phase 5-B — +N 칩 톤. 밴드가 올라갈수록 어둡게 → legend 골드 → 라임 + 글로우.
 *   1..9   : 어두운 배경, rarity 보더 (기존)
 *   10..14 : legend 골드 (기존 +10 톤)
 *   15..19 : 라임 + 글로우, 보더 없음
 *   20     : 라임 + 더 강한 글로우
 * Track E 의 종이인형 칩도 이 헬퍼를 가져다 쓴다.
 */
export function enhanceChipTone(
  level: number,
  rarityColor: string,
): { bg: string; fg: string; glow?: string; border: string } {
  if (level >= 20) {
    return { bg: GB.lightest, fg: GB.darkest, glow: `0 0 10px ${GB.lightest}`, border: "none" };
  }
  if (level >= 15) {
    return { bg: GB.lightest, fg: GB.darkest, glow: `0 0 6px ${GB.lightest}aa`, border: "none" };
  }
  if (level >= 10) {
    return { bg: GB_LEGEND, fg: GB.darkest, border: `1px solid ${GB_LEGEND}` };
  }
  return { bg: `${GB.darkest}dd`, fg: GB.lightest, border: `1px solid ${rarityColor}` };
}

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
  // Phase 5-B — 칭호는 저장하지 않고 레벨에서 파생. md/lg 에서만 칩으로 그린다.
  const enhanceLevel = equipment.enhanceLevel ?? 0;
  const enhanceTitle = getEnhanceTitle(enhanceLevel);
  const chipTone = enhanceChipTone(enhanceLevel, rarityColor);

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

      {/* Phase 5-B — 칭호 칩 (각성/초월). sm 은 공간이 없어 +N 칩만. */}
      {size !== "sm" && enhanceTitle && (
        <span
          className="typo-micro self-start mt-1 px-1 rounded-sm"
          style={{
            background: `${GB.lightest}22`,
            color: GB.lightest,
            fontSize: 9,
            lineHeight: 1.4,
            letterSpacing: "0.02em",
          }}
          aria-label={t("uphero.enhance.title.chipAria", {
            title: t(`uphero.enhance.title.${enhanceTitle}` as const),
          })}
        >
          {t(`uphero.enhance.title.${enhanceTitle}` as const)}
        </span>
      )}

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
                ✦ {talismanSkillName(id, language)}
              </span>
            ))}
          </div>
        )}

      {/* Phase 11a — 좌상단 enhance level chip (+1~+20).
           name 에 이미 " +N" 이 붙어있지만 line-clamp 로 가려질 수 있어
           별도 chip 으로 강조. Phase 5-B — 톤은 enhanceChipTone 밴드 표. */}
      {enhanceLevel > 0 && !selected && (
        <div
          className="absolute top-1 left-1 typo-micro tabular-nums px-1 rounded-sm pointer-events-none"
          style={{
            background: chipTone.bg,
            color: chipTone.fg,
            border: chipTone.border,
            boxShadow: chipTone.glow,
            fontSize: 9,
            letterSpacing: "0.03em",
            lineHeight: 1.3,
          }}
          aria-label={t("uphero.equip.enhanceChipAria", { n: enhanceLevel })}
        >
          +{enhanceLevel}
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
      enhance > 0 ? t("uphero.equip.enhanceChipAria", { n: enhance }) : null,
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
