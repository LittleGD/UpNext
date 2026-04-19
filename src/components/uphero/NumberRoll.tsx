"use client";

/**
 * Up Hero — NumberRoll.
 *
 * 숫자 값이 바뀔 때 slot-machine 처럼 올라가는 감각을 주는 컴포넌트.
 *
 * 설계:
 *  - value 변화 감지 → 이전 숫자 위로 slide-out, 새 숫자 아래서 slide-in
 *  - delta 방향 (증가/감소) 에 따라 색 일순간 highlight (증가=GB.lightest, 감소=GB_ENEMY)
 *  - 애니메이션 260ms, 고빈도라도 답답하지 않음
 *  - `tabular-nums` 사용해 자릿수 바뀌어도 layout shift 없음
 *
 * 사용처:
 *  - CampPlaceholder 헤더의 코인/티켓
 *  - IdleRewardToast 의 XP/코인
 *  - 기타 리소스 변화가 "획득 감" 으로 느껴져야 할 곳
 *
 * 왜 텍스트 로그라이크에 필요한가:
 *  - 그래픽이 적은 텍스트 기반 UI 에서 숫자는 주요 시각 변화 지점
 *  - hard swap 시 변화가 "언제 일어났나" 감지가 어려움
 *  - rolling 모션은 변화를 즉각 알림 + 보상감 (게임의 "딸깍")
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";

interface NumberRollProps {
  value: number;
  /** 자릿수 형식 (예: ticket 이면 "3/10") — 있으면 renderer 에 value 넘김 */
  format?: (v: number) => string;
  /** tabular-nums 외 추가 style */
  style?: CSSProperties;
  className?: string;
  /** 증가 시 highlight 색 (기본 GB.lightest) */
  gainColor?: string;
  /** 감소 시 highlight 색 (기본 없음 — color 그대로) */
  lossColor?: string;
  /** 첫 render 시 애니메이션 skip (true 권장 — 초기값은 정적) */
  skipFirst?: boolean;
  /**
   * Phase 11c R4 R2 — 공지 비활성 (progressbar 등 부모에 aria-valuetext 가 있어
   * 숫자 변화가 중복 announce 되는 걸 방지). 기본값 false (기존 동작 유지).
   */
  silent?: boolean;
}

export default function NumberRoll({
  value,
  format,
  style,
  className,
  gainColor = GB.lightest,
  lossColor,
  skipFirst = true,
  silent = false,
}: NumberRollProps) {
  const [prev, setPrev] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const [flashColor, setFlashColor] = useState<string | null>(null);
  const firstRenderRef = useRef(true);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      if (skipFirst) return;
    }
    // prev 기록 후 animating=true
    setPrev((p) => (p === null ? value : p));
  }, [value, skipFirst]);

  useEffect(() => {
    if (prev === null) return;
    if (prev === value) return;
    // animation 시작
    setAnimating(true);
    const delta = value - prev;
    if (delta > 0) setFlashColor(gainColor);
    else if (delta < 0 && lossColor) setFlashColor(lossColor);
    else setFlashColor(null);

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setAnimating(false);
      setFlashColor(null);
      setPrev(value);
      timerRef.current = null;
    }, 260);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [value, prev, gainColor, lossColor]);

  const display = format ? format(value) : String(value);
  const prevDisplay =
    prev != null ? (format ? format(prev) : String(prev)) : display;

  return (
    <span
      className={`num-roll tabular-nums ${className ?? ""}`}
      style={{
        display: "inline-flex",
        position: "relative",
        overflow: "hidden",
        lineHeight: 1.2,
        color: flashColor ?? (style?.color as string | undefined),
        transition: `color 180ms ${EASE_OUT}`,
        verticalAlign: "baseline",
        ...style,
      }}
      aria-live={silent ? undefined : "polite"}
      aria-hidden={silent ? true : undefined}
    >
      {/* 새로운 값 (최종 표시) */}
      <span
        className="num-roll-new"
        style={{
          display: "inline-block",
          animation: animating
            ? `uphero-num-roll-in 260ms ${EASE_OUT} both`
            : "none",
        }}
      >
        {display}
      </span>
      {/* 이전 값 — animating 중에만 absolute 로 올라가며 사라짐 */}
      {animating && prev != null && prev !== value && (
        <span
          className="num-roll-old"
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            display: "inline-block",
            animation: `uphero-num-roll-out 260ms ${EASE_OUT} both`,
          }}
        >
          {prevDisplay}
        </span>
      )}
    </span>
  );
}
