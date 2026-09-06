"use client";

/**
 * Up Hero — 정리 대기 트레이.
 *
 * 넘침 전용 공간이다. 유저가 아이템을 여기로 **옮기는** 동작은 없고, 보드에
 * 자리가 없어 못 들어간 것과 레벨이 내려가 보드 밖으로 밀린 것(보류)만 온다.
 *
 * 기본 경로는 **탭 선택 → 보드 빈 칸 탭**이다. 드래그 아웃은 250ms 롱프레스로만
 * 시작한다 — 가로 스크롤(`touch-action: pan-x`)과 같은 제스처를 두고 다투면
 * 스크롤이 먼저 먹혀 드래그가 안 잡히기 때문에, StickerLayer 와 같은
 * "롱프레스 + 4px 취소 한계" 규칙을 그대로 쓴다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BAG_TRAY_H,
  isPhotoTalisman,
  normalizeRot,
  type BagSynergy,
} from "@/lib/upHeroBag";
import type { Equipment } from "@/types/uphero";
import { GB, GB_RARITY_GLOW, EASE_OUT, gbClass } from "@/lib/upHeroPalette";
import { enhanceChipTone } from "./EquipmentCard";
import { useGameStore } from "@/store/useGameStore";
import { triggerHaptic } from "@/lib/sounds";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import { equipmentNameById } from "@/lib/upHeroI18n";
import type { DictKey } from "@/i18n";
import PixelIcon from "@/components/icons/PixelIcon";
import EquipmentPhotoThumb from "./EquipmentPhotoThumb";

/** 롱프레스로 드래그를 여는 시간(ms). StickerLayer 선례보다 짧게 — 여긴 삭제가 아니라 이동. */
const LONG_PRESS_MS = 250;
/** 롱프레스 도중 이만큼 움직이면 취소하고 스크롤에 넘긴다. */
const CANCEL_SLOP = 4;
const TILE = 44;
/** 들기 햅틱 — sounds.ts HAPTIC_INTENT 에서 light 로 매핑된 이름. */
const HAPTIC_LIFT = "cardFlip";

interface BagTrayProps {
  items: Equipment[];
  suspendedIds: ReadonlySet<string>;
  selectedId: string | null;
  synergy: BagSynergy;
  /** 합성 재료로 고른 타일 — 선택과 같은 라임 보더 (Track E 합성 모드). */
  pickedIds?: ReadonlySet<string>;
  /** 합성 모드에서 재료가 될 수 없는 타일 — 흐리게. */
  dimmedIds?: ReadonlySet<string>;
  onSelect: (id: string) => void;
  /** 롱프레스 드래그가 보드 위에서 손을 뗐다. 좌표 해석은 부모가 보드 ref 로 한다. */
  onDragToBoard: (
    itemId: string,
    clientX: number,
    clientY: number,
    rot: number,
  ) => void;
}

export default function BagTray({
  items,
  suspendedIds,
  selectedId,
  synergy,
  pickedIds,
  dimmedIds,
  onSelect,
  onDragToBoard,
}: BagTrayProps) {
  const { t, language } = useTranslation();
  const { play } = useSound();
  const hapticEnabled = useGameStore((s) => s.progress.hapticEnabled ?? true);

  const timerRef = useRef<number | null>(null);
  const pressRef = useRef<{
    pointerId: number;
    item: Equipment;
    startX: number;
    startY: number;
    lifted: boolean;
  } | null>(null);
  const [lift, setLift] = useState<{
    item: Equipment;
    x: number;
    y: number;
  } | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  useEffect(() => clearTimer, [clearTimer]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>, item: Equipment) => {
      if (!e.isPrimary) return;
      pressRef.current = {
        pointerId: e.pointerId,
        item,
        startX: e.clientX,
        startY: e.clientY,
        lifted: false,
      };
      const { clientX, clientY } = e;
      const el = e.currentTarget;
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        const p = pressRef.current;
        if (!p) return;
        p.lifted = true;
        try {
          el.setPointerCapture?.(p.pointerId);
        } catch {
          /* 캡처 실패는 드래그를 막을 이유가 아니다 */
        }
        if (hapticEnabled) triggerHaptic(HAPTIC_LIFT);
        setLift({ item: p.item, x: clientX, y: clientY });
      }, LONG_PRESS_MS);
    },
    [clearTimer, hapticEnabled],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const p = pressRef.current;
      if (!p || p.pointerId !== e.pointerId) return;
      if (!p.lifted) {
        const moved = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
        // 아직 안 들렸는데 움직였다 = 스크롤 의도. 롱프레스를 접는다.
        if (moved > CANCEL_SLOP) {
          clearTimer();
          pressRef.current = null;
        }
        return;
      }
      setLift((prev) =>
        prev ? { ...prev, x: e.clientX, y: e.clientY } : prev,
      );
    },
    [clearTimer],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
      const p = pressRef.current;
      clearTimer();
      if (!p || p.pointerId !== e.pointerId) return;
      pressRef.current = null;
      setLift(null);
      if (!p.lifted) {
        // 짧은 탭 — 선택. 배치는 보드 빈 칸 탭이 마무리한다.
        if (!cancelled) {
          play("select");
          onSelect(p.item.id);
        }
        return;
      }
      if (cancelled) return;
      onDragToBoard(
        p.item.id,
        e.clientX,
        e.clientY,
        normalizeRot(p.item.bagRot),
      );
    },
    [clearTimer, onDragToBoard, onSelect, play],
  );

  return (
    <section
      className="shrink-0 flex flex-col"
      style={{
        height: BAG_TRAY_H,
        borderTop: `1px solid ${GB.dark}`,
        background: `${GB.dark}22`,
      }}
      aria-label={t("uphero.bag.tray", { n: items.length })}
    >
      <div
        className={`typo-micro px-3 pt-1 tabular-nums ${gbClass.textDim}`}
        style={{ lineHeight: "16px" }}
      >
        {items.length > 0
          ? t("uphero.bag.tray", { n: items.length })
          : t("uphero.bag.trayEmpty")}
      </div>
      <div
        className="flex-1 min-h-0 flex items-center gap-2 px-3 overflow-x-auto"
        style={{ touchAction: "pan-x" }}
      >
        {items.map((item) => {
          const rarity = GB_RARITY_GLOW[item.rarity] ?? GB.light;
          const selected =
            item.id === selectedId || (pickedIds?.has(item.id) ?? false);
          const dimmed = dimmedIds?.has(item.id) ?? false;
          const suspended = suspendedIds.has(item.id);
          const enhance = item.enhanceLevel ?? 0;
          const chip = enhanceChipTone(enhance, rarity);
          const pairing = synergy.links.some(
            (l) => l.sourceId === item.id || l.partnerId === item.id,
          );
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              aria-label={[
                t(`uphero.rarity.${item.rarity}` as DictKey),
                equipmentNameById(item.baseId ?? "", item.name, language),
                suspended ? t("uphero.bag.suspended") : null,
              ]
                .filter(Boolean)
                .join(", ")}
              onPointerDown={(e) => onPointerDown(e, item)}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => onPointerUp(e, false)}
              onPointerCancel={(e) => onPointerUp(e, true)}
              onLostPointerCapture={(e) => onPointerUp(e, true)}
              onContextMenu={(e) => e.preventDefault()}
              className="bag-tray-tile relative shrink-0 rounded-sm flex items-center justify-center"
              style={{
                width: TILE,
                height: TILE,
                background: `${GB.dark}dd`,
                border: `1px solid ${selected ? GB.lightest : rarity}`,
                boxShadow: pairing ? `0 0 6px ${rarity}55` : undefined,
                opacity: lift?.item.id === item.id ? 0.35 : dimmed ? 0.4 : 1,
              }}
            >
              {item.photoId ? (
                <EquipmentPhotoThumb
                  photoId={item.photoId}
                  size={26}
                  bordered={false}
                />
              ) : (
                <PixelIcon name={item.iconName} size={22} color={rarity} />
              )}
              {/* Track B 강화 칩 톤 (1..9 어둡게 / 10..14 골드 / 15+ 라임 글로우). */}
              {enhance > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute typo-micro tabular-nums px-1 rounded-sm pointer-events-none"
                  style={{
                    left: 2,
                    top: 2,
                    fontSize: 9,
                    lineHeight: 1.3,
                    background: chip.bg,
                    color: chip.fg,
                    boxShadow: chip.glow,
                  }}
                >
                  +{enhance}
                </span>
              )}
              {suspended && (
                <span
                  aria-hidden="true"
                  className="absolute typo-micro px-1 rounded-sm pointer-events-none"
                  style={{
                    left: 0,
                    bottom: 0,
                    fontSize: 9,
                    lineHeight: 1.4,
                    background: `${GB.darkest}dd`,
                    color: GB.light,
                  }}
                >
                  {t("uphero.bag.suspended")}
                </span>
              )}
              <style jsx>{`
                .bag-tray-tile {
                  transition: transform 120ms ${EASE_OUT};
                }
                .bag-tray-tile:active {
                  transform: scale(0.97);
                }
                @media (prefers-reduced-motion: reduce) {
                  .bag-tray-tile {
                    transition: none;
                  }
                }
              `}</style>
            </button>
          );
        })}
      </div>

      {/* 들린 복제본 — 스크롤 컨테이너 밖(포털)에 fixed 로 띄워야 잘리지 않는다. */}
      {lift &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            aria-hidden="true"
            className="fixed rounded-sm pointer-events-none flex items-center justify-center"
            style={{
              left: lift.x - TILE / 2,
              top: lift.y - TILE / 2 - TILE,
              width: TILE,
              height: TILE,
              background: `${GB.dark}ee`,
              border: `1px solid ${GB_RARITY_GLOW[lift.item.rarity] ?? GB.light}`,
              zIndex: 60,
            }}
          >
            {isPhotoTalisman(lift.item) ? (
              <EquipmentPhotoThumb
                photoId={lift.item.photoId ?? ""}
                size={26}
                bordered={false}
              />
            ) : (
              <PixelIcon
                name={lift.item.iconName}
                size={22}
                color={GB_RARITY_GLOW[lift.item.rarity] ?? GB.light}
              />
            )}
          </div>,
          document.body,
        )}
    </section>
  );
}
