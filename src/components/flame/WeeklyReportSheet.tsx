"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useTranslation } from "@/hooks/useTranslation";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { CATEGORY_ICONS } from "@/components/icons";
import { categoryLabel } from "@/data/titles";
import { ALL_CARDS } from "@/data/cards";
import { cardTitle } from "@/i18n";
import type { WeeklyReportSummary } from "@/types/retention";

/**
 * 지난주 리포트 바텀시트 (iOS reportSheet 포팅).
 *
 * 2x2 지표(체크인/완료 카드/사진 로그/세이버) + 최다 카테고리 + 인상적인 카드.
 * highlightCardTitle 은 한국어 원제 스냅샷(와이어 안정 식별자)이므로 렌더
 * 시점에 카탈로그 역조회로 현재 언어 제목으로 재현지화한다 (iOS 동일).
 *
 * AnimatePresence 하위에서 mount/unmount, 부모가 exit 애니메이션을 관리.
 * body 로 portal 해 조상 transform(framer 스태거)과 fixed 포지션 간섭 회피.
 */

interface WeeklyReportSheetProps {
  report: WeeklyReportSummary;
  onClose: () => void;
}

export default function WeeklyReportSheet({ report, onClose }: WeeklyReportSheetProps) {
  const { t, language } = useTranslation();
  const reducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  useModalA11y(containerRef, onClose);

  if (typeof window === "undefined") return null;

  // 인상적인 카드, 한국어 원제 → 현재 언어 (카탈로그 미매치 시 원제 그대로)
  const highlightCard = report.highlightCardTitle
    ? ALL_CARDS.find((c) => c.title === report.highlightCardTitle)
    : undefined;
  const highlightTitle = highlightCard
    ? cardTitle(highlightCard, language)
    : report.highlightCardTitle;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[60] flex items-end justify-center"
      style={{ background: "var(--backdrop-dialog)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="weekly-report-title"
        initial={reducedMotion ? { opacity: 0 } : { y: "100%" }}
        animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
        exit={reducedMotion ? { opacity: 0 } : { y: "100%" }}
        transition={
          reducedMotion
            ? { duration: 0.15 }
            : { type: "spring", duration: 0.45, bounce: 0.08 }
        }
        className="w-full max-w-lg md:max-w-xl bg-bg-surface rounded-t-3xl max-h-[85vh] overflow-y-auto px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+24px)]"
      >
        {/* 시트 핸들 */}
        <div aria-hidden="true" className="w-10 h-1 rounded-full bg-bg-hover mx-auto mb-4" />

        {/* 명시적 닫기 버튼 — 시트에 유일한 focusable. 없으면 useModalA11y 의
            focus trap 이 Tab 을 preventDefault 로 삼키고, 모바일 SR 은 Esc/백드롭
            외에 닫을 수단이 없다 (a11y 리뷰 반영, PhotoCaptureModal 과 동일 관례). */}
        <div className="flex items-start justify-between gap-2">
          <h2 id="weekly-report-title" className="typo-title text-text-primary">
            {t("flame.report.sheetTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("a11y.close")}
            className="press-affordance p-2 -m-2 rounded-md"
          >
            <PixelIcon name="Cancel" size={18} color="var(--text-secondary)" />
          </button>
        </div>
        <p className="typo-caption text-text-tertiary mt-1 tabular-nums">
          {report.weekStart} - {report.weekEnd}
        </p>

        {/* 2x2 지표 그리드 */}
        <div className="grid grid-cols-2 gap-2.5 mt-4">
          <MetricTile
            icon="Fire"
            value={t("flame.unit.days", { n: report.checkInCount })}
            label={t("flame.report.metric.checkIns")}
          />
          <MetricTile
            icon="Check"
            value={t("flame.unit.cards", { n: report.completedCardCount })}
            label={t("flame.report.metric.cards")}
          />
          <MetricTile
            icon="Image"
            value={t("flame.unit.logs", { n: report.photoLogCount })}
            label={t("flame.report.metric.photos")}
          />
          <MetricTile
            icon="Shield"
            value={report.usedSaver ? t("flame.report.saverUsed") : t("flame.report.saverUnused")}
            label={t("flame.report.metric.saver")}
          />
        </div>

        {report.topCategory && (
          <InsightRow
            icon={CATEGORY_ICONS[report.topCategory] ?? "Sparkle"}
            title={t("flame.report.topCategory")}
            value={categoryLabel(report.topCategory, language)}
          />
        )}
        {highlightTitle && (
          <InsightRow
            icon="Sparkle"
            title={t("flame.report.highlightCard")}
            value={highlightTitle}
          />
        )}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

/* ──────────────────────────────────────────────────────── */

function MetricTile({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div className="bg-bg-elevated rounded-xl p-3.5 flex flex-col items-start gap-2">
      <PixelIcon name={icon} size={16} color="var(--accent-primary)" />
      <p className="typo-heading text-text-primary tabular-nums">{value}</p>
      <p className="typo-micro text-text-tertiary">{label}</p>
    </div>
  );
}

function InsightRow({ icon, title, value }: { icon: string; title: string; value: string }) {
  return (
    <div className="flex items-center gap-3 bg-bg-elevated rounded-xl p-3.5 mt-2.5">
      <span className="w-6 flex justify-center">
        <PixelIcon name={icon} size={18} color="var(--accent-primary)" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block typo-micro text-text-tertiary">{title}</span>
        <span className="block typo-body text-text-primary truncate">{value}</span>
      </span>
    </div>
  );
}
