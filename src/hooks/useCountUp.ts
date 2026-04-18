"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Phase 9b — 0→target 으로 매끄럽게 증가하는 숫자 count-up hook.
 *
 * 원래 SessionResultModal + IdleRewardToast 두 파일에 복붙돼 있던 걸
 * 공용화. rAF 기반이라 60fps 유지, reduced-motion 대응은 호출처에서 enabled 로 제어.
 *
 * 설계:
 *  - target === 0 이면 그대로 0 반환 (animation skip)
 *  - enabled=false 일 때 즉시 target 반환 (초기 렌더 / reduced-motion / toast 미표시 등)
 *  - easeOutCubic 적용해 자연스러운 감속
 *  - unmount 시 rAF cleanup
 *
 * 주의:
 *  - NumberRoll 과는 다른 용도. NumberRoll = value 변화 시 slot-machine 느낌.
 *    useCountUp = 한 번 표시되는 결산 / toast 에서 0 → 최종값 연출.
 *
 * @param target 최종 숫자
 * @param duration 애니메이션 시간 ms (기본 700)
 * @param enabled false 면 즉시 target 반환 (애니메이션 skip)
 */
export function useCountUp(
  target: number,
  duration = 700,
  enabled = true,
): number {
  const [n, setN] = useState(enabled ? 0 : target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setN(target);
      return;
    }
    if (target === 0) {
      setN(0);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
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
