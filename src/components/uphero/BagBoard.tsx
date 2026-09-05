"use client";

/**
 * Up Hero — 격자 가방 보드.
 *
 * 5열 × rows 행. 데이터 좌표는 row 0 이 십자이고, 화면은 `visualRow` 로 뒤집어
 * 십자가 **아래쪽 엄지 영역**에 오게 그린다. 새 행은 위로 쌓인다.
 *
 * 왜 절대 배치인가: 1x2 / 2x2 아이템이 여러 칸을 덮어야 하는데, CSS grid 의
 * span 은 "데이터 row 를 뒤집어 그린다" 와 같이 쓰면 행 계산이 두 겹이 된다.
 * 칸 크기를 한 번 재고(ResizeObserver → `bagCellSize`) 좌표를 px 로 직접
 * 환산하는 편이 드래그 히트테스트와도 같은 수식을 공유해 어긋나지 않는다.
 *
 * 상태 기계는 **부모(EquipmentInventory)** 가 갖는다. 보드는 "무엇을 눌렀다"만
 * 올려보내고 selectedId·placingRot 은 prop 으로 받는다 — 트레이에서 고른 아이템을
 * 보드 빈 칸에 놓는 경로가 있어 선택 상태가 보드보다 위에 있어야 한다.
 *
 * 접근성: root `role="grid"`, 각 칸 `role="gridcell"` 버튼, roving tabindex
 * (화살표 이동 · Enter/Space 선택·배치 · R 회전 · Esc 취소 · Delete 버리기).
 * 빈 칸은 **아이템을 고른 동안에만** 포커스 대상이 된다 — 아무것도 안 고른
 * 상태에서 20개 빈 칸을 탭으로 지나가게 만들 이유가 없다.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BAG_ANCHORS,
  BAG_ANCHOR_ORDER,
  BAG_COLS,
  BAG_GAP,
  BAG_HERO_CELL,
  bagCellSize,
  cellIndex,
  checkPlacement,
  footprint,
  isCrossCell,
  isPhotoTalisman,
  normalizeBagLayout,
  readPlacement,
  shapeFor,
  visualRow,
  type BagCell,
  type BagSynergy,
} from "@/lib/upHeroBag";
import {
  CLASS_THEME_COLOR,
  MAX_ENHANCE_LEVEL,
  type Equipment,
  type EquipSlot,
  type Hero,
  type HeroBaseStats,
} from "@/types/uphero";
import type { PlaceResult } from "@/store/useUpHeroStore";
import {
  EASE_OUT,
  GB,
  GB_LEGEND,
  GB_RARITY_GLOW,
  GB_WARN,
} from "@/lib/upHeroPalette";
import { useGameStore } from "@/store/useGameStore";
import { playSound, triggerHaptic } from "@/lib/sounds";
import { useAnnounce } from "@/hooks/useAnnounce";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useTranslation } from "@/hooks/useTranslation";
import { affixStatLabel, equipmentNameById } from "@/lib/upHeroI18n";
import type { DictKey } from "@/i18n";
import PixelIcon from "@/components/icons/PixelIcon";
import HeroSprite from "./HeroSprite";
import EquipmentPhotoThumb from "./EquipmentPhotoThumb";

/** 탭과 드래그를 가르는 이동량(px). 플랜 §7 값. */
export const BAG_DRAG_THRESHOLD = 6;
/** 앵커 델타 한 줄이 쓰는 높이(px). 보드 높이에서 미리 빼고 셀 크기를 잰다. */
const FOOTER_H = 18;

/**
 * 햅틱 의도 매핑.
 *
 * 플랜은 들기 light / 유효 앵커 변경 selection / 배치 medium / 거부 warning 을
 * 요구하는데, 웹 `triggerHaptic` 은 `SoundName` 만 받는다(sounds.ts 의
 * HAPTIC_INTENT 표가 이름 → 의도를 정해 둔다). 그래서 **같은 의도를 가진
 * 이름**으로 옮긴다. 소리는 별도로 골라 재생하므로 여기서 소리는 나지 않는다.
 */
const HAPTIC_LIFT = "cardFlip"; // → light
const HAPTIC_MOVE = "cardSelect"; // → selection
const HAPTIC_DROP = "confirm"; // → medium
const HAPTIC_REJECT = "curseTrigger"; // → warning

const SLOT_LABEL_KEY: Record<EquipSlot, DictKey> = {
  weapon: "uphero.slot.weapon",
  armor: "uphero.slot.armor",
  accessory: "uphero.slot.accessory",
  talisman: "uphero.slot.talisman",
};

/** 앵커가 비었을 때 그리는 슬롯 아이콘 (PixelIcon 이름). */
const SLOT_ICON: Record<EquipSlot, string> = {
  weapon: "Sword",
  armor: "Shield",
  accessory: "Zap",
  talisman: "Moon",
};

export interface BagBoardHandle {
  /** 화면 좌표 → 데이터 칸. 보드 밖이면 null. 트레이 드래그가 이 좌표로 놓는다. */
  cellFromPoint(clientX: number, clientY: number): BagCell | null;
  /**
   * 화면 좌표 → **원점 칸**. 들린 프리뷰가 손가락 한 칸 위에 있으므로 한 칸 위를
   * 기준으로 잡고, 모양 높이만큼 데이터 row 를 내려 원점을 만든다.
   * (footprint 는 데이터 아래쪽으로 자라는데 화면은 뒤집혀 있어 그냥 칸을 쓰면
   *  1x2 무기가 한 칸 어긋난다.)
   */
  originFromPoint(
    clientX: number,
    clientY: number,
    type: EquipSlot,
    rot: number,
  ): BagCell | null;
}

interface BagBoardProps {
  rows: number;
  inventory: Equipment[];
  equipped: Hero["equipped"];
  classType: Hero["classType"];
  /** 레벨 기반 외형 variant — 캠프 헤더가 이미 계산한 값을 그대로 받는다. */
  heroVariant: 0 | 1 | 2;
  selectedId: string | null;
  /** 앵커를 눌러 고른 착용 슬롯. 그 앵커만 라임 보더, 나머지 착용 앵커는 등급색. */
  selectedSlot: EquipSlot | null;
  placingRot: number;
  synergy: BagSynergy;
  newIds: ReadonlySet<string>;
  onSelect: (id: string | null) => void;
  onTapEmptyCell: (x: number, y: number) => void;
  onTapWorn: (slot: EquipSlot) => void;
  onTapHero: () => void;
  onDropAt: (itemId: string, x: number, y: number, rot: number) => PlaceResult;
  onRequestDiscard?: (id: string) => void;
}

/** 모양의 폭·높이(칸 수). */
function shapeExtent(type: EquipSlot, rot: number): { w: number; h: number } {
  let w = 1;
  let h = 1;
  for (const c of shapeFor(type, rot)) {
    w = Math.max(w, c.x + 1);
    h = Math.max(h, c.y + 1);
  }
  return { w, h };
}

/** 모양 라벨 키 — SR 이 "세로 2칸" 처럼 읽게. */
function shapeKey(type: EquipSlot, rot: number): DictKey {
  const { w, h } = shapeExtent(type, rot);
  if (w === 2 && h === 2) return "uphero.bag.shape.2x2";
  if (w === 2) return "uphero.bag.shape.2x1";
  if (h === 2) return "uphero.bag.shape.1x2";
  return "uphero.bag.shape.1x1";
}

interface DragState {
  itemId: string;
  type: EquipSlot;
  rot: number;
  /** 손가락 화면 좌표 */
  px: number;
  py: number;
  origin: BagCell | null;
  valid: boolean;
}

interface SnapState {
  item: Equipment;
  rot: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  settled: boolean;
}

const BagBoard = forwardRef<BagBoardHandle, BagBoardProps>(function BagBoard(
  {
    rows,
    inventory,
    equipped,
    classType,
    heroVariant,
    selectedId,
    selectedSlot,
    placingRot,
    synergy,
    newIds,
    onSelect,
    onTapEmptyCell,
    onTapWorn,
    onTapHero,
    onDropAt,
    onRequestDiscard,
  },
  ref,
) {
  const { t, language } = useTranslation();
  const { announce } = useAnnounce();
  const reducedMotion = useReducedMotion();
  const soundEnabled = useGameStore((s) => s.progress.soundEnabled ?? true);
  const hapticEnabled = useGameStore((s) => s.progress.hapticEnabled ?? true);

  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  // 보드는 스크롤 컨테이너 안에 두지 않는다 — 남는 만큼만 쓰고 셀 크기를 줄인다.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setBox((prev) =>
        prev.w === r.width && prev.h === r.height
          ? prev
          : { w: r.width, h: r.height },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cell = bagCellSize(box.w || 320, Math.max(0, (box.h || 320) - FOOTER_H), rows);
  const step = cell + BAG_GAP;
  const gridW = BAG_COLS * cell + BAG_GAP * (BAG_COLS - 1);
  const gridH = rows * cell + BAG_GAP * (rows - 1);

  const layout = useMemo(
    () => normalizeBagLayout(inventory, rows).layout,
    [inventory, rows],
  );

  /** 소리·햅틱을 의도별로 따로 고른다 (설정 토글은 useSound 와 같은 두 값). */
  const feedback = useCallback(
    (sound: "equip" | "cancel" | null, haptic: string | null) => {
      if (sound && soundEnabled) playSound(sound);
      if (haptic && hapticEnabled) {
        triggerHaptic(haptic as Parameters<typeof triggerHaptic>[0]);
      }
    },
    [soundEnabled, hapticEnabled],
  );

  // ─── 좌표 변환 ─────────────────────────────────────────────────────────

  const cellFromPoint = useCallback(
    (clientX: number, clientY: number): BagCell | null => {
      const el = gridRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const col = Math.floor((clientX - r.left) / step);
      const vr = Math.floor((clientY - r.top) / step);
      if (col < 0 || col >= BAG_COLS || vr < 0 || vr >= rows) return null;
      return { x: col, y: rows - 1 - vr };
    },
    [step, rows],
  );

  const originFromPoint = useCallback(
    (
      clientX: number,
      clientY: number,
      type: EquipSlot,
      rot: number,
    ): BagCell | null => {
      const el = gridRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const col = Math.floor((clientX - r.left) / step);
      // 들린 프리뷰는 손가락 한 칸 위에 떠 있다.
      const vr = Math.floor((clientY - step - r.top) / step);
      if (col < 0 || col >= BAG_COLS || vr < 0 || vr >= rows) return null;
      const { h } = shapeExtent(type, rot);
      return { x: col, y: rows - vr - h };
    },
    [step, rows],
  );

  useImperativeHandle(ref, () => ({ cellFromPoint, originFromPoint }), [
    cellFromPoint,
    originFromPoint,
  ]);

  // ─── 타일 목록 ─────────────────────────────────────────────────────────

  const tiles = useMemo(
    () =>
      layout.placed.map((item) => {
        const p = readPlacement(item)!;
        const { w, h } = shapeExtent(item.type, p.rot);
        return { item, p, w, h };
      }),
    [layout],
  );

  /** 칸 → 포커스 대상 키. 아이템은 원점 하나로 접는다. */
  const ownerKeys = useMemo(() => {
    const out: (string | null)[] = new Array(BAG_COLS * rows).fill(null);
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < BAG_COLS; x += 1) {
        if (x === BAG_HERO_CELL.x && y === BAG_HERO_CELL.y) {
          out[cellIndex(x, y)] = "hero";
        }
      }
    }
    for (const slot of BAG_ANCHOR_ORDER) {
      const a = BAG_ANCHORS[slot];
      if (a.y < rows) out[cellIndex(a.x, a.y)] = `anchor:${slot}`;
    }
    for (const { item, p } of tiles) {
      for (const c of footprint(item.type, p.x, p.y, p.rot)) {
        out[cellIndex(c.x, c.y)] = `item:${item.id}`;
      }
    }
    return out;
  }, [tiles, rows]);

  const [focusCell, setFocusCell] = useState<BagCell>({ x: 0, y: 0 });
  const focusKey =
    ownerKeys[cellIndex(focusCell.x, focusCell.y)] ??
    (selectedId ? `empty:${focusCell.x},${focusCell.y}` : null);
  /** 포커스 가능한 것이 하나도 매칭되지 않는 상황을 위한 폴백. */
  const fallbackKey = useMemo(() => {
    for (const k of ownerKeys) if (k) return k;
    return null;
  }, [ownerKeys]);
  const activeKey = focusKey ?? fallbackKey;

  const elRefs = useRef(new Map<string, HTMLButtonElement>());
  const registerEl = useCallback((key: string, el: HTMLButtonElement | null) => {
    if (el) elRefs.current.set(key, el);
    else elRefs.current.delete(key);
  }, []);

  const moveFocus = useCallback(
    (dx: number, dy: number) => {
      let { x, y } = focusCell;
      for (let i = 0; i < BAG_COLS * rows; i += 1) {
        x += dx;
        y += dy;
        if (x < 0 || x >= BAG_COLS || y < 0 || y >= rows) return;
        const owner = ownerKeys[cellIndex(x, y)];
        // 아무것도 안 고른 상태에서는 빈 칸을 건너뛴다.
        if (owner || selectedId) {
          setFocusCell({ x, y });
          const key = owner ?? `empty:${x},${y}`;
          window.requestAnimationFrame(() => elRefs.current.get(key)?.focus());
          return;
        }
      }
    },
    [focusCell, ownerKeys, rows, selectedId],
  );

  // ─── 시너지 ────────────────────────────────────────────────────────────

  /** 아이템별 시너지 요약 문장 (SR 라벨용). */
  const synergyTextFor = useCallback(
    (item: Equipment): string => {
      const parts: string[] = [];
      for (const link of synergy.links) {
        if (link.sourceId !== item.id && link.partnerId !== item.id) continue;
        const stat = link.stat ? affixStatLabel(link.stat, language) : "";
        if (link.rule === "S1") {
          parts.push(
            t("uphero.bag.synergy.s1", { stat, pct: link.amount ?? 0 }),
          );
        } else if (link.rule === "S2") {
          parts.push(t("uphero.bag.synergy.s2", { n: link.amount ?? 0 }));
        } else if (link.rule === "S3") {
          parts.push(t("uphero.bag.synergy.s3", { n: link.amount ?? 0 }));
        } else if (link.rule === "S4") {
          parts.push(
            t("uphero.bag.synergy.s4", { stat, n: link.amount ?? 0 }),
          );
        } else {
          parts.push(t("uphero.bag.synergy.s6"));
        }
      }
      if (parts.length === 0) return t("uphero.bag.synergy.none");
      return parts.join(", ");
    },
    [synergy.links, language, t],
  );

  /** 앵커 델타 한 줄 — 어떤 앵커가 얼마를 받고 있는지. */
  const anchorDeltaText = useMemo(() => {
    const chunks: string[] = [];
    for (const slot of BAG_ANCHOR_ORDER) {
      const per = synergy.perAnchor[slot];
      const keys = Object.keys(per) as Array<keyof HeroBaseStats>;
      if (keys.length === 0) continue;
      const deltas = keys
        .map((k) => `+${per[k] ?? 0} ${affixStatLabel(k, language)}`)
        .join(" ");
      chunks.push(`${t(SLOT_LABEL_KEY[slot])} ${deltas}`);
    }
    return chunks.join("  ·  ");
  }, [synergy.perAnchor, language, t]);

  // ─── 포인터 (탭 / 드래그) ──────────────────────────────────────────────

  const pressRef = useRef<{
    pointerId: number;
    item: Equipment;
    rot: number;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [snap, setSnap] = useState<SnapState | null>(null);

  const setDragState = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const beginSnapBack = useCallback(
    (item: Equipment, rot: number, from: { x: number; y: number }) => {
      if (reducedMotion) return;
      const el = gridRef.current;
      const p = readPlacement(item);
      if (!el || !p) return;
      const r = el.getBoundingClientRect();
      const { h } = shapeExtent(item.type, rot);
      const to = {
        x: r.left + p.x * step,
        y: r.top + visualRow(p.y + h - 1, rows) * step,
      };
      setSnap({ item, rot, from, to, settled: false });
    },
    [reducedMotion, step, rows],
  );

  // 스냅백은 두 프레임에 걸쳐 일어난다: 놓친 자리에 한 번 그리고, 다음 프레임에
  //   원래 자리로 transform 을 걸어 150ms 동안 돌아간다.
  useEffect(() => {
    if (!snap || snap.settled) return;
    const id = window.requestAnimationFrame(() => {
      setSnap((s) => (s && !s.settled ? { ...s, settled: true } : s));
    });
    return () => window.cancelAnimationFrame(id);
  }, [snap]);
  useEffect(() => {
    if (!snap?.settled) return;
    const id = window.setTimeout(() => setSnap(null), 170);
    return () => window.clearTimeout(id);
  }, [snap]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.isPrimary) return;
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-bag-item]");
      const id = el?.dataset.bagItem;
      if (!id) return; // 십자·빈 칸은 각자의 onClick 이 처리한다.
      const item = tiles.find((tt) => tt.item.id === id)?.item;
      if (!item) return;
      const p = readPlacement(item);
      pressRef.current = {
        pointerId: e.pointerId,
        item,
        // 이미 고른 아이템이면 액션바에서 돌린 회전(placingRot)을 그대로 들고 간다.
        rot: item.id === selectedId ? placingRot : (p?.rot ?? 0),
        startX: e.clientX,
        startY: e.clientY,
        dragging: false,
      };
      // 캡처 실패(이미 끝난 포인터, 합성 이벤트)는 드래그를 막을 이유가 아니다 — 무시한다.
      try {
        rootRef.current?.setPointerCapture?.(e.pointerId);
      } catch {
        /* noop */
      }
    },
    [tiles, selectedId, placingRot],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const press = pressRef.current;
      if (!press || press.pointerId !== e.pointerId) return;
      const dx = e.clientX - press.startX;
      const dy = e.clientY - press.startY;
      if (!press.dragging) {
        if (Math.hypot(dx, dy) < BAG_DRAG_THRESHOLD) return;
        press.dragging = true;
        feedback(null, HAPTIC_LIFT);
      }
      const origin = originFromPoint(
        e.clientX,
        e.clientY,
        press.item.type,
        press.rot,
      );
      const valid =
        origin != null &&
        checkPlacement(
          layout.occupancy,
          rows,
          press.item.type,
          origin.x,
          origin.y,
          press.rot,
          press.item.id,
        ) === "ok";
      const prev = dragRef.current;
      // 유효한 자리로 **바뀔 때만** 짧은 selection 햅틱. 프레임마다 울리면 안 된다.
      if (
        valid &&
        origin &&
        (!prev?.valid || prev.origin?.x !== origin.x || prev.origin?.y !== origin.y)
      ) {
        feedback(null, HAPTIC_MOVE);
      }
      setDragState({
        itemId: press.item.id,
        type: press.item.type,
        rot: press.rot,
        px: e.clientX,
        py: e.clientY,
        origin,
        valid,
      });
    },
    [feedback, originFromPoint, layout.occupancy, rows, setDragState],
  );

  const finishPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
      const press = pressRef.current;
      if (!press || press.pointerId !== e.pointerId) return;
      pressRef.current = null;
      try {
        rootRef.current?.releasePointerCapture?.(e.pointerId);
      } catch {
        /* noop */
      }
      const d = dragRef.current;
      setDragState(null);

      if (!press.dragging) {
        // 탭 — 선택/회전은 부모가 판정한다.
        onSelect(press.item.id);
        return;
      }

      const rejected = () => {
        feedback("cancel", HAPTIC_REJECT);
        beginSnapBack(press.item, press.rot, {
          x: (d?.px ?? press.startX) - cell / 2,
          y: (d?.py ?? press.startY) - cell / 2 - step,
        });
      };

      if (cancelled || !d || !d.origin || !d.valid) {
        rejected();
        return;
      }
      const res = onDropAt(press.item.id, d.origin.x, d.origin.y, press.rot);
      if (!res.ok) {
        rejected();
        return;
      }
      feedback("equip", HAPTIC_DROP);
      announce(
        t("uphero.bag.announce.placed", {
          name: equipmentNameById(
            press.item.baseId ?? "",
            press.item.name,
            language,
          ),
          synergy: synergyTextFor(press.item),
        }),
      );
    },
    [
      announce,
      beginSnapBack,
      cell,
      feedback,
      language,
      onDropAt,
      onSelect,
      setDragState,
      step,
      synergyTextFor,
      t,
    ],
  );

  // ─── 키보드 ────────────────────────────────────────────────────────────

  const activateCell = useCallback(() => {
    const owner = ownerKeys[cellIndex(focusCell.x, focusCell.y)];
    if (!owner) {
      if (selectedId) onTapEmptyCell(focusCell.x, focusCell.y);
      return;
    }
    if (owner === "hero") {
      onTapHero();
      return;
    }
    if (owner.startsWith("anchor:")) {
      onTapWorn(owner.slice("anchor:".length) as EquipSlot);
      return;
    }
    onSelect(owner.slice("item:".length));
  }, [
    focusCell,
    onSelect,
    onTapEmptyCell,
    onTapHero,
    onTapWorn,
    ownerKeys,
    selectedId,
  ]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        // 화면이 뒤집혀 있으니 "위" 는 데이터 row 가 커지는 방향이다.
        case "ArrowUp":
          e.preventDefault();
          moveFocus(0, 1);
          return;
        case "ArrowDown":
          e.preventDefault();
          moveFocus(0, -1);
          return;
        case "ArrowLeft":
          e.preventDefault();
          moveFocus(-1, 0);
          return;
        case "ArrowRight":
          e.preventDefault();
          moveFocus(1, 0);
          return;
        case "Enter":
        case " ":
          e.preventDefault();
          activateCell();
          return;
        case "r":
        case "R":
          if (selectedId) {
            e.preventDefault();
            onSelect(selectedId);
          }
          return;
        case "Escape":
          if (selectedId) {
            e.preventDefault();
            onSelect(null);
          }
          return;
        case "Delete":
        case "Backspace": {
          const owner = ownerKeys[cellIndex(focusCell.x, focusCell.y)];
          const id = owner?.startsWith("item:")
            ? owner.slice("item:".length)
            : selectedId;
          if (id && onRequestDiscard) {
            e.preventDefault();
            onRequestDiscard(id);
          }
          return;
        }
        default:
      }
    },
    [
      activateCell,
      focusCell,
      moveFocus,
      onRequestDiscard,
      onSelect,
      ownerKeys,
      selectedId,
    ],
  );

  // ─── 렌더 조각 ─────────────────────────────────────────────────────────

  const ghostCells: BagCell[] =
    drag && drag.origin
      ? footprint(drag.type, drag.origin.x, drag.origin.y, drag.rot).filter(
          (c) => c.x >= 0 && c.x < BAG_COLS && c.y >= 0 && c.y < rows,
        )
      : [];

  const cellCenter = (c: BagCell) => ({
    cx: c.x * step + cell / 2,
    cy: visualRow(c.y, rows) * step + cell / 2,
  });

  const heroSpriteSize = cell < 52 ? 36 : 48;
  const iconSize = cell < 52 ? 22 : 26;

  /** 데이터 row 별로 role="row" 컨테이너를 만들어 grid 시맨틱을 지킨다. */
  const rowsIndices = Array.from({ length: rows }, (_, i) => i);

  return (
    <div
      ref={rootRef}
      className="flex-1 min-h-0 flex flex-col items-center justify-center relative"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finishPointer(e, false)}
      onPointerCancel={(e) => finishPointer(e, true)}
      onLostPointerCapture={(e) => finishPointer(e, true)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={gridRef}
        role="grid"
        aria-label={t("uphero.bag.title")}
        aria-rowcount={rows}
        aria-colcount={BAG_COLS}
        onKeyDown={onKeyDown}
        className="relative"
        style={{ width: gridW, height: gridH }}
      >
        {/* 가방 실루엣 — 빈 칸을 항상 옅게 깔아 "가방이 몇 칸인지"가 보이게 한다.
            (선택 중에 뜨는 빈 칸 버튼은 이 위에 겹친다. 십자·타일 아래라 이벤트 없음.) */}
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
          {rowsIndices.map((y) =>
            Array.from({ length: BAG_COLS }, (_, x) => x)
              .filter((x) => !isCrossCell(x, y))
              .map((x) => (
                <div
                  key={`bg-${x}-${y}`}
                  className="absolute rounded-sm"
                  style={{
                    left: x * step,
                    top: visualRow(y, rows) * step,
                    width: cell,
                    height: cell,
                    background: `${GB.dark}2e`,
                  }}
                />
              )),
          )}
        </div>
        {rowsIndices.map((vr) => (
          <div
            key={vr}
            role="row"
            aria-rowindex={vr + 1}
            className="absolute left-0"
            style={{
              top: vr * step,
              width: gridW,
              height: cell,
              pointerEvents: "none",
            }}
          >
            {/* 십자 칸 — 채움만, 보더 없음 */}
            {BAG_ANCHOR_ORDER.filter(
              (slot) => visualRow(BAG_ANCHORS[slot].y, rows) === vr,
            ).map((slot) => {
              const a = BAG_ANCHORS[slot];
              const worn = equipped[slot];
              const key = `anchor:${slot}`;
              return (
                <button
                  key={key}
                  type="button"
                  ref={(el) => registerEl(key, el)}
                  role="gridcell"
                  aria-colindex={a.x + 1}
                  aria-selected={worn != null && selectedSlot === slot}
                  tabIndex={activeKey === key ? 0 : -1}
                  onFocus={() => setFocusCell({ x: a.x, y: a.y })}
                  onClick={() => worn && onTapWorn(slot)}
                  aria-label={
                    worn
                      ? t("uphero.bag.anchor.worn", {
                          slot: t(SLOT_LABEL_KEY[slot]),
                          name: equipmentNameById(
                            worn.baseId ?? "",
                            worn.name,
                            language,
                          ),
                        })
                      : t("uphero.bag.anchor.empty", {
                          slot: t(SLOT_LABEL_KEY[slot]),
                        })
                  }
                  className="bag-cell absolute rounded-sm flex items-center justify-center"
                  style={{
                    left: a.x * step,
                    top: 0,
                    width: cell,
                    height: cell,
                    background: GB.dark,
                    // 보더는 의미가 있을 때만: 착용 = 등급색, 지금 고른 앵커 = 라임(화면에 하나).
                    border: worn
                      ? `1px solid ${
                          selectedSlot === slot
                            ? GB.lightest
                            : (GB_RARITY_GLOW[worn.rarity] ?? GB.light)
                        }`
                      : "none",
                    pointerEvents: "auto",
                  }}
                >
                  {worn ? (
                    worn.photoId ? (
                      <EquipmentPhotoThumb
                        photoId={worn.photoId}
                        size={iconSize + 6}
                        bordered={false}
                      />
                    ) : (
                      <PixelIcon
                        name={worn.iconName}
                        size={iconSize}
                        color={GB.lightest}
                      />
                    )
                  ) : (
                    <PixelIcon
                      name={SLOT_ICON[slot]}
                      size={iconSize}
                      color={`${GB.light}66`}
                    />
                  )}
                </button>
              );
            })}

            {/* 영웅 칸 */}
            {visualRow(BAG_HERO_CELL.y, rows) === vr && (
              <button
                type="button"
                ref={(el) => registerEl("hero", el)}
                role="gridcell"
                aria-colindex={BAG_HERO_CELL.x + 1}
                tabIndex={activeKey === "hero" ? 0 : -1}
                onFocus={() => setFocusCell({ ...BAG_HERO_CELL })}
                onClick={onTapHero}
                aria-label={t("uphero.bag.hero")}
                className="bag-cell absolute rounded-sm flex items-center justify-center overflow-hidden"
                style={{
                  left: BAG_HERO_CELL.x * step,
                  top: 0,
                  width: cell,
                  height: cell,
                  background: GB.dark,
                  border: "none",
                  pointerEvents: "auto",
                }}
              >
                {/* 정수 배율만 쓴다 — 셀에 맞춰 늘리면 도트가 뭉갠다. */}
                <HeroSprite
                  variant={heroVariant}
                  size={heroSpriteSize}
                  classType={classType}
                  color={
                    classType ? CLASS_THEME_COLOR[classType] : GB.lightest
                  }
                />
              </button>
            )}

            {/* 빈 칸 — 아이템을 고른 동안에만 노출 */}
            {selectedId &&
              Array.from({ length: BAG_COLS }, (_, x) => x)
                .filter((x) => !ownerKeys[cellIndex(x, rows - 1 - vr)])
                .map((x) => {
                  const y = rows - 1 - vr;
                  const key = `empty:${x},${y}`;
                  return (
                    <button
                      key={key}
                      type="button"
                      ref={(el) => registerEl(key, el)}
                      role="gridcell"
                      aria-colindex={x + 1}
                      tabIndex={activeKey === key ? 0 : -1}
                      onFocus={() => setFocusCell({ x, y })}
                      onClick={() => onTapEmptyCell(x, y)}
                      aria-label={t("uphero.bag.cell.empty", {
                        col: x + 1,
                        row: vr + 1,
                      })}
                      className="bag-cell absolute rounded-sm"
                      style={{
                        left: x * step,
                        top: 0,
                        width: cell,
                        height: cell,
                        background: `${GB.dark}55`,
                        border: "none",
                        pointerEvents: "auto",
                      }}
                    />
                  );
                })}

            {/* 가방 타일 — 이 행이 타일의 시각 첫 행일 때만 그린다 */}
            {tiles
              .filter(
                ({ p, h }) => visualRow(p.y + h - 1, rows) === vr,
              )
              .map(({ item, p, w, h }) => {
                const key = `item:${item.id}`;
                const selected = item.id === selectedId;
                const rarity = GB_RARITY_GLOW[item.rarity] ?? GB.light;
                const enhance = item.enhanceLevel ?? 0;
                const dragging = drag?.itemId === item.id;
                return (
                  <button
                    key={key}
                    type="button"
                    ref={(el) => registerEl(key, el)}
                    data-bag-item={item.id}
                    role="gridcell"
                    aria-colindex={p.x + 1}
                    aria-selected={selected}
                    tabIndex={activeKey === key ? 0 : -1}
                    onFocus={() => setFocusCell({ x: p.x, y: p.y })}
                    aria-label={t("uphero.bag.cell.item", {
                      rarity: t(`uphero.rarity.${item.rarity}` as DictKey),
                      name: equipmentNameById(
                        item.baseId ?? "",
                        item.name,
                        language,
                      ),
                      shape: t(shapeKey(item.type, p.rot)),
                      synergy: synergyTextFor(item),
                    })}
                    className="bag-tile absolute rounded-sm flex items-center justify-center"
                    style={{
                      left: p.x * step,
                      top: 0,
                      width: w * cell + (w - 1) * BAG_GAP,
                      height: h * cell + (h - 1) * BAG_GAP,
                      background: `${GB.dark}dd`,
                      border: `1px solid ${selected ? GB.lightest : rarity}`,
                      boxShadow: `0 0 6px ${rarity}44`,
                      opacity: dragging ? 0.35 : 1,
                      pointerEvents: "auto",
                    }}
                  >
                    {item.photoId ? (
                      <EquipmentPhotoThumb
                        photoId={item.photoId}
                        size={iconSize + 8}
                        bordered={false}
                      />
                    ) : (
                      <PixelIcon
                        name={item.iconName}
                        size={iconSize}
                        color={rarity}
                      />
                    )}
                    {enhance > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute typo-micro tabular-nums px-1 rounded-sm pointer-events-none"
                        style={{
                          left: 2,
                          top: 2,
                          fontSize: 9,
                          lineHeight: 1.3,
                          background:
                            enhance >= MAX_ENHANCE_LEVEL
                              ? GB_LEGEND
                              : `${GB.darkest}dd`,
                          color:
                            enhance >= MAX_ENHANCE_LEVEL
                              ? GB.darkest
                              : GB.lightest,
                        }}
                      >
                        +{enhance}
                      </span>
                    )}
                    {newIds.has(item.id) && (
                      <span
                        aria-hidden="true"
                        className="absolute pointer-events-none"
                        style={{
                          right: 2,
                          top: 2,
                          width: 4,
                          height: 4,
                          background: GB.lightest,
                        }}
                      />
                    )}
                  </button>
                );
              })}
          </div>
        ))}

        {/* 드래그 고스트 — 유효/무효를 색으로만 말한다 */}
        {ghostCells.map((c) => (
          <div
            key={`ghost-${c.x}-${c.y}`}
            aria-hidden="true"
            className="absolute rounded-sm pointer-events-none"
            style={{
              left: c.x * step,
              top: visualRow(c.y, rows) * step,
              width: cell,
              height: cell,
              background: drag?.valid ? `${GB.lightest}38` : `${GB_WARN}38`,
              border: drag?.valid ? "none" : `1px dashed ${GB_WARN}`,
            }}
          />
        ))}

        {/* 시너지 커넥터 — 오버레이 1장, 이벤트 없음 */}
        <svg
          aria-hidden="true"
          className="absolute left-0 top-0 pointer-events-none"
          width={gridW}
          height={gridH}
        >
          {synergy.links.map((link, i) => {
            const a = cellCenter(link.cells[0]);
            const b = cellCenter(link.cells[1]);
            const mx = (a.cx + b.cx) / 2;
            const my = (a.cy + b.cy) / 2;
            const hot = link.sourceId === selectedId;
            const color = hot ? GB.lightest : GB.light;
            const diagonal = a.cx !== b.cx && a.cy !== b.cy;
            if (diagonal) {
              // S4 대각 — 공유 모서리에 점 하나.
              return (
                <circle
                  key={`${link.rule}-${link.sourceId}-${i}`}
                  cx={mx}
                  cy={my}
                  r={2}
                  fill={color}
                />
              );
            }
            const half = cell * 0.3;
            const vertical = a.cx !== b.cx; // 좌우 인접 = 공유 변이 세로
            return (
              <line
                key={`${link.rule}-${link.sourceId}-${i}`}
                x1={vertical ? mx : mx - half}
                y1={vertical ? my - half : my}
                x2={vertical ? mx : mx + half}
                y2={vertical ? my + half : my}
                stroke={color}
                strokeWidth={3}
                strokeLinecap="round"
              />
            );
          })}
        </svg>
      </div>

      {/* 앵커 델타 — 시너지가 실제로 무엇을 주는지 숫자로 */}
      <div
        className="typo-micro tabular-nums text-center px-2 truncate"
        style={{ height: FOOTER_H, lineHeight: `${FOOTER_H}px`, color: GB.light, width: "100%" }}
      >
        {anchorDeltaText}
      </div>

      {/* 들린 프리뷰 — 손가락 한 칸 위 */}
      {drag && (
        <div
          aria-hidden="true"
          className="fixed rounded-sm pointer-events-none"
          style={{
            left: drag.px - cell / 2,
            top: drag.py - cell / 2 - step,
            width:
              shapeExtent(drag.type, drag.rot).w * cell +
              (shapeExtent(drag.type, drag.rot).w - 1) * BAG_GAP,
            height:
              shapeExtent(drag.type, drag.rot).h * cell +
              (shapeExtent(drag.type, drag.rot).h - 1) * BAG_GAP,
            background: `${GB.dark}ee`,
            border: `1px solid ${drag.valid ? GB.lightest : GB_WARN}`,
            zIndex: 40,
          }}
        />
      )}

      {/* 스냅백 — 거절된 드래그가 제 자리로 돌아가는 150ms */}
      {snap && (
        <div
          aria-hidden="true"
          className="fixed rounded-sm pointer-events-none flex items-center justify-center"
          style={{
            left: snap.from.x,
            top: snap.from.y,
            width:
              shapeExtent(snap.item.type, snap.rot).w * cell +
              (shapeExtent(snap.item.type, snap.rot).w - 1) * BAG_GAP,
            height:
              shapeExtent(snap.item.type, snap.rot).h * cell +
              (shapeExtent(snap.item.type, snap.rot).h - 1) * BAG_GAP,
            background: `${GB.dark}ee`,
            border: `1px solid ${GB_RARITY_GLOW[snap.item.rarity] ?? GB.light}`,
            transform: snap.settled
              ? `translate(${snap.to.x - snap.from.x}px, ${snap.to.y - snap.from.y}px)`
              : "none",
            transition: `transform 150ms ${EASE_OUT}`,
            zIndex: 40,
          }}
        >
          {!isPhotoTalisman(snap.item) && (
            <PixelIcon
              name={snap.item.iconName}
              size={iconSize}
              color={GB_RARITY_GLOW[snap.item.rarity] ?? GB.light}
            />
          )}
        </div>
      )}

      <style jsx>{`
        .bag-cell,
        .bag-tile {
          transition: transform 120ms ${EASE_OUT};
        }
        .bag-tile:active {
          transform: scale(0.97);
        }
        @media (prefers-reduced-motion: reduce) {
          .bag-cell,
          .bag-tile {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
});

export default BagBoard;
