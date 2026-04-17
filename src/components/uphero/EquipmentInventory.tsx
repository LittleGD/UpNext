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

import { useState } from "react";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { getHeroAppearanceVariant, SELL_PRICE } from "@/types/uphero";
import type { Equipment, EquipSlot } from "@/types/uphero";
import { GB, EASE_OUT, gbClass } from "@/lib/upHeroPalette";
import { useGameStore } from "@/store/useGameStore";
import { useSound } from "@/hooks/useSound";
import EquipmentCard from "./EquipmentCard";
import HeroSprite from "./HeroSprite";
import PixelIcon from "@/components/icons/PixelIcon";

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
  const equipItem = useUpHeroStore((s) => s.equipItem);
  const unequipItem = useUpHeroStore((s) => s.unequipItem);
  const sellItem = useUpHeroStore((s) => s.sellItem);
  const discardItem = useUpHeroStore((s) => s.discardItem);
  const level = useGameStore((s) => s.progress.level);
  const { play } = useSound();
  const variant = getHeroAppearanceVariant(level) as 0 | 1 | 2;

  const [selectedId, setSelectedId] = useState<string | null>(null);
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
            <HeroSprite variant={variant} size={80} color={GB.lightest} />
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
                  <PixelIcon
                    name={equipped.iconName}
                    size={28}
                    color={GB.lightest}
                  />
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
      </div>
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
