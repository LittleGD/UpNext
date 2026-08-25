"use client";

import PixelIcon from "@/components/icons/PixelIcon";
import { RETENTION_MILESTONES } from "@/lib/retention";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * 마일스톤 트랙 (iOS RetentionSectionView.MilestoneTrack 포팅), 7·30·100일.
 *
 * 달성한 마일스톤은 Trophy + 라임 칩, 미달성은 Flag + elevated 칩.
 * 다음 마일스톤까지의 구간 진행바 + "다음 마일스톤까지 N일" 카피.
 * 100일 이후엔 진행바 대신 전설 카피.
 */

interface MilestoneTrackProps {
  streak: number;
}

export default function MilestoneTrack({ streak }: MilestoneTrackProps) {
  const { t } = useTranslation();

  const stops = RETENTION_MILESTONES;
  const next = stops.find((s) => s > streak);
  const prev = [...stops].reverse().find((s) => s <= streak) ?? 0;
  const progress = next ? (streak - prev) / (next - prev) : 1;

  return (
    <section className="bg-bg-surface rounded-2xl p-4 space-y-2.5">
      <div className="flex items-center gap-1.5">
        {stops.map((stop) => {
          const achieved = streak >= stop;
          return (
            <span
              key={stop}
              className={`flex items-center gap-1 px-2 h-6 rounded-full ${
                achieved ? "bg-accent/15" : "bg-bg-elevated"
              }`}
            >
              <PixelIcon
                name={achieved ? "Trophy" : "Flag"}
                size={12}
                color={achieved ? "var(--accent-primary)" : "var(--text-tertiary)"}
              />
              <span
                className={`typo-micro tabular-nums ${
                  achieved ? "text-text-primary" : "text-text-tertiary"
                }`}
              >
                {stop}
              </span>
            </span>
          );
        })}
      </div>

      {next ? (
        <>
          {/* 진행바, 수치는 아래 카피가 전달하므로 시각 장식은 aria-hidden */}
          <div aria-hidden="true" className="h-1.5 rounded-full bg-bg-elevated overflow-hidden">
            <div
              className="h-full rounded-full bg-accent"
              style={{
                width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
                transition: "width 600ms var(--ease-gb-out)",
              }}
            />
          </div>
          <p className="typo-caption text-text-tertiary">
            {t("flame.milestone.toNext", { days: next - streak })}
          </p>
        </>
      ) : (
        <p className="typo-caption text-accent">{t("flame.milestone.legend")}</p>
      )}
    </section>
  );
}
