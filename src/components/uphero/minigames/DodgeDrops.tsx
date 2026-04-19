"use client";

/**
 * Phase 15 WarioWare — DodgeDrops.
 *
 * 5 초 동안 좌/우 버튼으로 캐릭터 이동해 떨어지는 물방울 피하기.
 *   diff 1: 최대 2 방 피격 허용 / 2: 1 방 / 3: 0 방.
 *
 * 키보드 — ← / → 로도 이동 가능.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MinigameProps } from "./_types";
import { GB, GB_DANGER, GB_DANGER_FLASH, EASE_OUT } from "@/lib/upHeroPalette";
import { useTranslation } from "@/hooks/useTranslation";
import { MinigameHeader, TimeBar, StatusMessage, GiveUpButton } from "./_chrome";

const LANES = 5;
const DURATION_MS = 5500;
const BASE_SPAWN_MS = 550;
const FALL_MS = 1100;

interface Drop {
  id: number;
  lane: number;
  born: number;
}

export default function DodgeDrops({ difficulty, onComplete, onCancel }: MinigameProps) {
  const { t } = useTranslation();
  const tolerance = useMemo(() => ({ 1: 2, 2: 1, 3: 0 }[difficulty]), [difficulty]);
  const spawnMs = useMemo(() => BASE_SPAWN_MS - (difficulty - 1) * 90, [difficulty]);
  const [pos, setPos] = useState(Math.floor(LANES / 2));
  const [drops, setDrops] = useState<Drop[]>([]);
  const [hits, setHits] = useState(0);
  const [remainingMs, setRemainingMs] = useState(DURATION_MS);
  const [done, setDone] = useState<"success" | "fail" | null>(null);
  const [hitFlash, setHitFlash] = useState(0);
  const posRef = useRef(pos);
  posRef.current = pos;
  const hitsRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (done) return;
    const start = performance.now();
    let lastSpawn = start;
    let nextId = 1;
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const left = Math.max(0, DURATION_MS - elapsed);
      setRemainingMs(left);
      if (now - lastSpawn >= spawnMs) {
        lastSpawn = now;
        const lane = Math.floor(Math.random() * LANES);
        setDrops((ds) => [...ds, { id: nextId++, lane, born: now }]);
      }
      setDrops((ds) =>
        ds.filter((d) => {
          const age = now - d.born;
          if (age >= FALL_MS) {
            if (d.lane === posRef.current) {
              hitsRef.current += 1;
              setHits(hitsRef.current);
              setHitFlash((v) => v + 1);
              if (hitsRef.current > tolerance) setDone("fail");
            }
            return false;
          }
          return true;
        }),
      );
      if (left <= 0) {
        setDone((prev) => prev ?? (hitsRef.current <= tolerance ? "success" : "fail"));
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [done, spawnMs, tolerance]);

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(
      () => onCompleteRef.current({ success: done === "success" }),
      600,
    );
    return () => window.clearTimeout(timer);
  }, [done]);

  const moveLeft = () => !done && setPos((p) => Math.max(0, p - 1));
  const moveRight = () => !done && setPos((p) => Math.min(LANES - 1, p + 1));

  // ←/→ 키로 이동
  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        moveLeft();
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        moveRight();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const timePct = (remainingMs / DURATION_MS) * 100;
  const fieldH = 260;
  const laneW = 48;

  return (
    <div
      className={`flex flex-col items-center gap-3 p-4 dodge-root ${hitFlash > 0 ? `shake-${hitFlash % 2}` : ""}`}
      style={{ minWidth: LANES * laneW + 24 }}
    >
      <MinigameHeader>
        {t("uphero.mini.dodge.header", { time: (remainingMs / 1000).toFixed(1), hits, tolerance })}
      </MinigameHeader>
      <TimeBar pct={timePct} maxWidthClass="" />
      <div
        className={`relative rounded dodge-field ${hitFlash > 0 ? `flash-${hitFlash % 2}` : ""}`}
        style={{ width: LANES * laneW, height: fieldH, background: GB.darkest, border: `1px solid ${GB.dark}`, overflow: "hidden" }}
        aria-hidden="true"
      >
        <div className="dodge-flash-overlay" aria-hidden="true" />
        {drops.map((d) => {
          const age = performance.now() - d.born;
          const y = (age / FALL_MS) * (fieldH - 24);
          return (
            <div
              key={d.id}
              style={{
                position: "absolute",
                left: d.lane * laneW + laneW / 2 - 10,
                top: y,
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: GB_DANGER,
                boxShadow: `0 0 6px ${GB_DANGER}`,
                willChange: "transform",
              }}
            />
          );
        })}
        <div
          className="dodge-player"
          style={{
            position: "absolute",
            left: laneW / 2 - 12,
            bottom: 6,
            width: 24,
            height: 24,
            background: GB.lightest,
            border: `2px solid ${GB.light}`,
            borderRadius: 4,
            transform: `translate3d(${pos * laneW}px, 0, 0)`,
          }}
        />
      </div>
      <div className="flex gap-6">
        <button
          type="button"
          onClick={moveLeft}
          disabled={!!done}
          className="dodge-ctrl rounded typo-body"
          style={{ width: 88, height: 56, background: `${GB.light}22`, color: GB.lightest, border: `1px solid ${GB.light}` }}
          aria-label={t("uphero.mini.dodge.leftAria")}
        >
          ◀
        </button>
        <button
          type="button"
          onClick={moveRight}
          disabled={!!done}
          className="dodge-ctrl rounded typo-body"
          style={{ width: 88, height: 56, background: `${GB.light}22`, color: GB.lightest, border: `1px solid ${GB.light}` }}
          aria-label={t("uphero.mini.dodge.rightAria")}
        >
          ▶
        </button>
      </div>
      {done && (
        <StatusMessage kind={done}>
          {done === "success" ? t("uphero.mini.dodge.success") : t("uphero.mini.dodge.fail")}
        </StatusMessage>
      )}
      {!done && <GiveUpButton onCancel={onCancel} />}
      <style jsx>{`
        .dodge-ctrl {
          transition: transform 80ms ${EASE_OUT}, background 160ms ${EASE_OUT};
          touch-action: manipulation;
        }
        .dodge-ctrl:focus-visible {
          outline: 2px solid ${GB.lightest};
          outline-offset: 2px;
        }
        @media (hover: hover) and (pointer: fine) {
          .dodge-ctrl:hover:not(:disabled) {
            background: ${GB.light}44;
          }
        }
        .dodge-ctrl:not(:disabled):active {
          transform: scale(0.97);
        }
        .dodge-player {
          transition: transform 120ms ${EASE_OUT};
          will-change: transform;
        }
        .dodge-flash-overlay {
          position: absolute;
          inset: 0;
          background: ${GB_DANGER_FLASH};
          opacity: 0;
          pointer-events: none;
          z-index: 5;
        }
        @keyframes dodgeShake {
          0% { transform: translate3d(0,0,0); }
          15% { transform: translate3d(-6px, 2px, 0); }
          30% { transform: translate3d(5px, -2px, 0); }
          45% { transform: translate3d(-4px, 3px, 0); }
          60% { transform: translate3d(3px, -1px, 0); }
          75% { transform: translate3d(-2px, 1px, 0); }
          100% { transform: translate3d(0,0,0); }
        }
        @keyframes dodgeFlash {
          0% { opacity: 0; }
          10% { opacity: 0.55; }
          25% { opacity: 0.1; }
          40% { opacity: 0.45; }
          100% { opacity: 0; }
        }
        .dodge-root.shake-0,
        .dodge-root.shake-1 {
          animation: dodgeShake 240ms ease-out;
        }
        .dodge-field.flash-0 .dodge-flash-overlay,
        .dodge-field.flash-1 .dodge-flash-overlay {
          animation: dodgeFlash 240ms ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .dodge-root.shake-0,
          .dodge-root.shake-1 {
            animation: none;
          }
          .dodge-field.flash-0 .dodge-flash-overlay,
          .dodge-field.flash-1 .dodge-flash-overlay {
            animation: none;
            opacity: 0.4;
          }
          .dodge-player,
          .dodge-ctrl {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
