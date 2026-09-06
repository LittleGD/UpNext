"use client";

/**
 * Up Hero — 가방 (격자 인벤토리).
 *
 * 화면은 위에서 아래로 고정 높이 4단이다:
 *   서브헤더 48 / BagBoard(남는 만큼) / 사진 부적 CTA 44 / BagTray 64 / BagActionBar 56.
 * 보드는 **절대 스크롤 컨테이너 안에 두지 않는다** — 격자는 한 화면에 다 보여야
 * "무엇이 어디 있는지"가 공간 기억으로 남는다. 대신 셀 크기가 44~56 사이에서 줄어든다.
 *
 * 탭(가방/사진/강화)은 제거했다. 강화는 선택 아이템의 액션바 버튼이고, 정렬된
 * 강화 개요는 서브헤더 오른쪽 아이콘이 여는 보조 시트다(같은 JSX 재사용).
 *
 * 상태 기계(플랜 §7): idle → selected(item) → placing(item, rot).
 *   - 아이템 탭 = 선택 / 같은 아이템 재탭 = 회전(무기만)
 *   - 빈 칸 탭 = 그 칸을 원점으로 배치
 *   - 앵커 탭 = 착용 아이템 선택 (해제·강화)
 * 드래그는 이 경로 위에 얹힌 것이고, 탭 경로가 항상 보장된 폴백이다.
 *
 * Phase 6-E (Track E) 통합: 합성은 액션바의 "합성" 으로 들어가는 **재료 고르기 모드**다
 *   (보드·트레이에서 같은 등급 3개, 사진 부적·전설·등급 불일치는 흐리게 + 토스트).
 *   강화 확인은 Track B/E 의 GuardPanel(기본 OFF, 시도당 소모)·밴드 힌트·"이번 시도"
 *   요약을 쓰고, 강화 개요 시트는 장착 마지막 정렬·슬롯 필터·"장착 중으로" 점프를 갖는다.
 */

import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useUpHeroStore, type EnhanceResult } from "@/store/useUpHeroStore";
import { useGrowthStore } from "@/store/useGrowthStore";
import { isPhotoBound, PHOTO_TALISMAN_MAX_ENHANCE_LEVEL } from "@/lib/photoTalisman";
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
  NEXT_RARITY,
  SYNTHESIS_INPUT_COUNT,
  sellPrice,
} from "@/types/uphero";
import type { Equipment, EquipSlot } from "@/types/uphero";
import type { Rarity } from "@/types/card";
import {
  bagRows,
  canRotate,
  computeBagSynergy,
  firstValidOriginCovering,
  normalizeBagLayout,
  normalizeRot,
  readPlacement,
} from "@/lib/upHeroBag";
import { GB, EASE_OUT, gbClass, GB_LEGEND, GB_UNIQUE, GB_RARE, GB_WARN } from "@/lib/upHeroPalette";
import { SLOT_ORDER } from "@/lib/equipmentSlotMeta";
import { useHeroLevel } from "./useHeroLevel";
import { useSound } from "@/hooks/useSound";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useTranslation } from "@/hooks/useTranslation";
import { equipmentNameById } from "@/lib/upHeroI18n";
import GbConfirm, { GbConfirmPanel } from "./GbConfirm";
import SlotFilterChips, { type SlotFilter } from "./SlotFilterChips";
import SynthesisResultModal from "./SynthesisResultModal";
import EnhanceRitualOverlay, {
  type EnhanceRitualOutcome,
} from "./EnhanceRitualOverlay";
import EnhanceResultModal, {
  type EnhanceModalVariant,
} from "./EnhanceResultModal";
import PixelIcon from "@/components/icons/PixelIcon";
import BagBoard, { type BagBoardHandle } from "./BagBoard";
import BagTray from "./BagTray";
import BagActionBar from "./BagActionBar";

// Phase 9b — PhotoTalismanPicker 는 picker 버튼 탭 시에만 필요.
const PhotoTalismanPicker = lazy(() => import("./PhotoTalismanPicker"));
// 영웅 칸 탭 → 스탯 패널. 포털 기반이라 fallback 없이 열어도 자연스럽다.
const HeroStatPanel = lazy(() => import("./HeroStatPanel"));

/** 서브헤더 높이 — 캠프 헤더(41) 아래 한 단. 플랜 §7 세로 예산. */
const SUB_HEADER_H = 48;
/** 사진 부적 CTA 한 줄. 트레이 머리줄로 붙는다. */
const PHOTO_CTA_H = 44;

/**
 * "새로 들어온 타일" 표식 — 첫 탭 전까지 모서리 점.
 *
 * 비영속이고 스토어에도 없다. 모듈 스코프에 두는 이유: 가방 화면은 탐험 정산
 * 뒤에 다시 **마운트**되는데, 컴포넌트 state 로 두면 매 진입마다 전부 새것이
 * 되거나 전부 헌것이 된다. 페이지 세션 동안만 살아 있으면 충분하다.
 */
const seenIds = new Set<string>();
/** 첫 마운트가 기존 아이템을 "본 것"으로 채웠는지. 렌더가 아니라 effect 에서만 바뀐다. */
let seenPrimed = false;

/**
 * i18n 템플릿에서 값 한 개를 강조 span 으로 감싸기 위한 분할 헬퍼.
 *
 * **주의 (2026-08 버그의 원인)**: 템플릿이 이미 단위 기호를 갖고 있다
 * (`"성공률 {pct}%"`). 그러니 span 안에는 **숫자만** 넣어야 한다.
 * String.prototype.split 대신 indexOf 를 쓰는 이유: 토큰이 두 번 이상 나오는
 * 템플릿에서 split 의 구조 분해가 나머지 조각을 조용히 버린다.
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

/** Phase 9a / 11a / 6-E — 판매/버리기/합성/강화 확인 dialog pending state.
 *   enhance 는 단일 아이템 + 비용 + 성공률 snapshot. synth 는 재료 3개 + 결과 등급. */
type PendingAction =
  | { kind: "sell"; item: Equipment }
  | { kind: "discard"; item: Equipment }
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
  const discardItem = useUpHeroStore((s) => s.discardItem);
  const synthesizeItems = useUpHeroStore((s) => s.synthesizeItems);
  const enhanceItem = useUpHeroStore((s) => s.enhanceItem);
  const placeItem = useUpHeroStore((s) => s.placeItem);
  // Phase 15 — 방지권 2종 보유 개수.
  const destroyGuards = useUpHeroStore((s) => s.destroyGuards ?? 0);
  const downGuards = useUpHeroStore((s) => s.downGuards ?? 0);
  // Phase 2-A — 영웅 레벨은 heroXp 풀 기준.
  const level = useHeroLevel();
  const { play } = useSound();
  const variant = getHeroAppearanceVariant(level) as 0 | 1 | 2;

  /** 보드 행 수 — 상점에서 산 행 수만이 근거다. 숫자 자체를 구독해 구매 즉시 다시 그린다. */
  const rows = useUpHeroStore((s) => bagRows(s.bagRowsBought));

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<EquipSlot | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placingRot, setPlacingRot] = useState(0);
  const [statsOpen, setStatsOpen] = useState(false);
  const [enhanceListOpen, setEnhanceListOpen] = useState(false);
  /** Phase 7 — 사진 부적 Picker 오버레이 표시 여부. */
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  /** Phase 9a — GbConfirm 으로 교체된 판매/버리기/합성/강화 pending state. */
  const [pending, setPending] = useState<PendingAction | null>(null);
  /**
   * Phase 15 → 5-B — 이번 강화 시도에 방지권을 걸지 여부 (2종 독립).
   * 기본 OFF 이고 확인 다이얼로그를 열 때마다 OFF 로 되돌린다 (onEnhance). 시도당
   * 소모라 켜둔 채 잊으면 매 시도 1장씩 조용히 나가므로, 명시적 선택만 받는다.
   */
  const [armDestroyGuard, setArmDestroyGuard] = useState(false);
  const [armDownGuard, setArmDownGuard] = useState(false);
  /** Phase 6-E — 강화 개요 시트의 슬롯 필터. */
  const [slotFilter, setSlotFilter] = useState<SlotFilter>("all");
  /** Phase 6-E — 합성 모드 + 재료 선택 (보드·트레이 공용). */
  const [synthMode, setSynthMode] = useState(false);
  const [synthPicks, setSynthPicks] = useState<string[]>([]);
  /** Phase 6-E — 합성 결과 모달. */
  const [synthResult, setSynthResult] = useState<Equipment | null>(null);

  const boardRef = useRef<BagBoardHandle>(null);

  // ─── 파생 상태 ─────────────────────────────────────────────────────────

  const layout = useMemo(
    () => normalizeBagLayout(inventory, rows).layout,
    [inventory, rows],
  );
  const synergy = useMemo(
    () => computeBagSynergy(hero.equipped, inventory, rows),
    [hero.equipped, inventory, rows],
  );
  /** 트레이 = 미배치 + 보류(좌표는 있지만 지금 rows 밖). 최신순. */
  const trayItems = useMemo(() => {
    const out = inventory.filter(
      (i) => layout.statusById[i.id] !== "placed",
    );
    return out.reverse();
  }, [inventory, layout]);
  const suspendedIds = useMemo(
    () => new Set(layout.suspended.map((i) => i.id)),
    [layout],
  );

  /**
   * 처음 마운트 때 있던 것은 "새것" 이 아니다 — 전부 점을 찍으면 신호가 죽는다.
   * `seenTick` 은 "탭해서 확인했다" 를 리렌더로 옮기는 트리거일 뿐이다(모듈 Set 은
   * 리액트가 관찰하지 못한다).
   */
  const [seenTick, setSeenTick] = useState(0);
  // 첫 마운트: 지금 있는 아이템을 전부 "본 것"으로 채운다. 렌더 중에 모듈 변수를
  //   바꾸면 순수성이 깨지므로(react-hooks/globals) effect 에서 한 번만 하고 tick 으로
  //   리렌더를 유도한다. 그 전 첫 프레임은 점을 하나도 찍지 않는다(아래 memo).
  useEffect(() => {
    if (seenPrimed) return;
    for (const i of inventory) seenIds.add(i.id);
    seenPrimed = true;
    setSeenTick((n) => n + 1);
    // 최초 1회만 — inventory 는 그 시점 스냅샷이면 충분하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const newIds = useMemo(() => {
    void seenTick;
    const out = new Set<string>();
    if (!seenPrimed) return out;
    for (const i of inventory) if (!seenIds.has(i.id)) out.add(i.id);
    return out;
  }, [inventory, seenTick]);
  const markSeen = useCallback((id: string) => {
    if (seenIds.has(id)) return;
    seenIds.add(id);
    setSeenTick((n) => n + 1);
  }, []);

  const selectedItem = selectedId
    ? (inventory.find((i) => i.id === selectedId) ?? null)
    : null;
  const selectedWorn = selectedSlot ? (hero.equipped[selectedSlot] ?? null) : null;

  const photoMetas = useGrowthStore((s) => s.photoMetas);
  const unboundPhotoCount = useMemo(
    () =>
      photoMetas.filter((p) => !isPhotoBound(p.id, inventory, hero.equipped))
        .length,
    [inventory, photoMetas, hero.equipped],
  );

  // ─── 선택 / 배치 ───────────────────────────────────────────────────────

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setSelectedSlot(null);
    setPlacing(false);
  }, []);

  /** 배치 커밋 — 성공하면 그 자리로, 실패하면 상태를 전혀 건드리지 않는다. */
  const commitPlace = useCallback(
    (itemId: string, x: number, y: number, rot: number, withSound: boolean) => {
      const res = placeItem(itemId, x, y, rot);
      if (res.ok) {
        markSeen(itemId);
        setPlacing(false);
        if (withSound) play("equip");
        onNotify(t("uphero.bag.toast.placed"));
      } else {
        if (withSound) play("cancel");
        onNotify(t("uphero.bag.toast.noSpace"));
      }
      return res;
    },
    [placeItem, play, onNotify, t, markSeen],
  );

  /** 같은 아이템 재탭 = 회전. 이미 놓여 있으면 제자리 회전까지 시도한다. */
  const rotateSelected = useCallback(() => {
    if (!selectedItem) return;
    if (!canRotate(selectedItem.type)) return;
    const nextRot = (placingRot + 1) % 2;
    const p = readPlacement(selectedItem);
    if (p) {
      const res = placeItem(selectedItem.id, p.x, p.y, nextRot);
      if (!res.ok) {
        play("cancel");
        onNotify(t("uphero.bag.toast.noSpace"));
        return;
      }
    }
    setPlacingRot(nextRot);
    play("select");
  }, [selectedItem, placingRot, placeItem, play, onNotify, t]);

  // ─── 합성 모드 (Track E) ─────────────────────────────────────────────

  /** 합성 재료 후보인가 — 사진 부적·전설은 절대 아니다. */
  const synthEligible = useCallback(
    (item: Equipment) => !item.photoId && NEXT_RARITY[item.rarity] !== null,
    [],
  );
  /** 재료 후보(사진·전설 제외)가 3개 이상일 때만 유휴 바에 합성 진입을 보인다. */
  const canStartSynth = useMemo(
    () => inventory.filter(synthEligible).length >= SYNTHESIS_INPUT_COUNT,
    [inventory, synthEligible],
  );
  const synthPickItems = useMemo(
    () =>
      synthPicks
        .map((id) => inventory.find((i) => i.id === id))
        .filter((i): i is Equipment => !!i),
    [synthPicks, inventory],
  );
  const synthNext = synthPickItems.length > 0 ? NEXT_RARITY[synthPickItems[0].rarity] : null;
  const synthPickSet = useMemo(() => new Set(synthPicks), [synthPicks]);
  /** 합성 모드에서 흐리게 그릴 타일 — 후보가 아니거나 첫 재료와 등급이 다른 것. */
  const synthDimmed = useMemo(() => {
    const out = new Set<string>();
    if (!synthMode) return out;
    const first = synthPickItems[0];
    for (const i of inventory) {
      if (synthPickSet.has(i.id)) continue;
      const eligible = synthEligible(i) && (!first || first.rarity === i.rarity);
      if (!eligible) out.add(i.id);
    }
    return out;
  }, [synthMode, inventory, synthPickItems, synthPickSet, synthEligible]);

  /** Phase 6-E — 합성 모드 진입. 선택한 아이템이 첫 재료가 된다. */
  const enterSynthMode = useCallback(
    (first?: Equipment | null) => {
      setSynthMode(true);
      setSynthPicks(first && synthEligible(first) ? [first.id] : []);
      clearSelection();
      play("select");
    },
    [synthEligible, clearSelection, play],
  );
  const exitSynthMode = useCallback(() => {
    setSynthMode(false);
    setSynthPicks([]);
  }, []);
  /** 합성 재료 토글 — 등급 불일치/사진 부적/전설은 토스트로 막는다. */
  const onSynthPick = useCallback(
    (item: Equipment) => {
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
      const first = synthPickItems[0];
      if (first && first.rarity !== item.rarity) {
        play("cancel");
        onNotify(t("uphero.equip.synth.rarityMismatch"));
        return;
      }
      if (synthPicks.length >= SYNTHESIS_INPUT_COUNT) return;
      // 함수형 갱신 — 빠른 연속 탭에서도 앞선 선택을 잃지 않는다.
      setSynthPicks((prev) =>
        prev.includes(item.id) || prev.length >= SYNTHESIS_INPUT_COUNT
          ? prev
          : [...prev, item.id],
      );
      markSeen(item.id);
      play("select");
    },
    [synthPicks, synthPickItems, play, onNotify, t, markSeen],
  );
  const onSynthConfirm = useCallback(() => {
    if (synthPickItems.length !== SYNTHESIS_INPUT_COUNT || !synthNext) return;
    setPending({ kind: "synth", items: synthPickItems, next: synthNext });
  }, [synthPickItems, synthNext]);

  const handleSelect = useCallback(
    (id: string | null) => {
      if (synthMode) {
        // 합성 모드에서는 탭이 전부 재료 토글이다 (빈 칸 탭은 무시).
        if (id == null) return;
        const item = inventory.find((i) => i.id === id);
        if (item) onSynthPick(item);
        return;
      }
      if (id == null) {
        clearSelection();
        return;
      }
      if (id === selectedId) {
        rotateSelected();
        return;
      }
      const item = inventory.find((i) => i.id === id);
      if (!item) return;
      markSeen(id);
      setSelectedSlot(null);
      setSelectedId(id);
      setPlacingRot(normalizeRot(item.bagRot));
      setPlacing(false);
      play("select");
    },
    [synthMode, selectedId, inventory, rotateSelected, clearSelection, play, markSeen, onSynthPick],
  );

  /**
   * 빈 칸 탭 = 그 칸을 **덮는** 자리에 놓기. 탭한 칸을 원점으로만 쓰면 1x2 무기를 맨 윗줄에
   * 탭했을 때 footprint 가 보드 밖으로 나가 거절된다 — 덮는 원점 후보를 순서대로 시도한다.
   */
  const handleTapEmptyCell = useCallback(
    (x: number, y: number) => {
      if (synthMode) return;
      if (!selectedId) {
        clearSelection();
        return;
      }
      const item = inventory.find((i) => i.id === selectedId);
      if (!item) return;
      const origin = firstValidOriginCovering(
        layout.occupancy,
        rows,
        item.type,
        placingRot,
        x,
        y,
        item.id,
      );
      if (!origin) {
        play("cancel");
        onNotify(t("uphero.bag.toast.noSpace"));
        return;
      }
      commitPlace(selectedId, origin.x, origin.y, placingRot, true);
    },
    [synthMode, selectedId, inventory, layout.occupancy, rows, placingRot, commitPlace, clearSelection, play, onNotify, t],
  );

  /** 보드 드래그 커밋 — 소리·햅틱은 보드가 결과를 보고 직접 낸다. */
  const handleDropAt = useCallback(
    (itemId: string, x: number, y: number, rot: number) =>
      commitPlace(itemId, x, y, rot, false),
    [commitPlace],
  );

  /** 트레이 롱프레스 드래그 — 보드 ref 로 화면 좌표를 원점 칸으로 바꾼다. */
  const handleDragToBoard = useCallback(
    (itemId: string, clientX: number, clientY: number, rot: number) => {
      const item = inventory.find((i) => i.id === itemId);
      if (!item) return;
      const origin = boardRef.current?.originFromPoint(
        clientX,
        clientY,
        item.type,
        rot,
      );
      if (!origin) {
        play("cancel");
        onNotify(t("uphero.bag.toast.noSpace"));
        return;
      }
      commitPlace(itemId, origin.x, origin.y, rot, true);
    },
    [inventory, commitPlace, play, onNotify, t],
  );

  const handleTapWorn = useCallback(
    (slot: EquipSlot) => {
      if (synthMode) return;
      if (!hero.equipped[slot]) return;
      setSelectedId(null);
      setPlacing(false);
      setSelectedSlot(slot);
      play("select");
    },
    [synthMode, hero.equipped, play],
  );

  // ─── 장착 / 해제 / 판매 / 버리기 / 강화 ────────────────────────────────

  const onEquip = useCallback(
    (item: Equipment) => {
      equipItem(item.id, item.type);
      play("equip");
      onNotify(
        t("uphero.equip.toast.equipped", {
          name: equipmentNameById(item.baseId ?? "", item.name, language),
        }),
      );
      clearSelection();
    },
    [equipItem, play, onNotify, t, language, clearSelection],
  );

  const onUnequipSlot = useCallback(
    (slot: EquipSlot) => {
      const item = hero.equipped[slot];
      if (!item) return;
      unequipItem(slot);
      play("equip");
      onNotify(
        t("uphero.equip.toast.unequipped", {
          name: equipmentNameById(item.baseId ?? "", item.name, language),
        }),
      );
      clearSelection();
    },
    [hero.equipped, unequipItem, play, onNotify, t, language, clearSelection],
  );

  /** 강화 시도 — 확인 다이얼로그 표시. Phase 5-B — 방지권 토글은 열 때마다 OFF (시도당 소모). */
  const onEnhance = useCallback((item: Equipment) => {
    const lvl = item.enhanceLevel ?? 0;
    const cost = enhanceCost(item.rarity, lvl);
    // Phase 11c R4 — pity streak 반영된 성공률 표시.
    const rate = enhanceSuccessRate(item.rarity, lvl, item.enhanceFailStreak ?? 0);
    setArmDestroyGuard(false);
    setArmDownGuard(false);
    setPending({ kind: "enhance", item, cost, successRate: rate });
  }, []);

  /** Phase 11a — 강화 연출 state. confirm → ritual (밴드별 2.0/2.6/3.4s) → result modal. */
  const [ritual, setRitual] = useState<{
    item: Equipment;
    outcome: EnhanceRitualOutcome;
    band: 0 | 1 | 2;
  } | null>(null);
  const [resultModal, setResultModal] = useState<EnhanceModalVariant | null>(
    null,
  );
  /** ritual 연출 끝나면 여기 저장된 variant 로 결과 모달 open. */
  const [pendingResult, setPendingResult] = useState<EnhanceModalVariant | null>(
    null,
  );

  /** pending 액션 실행 — GbConfirm 확인 시 호출 */
  const executePending = () => {
    if (!pending) return;
    if (pending.kind === "sell") {
      const refund = sellItem(pending.item.id);
      play("collect");
      onNotify(t("uphero.equip.toast.sold", { coins: refund }));
      clearSelection();
    } else if (pending.kind === "discard") {
      discardItem(pending.item.id);
      play("cancel");
      onNotify(t("uphero.equip.toast.discarded"));
      clearSelection();
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
      // Phase 11a — 결과를 먼저 받고 ritual → 결과 모달. ritual 은 "입력 아이템"
      //   기준이라 store mutate 이후에도 stale 문제가 없다.
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
          // 사진 부적은 +10 이 상한이다. 20 을 그대로 찍으면 "왜 막혔는지" 가 어긋난다.
          onNotify(
            t("uphero.equip.toast.maxEnhance", {
              max: pending.item.photoId
                ? PHOTO_TALISMAN_MAX_ENHANCE_LEVEL
                : MAX_ENHANCE_LEVEL,
            }),
          );
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
      // Phase 5-B — 밴드별 연출. band >= 1 은 시작 시 충전음 (결과와 무관해 스포일 아님).
      const band = enhanceRitualBand(lvl + 1);
      setRitual({ item: pending.item, outcome, band });
      if (band >= 1) play("enhanceCharge");
      setPendingResult(modal);
      clearSelection();
    }
    setPending(null);
  };

  const RARITY_COLOR: Record<Rarity, string> = {
    normal: GB.light,
    rare: GB_RARE,
    unique: GB_UNIQUE,
    legend: GB_LEGEND,
  };

  // Phase 11a — 강화 가능한 아이템 리스트 (인벤 + 착용). 보조 시트에서 쓴다.
  // Phase 5-B — 사진 부적(photoId) 은 제외. 부적은 재의식(+10 상한) 경로만 쓴다.
  // Phase 6-E — 정렬: 장착 중 마지막 → 등급 (legend 먼저) → 강화 단계 내림차순.
  //   슬롯 필터 + 장착 그룹 앞에 id="eq-enhance-equipped" 구분선.
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

  // 보조 시트의 Esc·포커스 트랩. 확인/연출이 위에 떠 있는 동안은 비활성 —
  //   트랩 두 개가 서로 포커스를 뺏으면 아무 데도 닿지 않는다.
  const sheetRef = useRef<HTMLDivElement>(null);
  useModalA11y(sheetRef, () => setEnhanceListOpen(false), {
    disabled:
      !enhanceListOpen || pending != null || ritual != null || resultModal != null,
  });

  const enhanceList = (
    <div className="flex flex-col gap-1.5">
      {enhanceableItems.length > 0 && !equippedIds.has(enhanceableItems[0].id) && (
        <div className={`typo-micro ${gbClass.textDim}`}>
          {t("uphero.equip.enhance.groupBag")}
        </div>
      )}
      {enhanceableItems.map((item) => {
        const lvl = item.enhanceLevel ?? 0;
        const cost = enhanceCost(item.rarity, lvl);
        const streak = item.enhanceFailStreak ?? 0;
        const rate = enhanceSuccessRate(item.rarity, lvl, streak);
        const canAfford = coins >= cost;
        const rColor = RARITY_COLOR[item.rarity];
        // Phase 5-B — 칭호 칩 + 밴드 배지.
        const enhanceTitle = getEnhanceTitle(lvl);
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
                    {equipmentNameById(item.baseId ?? "", item.name, language)}
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
                  <span>+{lvl} → +{lvl + 1}</span>
                  <span style={{ color: rColor }}>{Math.round(rate * 100)}%</span>
                  {streak > 0 && (
                    <span
                      style={{ color: "#e8b887" }}
                      aria-label={t("uphero.equip.enhance.pityAria", { n: streak })}
                    >
                      pity ×{streak}
                    </span>
                  )}
                  {/* Phase 15 — 안전 구간(+0→+3)은 "유지 100%" 대신 "안전".
                      Phase 5-B — 상위 밴드 배지: 10..14 "실패 시 한 단계 하락",
                      15..19 "소실 N%". */}
                  {isEnhanceSafeLevel(item.rarity, lvl) ? (
                    <span style={{ color: GB.lightest }}>
                      {t("uphero.equip.enhanceSafeBadge")}
                    </span>
                  ) : lvl >= ENHANCE_TITLE_LEVELS.awakened ? (
                    <span style={{ color: GB_WARN }}>
                      {t("uphero.equip.enhanceBadge.destroyPct", {
                        pct: Math.round(
                          enhanceOutcomeRates(item.rarity, lvl).destroy * 100,
                        ),
                      })}
                    </span>
                  ) : lvl >= ENHANCE_HIGH_BAND_START ? (
                    <span>{t("uphero.equip.enhanceBadge.downOnly")}</span>
                  ) : (
                    <span>
                      {t("uphero.equip.enhancePreserveBadge", {
                        pct: Math.round(
                          enhanceOutcomeRates(item.rarity, lvl).keep * 100,
                        ),
                      })}
                    </span>
                  )}
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
                  border: "none",
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
        @media (prefers-reduced-motion: reduce) {
          .uphero-enhance-btn {
            transition: none;
          }
        }
      `}</style>
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* === 서브헤더 === 뒤로 44 / 제목 / 강화 목록 44 */}
      <header
        className="px-2 flex items-center gap-1 shrink-0"
        style={{ height: SUB_HEADER_H, borderBottom: `1px solid ${GB.dark}` }}
      >
        <button
          type="button"
          onClick={onBack}
          className="uphero-back-btn typo-caption inline-flex items-center gap-0.5 rounded"
          style={{
            minHeight: 44,
            minWidth: 44,
            padding: "6px 8px",
            background: "transparent",
            border: "none",
            color: GB.light,
          }}
          aria-label={t("uphero.equip.back.aria")}
        >
          <PixelIcon name="ChevronLeft" size={14} color={GB.light} />
          {t("uphero.equip.back")}
        </button>
        <div
          className="typo-body flex-1 ml-1 truncate"
          style={{ color: GB.lightest, fontWeight: 500 }}
        >
          {t("uphero.bag.title")}
        </div>
        <button
          type="button"
          onClick={() => {
            play("select");
            setEnhanceListOpen(true);
          }}
          className="uphero-back-btn rounded inline-flex items-center justify-center"
          style={{
            width: 44,
            height: 44,
            background: "transparent",
            border: "none",
            color: GB.light,
          }}
          aria-label={t("uphero.bag.enhanceList")}
        >
          <PixelIcon name="Fire" size={18} color={GB.light} />
        </button>
        <style jsx>{`
          .uphero-back-btn {
            transition: transform 120ms ${EASE_OUT}, background 160ms ${EASE_OUT};
          }
          .uphero-back-btn:active {
            transform: scale(0.97);
            background: ${GB.dark}66;
          }
          @media (prefers-reduced-motion: reduce) {
            .uphero-back-btn {
              transition: none;
            }
            .uphero-back-btn:active {
              transform: none;
            }
          }
        `}</style>
      </header>

      {/* === 격자 보드 === */}
      <BagBoard
        ref={boardRef}
        rows={rows}
        inventory={inventory}
        equipped={hero.equipped}
        classType={hero.classType}
        heroVariant={variant}
        selectedId={selectedId}
        selectedSlot={selectedSlot}
        placingRot={placingRot}
        synergy={synergy}
        newIds={newIds}
        pickedIds={synthPickSet}
        dimmedIds={synthDimmed}
        onSelect={handleSelect}
        onTapEmptyCell={handleTapEmptyCell}
        onTapWorn={handleTapWorn}
        onTapHero={() => setStatsOpen(true)}
        onDropAt={handleDropAt}
        onRequestDiscard={(id) => {
          const item = inventory.find((i) => i.id === id);
          if (item) setPending({ kind: "discard", item });
        }}
      />

      {/* === 사진 부적 CTA (트레이 머리줄) === */}
      <button
        type="button"
        onClick={() => {
          play("select");
          setPhotoPickerOpen(true);
        }}
        disabled={unboundPhotoCount === 0}
        title={t("uphero.bag.photoHint")}
        className="uphero-photo-cta shrink-0 flex items-center gap-2 px-3 typo-caption"
        style={{
          height: PHOTO_CTA_H,
          borderTop: `1px solid ${GB.dark}`,
          background: unboundPhotoCount > 0 ? `${GB.dark}44` : "transparent",
          color: GB.light,
          textAlign: "left",
          opacity: unboundPhotoCount > 0 ? 1 : 0.55,
        }}
      >
        <PixelIcon name="Camera" size={14} color={GB.light} />
        <span className="flex-1 truncate" style={{ color: GB.lightest }}>
          {unboundPhotoCount > 0
            ? t("uphero.bag.photoCta")
            : t("uphero.equip.ritualNoPhotos")}
        </span>
        <span className={`${gbClass.textDim} tabular-nums shrink-0`}>
          {t("uphero.equip.photo.priceMeta")}
        </span>
        <style jsx>{`
          .uphero-photo-cta {
            transition: transform 140ms ${EASE_OUT};
          }
          .uphero-photo-cta:not(:disabled):active {
            transform: scale(0.99);
          }
          @media (prefers-reduced-motion: reduce) {
            .uphero-photo-cta {
              transition: none;
            }
            .uphero-photo-cta:not(:disabled):active {
              transform: none;
            }
          }
        `}</style>
      </button>

      {/* === 정리 대기 트레이 === */}
      <BagTray
        items={trayItems}
        suspendedIds={suspendedIds}
        selectedId={selectedId}
        synergy={synergy}
        pickedIds={synthPickSet}
        dimmedIds={synthDimmed}
        onSelect={handleSelect}
        onDragToBoard={handleDragToBoard}
      />

      {/* === 액션바 (항상 마운트) === */}
      <BagActionBar
        item={selectedItem}
        wornSlot={selectedWorn ? selectedSlot : null}
        placing={placing}
        trayCount={trayItems.length}
        rotatable={selectedItem ? canRotate(selectedItem.type) : false}
        synthMode={synthMode}
        synthCount={synthPickItems.length}
        canStartSynth={canStartSynth}
        onPlace={() => setPlacing(true)}
        onRotate={rotateSelected}
        onEquip={() => selectedItem && onEquip(selectedItem)}
        onUnequip={() => selectedSlot && onUnequipSlot(selectedSlot)}
        onEnhance={() => {
          const target = selectedItem ?? selectedWorn;
          if (target) onEnhance(target);
        }}
        onSell={() =>
          selectedItem && setPending({ kind: "sell", item: selectedItem })
        }
        onCancel={clearSelection}
        onSynth={() => enterSynthMode(selectedItem)}
        onSynthConfirm={onSynthConfirm}
        onSynthCancel={exitSynthMode}
      />

      {/* === 강화 목록 (보조 시트) === */}
      {enhanceListOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("uphero.bag.enhanceList")}
            className="fixed inset-0 z-50 flex flex-col"
            style={{
              background: GB.darkest,
              color: GB.light,
              paddingTop: "calc(env(safe-area-inset-top) + 10px)",
              paddingBottom: "calc(max(env(safe-area-inset-bottom), 24px) + 10px)",
              outline: "none",
            }}
          >
            <header
              className="px-3 flex items-center justify-between shrink-0"
              style={{ height: SUB_HEADER_H, borderBottom: `1px solid ${GB.dark}` }}
            >
              <div className="typo-body" style={{ color: GB.lightest, fontWeight: 500 }}>
                {t("uphero.bag.enhanceList")}
              </div>
              <button
                type="button"
                onClick={() => setEnhanceListOpen(false)}
                className="typo-caption rounded"
                style={{
                  minHeight: 44,
                  minWidth: 44,
                  padding: "6px 10px",
                  background: "transparent",
                  border: "none",
                  color: GB.light,
                }}
              >
                {t("uphero.stat.close")}
              </button>
            </header>
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
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
                <div
                  className={`typo-caption ${gbClass.textDim} text-center py-8 leading-relaxed`}
                >
                  {t("uphero.equip.empty.enhance")}
                </div>
              ) : (
                enhanceList
              )}
            </div>
          </div>,
          document.body,
        )}

      {/* 영웅 칸 탭 — 스탯 패널 (가방 시너지 합 표시) */}
      {statsOpen && (
        <Suspense fallback={null}>
          <HeroStatPanel onClose={() => setStatsOpen(false)} />
        </Suspense>
      )}

      {/* Phase 7 / 9b — 사진 부적 Picker (lazy overlay portal) */}
      {photoPickerOpen && (
        <Suspense fallback={null}>
          <PhotoTalismanPicker
            onClose={() => setPhotoPickerOpen(false)}
            onNotify={onNotify}
          />
        </Suspense>
      )}

      {/* Phase 9a — 판매/버리기/합성/강화 confirm 다이얼로그. pending 하나로 네 액션 공유. */}
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
            : pending?.kind === "discard"
              ? t("uphero.equip.confirm.discardTitle", {
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
          ) : pending?.kind === "discard" ? (
            t("uphero.equip.noRefund")
          ) : pending?.kind === "synth" ? (
            t("uphero.equip.confirm.synthBody", {
              next: t(`uphero.rarity.${pending.next}` as const),
            })
          ) : pending?.kind === "enhance" ? (
            <>
              {(() => {
                // "성공률 N%" 의 숫자만 강조 색으로. 템플릿이 "%" 를 갖고 있으므로
                //   span 안에는 숫자만 넣는다 (그렇지 않으면 "86%%").
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
              {/* Phase 15 — 안전 구간에선 "실패해도 그대로", 위험 구간에서만 소실/하락
                  확률을 각각 숫자로. 방지권이 막는 항목은 같은 줄에 "막힘" 을 덧붙인다. */}
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
              {/* Phase 5-B — 방지권이 하나라도 걸리면 이번 시도의 총 값을 한 줄로. */}
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
              {equippedIds.has(pending.item.id) && (
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
            : pending?.kind === "discard"
              ? t("uphero.equip.action.discard")
              : pending?.kind === "synth"
                ? t("uphero.equip.action.synth")
                : pending?.kind === "enhance"
                  ? t("uphero.equip.action.enhance")
                  : t("uphero.equip.action.confirm")
        }
        danger={pending?.kind === "discard" || pending?.kind === "enhance"}
        onConfirm={executePending}
        onCancel={() => setPending(null)}
      />

      {/* Phase 11a — 강화 연출 → 결과 모달 순서.
           Phase 11b-fix — 소리는 ritual 이 끝날 때 재생해야 연출 동안 결과 스포일러 안 됨. */}
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
              // keep — 애매한 결과. cancel 은 너무 negative 하니 아무 소리 안 냄.
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
