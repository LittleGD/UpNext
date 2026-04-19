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
 * 미니게임 wrapper — 일관된 padding/gap, prefers-reduced-motion 자동 처리.
 */
interface ShellProps {
  children: React.ReactNode;
  minWidth?: number;
}

export function MinigameShell({ children, minWidth }: ShellProps) {
  return (
    <div
      className="flex flex-col items-center gap-3 p-4 minigame-shell"
      style={minWidth ? { minWidth } : undefined}
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
