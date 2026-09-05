"use client";

/**
 * Up Hero — EquipmentInventory.
 *
 * 구조:
 *  - 상단 1/3: 영웅 sprite + 십자 4슬롯 (위=weapon, 아래=talisman, 좌=armor, 우=accessory)
 *  - 중단 actions: 선택한 아이템이 있을 때 [장착 / 판매 / 합성]
 *  - 하단 2/3: 보유 장비 grid (스크롤) — EquipmentCard sm
 *
 * Phase 6-E (Track E): 페이퍼돌 168, 슬롯 필터 칩(가방·강화 공용), 가방 n/30 헤더,
 *   합성 모드(같은 등급 3개 다중 선택), 강화 탭 정렬(장착 마지막)·"장착 중으로" 점프.
 *   버리기 버튼은 액션바에서 뺐다 (판매가 항상 우세; 넘친 전리품 모달만 버리기를 둔다).
 *   Track B 가 넣은 photoId 제외 / 방지권 패널 / 칭호 칩 / 밴드 배지는 그대로 둔다.
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
  enhanceSuccessRate,
  enhanceCost,
  enhanceOutcomeRates,
  canEnhanceDestroy,
  canEnhanceDowngrade,
  isEnhanceSafeLevel,
  getEnhanceTitle,
  enhanceRitualBand,
  ENHANCE_HIGH_BAND_START,
  ENHANCE_TITLE_LEVELS,
  MAX_ENHANCE_LEVEL,
  INVENTORY_CAP,
  NEXT_RARITY,
  SYNTHESIS_INPUT_COUNT,
  sellPrice,
  CLASS_THEME_COLOR,
} from "@/types/uphero";
import type { Equipment, EquipSlot } from "@/types/uphero";
import type { Rarity } from "@/types/card";
import { GB, EASE_OUT, gbClass, GB_LEGEND, GB_UNIQUE, GB_RARE, GB_WARN } from "@/lib/upHeroPalette";
import { SLOT_GLYPH, SLOT_LABEL_KEY, SLOT_ORDER } from "@/lib/equipmentSlotMeta";
import { useHeroLevel } from "./useHeroLevel";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import { equipmentNameById } from "@/lib/upHeroI18n";
import EquipmentCard, { enhanceChipTone } from "./EquipmentCard";
import SlotFilterChips, { type SlotFilter } from "./SlotFilterChips";
import SynthesisResultModal from "./SynthesisResultModal";
import HeroSprite from "./HeroSprite";
import GbConfirm, { GbConfirmPanel } from "./GbConfirm";
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

/**
 * i18n 템플릿에서 값 한 개를 강조 span 으로 감싸기 위한 분할 헬퍼.
 *
 * 호출부는 t() 에 실제 값 대신 sentinel 을 넣고, 돌아온 문자열을 sentinel 기준으로
 * 앞/뒤로 자른 다음 그 사이에 span 을 끼운다.
 *
 * **주의 (2026-08 버그의 원인)**: 템플릿이 이미 단위 기호를 갖고 있다
 * (`"성공률 {pct}%"`, `"비용 {cost} 코인"`). 그러니 span 안에는 **숫자만** 넣어야
 * 한다. 여기에 단위를 덧붙이면 템플릿에 남아 있던 기호와 겹쳐 `86%%` 가 된다.
 * 단위는 잘려나온 뒷부분(after)이 그대로 들고 있으므로 화면에서는 이어져 보인다.
 *
 * String.prototype.split 대신 indexOf 를 쓰는 이유: 토큰이 두 번 이상 나오는
 * 템플릿에서 split 의 [before, after] 구조 분해가 나머지 조각을 조용히 버린다.
 */
function splitAtToken(text: string, token: string): [string, string] {
  const idx = text.indexOf(token);
  if (idx < 0) return [text, ""];
  return [text.slice(0, idx), text.slice(idx + token.length)];
}

/**
 * Phase 15 → 5-B — 강화 확인 다이얼로그의 방지권 패널 (종류별 1개).
 *
 * GbConfirmPanel 위에 올라가며, 걸리면(armed && applicable && held>0) 라임 글로우.
 *   - applicable=false : 이 레벨에서 그 결과가 날 수 없다 (소실 0 인 +10..+14 등).
 *                        회색 NA 문구만, 버튼 없음. 걸어도 소모되지 않는다는 뜻.
 *   - held 0           : 구하는 경로를 한 줄로 (기존 destroyNone/downNone).
 *   - 그 외             : 40px 토글 + "켜면 이번 시도에 1장 (결과 무관)" 마이크로 힌트.
 * 토글은 열 때마다 OFF 로 시작한다 — 시도당 소모라 켜둔 채 잊으면 손해다.
 */
function GuardPanel({
  kind,
  held,
  armed,
  applicable,
  onToggle,
}: {
  kind: "destroy" | "down";
  held: number;
  armed: boolean;
  applicable: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const name = t(kind === "destroy" ? "uphero.guard.destroy.name" : "uphero.guard.down.name");
  const active = armed && applicable && held > 0;
  return (
    <GbConfirmPanel
      active={active}
      title={name}
      trailing={
        <span
          className="typo-micro tabular-nums"
          style={{
            background: GB.darkest,
            color: GB.lightest,
            borderRadius: 4,
            padding: "1px 6px",
          }}
        >
          {t("uphero.equip.guard.heldChip", { n: held })}
        </span>
      }
    >
      {!applicable ? (
        <div className="typo-micro mt-1" style={{ color: GB.light, opacity: 0.5 }}>
          {t(kind === "destroy" ? "uphero.equip.guard.destroyNA" : "uphero.equip.guard.downNA")}
        </div>
      ) : held <= 0 ? (
        <div className="typo-micro mt-1" style={{ color: GB.light, opacity: 0.8 }}>
          {t(
            kind === "destroy"
              ? "uphero.equip.guard.destroyNone"
              : "uphero.equip.guard.downNone",
            { name },
          )}
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={armed}
            className="typo-caption inline-flex items-center gap-1.5 rounded"
            style={{
              minHeight: 40,
              padding: "6px 4px",
              marginTop: 2,
              background: "transparent",
              border: "none",
              color: armed ? GB.lightest : GB.light,
            }}
          >
            <PixelIcon
              name={armed ? "CheckboxOn" : "Checkbox"}
              size={14}
              color={armed ? GB.lightest : GB.light}
            />
            {t("uphero.equip.guard.armLabel")}
          </button>
          <div className="typo-micro" style={{ color: GB.light, opacity: 0.8 }}>
            {t("uphero.equip.guard.perAttemptHint")}
          </div>
        </>
      )}
    </GbConfirmPanel>
  );
}

/** Phase 9a / 11a / 6-E — 판매/합성/강화 확인 dialog pending state.
 *   enhance 는 단일 아이템 + 비용 + 성공률 snapshot. synth 는 재료 3개 + 결과 등급. */
type PendingAction =
  | { kind: "sell"; item: Equipment }
  | { kind: "synth"; items: Equipment[]; next: Rarity }
  | {
      kind: "enhance";
      item: Equipment;
      cost: number;
      successRate: number;
    };

/** 등급 정렬 순서 (legend 먼저). */
const RARITY_ORDER: Record<Rarity, number> = {
  legend: 0,
  unique: 1,
  rare: 2,
  normal: 3,
};

interface EquipmentInventoryProps {
  onBack: () => void;
  /** toast 메시지 */
  onNotify: (msg: string) => void;
}

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
  const { t, language } = useTranslation();
  const hero = useUpHeroStore((s) => s.hero);
  const inventory = useUpHeroStore((s) => s.inventory);
  const coins = useUpHeroStore((s) => s.coins);
  const equipItem = useUpHeroStore((s) => s.equipItem);
  const unequipItem = useUpHeroStore((s) => s.unequipItem);
  const sellItem = useUpHeroStore((s) => s.sellItem);
  const synthesizeItems = useUpHeroStore((s) => s.synthesizeItems);
  const enhanceItem = useUpHeroStore((s) => s.enhanceItem);
  // Phase 15 — 방지권 2종 보유 개수.
  const destroyGuards = useUpHeroStore((s) => s.destroyGuards ?? 0);
  const downGuards = useUpHeroStore((s) => s.downGuards ?? 0);
  // Phase 2-A — 영웅 레벨은 heroXp 풀 기준.
  const level = useHeroLevel();
  const { play } = useSound();
  const variant = getHeroAppearanceVariant(level) as 0 | 1 | 2;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Phase 7 — 사진 부적 Picker 오버레이 표시 여부. */
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  /** Phase 8a — 장비 페이지 내부 탭 (가방 기본 / 사진 부적 / 강화) */
  const [tab, setTab] = useState<"bag" | "photo" | "enhance">("bag");
  /** Phase 9a — GbConfirm 으로 교체된 판매/버리기/합성 pending state. */
  const [pending, setPending] = useState<PendingAction | null>(null);
  /**
   * Phase 15 → 5-B — 이번 강화 시도에 방지권을 걸지 여부 (2종 독립).
   * 기본 OFF 이고 확인 다이얼로그를 열 때마다 OFF 로 되돌린다 (onEnhance). 시도당
   * 소모라 켜둔 채 잊으면 매 시도 1장씩 조용히 나가므로, 명시적 선택만 받는다.
   */
  const [armDestroyGuard, setArmDestroyGuard] = useState(false);
  const [armDownGuard, setArmDownGuard] = useState(false);
  /** Phase 6-E — 슬롯 필터 (가방·강화 탭 공용). */
  const [slotFilter, setSlotFilter] = useState<SlotFilter>("all");
  /** Phase 6-E — 합성 모드 + 재료 선택 (가방 탭). */
  const [synthMode, setSynthMode] = useState(false);
  const [synthPicks, setSynthPicks] = useState<string[]>([]);
  /** Phase 6-E — 합성 결과 모달. */
  const [synthResult, setSynthResult] = useState<Equipment | null>(null);

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
    onNotify(
      t("uphero.equip.toast.equipped", {
        name: equipmentNameById(item.baseId ?? "", item.name, language),
      }),
    );
    setSelectedId(null);
  };

  const onUnequipSlot = (slot: EquipSlot) => {
    const item = hero.equipped[slot];
    if (!item) return;
    unequipItem(slot);
    play("equip");
    onNotify(
      t("uphero.equip.toast.unequipped", {
        name: equipmentNameById(item.baseId ?? "", item.name, language),
      }),
    );
  };

  // Phase 9a — 직접 confirm() 대신 GbConfirm 상태 설정.
  const onSell = (item: Equipment) => {
    setPending({ kind: "sell", item });
  };

  /** Phase 6-E — 합성 모드 진입. 선택한 아이템이 첫 재료가 된다. */
  const enterSynthMode = (first?: Equipment) => {
    setSynthMode(true);
    setSynthPicks(first && !first.photoId && first.rarity !== "legend" ? [first.id] : []);
    setSelectedId(null);
    play("select");
  };
  const exitSynthMode = () => {
    setSynthMode(false);
    setSynthPicks([]);
  };
  /** 합성 재료 토글 — 등급 불일치/사진 부적/전설은 토스트로 막는다. */
  const onSynthPick = (item: Equipment) => {
    if (synthPicks.includes(item.id)) {
      setSynthPicks((prev) => prev.filter((id) => id !== item.id));
      play("select");
      return;
    }
    if (item.photoId) {
      play("cancel");
      onNotify(t("uphero.equip.synth.photoBlocked"));
      return;
    }
    if (item.rarity === "legend") {
      play("cancel");
      onNotify(t("uphero.equip.synth.legendBlocked"));
      return;
    }
    const first = synthPicks.length > 0 ? inventory.find((i) => i.id === synthPicks[0]) : null;
    if (first && first.rarity !== item.rarity) {
      play("cancel");
      onNotify(t("uphero.equip.synth.rarityMismatch"));
      return;
    }
    if (synthPicks.length >= SYNTHESIS_INPUT_COUNT) return;
    // 함수형 갱신 — 빠른 연속 탭에서도 앞선 선택을 잃지 않는다.
    setSynthPicks((prev) =>
      prev.includes(item.id) || prev.length >= SYNTHESIS_INPUT_COUNT ? prev : [...prev, item.id],
    );
    play("select");
  };
  const synthPickItems = synthPicks
    .map((id) => inventory.find((i) => i.id === id))
    .filter((i): i is Equipment => !!i);
  const synthNext = synthPickItems.length > 0 ? NEXT_RARITY[synthPickItems[0].rarity] : null;
  const onSynthConfirm = () => {
    if (synthPickItems.length !== SYNTHESIS_INPUT_COUNT || !synthNext) return;
    setPending({ kind: "synth", items: synthPickItems, next: synthNext });
  };

  /** Phase 11a — 강화 연출 state. confirm → ritual (밴드별 2.0/2.6/3.4s) → result modal. */
  const [ritual, setRitual] = useState<{
    item: Equipment;
    outcome: EnhanceRitualOutcome;
    band: 0 | 1 | 2;
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
      onNotify(t("uphero.equip.toast.sold", { coins: refund }));
      setSelectedId(null);
    } else if (pending.kind === "synth") {
      const result = synthesizeItems(pending.items.map((i) => i.id));
      if (result.ok) {
        play("collect");
        setSynthResult(result.item);
        onNotify(
          t("uphero.equip.toast.synthesized", {
            name: equipmentNameById(result.item.baseId ?? "", result.item.name, language),
          }),
        );
        exitSynthMode();
      } else {
        play("cancel");
        onNotify(
          t(
            result.reason === "rarity"
              ? "uphero.equip.synth.rarityMismatch"
              : result.reason === "legend"
                ? "uphero.equip.synth.legendBlocked"
                : result.reason === "photo"
                  ? "uphero.equip.synth.photoBlocked"
                  : "uphero.equip.toast.notFound",
          ),
        );
        setSynthPicks([]);
      }
    } else if (pending.kind === "enhance") {
      // Phase 11a — 단일 아이템 + 확률 강화. result 를 먼저 받은 뒤 2초 ritual
      //   연출 → 연출 끝나면 결과 모달. 순서 주의: enhanceItem 이 이미 store 를
      //   mutate 했으므로 UI 에서 보이는 아이템 reference 는 staleness 주의.
      //   ritual 은 "입력 아이템" 기준으로 보여주므로 stale 문제 없음.
      //
      // Phase 11c R1 — exhaustive switch 로 재구성. 새로운 EnhanceResult 분기가
      //   추가될 때 TS 에러 로 포착되도록 default 에 assertExhaustive 패턴.
      // Phase 5-B — 토글 값을 그대로 넘긴다. 보유 0 / 그 결과가 불가능한 레벨 검증은
      //   스토어가 한 곳에서 한다 (UI 게이트는 안내용).
      const lvl = pending.item.enhanceLevel ?? 0;
      const result: EnhanceResult = enhanceItem(pending.item.id, {
        destroy: armDestroyGuard,
        down: armDownGuard,
      });

      // coin/maxed/not-found 는 ritual 없이 즉시 toast — 상호작용 abort
      if (!result.ok) {
        if (result.reason === "coin") {
          play("cancel");
          onNotify(t("uphero.equip.toast.coinShort", { need: result.cost }));
          setPending(null);
          return;
        }
        if (result.reason === "maxed") {
          play("cancel");
          onNotify(t("uphero.equip.toast.maxEnhance", { max: MAX_ENHANCE_LEVEL }));
          setPending(null);
          return;
        }
        if (result.reason === "not-found") {
          play("cancel");
          onNotify(t("uphero.equip.toast.notFound"));
          setPending(null);
          return;
        }
      }

      // 시각 outcome + modal variant 을 exhaustive 하게 결정.
      let outcome: EnhanceRitualOutcome;
      let modal: EnhanceModalVariant;
      if (result.ok) {
        outcome = "success";
        modal = {
          kind: "success",
          newItem: result.newItem,
          prevLevel: result.prevLevel,
          spent: result.spent,
        };
      } else if (result.reason === "keep") {
        outcome = "keep";
        modal = { kind: "keep", item: result.item, spent: result.spent };
      } else if (result.reason === "guarded") {
        // 방지권이 막아냈다. 연출은 "유지" 쪽 색을 쓰되 모달이 무엇을 막았는지 말한다.
        outcome = "keep";
        modal = {
          kind: "guarded",
          item: result.item,
          guard: result.guard,
          spent: result.spent,
        };
      } else if (result.reason === "down") {
        outcome = "keep";
        modal = {
          kind: "down",
          item: result.item,
          prevLevel: result.prevLevel,
          spent: result.spent,
        };
      } else if (result.reason === "destroyed") {
        outcome = "destroyed";
        modal = {
          kind: "destroyed",
          lostItemName: result.lostItemName,
          lostBaseId: result.lostBaseId,
          spent: result.spent,
        };
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
      // Phase 5-B — 밴드별 연출. band >= 1 은 시작 시 충전음 (결과와 무관해 스포일 아님).
      const band = enhanceRitualBand(lvl + 1);
      setRitual({ item: pending.item, outcome, band });
      if (band >= 1) play("enhanceCharge");
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
  //   inventory 전체에서 최대 미만인 아이템만. rarity 별 그룹은 유지 (UI 가독성).
  // Phase 11c R4 — 장착된 장비도 포함. inventory + equipped 합쳐서 정렬.
  // Phase 5-B — 사진 부적(photoId) 은 제외. 부적은 사진 부적 탭의 재의식(+10 상한)
  //   경로만 쓴다.
  // Phase 6-E — 정렬: 장착 중 마지막 → 등급 (legend 먼저) → 강화 단계 내림차순.
  //   슬롯 필터는 가방 탭과 공유. 장착 그룹 앞에 id="eq-enhance-equipped" 구분선.
  const equippedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const slot of SLOT_ORDER) {
      const eq = hero.equipped[slot];
      if (eq) ids.add(eq.id);
    }
    return ids;
  }, [hero.equipped]);
  const enhanceableItems = useMemo(() => {
    const equippedList: Equipment[] = [];
    for (const slot of SLOT_ORDER) {
      const eq = hero.equipped[slot];
      if (eq) equippedList.push(eq);
    }
    const items = [...inventory, ...equippedList].filter(
      (i) =>
        !i.photoId &&
        (i.enhanceLevel ?? 0) < MAX_ENHANCE_LEVEL &&
        (slotFilter === "all" || i.type === slotFilter),
    );
    return [...items].sort((a, b) => {
      const e = (equippedIds.has(a.id) ? 1 : 0) - (equippedIds.has(b.id) ? 1 : 0);
      if (e !== 0) return e;
      const r = RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
      if (r !== 0) return r;
      return (b.enhanceLevel ?? 0) - (a.enhanceLevel ?? 0);
    });
  }, [inventory, hero.equipped, slotFilter, equippedIds]);
  const firstEquippedEnhanceId = enhanceableItems.find((i) => equippedIds.has(i.id))?.id;

  /** Phase 6-E — 가방 탭 표시 목록 (슬롯 필터) + 슬롯별 개수. */
  const bagItems = useMemo(
    () => (slotFilter === "all" ? inventory : inventory.filter((i) => i.type === slotFilter)),
    [inventory, slotFilter],
  );
  const bagCounts = useMemo(() => {
    const counts: Partial<Record<EquipSlot, number>> = {};
    for (const i of inventory) counts[i.type] = (counts[i.type] ?? 0) + 1;
    return counts;
  }, [inventory]);

  /** 강화 시도 — 확인 다이얼로그 표시 */
  const onEnhance = (item: Equipment) => {
    const level = item.enhanceLevel ?? 0;
    const cost = enhanceCost(item.rarity, level);
    // Phase 11c R4 — pity streak 반영된 성공률 표시.
    const rate = enhanceSuccessRate(item.rarity, level, item.enhanceFailStreak ?? 0);
    // Phase 5-B — 다이얼로그를 열 때마다 방지권 토글을 OFF 로 되돌린다 (시도당 소모).
    setArmDestroyGuard(false);
    setArmDownGuard(false);
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
          aria-label={t("uphero.equip.back.aria")}
        >
          <PixelIcon name="ChevronLeft" size={14} color={GB.light} />
          {t("uphero.equip.back")}
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
          {t("uphero.equip.title")}
        </div>
      </header>

      {/* === 상단: 영웅 + 4슬롯 — Phase 6-E: 220 → 168, 슬롯 48, 스프라이트 64 === */}
      <section
        className="shrink-0 py-3 flex items-center justify-center"
        style={{ borderBottom: `1px solid ${GB.dark}` }}
      >
        <div
          className="relative"
          style={{ width: 168, height: 168 }}
        >
          {/* 중앙 영웅 sprite */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ width: 64, height: 64 }}
          >
            <HeroSprite
              variant={variant}
              classType={hero.classType}
              size={64}
              color={
                hero.classType
                  ? CLASS_THEME_COLOR[hero.classType]
                  : GB.lightest
              }
            />
          </div>

          {/* 4 슬롯 */}
          {SLOT_ORDER.map((slot) => {
            const equipped = hero.equipped[slot];
            const pos = SLOT_POSITIONS[slot];
            const translate = SLOT_TRANSFORMS[slot];
            const equippedLevel = equipped?.enhanceLevel ?? 0;
            const slotChip = equipped
              ? enhanceChipTone(equippedLevel, RARITY_COLOR[equipped.rarity])
              : null;
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
                  width: 48,
                  height: 48,
                  background: equipped ? `${GB.dark}cc` : "transparent",
                  border: `1px solid ${equipped ? GB.lightest : GB.dark}`,
                  cursor: equipped ? "pointer" : "default",
                  color: GB.light,
                }}
                aria-label={
                  equipped
                    ? `${t(SLOT_LABEL_KEY[slot])}: ${equipmentNameById(
                        equipped.baseId ?? "",
                        equipped.name,
                        language,
                      )}`
                    : t(SLOT_LABEL_KEY[slot])
                }
              >
                {equipped ? (
                  equipped.photoId ? (
                    <SlotPhotoThumb photoId={equipped.photoId} size={34} />
                  ) : (
                    <PixelIcon
                      name={equipped.iconName}
                      size={22}
                      color={GB.lightest}
                    />
                  )
                ) : (
                  <>
                    {/* Phase 6-E — 빈 슬롯: 맨 글리프 + 라벨 (아이콘 박스 없음). */}
                    <PixelIcon name={SLOT_GLYPH[slot]} size={16} color={GB.dark} />
                    <div
                      className="typo-micro"
                      style={{ color: GB.dark, letterSpacing: "0.05em", fontSize: 9 }}
                    >
                      {t(SLOT_LABEL_KEY[slot])}
                    </div>
                  </>
                )}
                {/* Phase 6-E — 장착 슬롯 강화 칩 (Track B 톤 표). */}
                {equipped && equippedLevel > 0 && slotChip && (
                  <span
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 typo-micro tabular-nums px-1 rounded-sm pointer-events-none"
                    style={{
                      background: slotChip.bg,
                      color: slotChip.fg,
                      boxShadow: slotChip.glow,
                      fontSize: 9,
                      lineHeight: 1.3,
                    }}
                    aria-label={t("uphero.equip.enhanceChipAria", { n: equippedLevel })}
                  >
                    +{equippedLevel}
                  </span>
                )}
                <style jsx>{`
                  .uphero-slot-btn {
                    transition: transform 120ms ${EASE_OUT};
                  }
                  .uphero-slot-btn:not(:disabled):active {
                    /* Emil — press 0.97 통일. 기존 0.95 는 강한 strobe 감. */
                    transform: ${translate} scale(0.97);
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
            {equipmentNameById(
              selectedItem.baseId ?? "",
              selectedItem.name,
              language,
            )}
          </div>
          <ActionButton onClick={() => onEquip(selectedItem)} primary>
            {t("uphero.equip.action.equip")}
          </ActionButton>
          <ActionButton onClick={() => onSell(selectedItem)}>
            {t("uphero.equip.action.sellPreview", {
              price: sellPrice(
                selectedItem.rarity,
                selectedItem.dropFloor,
                selectedItem.enhanceLevel,
              ),
            })}
          </ActionButton>
          {/* Phase 6-E — 버리기 대신 합성. 선택한 아이템이 첫 재료.
              legend(다음 등급 없음)와 사진 부적은 iOS 와 같이 버튼 자체를 숨긴다. */}
          {!selectedItem.photoId && NEXT_RARITY[selectedItem.rarity] !== null && (
            <ActionButton
              onClick={() => {
                setTab("bag");
                enterSynthMode(selectedItem);
              }}
            >
              {t("uphero.equip.action.synth")}
            </ActionButton>
          )}
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
          label={t("uphero.equip.tabBag")}
        />
        <EqTabButton
          active={tab === "photo"}
          onClick={() => setTab("photo")}
          label={t("uphero.equip.tabTalisman")}
        />
        <EqTabButton
          active={tab === "enhance"}
          onClick={() => setTab("enhance")}
          label={t("uphero.equip.tabEnhance")}
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
        {/* 가방 — 현재 인벤토리 grid. Phase 6-E: n/cap 헤더 + 슬롯 필터 + 합성 모드 */}
        {tab === "bag" && (
          <section className="flex flex-col min-h-full">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span
                className="typo-micro tabular-nums"
                style={{
                  color: inventory.length >= INVENTORY_CAP ? GB_WARN : GB.light,
                  fontWeight: inventory.length >= INVENTORY_CAP ? 600 : 400,
                }}
              >
                {t("uphero.equip.bagCount", { n: inventory.length, cap: INVENTORY_CAP })}
              </span>
              {synthMode ? (
                <span className="typo-micro" style={{ color: GB.lightest }}>
                  {t("uphero.equip.synth.mode")}
                </span>
              ) : (
                inventory.length >= SYNTHESIS_INPUT_COUNT && (
                  <button
                    type="button"
                    onClick={() => enterSynthMode()}
                    className="typo-micro rounded px-2 py-1"
                    style={{
                      minHeight: 32,
                      background: `${GB.dark}66`,
                      color: GB.light,
                      border: "none",
                    }}
                  >
                    {t("uphero.equip.action.synth")}
                  </button>
                )
              )}
            </div>
            <SlotFilterChips value={slotFilter} onChange={setSlotFilter} counts={bagCounts} />
            {bagItems.length === 0 ? (
              <EmptyState text={t("uphero.equip.empty.bag")} />
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {bagItems.map((eq) => {
                  if (!synthMode) {
                    return (
                      <EquipmentCard
                        key={eq.id}
                        equipment={eq}
                        size="sm"
                        selected={eq.id === selectedId}
                        onClick={() =>
                          setSelectedId(eq.id === selectedId ? null : eq.id)
                        }
                      />
                    );
                  }
                  // 합성 모드 — 다중 선택. 등급 불일치·사진·전설은 흐리게 (탭하면 토스트).
                  const picked = synthPicks.includes(eq.id);
                  const first = synthPickItems[0];
                  const eligible =
                    !eq.photoId &&
                    eq.rarity !== "legend" &&
                    (!first || first.rarity === eq.rarity);
                  return (
                    <EquipmentCard
                      key={eq.id}
                      equipment={eq}
                      size="sm"
                      selected={picked}
                      onClick={() => onSynthPick(eq)}
                      style={eligible || picked ? undefined : { opacity: 0.4 }}
                    />
                  );
                })}
              </div>
            )}
            {synthMode && (
              <div
                className="sticky bottom-0 mt-3 pt-2 flex items-center gap-2"
                style={{ background: GB.darkest }}
              >
                <button
                  type="button"
                  onClick={exitSynthMode}
                  className="typo-caption rounded"
                  style={{
                    minHeight: 44,
                    padding: "10px 14px",
                    background: `${GB.dark}aa`,
                    color: GB.light,
                    border: "none",
                  }}
                >
                  {t("uphero.buff.cancel")}
                </button>
                <button
                  type="button"
                  onClick={onSynthConfirm}
                  disabled={synthPickItems.length !== SYNTHESIS_INPUT_COUNT || !synthNext}
                  className="typo-caption rounded flex-1 tabular-nums"
                  style={{
                    minHeight: 44,
                    padding: "10px 14px",
                    background: GB.lightest,
                    color: GB.darkest,
                    border: "none",
                    fontWeight: 600,
                    opacity: synthPickItems.length === SYNTHESIS_INPUT_COUNT ? 1 : 0.5,
                  }}
                >
                  {t("uphero.equip.synth.button", { n: synthPickItems.length })}
                </button>
              </div>
            )}
          </section>
        )}

        {/* 사진 부적 — CTA + 카운트 라벨 */}
        {tab === "photo" && (
          <section>
            <div
              className="typo-caption mb-3 inline-flex items-center gap-1.5"
              style={{ color: GB.lightest }}
            >
              <PixelIcon name="Camera" size={14} color={GB.lightest} />
              {t("uphero.equip.photo.heading")}
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
                  ? t("uphero.equip.ritualOpen")
                  : t("uphero.equip.ritualNoPhotos")}
              </span>
              <span className={gbClass.textDim}>
                {t("uphero.equip.photo.priceMeta")}
              </span>
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
                label={t("uphero.equip.talismanBound")}
                count={photoCounts.boundCount}
                accent={GB.lightest}
              />
              <CountTile
                iconName="Image"
                label={t("uphero.equip.talismanUnbound")}
                count={photoCounts.unboundCount}
                accent={GB.light}
              />
            </div>

            {/* 전체 총합 / 도움 문구 */}
            <div
              className={`typo-caption ${gbClass.textDim} mt-3 text-center leading-relaxed`}
            >
              {t("uphero.equip.photo.archiveTotal", {
                n: photoCounts.totalPhotos,
              })}
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
              {t("uphero.equip.enhance.heading", { max: MAX_ENHANCE_LEVEL })}
            </div>
            {/* Phase 6-E — 슬롯 필터 + "장착 중으로" 점프. */}
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <SlotFilterChips value={slotFilter} onChange={setSlotFilter} />
              </div>
              {firstEquippedEnhanceId && (
                <button
                  type="button"
                  onClick={() => {
                    const reduce =
                      typeof window !== "undefined" &&
                      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
                    document
                      .getElementById("eq-enhance-equipped")
                      ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
                  }}
                  className="typo-micro rounded px-2 py-1 shrink-0"
                  style={{
                    minHeight: 32,
                    background: `${GB.dark}66`,
                    color: GB.lightest,
                    border: "none",
                  }}
                >
                  {t("uphero.equip.enhance.jumpEquipped")}
                </button>
              )}
            </div>
            {enhanceableItems.length === 0 ? (
              <EmptyState text={t("uphero.equip.empty.enhance")} />
            ) : (
              <div className="flex flex-col gap-1.5">
                {enhanceableItems.length > 0 && !equippedIds.has(enhanceableItems[0].id) && (
                  <div className={`typo-micro ${gbClass.textDim}`}>
                    {t("uphero.equip.enhance.groupBag")}
                  </div>
                )}
                {enhanceableItems.map((item) => {
                  const level = item.enhanceLevel ?? 0;
                  const cost = enhanceCost(item.rarity, level);
                  const streak = item.enhanceFailStreak ?? 0;
                  // Phase 11c R4 — pity streak 가산 성공률.
                  const rate = enhanceSuccessRate(item.rarity, level, streak);
                  const canAfford = coins >= cost;
                  const rColor = RARITY_COLOR[item.rarity];
                  // Phase 5-B — 칭호 칩 + 밴드 배지.
                  const enhanceTitle = getEnhanceTitle(level);
                  // Phase 11c R4 R2 — 장착 중인 아이템인지 표시 (destroy 시 스탯 하락 경고).
                  const isEquipped = equippedIds.has(item.id);
                  return (
                    <div key={item.id} className="flex flex-col gap-1.5">
                    {item.id === firstEquippedEnhanceId && (
                      <div
                        id="eq-enhance-equipped"
                        className={`typo-micro ${gbClass.textDim} pt-2`}
                        style={{ scrollMarginTop: 8 }}
                      >
                        {t("uphero.equip.enhance.groupEquipped")}
                      </div>
                    )}
                    <div
                      className="flex items-center gap-2 rounded px-2.5 py-2"
                      style={{
                        background: `${GB.dark}66`,
                        border: `1px solid ${rColor}55`,
                      }}
                    >
                      <PixelIcon name={item.iconName} size={18} color={rColor} />
                      <div className="flex-1 min-w-0">
                        <div
                          className="typo-caption flex items-center gap-1 min-w-0"
                          style={{ color: GB.lightest }}
                        >
                          <span className="truncate">
                            {equipmentNameById(
                              item.baseId ?? "",
                              item.name,
                              language,
                            )}
                          </span>
                          {enhanceTitle && (
                            <span
                              className="typo-micro shrink-0 px-1 rounded-sm"
                              style={{
                                background: `${GB.lightest}22`,
                                color: GB.lightest,
                              }}
                              aria-label={t("uphero.enhance.title.chipAria", {
                                title: t(`uphero.enhance.title.${enhanceTitle}` as const),
                              })}
                            >
                              {t(`uphero.enhance.title.${enhanceTitle}` as const)}
                            </span>
                          )}
                        </div>
                        <div
                          className={`typo-micro tabular-nums ${gbClass.textDim} flex items-center gap-2 flex-wrap`}
                        >
                          <span>+{level} → +{level + 1}</span>
                          <span style={{ color: rColor }}>
                            {Math.round(rate * 100)}%
                          </span>
                          {/* Phase 11c R4 — pity streak 노출 (legend/unique 에서 의미). */}
                          {streak > 0 && (
                            <span
                              style={{ color: "#e8b887" }}
                              aria-label={t("uphero.equip.enhance.pityAria", {
                                n: streak,
                              })}
                            >
                              pity ×{streak}
                            </span>
                          )}
                          {/* Phase 15 — 안전 구간(+0→+3)은 "유지 100%" 대신 "안전"
                              으로 말한다. 100% 라는 숫자를 확률처럼 늘어놓으면
                              나머지 구간의 숫자와 같은 무게로 읽혀 오히려 흐릿해진다. */}
                          {/* Phase 5-B — 상위 밴드 배지: 10..14 "실패 시 한 단계 하락",
                              15..19 "소실 N%". 유지 확률이 0 인 구간에서 "보존 0%" 는
                              숫자만 남고 뜻이 죽는다. */}
                          {isEnhanceSafeLevel(item.rarity, level) ? (
                            <span style={{ color: GB.lightest }}>
                              {t("uphero.equip.enhanceSafeBadge")}
                            </span>
                          ) : level >= ENHANCE_TITLE_LEVELS.awakened ? (
                            <span style={{ color: GB_WARN }}>
                              {t("uphero.equip.enhanceBadge.destroyPct", {
                                pct: Math.round(
                                  enhanceOutcomeRates(item.rarity, level).destroy * 100,
                                ),
                              })}
                            </span>
                          ) : level >= ENHANCE_HIGH_BAND_START ? (
                            <span>{t("uphero.equip.enhanceBadge.downOnly")}</span>
                          ) : (
                            <span>
                              {t("uphero.equip.enhancePreserveBadge", {
                                pct: Math.round(
                                  enhanceOutcomeRates(item.rarity, level).keep * 100,
                                ),
                              })}
                            </span>
                          )}
                          {/* Phase 11c R4 R2 — 장착 중 배지. 실패-소실 시 즉시 스탯 감소 안내. */}
                          {isEquipped && (
                            <span
                              style={{ color: GB_WARN, fontWeight: 600 }}
                              aria-label={t("uphero.equip.equippedAria")}
                            >
                              {t("uphero.equip.enhance.equippedBadge")}
                            </span>
                          )}
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
                        {t("uphero.equip.enhance.button", { cost })}
                      </button>
                    </div>
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
            ? t("uphero.equip.confirm.sellTitle", {
                name: equipmentNameById(
                  pending.item.baseId ?? "",
                  pending.item.name,
                  language,
                ),
              })
            : pending?.kind === "synth"
              ? t("uphero.equip.confirm.synthTitle", {
                  rarity: t(`uphero.rarity.${pending.items[0].rarity}` as const),
                })
              : pending?.kind === "enhance"
                ? t("uphero.equip.confirm.enhanceTitle", {
                    name: equipmentNameById(
                      pending.item.baseId ?? "",
                      pending.item.name,
                      language,
                    ),
                    from: pending.item.enhanceLevel ?? 0,
                    to: (pending.item.enhanceLevel ?? 0) + 1,
                  })
                : ""
        }
        body={
          pending?.kind === "sell" ? (
            t("uphero.equip.confirm.sellBody", {
              coins: sellPrice(
                pending.item.rarity,
                pending.item.dropFloor,
                pending.item.enhanceLevel,
              ),
            })
          ) : pending?.kind === "synth" ? (
            t("uphero.equip.confirm.synthBody", {
              next: t(`uphero.rarity.${pending.next}` as const),
            })
          ) : pending?.kind === "enhance" ? (
            <>
              {(() => {
                // Phase 12 i18n — "성공률 N%" 의 숫자만 강조 색으로 묶기.
                // 2026-08 버그 수정: 템플릿이 이미 "%" 를 갖고 있으므로 span 안에는
                //   숫자만 넣는다. 예전엔 여기서 `{pct}%` 를 렌더해 "86%%" 가 됐다.
                //   "%" 는 잘려나온 after 가 그대로 들고 있어 화면에선 이어져 보인다.
                const pct = Math.round(pending.successRate * 100);
                const [before, after] = splitAtToken(
                  t("uphero.equip.confirm.successRate", { pct: "__PCT__" }),
                  "__PCT__",
                );
                return (
                  <>
                    {before}
                    <span style={{ color: GB.lightest }}>{pct}</span>
                    {after}
                  </>
                );
              })()}
              <br />
              {/* Phase 15 — 위험 안내는 정직하게. 안전 구간에서는 소실·하락이 둘 다
                  0 이므로 "실패해도 그대로" 라고만 말하고, 위험 구간에서만 실패 시의
                  소실/하락 확률을 각각 숫자로 보여준다. 방지권을 걸어 그 결과가
                  막히는 항목은 같은 줄에서 "막힘" 으로 표시한다 — 확률은 그대로
                  굴러가지만 결과가 바뀌므로, 숫자를 지우는 대신 상태를 덧붙인다. */}
              {(() => {
                const lvl = pending.item.enhanceLevel ?? 0;
                if (isEnhanceSafeLevel(pending.item.rarity, lvl)) {
                  return (
                    <span style={{ color: GB.lightest }}>
                      {t("uphero.equip.enhanceSafeHint")}
                    </span>
                  );
                }
                const rates = enhanceOutcomeRates(pending.item.rarity, lvl);
                // Phase 5-B — "막힘" 은 실제로 arm 되는 조건과 같다:
                //   켜짐 && 보유 > 0 && 그 결과가 이 레벨에서 가능.
                const destroyBlocked =
                  armDestroyGuard && destroyGuards > 0 && rates.destroy > 0;
                const downBlocked = armDownGuard && downGuards > 0 && rates.down > 0;
                const pct = (n: number) => Math.round(n * 100);
                // 밴드 힌트 — 10..14 는 하락 전용 + +9 재노출, 15..19 는 소실 주 + 두 방지권.
                const bandHint =
                  lvl >= ENHANCE_TITLE_LEVELS.awakened
                    ? t("uphero.equip.enhanceBandHint.top")
                    : lvl >= ENHANCE_HIGH_BAND_START
                      ? t("uphero.equip.enhanceBandHint.mid")
                      : null;
                return (
                  <>
                    {rates.destroy > 0 && (
                      <>
                        <span style={{ color: destroyBlocked ? GB.light : GB_WARN }}>
                          {t("uphero.equip.enhanceDestroyHint", {
                            pct: pct(rates.destroy),
                          })}
                          {destroyBlocked && ` ${t("uphero.equip.guard.blockedTag")}`}
                        </span>
                        <br />
                      </>
                    )}
                    {rates.down > 0 && (
                      <>
                        <span style={{ color: downBlocked ? GB.light : GB_WARN }}>
                          {t("uphero.equip.enhanceDownHint", { pct: pct(rates.down) })}
                          {downBlocked && ` ${t("uphero.equip.guard.blockedTag")}`}
                        </span>
                        <br />
                      </>
                    )}
                    {bandHint && (
                      <>
                        <span style={{ color: GB.light }}>{bandHint}</span>
                        <br />
                      </>
                    )}
                  </>
                );
              })()}
              {(() => {
                // Phase 12 i18n — cost 숫자만 강조. (템플릿의 "코인"/"C" 단위는
                //   after 가 들고 있으므로 span 에는 숫자만.)
                const [before, after] = splitAtToken(
                  t("uphero.equip.enhanceCost", { cost: "__COST__", coins }),
                  "__COST__",
                );
                return (
                  <>
                    {before}
                    <span style={{ color: GB.lightest }}>{pending.cost}</span>
                    {after}
                  </>
                );
              })()}
              {/* Phase 5-B — 방지권이 하나라도 걸리면 이번 시도의 총 값을 한 줄로.
                  코인 + 방지권 이름들. 확인 버튼을 누르기 전에 무엇이 나가는지 보인다. */}
              {(() => {
                const lvl = pending.item.enhanceLevel ?? 0;
                const wards: string[] = [];
                if (
                  armDestroyGuard &&
                  destroyGuards > 0 &&
                  canEnhanceDestroy(pending.item.rarity, lvl)
                ) {
                  wards.push(t("uphero.guard.destroy.name"));
                }
                if (
                  armDownGuard &&
                  downGuards > 0 &&
                  canEnhanceDowngrade(pending.item.rarity, lvl)
                ) {
                  wards.push(t("uphero.guard.down.name"));
                }
                if (wards.length === 0) return null;
                return (
                  <>
                    <br />
                    <span style={{ color: GB.lightest }}>
                      {t("uphero.equip.enhance.attemptSummary", {
                        cost: pending.cost,
                        wards: wards.join(" + "),
                      })}
                    </span>
                  </>
                );
              })()}
              {/* Phase 11c R4 R2 — equipped 장비 강화 시 추가 경고 (소실 → 스탯 즉시 하락). */}
              {(["weapon", "armor", "accessory", "talisman"] as const).some(
                (s) => hero.equipped[s]?.id === pending.item.id,
              ) && (
                <>
                  <br />
                  <span style={{ color: GB_WARN }}>
                    {t("uphero.equip.confirm.equippedWarn")}
                  </span>
                </>
              )}
            </>
          ) : undefined
        }
        sections={
          // Phase 5-B — 방지권 패널 2종. 안전 구간(소실·하락 0)에서는 아예 그리지
          //   않는다. 그 외에는 둘 다 그리되, 불가능한 쪽은 회색 NA 로 남긴다.
          pending?.kind === "enhance" &&
          !isEnhanceSafeLevel(pending.item.rarity, pending.item.enhanceLevel ?? 0) ? (
            <>
              <div className="typo-micro" style={{ color: GB.light }}>
                {t("uphero.equip.guard.panelTitle")}
              </div>
              <GuardPanel
                kind="destroy"
                held={destroyGuards}
                armed={armDestroyGuard}
                applicable={canEnhanceDestroy(
                  pending.item.rarity,
                  pending.item.enhanceLevel ?? 0,
                )}
                onToggle={() => setArmDestroyGuard((v) => !v)}
              />
              <GuardPanel
                kind="down"
                held={downGuards}
                armed={armDownGuard}
                applicable={canEnhanceDowngrade(
                  pending.item.rarity,
                  pending.item.enhanceLevel ?? 0,
                )}
                onToggle={() => setArmDownGuard((v) => !v)}
              />
            </>
          ) : undefined
        }
        confirmLabel={
          pending?.kind === "sell"
            ? t("uphero.equip.action.sell")
            : pending?.kind === "synth"
              ? t("uphero.equip.action.synth")
              : pending?.kind === "enhance"
                ? t("uphero.equip.action.enhance")
                : t("uphero.equip.action.confirm")
        }
        danger={pending?.kind === "enhance"}
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
          band={ritual.band}
          onDone={() => {
            // outcome 별 sound 재생 — ritual 종료와 result modal 등장 사이.
            // Phase 5-B — band 0 은 기존 그대로, band 1/2 는 전용 큐.
            if (ritual.outcome === "success") {
              play(
                ritual.band === 2
                  ? "enhanceSuccessMax"
                  : ritual.band === 1
                    ? "enhanceSuccessHigh"
                    : "collect",
              );
            } else if (ritual.outcome === "destroyed") {
              play(ritual.band >= 1 ? "enhanceShatter" : "cancel");
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
      {/* Phase 6-E — 합성 결과. */}
      {synthResult && (
        <SynthesisResultModal item={synthResult} onClose={() => setSynthResult(null)} />
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
          /* Emil — press 0.97 통일 */
          transform: scale(0.97);
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
        padding: "8px 6px",
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
