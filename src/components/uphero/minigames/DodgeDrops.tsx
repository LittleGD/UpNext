"use client";

/**
 * Phase 15 WarioWare — DodgeDrops.
 *
 * 5 초 동안 좌/우 버튼으로 캐릭터 이동해 떨어지는 물방울 피하기.
 *   diff 1: 최대 2 방 피격 허용 / 2: 1 방 / 3: 0 방.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { MinigameProps } from "./_types";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import { useTranslation } from "@/hooks/useTranslation";

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
  const posRef = useRef(pos);
  posRef.current = pos;
  const hitsRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Timer + spawn + fall
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
      // Remove drops that fell off and check collision at landing
      setDrops((ds) =>
        ds.filter((d) => {
          const age = now - d.born;
          if (age >= FALL_MS) {
            // Landing — collision if on player lane
            if (d.lane === posRef.current) {
              hitsRef.current += 1;
              setHits(hitsRef.current);
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

  const timePct = (remainingMs / DURATION_MS) * 100;
  const fieldH = 260;
  const laneW = 48;

  return (
    <div className="flex flex-col items-center gap-3 p-4" style={{ minWidth: LANES * laneW + 24 }}>
      <div className="typo-caption tabular-nums" style={{ color: GB.lightest }}>
        {t("uphero.mini.dodge.header", { time: (remainingMs / 1000).toFixed(1), hits, tolerance })}
      </div>
      <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: GB.dark }} aria-hidden="true">
        <div
          style={{
            width: `${timePct}%`,
            height: "100%",
            background: timePct > 40 ? GB.light : "#e88b7a",
          }}
        />
      </div>
      <div
        className="relative rounded"
        style={{ width: LANES * laneW, height: fieldH, background: GB.darkest, border: `1px solid ${GB.dark}`, overflow: "hidden" }}
        aria-hidden="true"
      >
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
                background: "#e88b7a",
                boxShadow: `0 0 6px #e88b7a`,
              }}
            />
          );
        })}
        <div
          style={{
            position: "absolute",
            left: pos * laneW + laneW / 2 - 12,
            bottom: 6,
            width: 24,
            height: 24,
            background: GB.lightest,
            border: `2px solid ${GB.light}`,
            borderRadius: 4,
            transition: `left 120ms ${EASE_OUT}`,
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
        <div
          role="status"
          aria-live="assertive"
          className="typo-body"
          style={{ color: done === "success" ? GB.lightest : "#e88b7a", fontWeight: 600 }}
        >
          {done === "success" ? t("uphero.mini.dodge.success") : t("uphero.mini.dodge.fail")}
        </div>
      )}
      {!done && (
        <button
          type="button"
          onClick={onCancel}
          className="typo-caption rounded px-3 py-1"
          style={{ color: GB.light, border: `1px solid ${GB.dark}`, background: "transparent" }}
          aria-label={t("uphero.mini.giveUpAria")}
        >
          {t("uphero.mini.giveUpLabel")}
        </button>
      )}
      <style jsx>{`
        .dodge-ctrl {
          transition: transform 80ms ${EASE_OUT};
          touch-action: manipulation;
        }
        .dodge-ctrl:not(:disabled):active {
          transform: scale(0.94);
        }
      `}</style>
    </div>
  );
}
