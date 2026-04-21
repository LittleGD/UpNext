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
