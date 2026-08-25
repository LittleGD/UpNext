"use client";

import PixelIcon from "@/components/icons/PixelIcon";
import { MAX_MONTHLY_SAVERS } from "@/lib/retention";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * 방패(세이버) + 최고기록 2열 스탯 행 (iOS GuardStatsRow 포팅).
 *
 * grid 2열 stretch 로 두 카드 등고 유지 (iOS 의 fixedSize+maxHeight 트릭의
 * 웹 동치는 CSS grid 기본 stretch 라 별도 처리 불필요).
 */

interface GuardStatsRowProps {
  savers: number;
  best: number;
  current: number;
}

export default function GuardStatsRow({ savers, best, current }: GuardStatsRowProps) {
  const { t } = useTranslation();
  const renewing = current >= best && best > 0;

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {/* 방패, 남은 개수만큼 라임, 소진분은 흐리게 */}
      <section className="bg-bg-surface rounded-2xl p-4 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: MAX_MONTHLY_SAVERS }, (_, i) => (
            <PixelIcon
              key={i}
              name="Shield"
              size={18}
              color={
                i < savers
                  ? "var(--accent-primary)"
                  : "color-mix(in srgb, var(--text-tertiary) 30%, transparent)"
              }
            />
          ))}
        </div>
        <p className="typo-micro text-text-tertiary">
          {savers > 0
            ? t("flame.guard.savers", { count: savers })
            : t("flame.guard.noSavers")}
        </p>
      </section>

      {/* 최고기록, 경신 중이면 라임 카피로 강조 */}
      <section className="bg-bg-surface rounded-2xl p-4 flex flex-col gap-2">
        <PixelIcon name="Trophy" size={18} color="var(--accent-primary)" />
        <p className="typo-heading text-text-primary tabular-nums">
          {t("flame.unit.days", { n: best })}
        </p>
        <p className={`typo-micro ${renewing ? "text-accent" : "text-text-tertiary"}`}>
          {renewing ? t("flame.hero.bestRenewing") : t("flame.guard.bestLabel")}
        </p>
      </section>
    </div>
  );
}
