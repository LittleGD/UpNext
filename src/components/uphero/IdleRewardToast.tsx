"use client";

/**
 * Up Hero — Idle reward toast.
 *
 * Phase 5b.1: 앱을 재진입할 때 이전 세션부터 경과한 시간만큼 영웅이 "수련"
 * 했다는 연출 + 보상 표시. 탭하거나 2.4초 후 자동 사라짐.
 *
 * 스타일: 다른 toast 와 유사하게 상단 배너 (z-30).
 */

import { useEffect, useState } from "react";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { formatElapsed } from "@/lib/idleAccrual";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import PixelIcon from "@/components/icons/PixelIcon";

export default function IdleRewardToast() {
  const reward = useUpHeroStore((s) => s.idleReward);
  const acknowledge = useUpHeroStore((s) => s.acknowledgeIdleReward);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!reward) return;
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
  }, [reward, acknowledge]);

  if (!reward) return null;

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
      className="fixed left-1/2 z-30 rounded typo-caption text-left"
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
          +<span style={{ color: GB.lightest }}>{reward.xp}</span> XP · +
          <span style={{ color: GB.lightest }}>{reward.coins}</span> C
        </span>
      </div>
    </button>
  );
}
