"use client";

import { useMemo } from "react";
import { addDays } from "@/lib/retention";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * 28일 체크인 히트맵 (iOS CheckInHeatmap 포팅), checkInDates 시각화.
 *
 * 7열 x 4행, 왼쪽 위가 27일 전 / 오른쪽 아래가 오늘.
 * 색: 체크인 = 라임 / 방패로 메움 = 라임 55% / 오늘(미체크) = 라임 40% /
 * 빈 날 = elevated. 각 칸은 role="img" + 날짜별 aria-label 로 스크린리더 대응.
 */

interface CheckInHeatmapProps {
  checkInDates: string[];
  usedSaverDates: string[];
  today: string;
}

export default function CheckInHeatmap({
  checkInDates,
  usedSaverDates,
  today,
}: CheckInHeatmapProps) {
  const { t } = useTranslation();

  const checkIns = useMemo(() => new Set(checkInDates), [checkInDates]);
  const savers = useMemo(() => new Set(usedSaverDates), [usedSaverDates]);
  // addDays 28회를 today 변경 시에만 재계산 (iOS init 캐시와 동일 의도)
  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = -27; i <= 0; i++) {
      const d = addDays(today, i);
      if (d !== null) out.push(d);
    }
    return out;
  }, [today]);

  const cellColor = (d: string): string => {
    if (checkIns.has(d)) return "var(--accent-primary)";
    if (savers.has(d)) return "color-mix(in srgb, var(--accent-primary) 55%, transparent)";
    if (d === today) return "color-mix(in srgb, var(--accent-primary) 40%, transparent)";
    return "var(--bg-elevated)";
  };

  const cellLabel = (d: string): string => {
    if (checkIns.has(d)) return t("flame.heatmap.a11y.lit", { date: d });
    if (savers.has(d)) return t("flame.heatmap.a11y.saver", { date: d });
    return t("flame.heatmap.a11y.empty", { date: d });
  };

  return (
    <section className="bg-bg-surface rounded-2xl p-4">
      <h2 className="typo-body text-text-primary mb-2.5">{t("flame.heatmap.title")}</h2>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => (
          <div
            key={d}
            role="img"
            aria-label={cellLabel(d)}
            className="aspect-square rounded"
            style={{ background: cellColor(d) }}
          />
        ))}
      </div>
    </section>
  );
}
