"use client";

/**
 * Up Hero — 세션 결산 modal.
 *
 * currentSession.status === "completed" 일 때 표시.
 * acknowledgeSessionEnd() 호출로 reward 적용 + session 초기화.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { DUNGEONS } from "@/data/upHeroDungeons";
import { GB, EASE_OUT, gbClass, GB_ENEMY } from "@/lib/upHeroPalette";
import PixelIcon from "@/components/icons/PixelIcon";
import DropRevealCard from "./DropRevealCard";

export default function SessionResultModal() {
  const session = useUpHeroStore((s) => s.currentSession);
  const acknowledge = useUpHeroStore((s) => s.acknowledgeSessionEnd);

  const [mounted, setMounted] = useState(false);
  // Phase 4c-polish — detail 은 타이틀 등장 후 280ms 뒤 fade-in.
  // "결과 (모험 완료) → 사유 (거인을 쓰러뜨렸다)" 두 박자 reveal.
  const [detailMounted, setDetailMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    const detailTimer = window.setTimeout(() => setDetailMounted(true), 280);
    return () => {
      cancelAnimationFrame(id);
      window.clearTimeout(detailTimer);
    };
  }, []);

  if (!session || session.status !== "completed") return null;
  if (typeof window === "undefined") return null;

  const dungeon = DUNGEONS[session.dungeonId];
  const lastEntry = session.log[session.log.length - 1];
  const reason =
    lastEntry?.type === "sessionEnd" ? lastEntry.reason : "heroAbandoned";
  const detail =
    lastEntry?.type === "sessionEnd" ? lastEntry.detail : undefined;

  // Phase 4c.1 — 사유별 구체 타이틀/아이콘/색
  // legacy reason ("victory"/"defeat"/"abandoned") 도 매핑 (이전 세션 호환).
  const { title, titleColor, iconName } = resolveReasonDisplay(reason);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: `${GB.darkest}e0`,
        opacity: mounted ? 1 : 0,
        transition: `opacity 180ms ${EASE_OUT}`,
      }}
    >
      <div
        className="w-full max-w-sm rounded-md overflow-hidden"
        style={{
          background: GB.darkest,
          border: `1px solid ${GB.light}`,
          transform: mounted ? "scale(1)" : "scale(0.96)",
          opacity: mounted ? 1 : 0,
          transition: `transform 220ms ${EASE_OUT}, opacity 180ms ${EASE_OUT}`,
        }}
      >
        {/* Header */}
        <div
          className="px-4 py-4 text-center flex flex-col items-center gap-1.5"
          style={{ borderBottom: `1px solid ${GB.dark}` }}
        >
          <div className="typo-caption" style={{ color: GB.light }}>
            {dungeon.name} — F{session.currentFloor}
          </div>
          <PixelIcon name={iconName} size={22} color={titleColor} />
          <div
            className="typo-heading"
            style={{ color: titleColor }}
          >
            {title}
          </div>
          {/* Phase 4c.1 — 사유 상세 (예: "시간이 다했다", "산악의 거인을 쓰러뜨렸다").
               Phase 4c-polish: 타이틀이 자리잡은 후 두 박자로 fade-in + y-shift. */}
          {detail && (
            <div
              className="typo-caption px-2"
              style={{
                color: GB.light,
                opacity: detailMounted ? 0.85 : 0,
                transform: detailMounted ? "translateY(0)" : "translateY(-4px)",
                transition: `opacity 240ms ${EASE_OUT}, transform 240ms ${EASE_OUT}`,
              }}
            >
              {detail}
            </div>
          )}
        </div>

        {/* Rewards */}
        <div className="px-4 py-4 flex flex-col gap-2.5">
          <RewardRow
            iconName="Sparkle"
            label="경험치"
            value={`+${session.rewards.xp} XP`}
            accent={session.rewards.xp > 0}
          />
          <RewardRow
            iconName="Coins"
            label="갓생 코인"
            value={`+${session.rewards.coins} C`}
            accent={session.rewards.coins > 0}
          />
          <div>
            <div
              className="typo-caption mb-2 inline-flex items-center gap-1.5"
              style={{ color: GB.light }}
            >
              <PixelIcon name="Gift" size={14} color={GB.light} />
              장비 획득 ({session.rewards.drops.length})
            </div>
            {session.rewards.drops.length === 0 ? (
              <div className={`typo-caption ${gbClass.textDim} pl-4`}>
                없음
              </div>
            ) : (
              // 개별 flip — 한 장씩 탭해서 공개 (사용자 결정)
              <div className="flex flex-wrap gap-2 justify-center py-2">
                {session.rewards.drops.map((eq) => (
                  <DropRevealCard key={eq.id} equipment={eq} />
                ))}
              </div>
            )}
            {session.rewards.drops.length > 0 && (
              <div
                className={`typo-caption ${gbClass.textDim} text-center mt-1`}
              >
                카드를 탭해서 확인
              </div>
            )}
          </div>
        </div>

        {/* CTA */}
        <div
          className="px-4 py-3"
          style={{ borderTop: `1px solid ${GB.dark}` }}
        >
          <button
            type="button"
            onClick={acknowledge}
            className="w-full py-3 rounded typo-caption transition-transform"
            style={{
              background: GB.lightest,
              color: GB.darkest,
              border: `1px solid ${GB.lightest}`,
              transition: `transform 120ms ${EASE_OUT}`,
            }}
            onMouseDown={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)")
            }
            onMouseUp={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.transform = "scale(1)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.transform = "scale(1)")
            }
            onTouchStart={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)")
            }
            onTouchEnd={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.transform = "scale(1)")
            }
          >
            캠프로 돌아가기
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Phase 4c.1 — 종료 사유별 타이틀/색/아이콘 매핑.
 * legacy reason 도 알맞은 신규 reason 으로 mapping.
 */
function resolveReasonDisplay(
  reason: string,
): { title: string; titleColor: string; iconName: string } {
  switch (reason) {
    case "bossDefeated":
    case "victory": // legacy
      return { title: "보스 처치", titleColor: GB.lightest, iconName: "Trophy" };
    case "heroDied":
    case "defeat": // legacy
      return { title: "영웅이 쓰러졌다", titleColor: GB_ENEMY, iconName: "Skull" };
    case "timeExpired":
      return { title: "시간이 다했다", titleColor: GB.light, iconName: "Clock" };
    case "heroAbandoned":
    case "abandoned": // legacy
    default:
      return { title: "캠프로 복귀", titleColor: GB.light, iconName: "Flag" };
  }
}

function RewardRow({
  iconName,
  label,
  value,
  accent,
}: {
  iconName: string;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between typo-caption">
      <span className="inline-flex items-center gap-1.5" style={{ color: GB.light }}>
        <PixelIcon name={iconName} size={14} color={GB.light} />
        {label}
      </span>
      <span
        className="tabular-nums"
        style={{ color: accent ? GB.lightest : GB.light }}
      >
        {value}
      </span>
    </div>
  );
}

