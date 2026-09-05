"use client";

import { useEffect, useState } from "react";
import { useCountUp } from "@/hooks/useCountUp";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * 챌린지 완료 셀레브레이션의 "+N XP" 카운트업.
 *
 * - XP_COUNT_START_MS(300) 뒤에 arm — XP chip 의 enter delay(0.3s) 와 xpGain sfx(280ms) 에 맞춘다.
 * - XP_COUNT_MS(600) 동안 0 → xp 로 useCountUp (easeOutCubic). 0.9s 에 끝난다.
 * - useCountUp 은 내부 상태를 마지막 target 에 유지하므로, 같은 XP 의 연속 완료에서도
 *   다시 굴러가도록 호출처(DailyBoard)가 `key={card.id}` 로 매 셀레브레이션마다 remount 한다.
 * - reduced-motion 이면 카운트업 없이 최종값을 바로 보여준다.
 * - 표시값은 store 가 실제로 progress.xp 에 더한 totalXp (ChallengeCompletionResult).
 */
export const XP_COUNT_START_MS = 300;
export const XP_COUNT_MS = 600;

interface Props {
  xp: number;
  reducedMotion: boolean;
}

export default function ChallengeXpCounter({ xp, reducedMotion }: Props) {
  const { t } = useTranslation();
  const [armed, setArmed] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setTimeout(() => setArmed(true), XP_COUNT_START_MS);
    return () => window.clearTimeout(id);
  }, [reducedMotion]);

  const counted = useCountUp(xp, XP_COUNT_MS, armed && !reducedMotion);
  const shown = reducedMotion ? xp : armed ? counted : 0;

  return (
    <span className="typo-title text-accent tabular-nums">
      {t("common.unit.xpGain", { n: shown })}
    </span>
  );
}
