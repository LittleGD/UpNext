"use client";

/**
 * Up Hero — DungeonView.
 *
 * 전투 세션 진행 메인 view. 구성:
 *  - 상단 헤더: 던전명 / 현재 floor / 영웅 HP 바
 *  - 본문: CombatLog (auto-scroll)
 *  - 하단 컨트롤: 속도 (1× / 2× / 4×) / 일시정지 / 캠프로
 *  - awaitingChoice 이면 ChoicePanel 오버레이
 *
 * tick 자동 진행:
 *  - speed 별 interval: 1× = 1200ms, 2× = 600ms, 4× = 300ms
 *  - session.status 가 "active" 일 때만 tick
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { DUNGEONS } from "@/data/upHeroDungeons";
import { computeEffectiveStats } from "@/types/uphero";
import type { Monster } from "@/types/uphero";
import { GB, EASE_OUT, gbClass, GB_ENEMY, GB_WARN } from "@/lib/upHeroPalette";
import { useSound } from "@/hooks/useSound";
import CombatLog from "./CombatLog";
import ChoicePanel from "./ChoicePanel";
import BossBanner from "./BossBanner";
import PixelIcon from "@/components/icons/PixelIcon";

const TICK_INTERVAL: Record<1 | 2 | 4, number> = {
  1: 1200,
  2: 600,
  4: 300,
};

export default function DungeonView() {
  const session = useUpHeroStore((s) => s.currentSession);
  const tickSession = useUpHeroStore((s) => s.tickSession);
  const resumeSession = useUpHeroStore((s) => s.resumeSession);
  const abandonSession = useUpHeroStore((s) => s.abandonSession);

  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [paused, setPaused] = useState(false);
  /** 치명타 발생 시 root shake 트리거 — 260ms 후 자동 해제 */
  const [critShake, setCritShake] = useState(false);
  const { play } = useSound();

  const tickRef = useRef(tickSession);
  tickRef.current = tickSession;

  // 치명타 (crit) 발생 감지 — log 의 새 combat 엔트리 중 outcome==="crit" 탐지
  // 같은 엔트리에 대해 중복 발동 방지 위해 처리 완료된 log index 저장.
  const seenCritIdxRef = useRef<Set<number>>(new Set());
  const shakeTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!session) return;
    session.log.forEach((entry, idx) => {
      if (entry.type !== "combat") return;
      if (entry.outcome !== "crit") return;
      if (seenCritIdxRef.current.has(idx)) return;
      seenCritIdxRef.current.add(idx);
      // 사운드 + 진동 (impactShake = 충격 효과 사운드/haptic)
      play("impactShake");
      // 화면 흔들기 — setTimeout 중첩 방지
      if (shakeTimerRef.current) window.clearTimeout(shakeTimerRef.current);
      setCritShake(true);
      shakeTimerRef.current = window.setTimeout(() => {
        setCritShake(false);
        shakeTimerRef.current = null;
      }, 260);
    });
  }, [session, play]);

  // 세션 바뀌면 seen set 초기화 (다른 던전 / 재시작)
  useEffect(() => {
    if (!session) {
      seenCritIdxRef.current.clear();
    }
  }, [session?.startedAt, session]);

  // 보스 등장 감지 — session.status === "paused" 이고 last log 가 "boss" 엔트리
  // combat.ts 에서 보스 등장 시 자동으로 status = "paused" 로 세팅
  const bossReveal = useMemo(() => {
    if (!session) return null;
    if (session.status !== "paused") return null;
    const last = session.log[session.log.length - 1];
    if (last?.type !== "boss") return null;
    return { monster: last.monster as Monster, floor: last.floor };
  }, [session]);

  // 보스 등장 시 사운드/진동 재생
  const bossSoundPlayedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!bossReveal) return;
    // 같은 보스에 대해 1회만 재생
    const ts = session?.log[session.log.length - 1]?.timestamp ?? 0;
    if (bossSoundPlayedRef.current === ts) return;
    bossSoundPlayedRef.current = ts;
    play("impactShake");
  }, [bossReveal, session, play]);

  // auto-tick loop — session.status === "active" 일 때만
  useEffect(() => {
    if (!session) return;
    if (session.status !== "active") return;
    if (paused) return;
    const id = window.setInterval(() => {
      tickRef.current();
    }, TICK_INTERVAL[speed]);
    return () => window.clearInterval(id);
  }, [session, speed, paused]);

  // Time bar pulse — 시간이 ≥5 한 번에 빠지면 bar 가 한 번 번쩍.
  // 이벤트 outcome (대피 -15, 보스 -8, 악몽 -10 등) 처럼 "큰 비용" 순간을
  // 시각적으로 강조. rAF restart 패턴으로 keyframe 다시 재생.
  const prevTimeRef = useRef(session?.time ?? 0);
  const [timeFlashing, setTimeFlashing] = useState(false);
  useEffect(() => {
    const current = session?.time ?? 0;
    const diff = prevTimeRef.current - current;
    prevTimeRef.current = current;
    if (diff >= 5) {
      setTimeFlashing(false);
      const raf = requestAnimationFrame(() => setTimeFlashing(true));
      const t = window.setTimeout(() => setTimeFlashing(false), 340);
      return () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(t);
      };
    }
  }, [session?.time]);

  if (!session) return null;

  const dungeon = DUNGEONS[session.dungeonId];
  const hp = session.hero.hp;
  const maxHp = session.hero.maxHp;
  const hpPct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  // Phase 4c.2 — 탐험 시간 리소스. HP 와 같은 bar 패턴, 30%/15% 에서 경고색.
  const time = session.time;
  const maxTime = session.maxTime;
  const timePct = Math.max(0, Math.min(100, (time / maxTime) * 100));
  const stats = computeEffectiveStats(session.hero);

  const awaitingChoice = session.status === "awaitingChoice";

  // SSR 안전 장치 — Portal target 은 클라이언트만
  if (typeof window === "undefined") return null;

  const onExit = () => {
    // 긴장감 있는 포기 플로우 — 획득한 보상은 유지된다고 명시
    const msg = `탐험을 포기하고 캠프로 돌아갈까요?\n\n지금까지 획득한 보상 (XP, 코인, 장비) 은 모두 유지됩니다.\n단, F${session.currentFloor} 의 보스는 놓칩니다.`;
    if (confirm(msg)) {
      abandonSession();
    }
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-50 overflow-hidden flex flex-col ${critShake ? "uphero-crit-shake" : ""}`}
      style={{
        background: GB.darkest,
        color: GB.light,
        // Portal 로 body 에 렌더 → main(z-[1]) stacking context 밖으로 탈출.
        // 진짜 풀스크린 — 앱 헤더/탭/네비 모두 덮음 (몰입감).
      }}
    >
      {/* === Header === */}
      <header
        className="px-3 py-2.5 shrink-0"
        style={{
          borderBottom: `1px solid ${GB.dark}`,
          background: `linear-gradient(180deg, ${dungeon.themeColor}18 0%, transparent 100%)`,
          paddingTop: "calc(env(safe-area-inset-top) + 10px)",
        }}
      >
        <div className="flex items-center justify-between typo-caption">
          <div className="flex items-center gap-2">
            <span style={{ color: GB.lightest }}>{dungeon.name}</span>
            <span className={gbClass.textDim}>—</span>
            <span style={{ color: GB.light }}>Floor {session.currentFloor}</span>
          </div>
          <div className={`typo-caption ${gbClass.textDim} tabular-nums`}>
            STR {stats.str} · AGI {stats.agi}
          </div>
        </div>
        {/* HP bar */}
        <div className="mt-2.5 flex items-center gap-2">
          <span className="typo-caption" style={{ color: GB.light }}>
            HP
          </span>
          <div
            className="flex-1 h-2.5 rounded-sm relative overflow-hidden"
            style={{ background: GB.dark }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-sm"
              style={{
                width: `${hpPct}%`,
                background:
                  hpPct > 50
                    ? GB.lightest
                    : hpPct > 20
                      ? GB_WARN
                      : GB_ENEMY,
                transition: `width 240ms ${EASE_OUT}, background 240ms ${EASE_OUT}`,
              }}
            />
          </div>
          <span
            className="typo-caption tabular-nums"
            style={{ color: GB.lightest, minWidth: 56, textAlign: "right" }}
          >
            {hp}/{maxHp}
          </span>
        </div>

        {/* Phase 4c.2 — 탐험 시간 bar.
             이벤트/전투 결과가 시간을 소모/회복하면 여기서 즉시 시각화.
             0 도달 시 timeExpired 로 세션 종료.
             Phase 4c-polish: 시간 ≥5 급감 시 outer 컨테이너에 pulse (box-shadow 기반). */}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="typo-caption" style={{ color: GB.light }}>
            TIME
          </span>
          <div
            className={`flex-1 h-1.5 rounded-sm relative overflow-hidden ${
              timeFlashing ? "uphero-time-flash" : ""
            }`}
            style={{ background: GB.dark }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-sm"
              style={{
                width: `${timePct}%`,
                background:
                  timePct > 50
                    ? GB.light
                    : timePct > 20
                      ? GB_WARN
                      : GB_ENEMY,
                transition: `width 240ms ${EASE_OUT}, background 240ms ${EASE_OUT}`,
              }}
            />
          </div>
          <span
            className="typo-caption tabular-nums"
            style={{
              color: timePct > 20 ? GB.light : GB_ENEMY,
              minWidth: 56,
              textAlign: "right",
            }}
          >
            {Math.round(time)}/{maxTime}
          </span>
        </div>
      </header>

      {/* === Log === */}
      <div className="flex-1 min-h-0 relative">
        <CombatLog log={session.log} />
        {/* === Choice overlay — footer 위쪽에 sheet 로 올라옴, footer 는 항상 보임 === */}
        {awaitingChoice && !bossReveal && <ChoicePanel />}
      </div>

      {/* === Controls — awaitingChoice 상태에서도 항상 노출.
           speed 는 dim/disabled, 포기 는 항상 활성. === */}
      <footer
        className="px-3 py-2.5 shrink-0 relative z-10"
        style={{
          background: GB.darkest,
          borderTop: `1px solid ${GB.dark}`,
          paddingBottom: "calc(max(env(safe-area-inset-bottom), 24px) + 10px)",
        }}
      >
        <div className="flex items-center gap-2">
          {/* 속도 / 일시정지 — awaitingChoice 시 dim 처리 */}
          <div
            className="flex items-center gap-1 transition-opacity"
            style={{
              opacity: awaitingChoice ? 0.3 : 1,
              pointerEvents: awaitingChoice ? "none" : "auto",
            }}
          >
            {[1, 2, 4].map((s) => (
              <SpeedButton
                key={s}
                active={speed === s && !paused}
                onClick={() => {
                  setSpeed(s as 1 | 2 | 4);
                  setPaused(false);
                }}
              >
                {s}×
              </SpeedButton>
            ))}
            <SpeedButton
              active={paused}
              onClick={() => setPaused((p) => !p)}
              wide
            >
              <span className="inline-flex items-center justify-center">
                {paused ? (
                  <PixelIcon name="Play" size={14} color={GB.darkest} />
                ) : (
                  <PauseIcon color={GB.light} size={14} />
                )}
              </span>
            </SpeedButton>
          </div>
          <div className="flex-1" />
          {/* 포기 CTA — awaitingChoice 상태에서도 항상 탭 가능 */}
          <DangerButton onClick={onExit}>
            <span className="inline-flex items-center gap-1.5">
              <PixelIcon name="Flag" size={14} color={GB_ENEMY} />
              포기
            </span>
          </DangerButton>
        </div>
      </footer>

      {/* === Boss 등장 연출 (2.4s, session.status === "paused" 동안) === */}
      {bossReveal && (
        <BossBanner
          monster={bossReveal.monster}
          floor={bossReveal.floor}
          onDone={resumeSession}
        />
      )}

      {/* 치명타 shake keyframe 은 globals.css 에 정의됨 (uphero-crit-shake) */}
    </div>,
    document.body,
  );
}

/* ──────────────────────────────────────────────────────── */

function SpeedButton({
  children,
  active,
  onClick,
  wide,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="uphero-speed-btn typo-caption rounded"
      style={{
        // 모바일 접근성: 최소 tap target 40px 확보
        minHeight: 40,
        minWidth: wide ? 52 : 40,
        padding: wide ? "8px 12px" : "8px 10px",
        background: active ? GB.lightest : `${GB.dark}cc`,
        color: active ? GB.darkest : GB.light,
        border: `1px solid ${active ? GB.lightest : GB.dark}`,
      }}
    >
      {children}
      <style jsx>{`
        .uphero-speed-btn {
          transition:
            transform 120ms cubic-bezier(0.23, 1, 0.32, 1),
            background 160ms cubic-bezier(0.23, 1, 0.32, 1),
            color 160ms cubic-bezier(0.23, 1, 0.32, 1);
        }
        .uphero-speed-btn:active {
          transform: scale(0.97);
        }
      `}</style>
    </button>
  );
}

/**
 * pixelarticons 에 Pause 아이콘이 없어, 동일 무드 (24×24 grid, 단일 stroke)
 * 로 직접 그린 12×12 viewBox 버전. 두 세로 막대.
 */
function PauseIcon({ color = "currentColor", size = 12 }: { color?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      role="img"
      aria-hidden="true"
    >
      <rect x="3" y="2" width="2" height="8" fill={color} />
      <rect x="7" y="2" width="2" height="8" fill={color} />
    </svg>
  );
}

function DangerButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="uphero-danger-btn typo-caption rounded"
      style={{
        minHeight: 40,
        padding: "8px 14px",
        background: "transparent",
        color: GB_ENEMY,
        border: `1px solid ${GB_ENEMY}`,
      }}
    >
      {children}
      <style jsx>{`
        .uphero-danger-btn {
          transition: transform 120ms cubic-bezier(0.23, 1, 0.32, 1), background 160ms cubic-bezier(0.23, 1, 0.32, 1);
        }
        .uphero-danger-btn:active {
          transform: scale(0.97);
          background: rgba(232, 139, 122, 0.15);
        }
      `}</style>
    </button>
  );
}
