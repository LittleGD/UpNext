"use client";

/**
 * 미니게임 11종 공통 chrome primitives.
 *
 * - MinigameHeader: typo-caption 헤더 라인 (시간/카운트 등)
 * - TimeBar: 1px 시간 바, 임계 색상 통일 (>50% lime, 20–50% amber, <20% danger)
 * - StatusMessage: 성공/실패 텍스트 (live region)
 * - GiveUpButton: 우측 정렬 작은 텍스트 버튼
 *
 * 모든 인터랙션은 EASE_OUT + scale(0.97) press 통일.
 */

import { GB, GB_DANGER, GB_WARN, EASE_OUT } from "@/lib/upHeroPalette";
import { useTranslation } from "@/hooks/useTranslation";

interface HeaderProps {
  children: React.ReactNode;
  tabular?: boolean;
}

export function MinigameHeader({ children, tabular = true }: HeaderProps) {
  return (
    <div
      className={`typo-caption ${tabular ? "tabular-nums" : ""}`}
      style={{ color: GB.lightest, minHeight: "1.2em" }}
    >
      {children}
    </div>
  );
}

interface HintProps {
  children: React.ReactNode;
}

export function MinigameHint({ children }: HintProps) {
  return (
    <div className="typo-caption" style={{ color: GB.light }}>
      {children}
    </div>
  );
}

interface TimeBarProps {
  /** 0..100 */
  pct: number;
  maxWidthClass?: string;
}

export function TimeBar({ pct, maxWidthClass = "max-w-xs" }: TimeBarProps) {
  const color = pct > 50 ? GB.light : pct > 20 ? GB_WARN : GB_DANGER;
  return (
    <div
      className={`w-full ${maxWidthClass} h-1 rounded-full overflow-hidden`}
      style={{ background: GB.dark }}
      aria-hidden="true"
    >
      <div
        className="time-bar-fill"
        style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
        }}
      />
      <style jsx>{`
        .time-bar-fill {
          transition: background 240ms ${EASE_OUT}, width 120ms linear;
        }
        @media (prefers-reduced-motion: reduce) {
          .time-bar-fill {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}

interface ProgressBarProps {
  /** 0..100 */
  pct: number;
  maxWidthClass?: string;
}

export function ProgressBar({ pct, maxWidthClass = "max-w-xs" }: ProgressBarProps) {
  return (
    <div
      className={`w-full ${maxWidthClass} h-1 rounded-full overflow-hidden`}
      style={{ background: GB.dark }}
      aria-hidden="true"
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: GB.lightest,
          transition: `width 180ms ${EASE_OUT}`,
        }}
      />
    </div>
  );
}

interface StatusProps {
  kind: "success" | "fail";
  children: React.ReactNode;
}

export function StatusMessage({ kind, children }: StatusProps) {
  return (
    <div
      role="status"
      aria-live="assertive"
      className="typo-body status-msg"
      style={{
        color: kind === "success" ? GB.lightest : GB_DANGER,
        fontWeight: 600,
        minHeight: "1.5em",
      }}
    >
      {children}
      <style jsx>{`
        .status-msg {
          animation: statusPulse 320ms ${EASE_OUT};
        }
        @keyframes statusPulse {
          0% {
            transform: scale(0.9);
            opacity: 0;
          }
          60% {
            transform: scale(1.04);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .status-msg {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

interface GiveUpProps {
  onCancel: () => void;
}

export function GiveUpButton({ onCancel }: GiveUpProps) {
  const { t } = useTranslation();
  return (
    <>
      <button
        type="button"
        onClick={onCancel}
        className="give-up-btn typo-caption rounded px-3 py-1"
        style={{
          color: GB.light,
          border: `1px solid ${GB.dark}`,
          background: "transparent",
        }}
        aria-label={t("uphero.mini.giveUpAria")}
      >
        {t("uphero.mini.giveUpLabel")}
      </button>
      <style jsx>{`
        .give-up-btn {
          transition: transform 80ms ${EASE_OUT}, color 120ms ${EASE_OUT}, border-color 120ms ${EASE_OUT};
          touch-action: manipulation;
        }
        @media (hover: hover) and (pointer: fine) {
          .give-up-btn:hover {
            color: ${GB.lightest};
            border-color: ${GB.light};
          }
        }
        .give-up-btn:focus-visible {
          outline: 2px solid ${GB.lightest};
          outline-offset: 2px;
        }
        .give-up-btn:active {
          transform: scale(0.97);
        }
        @media (prefers-reduced-motion: reduce) {
          .give-up-btn {
            transition: none;
          }
          .give-up-btn:active {
            transform: none;
          }
        }
      `}</style>
    </>
  );
}

/**
 * 미니게임 wrapper — 일관된 padding/gap, 엔트리 애니메이션, z-hud 집행.
 *
 * Phase 16 design review R3/R7 — 기존에는 각 게임이 `<div className="flex flex-col
 * items-center gap-3 p-4">` 를 인라인 반복하고 `minWidth` 도 280 / 300 / 파생
 * 으로 제각각이었다. Shell 로 통합하면:
 *   - z-index 가 토큰(`--z-hud`) 을 강제해 toast/zoom 위로 올라올 일이 없고
 *   - mg-shell-in 애니메이션이 마운트 시 일관되게 재생되며
 *   - `minWidth` default 가 "반응형 토큰 기반" 으로 통일됨.
 *
 * `allowOverflow` 는 PipeConnect 처럼 grid 크기가 content-driven 일 때 사용.
 */
interface ShellProps {
  children: React.ReactNode;
  /** 기본값 `auto` — mg-hero-btn-size 에 맞춘 반응형 min-width. */
  minWidth?: number | "auto";
}

export function MinigameShell({ children, minWidth = "auto" }: ShellProps) {
  const inlineMinWidth =
    minWidth === "auto"
      ? "calc(var(--mg-hero-btn-size) + 80px)" /* 버튼 + 양쪽 여백 */
      : typeof minWidth === "number"
        ? minWidth
        : undefined;
  return (
    <div
      className="flex flex-col items-center gap-3 p-4 mg-shell-in"
      style={{
        minWidth: inlineMinWidth,
        zIndex: "var(--z-hud)" as unknown as number,
        position: "relative",
      }}
    >
      {children}
    </div>
  );
}

/**
 * 플레이 도중 상태 안내용 라이브 리전 — 결과 발표 전까지 스크린리더가
 * 완전한 silence 상태가 되는 걸 막는다 (UX #9 / Phase 16 R6).
 *
 * StatusMessage 와 차이:
 *   - StatusMessage: 결과 발표 (success/fail), pulse 애니메이션, aria-live="assertive"
 *   - MinigameLiveText: 플레이 중간 텍스트, 조용한 전환, aria-live="polite"
 *
 * ReactionTap "wait/ready/now" 같은 phase label 을 담는다.
 */
interface LiveTextProps {
  children: React.ReactNode;
}
export function MinigameLiveText({ children }: LiveTextProps) {
  return (
    <div
      className="typo-body"
      aria-live="polite"
      style={{ color: GB.lightest, fontWeight: 600, minHeight: "1.5em" }}
    >
      {children}
    </div>
  );
}

/**
 * Phase 16 U1 — 신호등 phase SVG (●/◐/○ 유니코드 글리프 교체).
 *
 * 이전엔 ReactionTap 에서 `●` (green), `◐` (yellow), `○` (red) 유니코드
 * 문자를 fontSize 로 렌더. 폰트 폴백 환경 / 스크린리더 / 픽셀 그리드 대비에서
 * 일관성 문제가 있어 SVG primitive 로 전환.
 *
 * kind:
 *   - "stop"  (red phase)  → 외곽선만 있는 원 (empty)
 *   - "ready" (yellow)     → 반만 채워진 crescent (half-moon)
 *   - "go"    (green)      → 완전 채워진 원 (solid)
 *
 * color 는 currentColor 기본값. 부모 (button) 의 color 를 그대로 상속해
 * 버튼 표면이 바뀌어도 글리프 색은 자동 추적.
 */
interface SignalIconProps {
  kind: "stop" | "ready" | "go";
  size?: number;
  color?: string;
}

export function SignalIcon({ kind, size = 48, color = "currentColor" }: SignalIconProps) {
  // 공통 원: 외곽선. strokeWidth 3 은 GB 픽셀 미학과 맞춤.
  const stroke = 3;
  const r = 10 - stroke / 2; // viewBox 24 기준 반지름
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      {/* 외곽 원 — 모든 phase 공통 */}
      <circle cx="12" cy="12" r={r} stroke={color} strokeWidth={stroke} />
      {kind === "go" && (
        /* 완전 채움 */
        <circle cx="12" cy="12" r={r - 1} fill={color} />
      )}
      {kind === "ready" && (
        /* 왼쪽 반만 채움 — clip path 대신 단순 path 로 */
        <path
          d={`M 12 ${12 - r + 1} A ${r - 1} ${r - 1} 0 0 0 12 ${12 + r - 1} Z`}
          fill={color}
        />
      )}
      {/* stop 은 외곽선만 — 추가 요소 없음 */}
    </svg>
  );
}

/**
 * Phase 16 U1 — PipeConnect 흐름 방향 화살표 (▶ 유니코드 글리프 교체).
 *
 * 시작/끝 타일 옆에 S→E 흐름을 시각적으로 암시. 유니코드 ▶ 는 폰트에 따라
 * 크기/정렬이 제각각이라 SVG 로 고정. direction prop 으로 회전.
 */
interface FlowArrowProps {
  /** 화살표 방향 — pipe 흐름의 "이쪽에서 저쪽으로" */
  direction?: "right" | "down" | "left" | "up";
  size?: number;
  color?: string;
}

export function FlowArrow({
  direction = "right",
  size = 14,
  color = "currentColor",
}: FlowArrowProps) {
  const rotation = {
    right: 0,
    down: 90,
    left: 180,
    up: 270,
  }[direction];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      style={{ transform: `rotate(${rotation}deg)` }}
      aria-hidden="true"
    >
      {/* 삼각 화살표 — 유니코드 ▶ 와 동일 비율 */}
      <path d="M 3 2 L 13 8 L 3 14 Z" fill={color} />
    </svg>
  );
}

/**
 * Phase 16 U1 — PipeConnect 시작/끝 endpoint 배지 (S/E 텍스트 라벨 교체).
 *
 * 이전엔 `S` / `E` 단일 문자 라벨. 1글자는 letter-spacing 이 무효고 폰트에
 * 따라 시각 weight 가 불안정해 SVG 글리프로 대체:
 *   - start → 오른쪽으로 향하는 채워진 삼각 (입구 / play-style)
 *   - end   → 속이 빈 동심 원 (target / goal)
 *
 * aria-hidden 은 호출자가 결정 — 타일의 aria-label 이 이미 기능을 전달하는
 * 경우 장식용으로 숨김 처리.
 */
interface EndpointBadgeProps {
  kind: "start" | "end";
  size?: number;
  color?: string;
}

export function EndpointBadge({
  kind,
  size = 12,
  color = "currentColor",
}: EndpointBadgeProps) {
  if (kind === "start") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 12 12"
        aria-hidden="true"
      >
        {/* 입구 — play 삼각 */}
        <path d="M 3 2 L 10 6 L 3 10 Z" fill={color} />
      </svg>
    );
  }
  // end — 동심 원 (target / bullseye)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="5" stroke={color} strokeWidth="1.5" />
      <circle cx="6" cy="6" r="2" fill={color} />
    </svg>
  );
}

/**
 * 성공/실패 SVG 아이콘 — 이모지 대신 사용.
 * 게임 패드 버튼 등에서 ✓/✗ 표기로 사용.
 */
interface ResultIconProps {
  kind: "success" | "fail";
  size?: number;
  color?: string;
}

export function ResultIcon({ kind, size = 24, color = "currentColor" }: ResultIconProps) {
  if (kind === "success") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="5 13 10 18 19 7" />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}
