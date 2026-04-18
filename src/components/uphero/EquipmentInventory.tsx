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
import { useUpHeroStore, type EnhanceResult } from "@/store/useUpHeroStore";
import { useGrowthStore } from "@/store/useGrowthStore";
import { isPhotoBound } from "@/lib/photoTalisman";
import {
  getHeroAppearanceVariant,
  getEffectiveHeroLevel,
  enhanceSuccessRate,
  enhanceCost,
  ENHANCE_PRESERVE_BY_RARITY,
  MAX_ENHANCE_LEVEL,
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
import EnhanceRitualOverlay, {
  type EnhanceRitualOutcome,
} from "./EnhanceRitualOverlay";
import EnhanceResultModal, {
  type EnhanceModalVariant,
} from "./EnhanceResultModal";
import PixelIcon from "@/components/icons/PixelIcon";

// Phase 9b — PhotoTalismanPicker 는 picker 버튼 탭 시에만 필요.
//   631줄 + PhotoMeta/DUNGEONS import → 장비 탭 첫 진입에서 번들링 제외.
const PhotoTalismanPicker = lazy(() => import("./PhotoTalismanPicker"));
import { getThumbnailBlob, blobToUrl } from "@/lib/photoStorage";

/** Phase 9a / 11a — 판매/버리기/강화 확인 dialog pending state.
 *   enhance 는 이제 단일 아이템 + 비용 + 성공률 snapshot. */
type PendingAction =
  | { kind: "sell"; item: Equipment }
  | { kind: "discard"; item: Equipment }
  | {
      kind: "enhance";
      item: Equipment;
      cost: number;
      successRate: number;
    };

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

  /** Phase 11a — 강화 연출 state. confirm → ritual (2s) → result modal 순서. */
  const [ritual, setRitual] = useState<{
    item: Equipment;
    outcome: EnhanceRitualOutcome;
  } | null>(null);
  const [resultModal, setResultModal] = useState<EnhanceModalVariant | null>(
    null,
  );

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
      // Phase 11a — 단일 아이템 + 확률 강화. result 를 먼저 받은 뒤 2초 ritual
      //   연출 → 연출 끝나면 결과 모달. 순서 주의: enhanceItem 이 이미 store 를
      //   mutate 했으므로 UI 에서 보이는 아이템 reference 는 staleness 주의.
      //   ritual 은 "입력 아이템" 기준으로 보여주므로 stale 문제 없음.
      //
      // Phase 11c R1 — exhaustive switch 로 재구성. 새로운 EnhanceResult 분기가
      //   추가될 때 TS 에러 로 포착되도록 default 에 assertExhaustive 패턴.
      const result: EnhanceResult = enhanceItem(pending.item.id);

      // coin/maxed/not-found 는 ritual 없이 즉시 toast — 상호작용 abort
      if (!result.ok) {
        if (result.reason === "coin") {
          play("cancel");
          onNotify(`코인 부족 (${result.cost} 필요)`);
          setPending(null);
          return;
        }
        if (result.reason === "maxed") {
          play("cancel");
          onNotify("이미 +10 최대 강화");
          setPending(null);
          return;
        }
        if (result.reason === "not-found") {
          play("cancel");
          onNotify("아이템을 찾을 수 없음");
          setPending(null);
          return;
        }
      }

      // 시각 outcome + modal variant 을 exhaustive 하게 결정.
      let outcome: EnhanceRitualOutcome;
      let modal: EnhanceModalVariant;
      if (result.ok) {
        outcome = "success";
        modal = { kind: "success", newItem: result.newItem, prevLevel: result.prevLevel };
      } else if (result.reason === "keep") {
        outcome = "keep";
        modal = { kind: "keep", item: result.item };
      } else if (result.reason === "destroyed") {
        outcome = "destroyed";
        modal = { kind: "destroyed", lostItemName: result.lostItemName };
      } else {
        // unreachable — coin/maxed/not-found 위에서 처리됨. TS exhaustiveness 보장.
        const _exhaustive: never = result;
        void _exhaustive;
        setPending(null);
        return;
      }

      // Phase 11b-fix — 소리는 ritual 연출 끝에 재생해야 결과 스포일 방지.
      //   이전엔 여기서 play() 를 했지만 "collect" vs "cancel" 이 2초 연출보다
      //   먼저 들려 유저가 결과 예측 가능. 이제 ritual onDone 에서 재생.
      setRitual({ item: pending.item, outcome });
      setPendingResult(modal);
      setSelectedId(null);
    }
    setPending(null);
  };

  /** ritual 연출 끝나면 여기 저장된 variant 로 결과 모달 open. */
  const [pendingResult, setPendingResult] = useState<EnhanceModalVariant | null>(
    null,
  );

  const RARITY_COLOR: Record<Rarity, string> = {
    normal: GB.light,
    rare: GB_RARE,
    unique: GB_UNIQUE,
    legend: GB_LEGEND,
  };

  // Phase 11a — 강화 가능한 아이템 리스트.
  //   inventory 전체에서 +10 미만인 아이템만. rarity 별 그룹은 유지 (UI 가독성).
  const enhanceableItems = useMemo(() => {
    const items = inventory.filter(
      (i) => (i.enhanceLevel ?? 0) < MAX_ENHANCE_LEVEL,
    );
    // rarity 순 (legend 먼저) 그 다음 enhanceLevel 내림차순.
    const rarityOrder: Record<Rarity, number> = {
      legend: 0,
      unique: 1,
      rare: 2,
      normal: 3,
    };
    return [...items].sort((a, b) => {
      const r = rarityOrder[a.rarity] - rarityOrder[b.rarity];
      if (r !== 0) return r;
      return (b.enhanceLevel ?? 0) - (a.enhanceLevel ?? 0);
    });
  }, [inventory]);

  /** 강화 시도 — 확인 다이얼로그 표시 */
  const onEnhance = (item: Equipment) => {
    const level = item.enhanceLevel ?? 0;
    const cost = enhanceCost(item.rarity, level);
    const rate = enhanceSuccessRate(item.rarity, level);
    setPending({ kind: "enhance", item, cost, successRate: rate });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* === SubHeader === */}
      {/* Phase 11b-fix — subheader 균형: 뒤로 ghost, 제목 typo-body. */}
      <header
        className="px-3 py-2 flex items-center gap-1 shrink-0"
        style={{ borderBottom: `1px solid ${GB.dark}` }}
      >
        <button
          type="button"
          onClick={onBack}
          className="uphero-back-btn typo-caption inline-flex items-center gap-0.5 rounded"
          style={{
            minHeight: 40,
            padding: "6px 8px",
            background: "transparent",
            border: "none",
            color: GB.light,
          }}
          aria-label="뒤로"
        >
          <PixelIcon name="ChevronLeft" size={14} color={GB.light} />
          뒤로
          <style jsx>{`
            .uphero-back-btn {
              transition: transform 120ms ${EASE_OUT},
                background 160ms ${EASE_OUT};
            }
            .uphero-back-btn:active {
              transform: scale(0.96);
              background: ${GB.dark}66;
            }
          `}</style>
        </button>
        <div
          className="typo-body ml-1"
          style={{ color: GB.lightest, fontWeight: 500 }}
        >
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

        {/* Phase 11a — 강화: 단일 아이템 선택 + 확률 기반 +N.
             이전 "같은 등급 2장 합성" 은 제거됨. 이제 각 아이템에 enhanceLevel (+0~+10) 부여. */}
        {tab === "enhance" && (
          <section>
            <div
              className="typo-caption mb-3 inline-flex items-center gap-1.5"
              style={{ color: GB.lightest }}
            >
              <PixelIcon name="Fire" size={14} color={GB.lightest} />
              강화 — 장비 한 장 + 코인, 확률로 +1 (최대 +10)
            </div>
            {enhanceableItems.length === 0 ? (
              <EmptyState text="강화 가능한 장비가 없어요 — 드롭이나 사진 부적으로 아이템을 먼저 얻어보세요" />
            ) : (
              <div className="flex flex-col gap-1.5">
                {enhanceableItems.map((item) => {
                  const level = item.enhanceLevel ?? 0;
                  const cost = enhanceCost(item.rarity, level);
                  const rate = enhanceSuccessRate(item.rarity, level);
                  const canAfford = coins >= cost;
                  const rColor = RARITY_COLOR[item.rarity];
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 rounded px-2.5 py-2"
                      style={{
                        background: `${GB.dark}66`,
                        border: `1px solid ${rColor}55`,
                      }}
                    >
                      <PixelIcon name={item.iconName} size={18} color={rColor} />
                      <div className="flex-1 min-w-0">
                        <div
                          className="typo-caption truncate"
                          style={{ color: GB.lightest }}
                        >
                          {item.name}
                        </div>
                        <div
                          className={`typo-micro tabular-nums ${gbClass.textDim} flex items-center gap-2`}
                        >
                          <span>+{level} → +{level + 1}</span>
                          <span style={{ color: rColor }}>
                            {Math.round(rate * 100)}%
                          </span>
                          <span>보존 {Math.round(ENHANCE_PRESERVE_BY_RARITY[item.rarity] * 100)}%</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={() => onEnhance(item)}
                        className="uphero-enhance-btn typo-caption rounded tabular-nums"
                        style={{
                          padding: "10px 14px",
                          minHeight: 44,
                          background: canAfford ? rColor : `${GB.dark}aa`,
                          color: canAfford ? GB.darkest : GB.light,
                          border: `1px solid ${canAfford ? rColor : GB.dark}`,
                          opacity: canAfford ? 1 : 0.55,
                        }}
                      >
                        강화 −{cost}C
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
                ? `${pending.item.name} 강화 (+${pending.item.enhanceLevel ?? 0} → +${(pending.item.enhanceLevel ?? 0) + 1})?`
                : ""
        }
        body={
          pending?.kind === "sell" ? (
            `+${SELL_PRICE[pending.item.rarity]} 코인`
          ) : pending?.kind === "discard" ? (
            "환급 없음 · 복구 불가"
          ) : pending?.kind === "enhance" ? (
            <>
              성공률 <span style={{ color: GB.lightest }}>{Math.round(pending.successRate * 100)}%</span>
              <br />
              실패 시 <span style={{ color: GB.lightest }}>{Math.round(ENHANCE_PRESERVE_BY_RARITY[pending.item.rarity] * 100)}%</span> 확률로 아이템 보존 · 나머지는 소실
              <br />
              비용 <span style={{ color: GB.lightest }}>{pending.cost}</span> 코인 (보유 {coins})
            </>
          ) : undefined
        }
        confirmLabel={
          pending?.kind === "sell"
            ? "판매"
            : pending?.kind === "discard"
              ? "버리기"
              : pending?.kind === "enhance"
                ? "강화 시도"
                : "확인"
        }
        danger={pending?.kind === "discard" || pending?.kind === "enhance"}
        onConfirm={executePending}
        onCancel={() => setPending(null)}
      />

      {/* Phase 11a — 강화 연출 (2s) → 결과 모달 순서.
           Phase 11b-fix — 소리는 ritual 이 끝날 때 재생해야 2초 연출 동안 결과
           스포일러 안 됨. 이전엔 ritual 시작 직전 play 로 즉시 결과 추측 가능했음. */}
      {ritual && (
        <EnhanceRitualOverlay
          item={ritual.item}
          outcome={ritual.outcome}
          onDone={() => {
            // outcome 별 sound 재생 — ritual 종료와 result modal 등장 사이.
            if (ritual.outcome === "success") {
              play("collect");
            } else if (ritual.outcome === "destroyed") {
              play("cancel");
            } else {
              // keep — 애매한 결과. cancel 은 너무 negative 하니 아무 소리 안 냄
              // (정적 → modal 이 직접 메시지 전달).
            }
            setRitual(null);
            if (pendingResult) {
              setResultModal(pendingResult);
              setPendingResult(null);
            }
          }}
        />
      )}
      {resultModal && (
        <EnhanceResultModal
          variant={resultModal}
          onClose={() => setResultModal(null)}
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
