"use client";

import { useMemo } from "react";
import PixelIcon from "@/components/icons/PixelIcon";
import { addDays } from "@/lib/retention";
import { useTranslation } from "@/hooks/useTranslation";
import { useSound } from "@/hooks/useSound";
import type { WeeklyReportSummary } from "@/types/retention";

/**
 * 지난주 리포트 행 (iOS weeklyReportRow 포팅), 미니 7칸 잔디 + 요약 + 진입.
 * 탭하면 WeeklyReportSheet(바텀시트)가 열린다.
 */

interface WeeklyReportRowProps {
  report: WeeklyReportSummary;
  checkInDates: string[];
  onOpen: () => void;
}

export default function WeeklyReportRow({
  report,
  checkInDates,
  onOpen,
}: WeeklyReportRowProps) {
  const { t } = useTranslation();
  const { play } = useSound();
  const checkIns = useMemo(() => new Set(checkInDates), [checkInDates]);
  const weekDays = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(report.weekStart, i);
      if (d !== null) out.push(d);
    }
    return out;
  }, [report.weekStart]);

  return (
    <button
      type="button"
      onClick={() => {
        play("select");
        onOpen();
      }}
      className="press-affordance w-full flex items-center gap-3 bg-bg-surface rounded-2xl p-4 text-left"
    >
      {/* 해당 주 7칸 미니 잔디 프리뷰 (장식, 수치는 요약 텍스트가 전달) */}
      <span className="flex items-center gap-[3px]" aria-hidden="true">
        {weekDays.map((d) => (
          <span
            key={d}
            className="w-2 h-2 rounded-[2px]"
            style={{
              background: checkIns.has(d)
                ? "color-mix(in srgb, var(--accent-primary) 85%, transparent)"
                : "var(--bg-elevated)",
            }}
          />
        ))}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block typo-body text-text-primary">
          {t("flame.report.rowTitle")}
        </span>
        <span className="block typo-caption text-text-tertiary truncate">
          {t("flame.report.rowSummary", {
            checkIns: report.checkInCount,
            cards: report.completedCardCount,
            logs: report.photoLogCount,
          })}
        </span>
      </span>
      <PixelIcon name="ChevronRight" size={12} color="var(--text-tertiary)" />
    </button>
  );
}
