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

import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useGrowthStore } from "@/store/useGrowthStore";
import { isPhotoBound } from "@/lib/photoTalisman";
import {
  getHeroAppearanceVariant,
  getEffectiveHeroLevel,
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
import GbConfirm from "./GbConfirm";
import PixelIcon from "@/components/icons/PixelIcon";

// Phase 9b — PhotoTalismanPicker 는 picker 버튼 탭 시에만 필요.
//   631줄 + PhotoMeta/DUNGEONS import → 장비 탭 첫 진입에서 번들링 제외.
const PhotoTalismanPicker = lazy(() => import("./PhotoTalismanPicker"));
import { getThumbnailBlob, blobToUrl } from "@/lib/photoStorage";

/** Phase 9a — confirm 다이얼로그 state. 판매/버리기/합성 3액션 공유. */
type PendingAction =
  | { kind: "sell"; item: Equipment }
  | { kind: "discard"; item: Equipment }
  | { kind: "enhance"; items: Equipment[]; rarity: Rarity; cost: number };

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
  // Phase 9d — 영웅 전용 레벨.
  const gameLevel = useGameStore((s) => s.progress.level);
  const heroStartLevel = useUpHeroStore((s) => s.heroStartLevel);
  const level = getEffectiveHeroLevel(gameLevel, heroStartLevel);
  const { play } = useSound();
  const variant = getHeroAppearanceVariant(level) as 0 | 1 | 2;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Phase 7 — 사진 부적 Picker 오버레이 표시 여부. */
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  /** Phase 8a — 장비 페이지 내부 탭 (가방 기본 / 사진 부적 / 강화) */
  const [tab, setTab] = useState<"bag" | "photo" | "enhance">("bag");
  /** Phase 9a — GbConfirm 으로 교체된 판매/버리기/합성 pending state. */
  const [pending, setPending] = useState<PendingAction | null>(null);

  /** Phase 8a — 사진 부적 탭 카운트용 */
  const photoMetas = useGrowthStore((s) => s.photoMetas);
  const photoCounts = useMemo(() => {
    const boundCount = inventory.filter((i) => i.photoId).length;
    const unboundCount = photoMetas.filter(
      (p) => !isPhotoBound(p.id, inventory, hero.equipped),
    ).length;
    return { boundCount, unboundCount, totalPhotos: photoMetas.length };
  }, [inventory, photoMetas, hero.equipped]);
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

  // Phase 9a — 직접 confirm() 대신 GbConfirm 상태 설정.
  const onSell = (item: Equipment) => {
    setPending({ kind: "sell", item });
  };

  const onDiscard = (item: Equipment) => {
    setPending({ kind: "discard", item });
  };

  /** pending 액션 실행 — GbConfirm 확인 시 호출 */
  const executePending = () => {
    if (!pending) return;
    if (pending.kind === "sell") {
      const refund = sellItem(pending.item.id);
      play("collect");
      onNotify(`판매 +${refund} C`);
      setSelectedId(null);
    } else if (pending.kind === "discard") {
      discardItem(pending.item.id);
      play("cancel");
      onNotify("버렸다");
      setSelectedId(null);
    } else if (pending.kind === "enhance") {
      const result = enhanceItem(pending.items[0].id, pending.items[1].id);
      if (result.ok && result.newItem) {
        play("collect");
        onNotify(`합성 성공 — ${result.newItem.name}`);
      } else {
        play("cancel");
        onNotify(result.error ?? "합성 실패");
      }
    }
    setPending(null);
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

  // Phase 9a — 합성도 GbConfirm 로 통합.
  const onEnhance = (items: Equipment[], rarity: Rarity) => {
    const cost = RARITY_COST[rarity];
    setPending({ kind: "enhance", items, rarity, cost });
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

      {/* === Phase 8a: 탭 switcher (가방 / 사진 부적 / 강화)
           Phase 8b: sliding underline indicator — 두 객체(A↓/B↑) 가 아닌 하나의
           underline 이 옮겨가는 지각. translateX 로 0/100/200% 이동. === */}
      <nav
        className="relative flex items-stretch shrink-0"
        style={{ borderBottom: `1px solid ${GB.dark}` }}
      >
        <EqTabButton
          active={tab === "bag"}
          onClick={() => setTab("bag")}
          label="가방"
        />
        <EqTabButton
          active={tab === "photo"}
          onClick={() => setTab("photo")}
          label="사진 부적"
        />
        <EqTabButton
          active={tab === "enhance"}
          onClick={() => setTab("enhance")}
          label="강화"
        />
        <div
          aria-hidden="true"
          className="absolute bottom-[-1px] h-[2px]"
          style={{
            width: "33.3333%",
            left: 0,
            background: GB.lightest,
            transform: `translateX(${tab === "bag" ? "0%" : tab === "photo" ? "100%" : "200%"})`,
            transition: `transform 240ms ${EASE_OUT}`,
            boxShadow: `0 0 4px ${GB.lightest}66`,
          }}
        />
      </nav>

      {/* === 탭 컨텐츠 — key={tab} 로 DOM remount 해서 enter keyframe 재생.
           "탭 전환 = 새로운 공간" 이라는 감각을 200ms fade + 4px slide 로 전달. === */}
      <div
        key={tab}
        className="eq-tab-content flex-1 min-h-0 overflow-y-auto px-3 py-3"
      >
        {/* 가방 — 현재 인벤토리 grid */}
        {tab === "bag" &&
          (inventory.length === 0 ? (
            <EmptyState text="장비가 없어요. 던전에서 획득하거나 사진 부적을 만들어 보세요" />
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
          ))}

        {/* 사진 부적 — CTA + 카운트 라벨 */}
        {tab === "photo" && (
          <section>
            <div
              className="typo-caption mb-3 inline-flex items-center gap-1.5"
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
              disabled={photoCounts.unboundCount === 0}
              className="uphero-ritual-cta w-full rounded px-3 py-3 typo-caption flex items-center gap-2"
              style={{
                background:
                  photoCounts.unboundCount > 0
                    ? `${GB.dark}66`
                    : `${GB.dark}33`,
                border: `1px dashed ${photoCounts.unboundCount > 0 ? GB.light : GB.dark}80`,
                color: GB.light,
                textAlign: "left",
              }}
            >
              <PixelIcon name="Image" size={14} color={GB.light} />
              <span className="flex-1" style={{ color: GB.lightest }}>
                {photoCounts.unboundCount > 0
                  ? "바인딩 의식 열기"
                  : "바인딩할 수 있는 사진 없음"}
              </span>
              <span className={gbClass.textDim}>80 C · 랜덤</span>
              <style jsx>{`
                .uphero-ritual-cta {
                  transition: transform 140ms ${EASE_OUT},
                    border-color 200ms ${EASE_OUT},
                    filter 220ms ${EASE_OUT};
                }
                .uphero-ritual-cta:not(:disabled):active {
                  transform: scale(0.985);
                }
                .uphero-ritual-cta:not(:disabled):hover {
                  border-color: ${GB.lightest};
                }
                .uphero-ritual-cta:disabled {
                  filter: saturate(0.25) brightness(0.85);
                  opacity: 0.55;
                  cursor: not-allowed;
                }
              `}</style>
            </button>

            {/* 카운트 라벨 */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <CountTile
                iconName="Heart"
                label="부적이 된 사진"
                count={photoCounts.boundCount}
                accent={GB.lightest}
              />
              <CountTile
                iconName="Image"
                label="미바인딩 사진"
                count={photoCounts.unboundCount}
                accent={GB.light}
              />
            </div>

            {/* 전체 총합 / 도움 문구 */}
            <div
              className={`typo-caption ${gbClass.textDim} mt-3 text-center leading-relaxed`}
            >
              아카이브 총 {photoCounts.totalPhotos} 장 · 챌린지를 완료할수록
              의식 후보가 늘어나요
            </div>
          </section>
        )}

        {/* 강화 — enhanceableGroups 리스트, 없으면 placeholder */}
        {tab === "enhance" && (
          <section>
            <div
              className="typo-caption mb-3 inline-flex items-center gap-1.5"
              style={{ color: GB.lightest }}
            >
              <PixelIcon name="Fire" size={14} color={GB.lightest} />
              강화 — 같은 슬롯 · 같은 등급 2장 합성
            </div>
            {enhanceableGroups.length === 0 ? (
              <EmptyState text="합성 가능한 쌍 없음 — 같은 슬롯 · 등급 장비 2개 이상 필요해요" />
            ) : (
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
                      <div
                        className={`typo-caption tabular-nums ${gbClass.textDim}`}
                      >
                        ×{items.length}
                      </div>
                      <div className="flex-1" />
                      {/* Phase 9a — tap target 30px → 44px (Apple HIG 준수) */}
                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={() => onEnhance(items.slice(0, 2), rarity)}
                        className="uphero-enhance-btn typo-caption rounded"
                        style={{
                          padding: "10px 14px",
                          minHeight: 44,
                          background: canAfford
                            ? RARITY_COLOR[rarity]
                            : `${GB.dark}aa`,
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
                <style jsx>{`
                  .uphero-enhance-btn {
                    transition: transform 120ms ${EASE_OUT};
                  }
                  .uphero-enhance-btn:not(:disabled):active {
                    transform: scale(0.96);
                  }
                `}</style>
              </div>
            )}
          </section>
        )}
      </div>

      {/* Phase 7 — 사진 부적 Picker (overlay portal).
           Phase 9b — lazy. picker 는 Portal 기반 + 첫 open 시 fade-in 자체가 로딩
           시간 감춤 → fallback=null 이면 네이티브처럼 느껴짐. */}
      {photoPickerOpen && (
        <Suspense fallback={null}>
          <PhotoTalismanPicker
            onClose={() => setPhotoPickerOpen(false)}
            onNotify={onNotify}
          />
        </Suspense>
      )}

      {/* Phase 9a — 판매/버리기/합성 confirm 다이얼로그 (기존 native confirm 대체).
           pending state 하나로 세 액션 공유, UI 에서 title/body 만 분기. */}
      <GbConfirm
        open={pending != null}
        title={
          pending?.kind === "sell"
            ? `${pending.item.name} 을(를) 판매할까요?`
            : pending?.kind === "discard"
              ? `${pending.item.name} 을(를) 버릴까요?`
              : pending?.kind === "enhance"
                ? `${RARITY_LABEL[pending.rarity]} 2개 → ${RARITY_LABEL[NEXT_RARITY[pending.rarity]]} 1개 합성할까요?`
                : ""
        }
        body={
          pending?.kind === "sell"
            ? `+${SELL_PRICE[pending.item.rarity]} 코인`
            : pending?.kind === "discard"
              ? "환급 없음 · 복구 불가"
              : pending?.kind === "enhance"
                ? `비용 ${pending.cost} 코인 (보유 ${coins})`
                : undefined
        }
        confirmLabel={
          pending?.kind === "sell"
            ? "판매"
            : pending?.kind === "discard"
              ? "버리기"
              : pending?.kind === "enhance"
                ? "합성"
                : "확인"
        }
        danger={pending?.kind === "discard"}
        onConfirm={executePending}
        onCancel={() => setPending(null)}
      />
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
  // Phase 9a — tap target 34 → 44 (Apple HIG). 판매/버리기는 high-stakes 이므로
  //   오탭 방지가 특히 중요. padding 확대로 실수 탭 확률 ↓.
  return (
    <button
      type="button"
      onClick={onClick}
      className="uphero-action-btn typo-caption rounded"
      style={{
        padding: "10px 14px",
        minHeight: 44,
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

/** Phase 8a → 8b — 탭 버튼.
 *   underline 은 nav 부모의 sliding indicator 가 담당 (shared element).
 *   여기선 flex-1 balanced + press feedback 만 책임.
 *   탭은 하루 수십 번 눌리는 고빈도라 120ms 로 짧게, 0.97 scale 로 미묘하게. */
function EqTabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="eq-tab-btn typo-caption flex-1"
      style={{
        padding: "10px 8px",
        color: active ? GB.lightest : GB.light,
        background: "transparent",
      }}
      aria-current={active ? "page" : undefined}
    >
      {label}
      <style jsx>{`
        .eq-tab-btn {
          transition: color 180ms ${EASE_OUT}, transform 120ms ${EASE_OUT};
        }
        .eq-tab-btn:active {
          transform: scale(0.97);
        }
      `}</style>
    </button>
  );
}

/** Phase 8b — 로그라이크 감성 Empty state.
 *   텍스트 뒤에 깜빡이는 cursor caret 을 붙여 "터미널 / prompt 대기" 느낌.
 *   정적 placeholder 보다 "앱이 살아있다" 는 시그널. */
function EmptyState({ text }: { text: string }) {
  return (
    <div
      className={`typo-caption ${gbClass.textDim} text-center py-8 leading-relaxed`}
    >
      {text}
      <span className="uphero-caret" aria-hidden="true">
        _
      </span>
      <style jsx>{`
        .uphero-caret {
          display: inline-block;
          margin-left: 2px;
          animation: uphero-caret-blink 1.1s steps(2, end) infinite;
        }
        @keyframes uphero-caret-blink {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

/** Phase 8a — 사진 부적 탭의 카운트 tile (아이콘 + 숫자 + 라벨) */
function CountTile({
  iconName,
  label,
  count,
  accent,
}: {
  iconName: string;
  label: string;
  count: number;
  accent: string;
}) {
  return (
    <div
      className="rounded px-3 py-2.5 flex items-center gap-2.5"
      style={{
        background: `${GB.dark}44`,
        border: `1px solid ${GB.dark}`,
      }}
    >
      <PixelIcon name={iconName} size={16} color={accent} />
      <div className="flex flex-col leading-tight">
        <div
          className="typo-body tabular-nums"
          style={{ color: accent, fontWeight: 600 }}
        >
          {count}
        </div>
        <div className={`typo-micro ${gbClass.textDim}`}>{label}</div>
      </div>
    </div>
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
      alt=""
      aria-hidden="true"
      className="rounded-sm"
      style={{
        width: size,
        height: size,
        objectFit: "cover",
      }}
    />
  );
}
