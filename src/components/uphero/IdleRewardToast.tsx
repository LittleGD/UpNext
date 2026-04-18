"use client";

/**
 * Up Hero — Idle reward toast.
 *
 * Phase 5b.1: 앱을 재진입할 때 이전 세션부터 경과한 시간만큼 영웅이 "수련"
 * 했다는 연출 + 보상 표시. 탭하거나 2.4초 후 자동 사라짐.
 *
 * 스타일: 다른 toast 와 유사하게 상단 배너 (z-30).
 */

import { useEffect, useRef, useState } from "react";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { formatElapsed } from "@/lib/idleAccrual";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import PixelIcon from "@/components/icons/PixelIcon";

/**
 * Phase 8b — 작은 count-up hook.
 * 0 → target 으로 duration 동안 올라간다. idle reward toast 처럼
 * "이만큼이나 얻었어!" 감각을 주는 숫자에 쓴다.
 * tabular-nums 로 layout shift 없음.
 */
function useCountUp(target: number, duration = 700, enabled = true): number {
  const [n, setN] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) {
      setN(target);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(target * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, enabled]);
  return n;
}

export default function IdleRewardToast() {
  const reward = useUpHeroStore((s) => s.idleReward);
  const acknowledge = useUpHeroStore((s) => s.acknowledgeIdleReward);
  // Phase 5c-fix #1: 다른 blocking modal (SessionResultModal / ClassAwakenModal)
  // 이 떠있으면 토스트가 backdrop 뒤에 숨어 유저가 놓칠 수 있음.
  // 해당 modal 들이 모두 사라질 때까지 mount / timer 를 지연.
  const sessionStatus = useUpHeroStore((s) => s.currentSession?.status);
  const pendingClassAwaken = useUpHeroStore((s) => s.pendingClassAwaken);
  const blocked =
    sessionStatus === "completed" || pendingClassAwaken !== null;

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!reward) return;
    if (blocked) return; // 대기 — 차단 modal 이 닫히면 재실행
    const rafId = requestAnimationFrame(() => setMounted(true));
    // 4초 자동 dismiss
    const dismissTimer = window.setTimeout(() => {
      setMounted(false);
      window.setTimeout(() => acknowledge(), 240);
    }, 4000);
    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(dismissTimer);
    };
  }, [reward, acknowledge, blocked]);

  // Phase 8b — mount 후 XP/coin 을 count-up 으로 올려 "이만큼이나!" 감각 전달.
  // mounted 가 true 된 뒤에만 started — reward 가 바뀌어도 key effect 로 재실행됨.
  const xpDisplay = useCountUp(reward?.xp ?? 0, 700, mounted);
  const coinDisplay = useCountUp(reward?.coins ?? 0, 700, mounted);

  if (!reward) return null;
  if (blocked) return null;

  const onTap = () => {
    setMounted(false);
    window.setTimeout(() => acknowledge(), 240);
  };

  const elapsed = formatElapsed(reward.rawElapsedMin);
  const capped = reward.rawElapsedMin > reward.elapsedMin;

  return (
    <button
      type="button"
      onClick={onTap}
      className="fixed left-1/2 z-[60] rounded typo-caption text-left"
      style={{
        top: "calc(env(safe-area-inset-top) + 52px)",
        transform: `translateX(-50%) translateY(${mounted ? 0 : "-8px"})`,
        opacity: mounted ? 1 : 0,
        background: GB.darkest,
        color: GB.light,
        border: `1px solid ${GB.lightest}`,
        padding: "8px 12px",
        minWidth: 240,
        maxWidth: "calc(100dvw - 32px)",
        transition: `opacity 240ms ${EASE_OUT}, transform 240ms ${EASE_OUT}`,
      }}
      aria-label={`영웅이 ${elapsed} 동안 수련해서 XP ${reward.xp} 와 코인 ${reward.coins} 을 얻었어요`}
    >
      <div className="flex items-center gap-2">
        <PixelIcon name="Moon" size={14} color={GB.lightest} />
        <span style={{ color: GB.lightest }}>수련 보상</span>
        <span style={{ marginLeft: "auto", opacity: 0.7 }}>탭해서 닫기</span>
      </div>
      <div className="mt-1" style={{ lineHeight: 1.45 }}>
        영웅이 <span style={{ color: GB.lightest }}>{elapsed}</span> 동안 수련했어요
        {capped && (
          <span style={{ color: GB.light, opacity: 0.6 }}> (8시간까지만 누적)</span>
        )}
        <br />
        <span className="tabular-nums">
          +<span style={{ color: GB.lightest }}>{xpDisplay}</span> XP · +
          <span style={{ color: GB.lightest }}>{coinDisplay}</span> C
        </span>
      </div>
    </button>
  );
}
