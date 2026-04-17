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
import { GB, EASE_OUT, gbClass, GB_ENEMY, GB_LEGEND, GB_UNIQUE, GB_RARE } from "@/lib/upHeroPalette";
import PixelIcon from "@/components/icons/PixelIcon";

export default function SessionResultModal() {
  const session = useUpHeroStore((s) => s.currentSession);
  const acknowledge = useUpHeroStore((s) => s.acknowledgeSessionEnd);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!session || session.status !== "completed") return null;
  if (typeof window === "undefined") return null;

  const dungeon = DUNGEONS[session.dungeonId];
  const lastEntry = session.log[session.log.length - 1];
  const reason =
    lastEntry?.type === "sessionEnd" ? lastEntry.reason : "victory";

  const title =
    reason === "victory"
      ? "모험 완료"
      : reason === "defeat"
        ? "영웅이 쓰러졌다"
        : "캠프로 복귀";

  const titleColor =
    reason === "victory"
      ? GB.lightest
      : reason === "defeat"
        ? GB_ENEMY
        : GB.light;

  const iconName =
    reason === "victory"
      ? "Trophy"
      : reason === "defeat"
        ? "Skull"
        : "Flag";

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
              className="typo-caption mb-1.5 inline-flex items-center gap-1.5"
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
              <div className="flex flex-col gap-1 pl-4">
                {session.rewards.drops.map((eq) => (
                  <div
                    key={eq.id}
                    className="typo-caption inline-flex items-center gap-1.5"
                    style={{ color: rarityColor(eq.rarity) }}
                  >
                    <PixelIcon name="Shield" size={14} color={rarityColor(eq.rarity)} />
                    {eq.name}
                  </div>
                ))}
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

function rarityColor(rarity: string): string {
  switch (rarity) {
    case "legend":
      return GB_LEGEND;
    case "unique":
      return GB_UNIQUE;
    case "rare":
      return GB_RARE;
    default:
      return GB.light;
  }
}
