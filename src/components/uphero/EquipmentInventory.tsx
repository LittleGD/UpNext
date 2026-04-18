"use client";

/**
 * Up Hero — EquipmentInventory.
 *
 * 구조:
 *  - 상단 1/3: 영웅 sprite + 십자 4슬롯 (위=weapon, 아래=talisman, 좌=armor, 우=accessory)
 *  - 중단 actions: 선택한 아이템이 있을 때 [장착 / 해제 / 판매 / 버리기]
 *  - 하단 2/3: 보유 장비 grid (스크롤) — EquipmentCard sm
 *
 * interaction flow:
 *  1. 사용자가 보유 장비 grid 에서 한 장 탭 → 선택 상태 (border 하이라이트)
 *  2. action bar 활성화: 장착하려면 "장착" (type 에 맞는 슬롯으로 이동)
 *  3. 또는 슬롯 탭 → 해제 (다시 인벤토리로)
 */

import { useEffect, useMemo, useState } from "react";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import {
  getHeroAppearanceVariant,
  SELL_PRICE,
  SHOP_PRICES,
  CLASS_THEME_COLOR,
} from "@/types/uphero";
import type { Equipment, EquipSlot } from "@/types/uphero";
import type { Rarity } from "@/types/card";
import { GB, EASE_OUT, gbClass, GB_LEGEND, GB_UNIQUE, GB_RARE } from "@/lib/upHeroPalette";
import { useGameStore } from "@/store/useGameStore";
import { useSound } from "@/hooks/useSound";
import EquipmentCard from "./EquipmentCard";
import HeroSprite from "./HeroSprite";
import PhotoTalismanPicker from "./PhotoTalismanPicker";
import PixelIcon from "@/components/icons/PixelIcon";
import { getThumbnailBlob, blobToUrl } from "@/lib/photoStorage";

interface EquipmentInventoryProps {
  onBack: () => void;
  /** toast 메시지 */
  onNotify: (msg: string) => void;
}

const SLOT_LABEL: Record<EquipSlot, string> = {
  weapon: "무기",
  armor: "갑옷",
  accessory: "액세서리",
  talisman: "부적",
};

/**
 * 슬롯 배치 (영웅 중심 십자):
 *    weapon (위)
 * armor     accessory
 *    talisman (아래)
 *
 * absolute positioning 으로 영웅 sprite 주변에 배치.
 */
const SLOT_POSITIONS: Record<
  EquipSlot,
  { top?: string; bottom?: string; left?: string; right?: string }
> = {
  weapon: { top: "0", left: "50%" }, // 상 중앙
  talisman: { bottom: "0", left: "50%" }, // 하 중앙
  armor: { top: "50%", left: "0" }, // 좌 중앙
  accessory: { top: "50%", right: "0" }, // 우 중앙
};

/** 슬롯 translate 보정 (중앙 정렬용) */
const SLOT_TRANSFORMS: Record<EquipSlot, string> = {
  weapon: "translate(-50%, 0)",
  talisman: "translate(-50%, 0)",
  armor: "translate(0, -50%)",
  accessory: "translate(0, -50%)",
};

export default function EquipmentInventory({
  onBack,
  onNotify,
}: EquipmentInventoryProps) {
  const hero = useUpHeroStore((s) => s.hero);
  const inventory = useUpHeroStore((s) => s.inventory);
  const coins = useUpHeroStore((s) => s.coins);
  const equipItem = useUpHeroStore((s) => s.equipItem);
  const unequipItem = useUpHeroStore((s) => s.unequipItem);
  const sellItem = useUpHeroStore((s) => s.sellItem);
  const discardItem = useUpHeroStore((s) => s.discardItem);
  const enhanceItem = useUpHeroStore((s) => s.enhanceItem);
  const level = useGameStore((s) => s.progress.level);
  const { play } = useSound();
  const variant = getHeroAppearanceVariant(level) as 0 | 1 | 2;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Phase 7 — 사진 부적 Picker 오버레이 표시 여부. */
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const selectedItem = selectedId
    ? inventory.find((i) => i.id === selectedId)
    : null;

  const onEquip = (item: Equipment) => {
    equipItem(item.id, item.type);
    play("equip");
    onNotify(`${item.name} 장착`);
    setSelectedId(null);
  };

  const onUnequipSlot = (slot: EquipSlot) => {
    const item = hero.equipped[slot];
    if (!item) return;
    unequipItem(slot);
    play("equip");
    onNotify(`${item.name} 해제`);
  };

  const onSell = (item: Equipment) => {
    if (!confirm(`${item.name} 을(를) 판매할까요?\n+${SELL_PRICE[item.rarity]} 코인`)) return;
    const refund = sellItem(item.id);
    play("collect");
    onNotify(`판매 +${refund} C`);
    setSelectedId(null);
  };

  const onDiscard = (item: Equipment) => {
    if (!confirm(`${item.name} 을(를) 버릴까요?\n환급 없음, 복구 불가`)) return;
    discardItem(item.id);
    play("cancel");
    onNotify("버렸다");
    setSelectedId(null);
  };

  // Phase 4c-feature: 강화 가능한 쌍 탐색.
  //   같은 type + rarity 가 2개 이상이고, rarity 가 legend 가 아닌 그룹만.
  //   각 그룹에서 첫 2개를 합성 대상으로 선정.
  const enhanceableGroups = useMemo(() => {
    const buckets = new Map<string, Equipment[]>();
    for (const item of inventory) {
      if (item.rarity === "legend") continue;
      // 장착 중인 아이템은 제외 (hero.equipped 에 있으면 inventory 에 없으니 OK)
      const key = `${item.type}_${item.rarity}`;
      const arr = buckets.get(key) ?? [];
      arr.push(item);
      buckets.set(key, arr);
    }
    return [...buckets.entries()]
      .filter(([, items]) => items.length >= 2)
      .map(([key, items]) => {
        const [type, rarity] = key.split("_") as [EquipSlot, Rarity];
        return { type, rarity, items };
      });
  }, [inventory]);

  const RARITY_LABEL: Record<Rarity, string> = {
    normal: "일반",
    rare: "희귀",
    unique: "고유",
    legend: "전설",
  };
  const RARITY_COLOR: Record<Rarity, string> = {
    normal: GB.light,
    rare: GB_RARE,
    unique: GB_UNIQUE,
    legend: GB_LEGEND,
  };
  const RARITY_COST: Record<Rarity, number> = {
    normal: SHOP_PRICES.enhance,
    rare: SHOP_PRICES.enhance * 2,
    unique: SHOP_PRICES.enhance * 4,
    legend: Number.POSITIVE_INFINITY,
  };
  const NEXT_RARITY: Record<Rarity, Rarity> = {
    normal: "rare",
    rare: "unique",
    unique: "legend",
    legend: "legend",
  };

  const onEnhance = (items: Equipment[], rarity: Rarity) => {
    const cost = RARITY_COST[rarity];
    if (
      !confirm(
        `${RARITY_LABEL[rarity]} 2개 → ${RARITY_LABEL[NEXT_RARITY[rarity]]} 1개로 합성할까요?\n\n비용: ${cost} 코인 (보유 ${coins})`,
      )
    )
      return;
    const result = enhanceItem(items[0].id, items[1].id);
    if (result.ok && result.newItem) {
      play("collect");
      onNotify(`합성 성공 — ${result.newItem.name}`);
    } else {
      play("cancel");
      onNotify(result.error ?? "합성 실패");
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* === SubHeader === */}
      <header
        className="px-3 py-2.5 flex items-center gap-3 shrink-0"
        style={{ borderBottom: `1px solid ${GB.dark}` }}
      >
        <button
          type="button"
          onClick={onBack}
          className="uphero-back-btn typo-caption inline-flex items-center gap-1"
          style={{
            minHeight: 40,
            padding: "8px 12px",
            background: `${GB.dark}cc`,
            border: `1px solid ${GB.light}`,
            color: GB.light,
            borderRadius: 6,
          }}
        >
          <PixelIcon name="ChevronLeft" size={14} color={GB.light} />
          뒤로
          <style jsx>{`
            .uphero-back-btn {
              transition: transform 120ms ${EASE_OUT};
            }
            .uphero-back-btn:active {
              transform: scale(0.97);
            }
          `}</style>
        </button>
        <div className="typo-caption" style={{ color: GB.lightest }}>
          장비
        </div>
      </header>

      {/* === 상단: 영웅 + 4슬롯 === */}
      <section
        className="shrink-0 py-5 flex items-center justify-center"
        style={{ borderBottom: `1px solid ${GB.dark}` }}
      >
        <div
          className="relative"
          style={{ width: 220, height: 220 }}
        >
          {/* 중앙 영웅 sprite */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ width: 80, height: 80 }}
          >
            <HeroSprite
              variant={variant}
              classType={hero.classType}
              size={80}
              color={
                hero.classType
                  ? CLASS_THEME_COLOR[hero.classType]
                  : GB.lightest
              }
            />
          </div>

          {/* 4 슬롯 */}
          {(Object.keys(SLOT_LABEL) as EquipSlot[]).map((slot) => {
            const equipped = hero.equipped[slot];
            const pos = SLOT_POSITIONS[slot];
            const translate = SLOT_TRANSFORMS[slot];
            return (
              <button
                key={slot}
                type="button"
                onClick={() => equipped && onUnequipSlot(slot)}
                disabled={!equipped}
                className="uphero-slot-btn absolute rounded-md flex flex-col items-center justify-center"
                style={{
                  ...pos,
                  transform: translate,
                  width: 56,
                  height: 56,
                  background: equipped ? `${GB.dark}cc` : "transparent",
                  border: `1px solid ${equipped ? GB.lightest : GB.dark}`,
                  cursor: equipped ? "pointer" : "default",
                  color: GB.light,
                }}
              >
                {equipped ? (
                  equipped.photoId ? (
                    <SlotPhotoThumb photoId={equipped.photoId} size={40} />
                  ) : (
                    <PixelIcon
                      name={equipped.iconName}
                      size={28}
                      color={GB.lightest}
                    />
                  )
                ) : (
                  <div
                    className="typo-micro"
                    style={{ color: GB.dark, letterSpacing: "0.05em" }}
                  >
                    {SLOT_LABEL[slot]}
                  </div>
                )}
                <style jsx>{`
                  .uphero-slot-btn {
                    transition: transform 120ms ${EASE_OUT};
                  }
                  .uphero-slot-btn:not(:disabled):active {
                    transform: ${translate} scale(0.95);
                  }
                `}</style>
              </button>
            );
          })}
        </div>
      </section>

      {/* === Action Bar (선택한 item 있을 때만) === */}
      {selectedItem && (
        <section
          className="shrink-0 px-3 py-2.5 flex items-center gap-2"
          style={{
            borderBottom: `1px solid ${GB.dark}`,
            background: `${GB.dark}40`,
          }}
        >
          <div className="typo-caption flex-1 truncate" style={{ color: GB.lightest }}>
            {selectedItem.name}
          </div>
          <ActionButton onClick={() => onEquip(selectedItem)} primary>
            장착
          </ActionButton>
          <ActionButton onClick={() => onSell(selectedItem)}>
            판매 +{SELL_PRICE[selectedItem.rarity]}
          </ActionButton>
          <ActionButton onClick={() => onDiscard(selectedItem)} danger>
            버리기
          </ActionButton>
        </section>
      )}

      {/* === 하단: 인벤토리 grid === */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {inventory.length === 0 ? (
          <div
            className={`typo-caption ${gbClass.textDim} text-center py-8`}
          >
            장비가 없어요. 던전에서 획득하세요.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {inventory.map((eq) => (
              <EquipmentCard
                key={eq.id}
                equipment={eq}
                size="sm"
                selected={eq.id === selectedId}
                onClick={() =>
                  setSelectedId(eq.id === selectedId ? null : eq.id)
                }
              />
            ))}
          </div>
        )}

        {/* Phase 7 — 사진 부적 바인딩 의식 CTA */}
        <section className="mt-5 pt-4" style={{ borderTop: `1px dashed ${GB.dark}` }}>
          <div
            className="typo-caption mb-2 inline-flex items-center gap-1.5"
            style={{ color: GB.lightest }}
          >
            <PixelIcon name="Camera" size={14} color={GB.lightest} />
            사진 부적 — 챌린지 사진을 운명의 부적으로
          </div>
          <button
            type="button"
            onClick={() => {
              play("select");
              setPhotoPickerOpen(true);
            }}
            className="w-full rounded px-3 py-2.5 typo-caption flex items-center gap-2"
            style={{
              background: `${GB.dark}66`,
              border: `1px dashed ${GB.light}80`,
              color: GB.light,
              textAlign: "left",
            }}
          >
            <PixelIcon name="Image" size={14} color={GB.light} />
            <span className="flex-1" style={{ color: GB.lightest }}>
              바인딩 의식 열기
            </span>
            <span className={gbClass.textDim}>80 C · 랜덤 rarity</span>
          </button>
        </section>

        {/* Phase 4c-feature: 강화 가능한 쌍. 같은 타입 + 등급 2개 이상이면 등장. */}
        {enhanceableGroups.length > 0 && (
          <section className="mt-5 pt-4" style={{ borderTop: `1px dashed ${GB.dark}` }}>
            <div className="typo-caption mb-2 inline-flex items-center gap-1.5" style={{ color: GB.lightest }}>
              <PixelIcon name="Fire" size={14} color={GB.lightest} />
              강화 가능 — 같은 슬롯 · 등급 2장 합성
            </div>
            <div className="flex flex-col gap-1.5">
              {enhanceableGroups.map(({ type, rarity, items }) => {
                const cost = RARITY_COST[rarity];
                const canAfford = coins >= cost;
                return (
                  <div
                    key={`${type}_${rarity}`}
                    className="flex items-center gap-2 rounded px-2.5 py-2"
                    style={{
                      background: `${GB.dark}66`,
                      border: `1px solid ${RARITY_COLOR[rarity]}55`,
                    }}
                  >
                    <div
                      className="typo-caption"
                      style={{ color: RARITY_COLOR[rarity], minWidth: 78 }}
                    >
                      {RARITY_LABEL[rarity]} {SLOT_LABEL[type]}
                    </div>
                    <div className={`typo-caption tabular-nums ${gbClass.textDim}`}>
                      ×{items.length}
                    </div>
                    <div className="flex-1" />
                    <button
                      type="button"
                      disabled={!canAfford}
                      onClick={() => onEnhance(items.slice(0, 2), rarity)}
                      className="uphero-enhance-btn typo-caption rounded"
                      style={{
                        padding: "5px 10px",
                        minHeight: 30,
                        background: canAfford ? RARITY_COLOR[rarity] : `${GB.dark}aa`,
                        color: canAfford ? GB.darkest : GB.light,
                        border: `1px solid ${canAfford ? RARITY_COLOR[rarity] : GB.dark}`,
                        opacity: canAfford ? 1 : 0.55,
                      }}
                    >
                      합성 −{cost}C
                    </button>
                  </div>
                );
              })}
            </div>
            <style jsx>{`
              .uphero-enhance-btn {
                transition: transform 120ms ${EASE_OUT};
              }
              .uphero-enhance-btn:not(:disabled):active {
                transform: scale(0.96);
              }
            `}</style>
          </section>
        )}
      </div>

      {/* Phase 7 — 사진 부적 Picker (overlay portal) */}
      {photoPickerOpen && (
        <PhotoTalismanPicker
          onClose={() => setPhotoPickerOpen(false)}
          onNotify={onNotify}
        />
      )}
    </div>
  );
}

/* ────────────────────────────────────────── */

function ActionButton({
  children,
  onClick,
  primary,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  const bg = primary ? GB.lightest : "transparent";
  const color = primary ? GB.darkest : danger ? "#e88b7a" : GB.light;
  const border = primary
    ? GB.lightest
    : danger
      ? "#e88b7a"
      : GB.light;
  return (
    <button
      type="button"
      onClick={onClick}
      className="uphero-action-btn typo-caption rounded"
      style={{
        padding: "6px 10px",
        minHeight: 34,
        background: bg,
        color,
        border: `1px solid ${border}`,
      }}
    >
      {children}
      <style jsx>{`
        .uphero-action-btn {
          transition: transform 120ms ${EASE_OUT};
        }
        .uphero-action-btn:active {
          transform: scale(0.95);
        }
      `}</style>
    </button>
  );
}

/** Phase 7 — 4슬롯 중앙 photo 부적 썸네일 (small inline version) */
function SlotPhotoThumb({ photoId, size }: { photoId: string; size: number }) {
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
          background: `${GB.dark}`,
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
      }}
    />
  );
}
