"use client";

import { motion } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { useTranslation } from "@/hooks/useTranslation";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * 불꽃 히어로 (iOS RetentionSectionView.FlameHeroCore 포팅), 페이지 위계 정점.
 *
 * 스트릭 = 키우는 불꽃: 티어(0 / 1-6 / 7-29 / 30-99 / 100+)에 따라 불꽃
 * 크기 40-88px + 글로우가 자란다. 체크 전에는 회색 + 미세 축소(0.96),
 * 체크인 순간 스프링으로 원래 크기 + 라임으로 점화.
 *
 * 사운드/햅틱은 useRetentionStore.checkInToday 내부에서 재생하므로 여기서는
 * 호출만 한다 (중복 재생 방지).
 *
 * 디자인 규칙: 카드/버튼 보더 금지, bg-bg-surface 평면 + 라운드만 사용.
 */

interface FlameHeroProps {
  streak: number;
  best: number;
  checkedToday: boolean;
  /**
   * 로그인 부트스트랩(클라우드 retention 채택) 완료 전 true — 체크인 CTA 비활성.
   * fresh 로컬 체크인이 클라우드의 긴 스트릭을 대체하는 창을 막는다 (iOS 는
   * phase .loading 이 UI 전체를 가리는 것에 대응).
   */
  checkInPending?: boolean;
  onCheckIn: () => void;
}

// 티어별 불꽃 크기 / 체크인 후 글로우 강도 (iOS 와 동일 수치)
const FLAME_SIZES = [40, 52, 64, 76, 88] as const;
const GLOW_ALPHAS = [0, 0.25, 0.4, 0.55, 0.7] as const;

function tierOf(streak: number): number {
  if (streak <= 0) return 0;
  if (streak <= 6) return 1;
  if (streak <= 29) return 2;
  if (streak <= 99) return 3;
  return 4;
}

export default function FlameHero({
  streak,
  best,
  checkedToday,
  checkInPending = false,
  onCheckIn,
}: FlameHeroProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();

  const tier = tierOf(streak);
  const flameSize = FLAME_SIZES[tier];
  const glow = checkedToday ? GLOW_ALPHAS[tier] : 0.12;
  const renewing = streak >= best && best > 0;

  return (
    <section className="bg-bg-surface rounded-2xl p-6 flex flex-col items-center gap-3.5">
      {/* 불꽃 + 글로우, 글로우는 순수 장식이라 aria-hidden */}
      <div
        className="relative flex items-center justify-center"
        style={{ height: flameSize * 2 }}
      >
        <div
          aria-hidden="true"
          className="absolute rounded-full"
          style={{
            width: flameSize * 1.9,
            height: flameSize * 1.9,
            background: "var(--accent-primary)",
            opacity: glow,
            filter: "blur(24px)",
            transition: "opacity 500ms var(--ease-gb-out)",
          }}
        />
        <motion.div
          className="relative"
          animate={
            reducedMotion ? undefined : { scale: checkedToday ? 1 : 0.96 }
          }
          transition={{ type: "spring", stiffness: 300, damping: 16 }}
        >
          <PixelIcon
            name="Fire"
            size={flameSize}
            color={checkedToday ? "var(--accent-primary)" : "var(--text-tertiary)"}
          />
        </motion.div>
      </div>

      <div className="text-center">
        <p className="typo-display text-text-primary tabular-nums">{streak}</p>
        <p className="typo-caption text-text-tertiary">{t("flame.hero.streakUnit")}</p>
      </div>

      {renewing && (
        <p className="typo-caption text-accent">{t("flame.hero.bestRenewing")}</p>
      )}

      {checkedToday ? (
        <p className="typo-body text-accent">{t("flame.hero.checkedToday")}</p>
      ) : (
        <div className="w-full space-y-2.5">
          <p className="typo-body text-text-primary text-center">
            {streak > 0
              ? t("flame.hero.continuePrompt", { days: streak })
              : t("flame.hero.firstPrompt")}
          </p>
          <button
            type="button"
            onClick={onCheckIn}
            disabled={checkInPending}
            className="press-affordance w-full h-12 rounded-full bg-accent text-bg-primary typo-body font-semibold disabled:opacity-50"
          >
            {t("flame.hero.checkIn")}
          </button>
        </div>
      )}
    </section>
  );
}
