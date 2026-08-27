"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useGameStore } from "@/store/useGameStore";
import { useRetentionStore } from "@/store/useRetentionStore";
import { useUIStore } from "@/store/useUIStore";
import { isFirebaseConfigured } from "@/lib/firebase";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import FlameGreetingHeader from "@/components/flame/FlameGreetingHeader";
import FlameHero from "@/components/flame/FlameHero";
import MilestoneTrack from "@/components/flame/MilestoneTrack";
import GuardStatsRow from "@/components/flame/GuardStatsRow";
import CheckInHeatmap from "@/components/flame/CheckInHeatmap";
import DuoFlameCard from "@/components/flame/DuoFlameCard";
import WeeklyReportRow from "@/components/flame/WeeklyReportRow";
import WeeklyReportSheet from "@/components/flame/WeeklyReportSheet";
import FortuneCard from "@/components/flame/FortuneCard";
import type { WeeklyReportSummary } from "@/types/retention";

/**
 * 불꽃 탭 (트랙 2-1/2-2 UI), iOS RecordTabView + RetentionSectionView 포팅.
 *
 * 시간대 인사 / 스트릭 히어로 / 마일스톤 / 방패·최고기록 / 28일 히트맵 /
 * 2인 불꽃 / 지난주 리포트를 한 페이지로. 디자인 언어는 웹 canonical
 * (Tailwind 토큰 + PixelIcon + framer-motion, 카드 보더 없음).
 *
 * 색 규칙: 솔로 = accent(라임), 듀오 = accent-cyan. accent-secondary(에러 레드)
 * 사용 금지 (iOS RetentionSectionView 헤더 주석과 동일).
 *
 * 데이터: useRetentionStore (initialize 는 멱등, SyncProvider 부트스트랩과
 * 중복 호출돼도 안전). reconcileForToday 는 SyncProvider 60초 틱이 주기적으로
 * 돌리지만, 탭 진입 직후 최신 상태(월 세이버 리필 + 주간 리포트 백필)를
 * 보장하기 위해 여기서도 1회 호출한다.
 */

const LoginOverlay = dynamic(() => import("@/components/auth/LoginOverlay"), {
  ssr: false,
});

export default function FlamePage() {
  const initialize = useGameStore((s) => s.initialize);
  const isLoaded = useGameStore((s) => s.isLoaded);
  const retentionInitialize = useRetentionStore((s) => s.initialize);
  const retentionLoaded = useRetentionStore((s) => s.isLoaded);
  const retention = useRetentionStore((s) => s.retention);
  const checkInToday = useRetentionStore((s) => s.checkInToday);
  const reconcileForToday = useRetentionStore((s) => s.reconcileForToday);
  // 데이 롤오버 재렌더 트리거 — 렌더 시점 getTodayString() 은 자정(01:00)을 넘겨도
  // 아무것도 재렌더를 유발하지 않아 열어둔 탭/PWA 가 어제 상태(체크인 완료 문구,
  // 어제 앵커 히트맵)로 굳는다. SyncProvider 60초 틱의 checkDailyReset 이 롤오버 시
  // daily.date 를 갱신하므로 이를 구독하면 경계에서 자동 재렌더된다.
  const today = useGameStore((s) => s.daily.date);
  // 로그인 사용자 부트스트랩(클라우드 retention 채택) 완료 전 체크인 게이트.
  // fresh 로컬에 체크인하면 lastCheckInDate 가 오늘로 찍혀 업로드 게이트를 통과,
  // 이후 aAhead/로컬 선택 시 스트릭 1짜리가 iOS 의 긴 스트릭을 대체한다.
  // auth 확정 전에는 로그인 여부를 알 수 없으므로 Firebase 사용 시 settled 전까지
  // 일괄 게이트 (익명은 auth null 확정 즉시 syncSettled=true 라 창이 짧다).
  // iOS 는 부트스트랩 동안 phase .loading 이 UI 전체를 가리는 것에 대응.
  const syncSettled = useUIStore((s) => s.syncSettled);
  const checkInPending = isFirebaseConfigured && !syncSettled;

  const [shownReport, setShownReport] = useState<WeeklyReportSummary | null>(null);
  const [showLoginOverlay, setShowLoginOverlay] = useState(false);

  useEffect(() => {
    if (!isLoaded) initialize();
  }, [isLoaded, initialize]);

  useEffect(() => {
    if (!retentionLoaded) retentionInitialize();
  }, [retentionLoaded, retentionInitialize]);

  // 게임 스토어 로드 후 1회 정리, reconcile 은 completionHistory 를 읽으므로
  // isLoaded 를 기다린다 (스토어 내부에도 동일 가드가 있지만 재시도 트리거용).
  useEffect(() => {
    if (isLoaded) reconcileForToday();
  }, [isLoaded, reconcileForToday]);

  if (!isLoaded || !retentionLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="skeleton w-32 h-4" />
      </div>
    );
  }

  const checkedToday = retention.lastCheckInDate === today;
  const latestReport = retention.weeklyReports[0];

  return (
    <div className="px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+96px)] max-w-lg md:max-w-xl lg:max-w-2xl mx-auto">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="space-y-3.5"
      >
        <motion.div variants={fadeInUp}>
          <FlameGreetingHeader />
        </motion.div>

        <motion.div variants={fadeInUp}>
          <FlameHero
            streak={retention.currentLightStreak}
            best={retention.bestLightStreak}
            checkedToday={checkedToday}
            checkInPending={checkInPending}
            onCheckIn={() => {
              // 사운드/햅틱/듀오 발행은 스토어가 처리. 반환값(방패 소비 등)은
              // 히어로 상태 전환(글로우 점화)으로 충분해 별도 토스트는 두지 않는다.
              checkInToday();
            }}
          />
        </motion.div>

        <motion.div variants={fadeInUp}>
          <MilestoneTrack streak={retention.currentLightStreak} />
        </motion.div>

        <motion.div variants={fadeInUp}>
          <GuardStatsRow
            savers={retention.streakSavers}
            best={retention.bestLightStreak}
            current={retention.currentLightStreak}
          />
        </motion.div>

        <motion.div variants={fadeInUp}>
          <CheckInHeatmap
            checkInDates={retention.checkInDates}
            usedSaverDates={retention.usedSaverDates}
            today={today}
          />
        </motion.div>

        <motion.div variants={fadeInUp}>
          <DuoFlameCard onRequestLogin={() => setShowLoginOverlay(true)} />
        </motion.div>

        {latestReport && (
          <motion.div variants={fadeInUp}>
            <WeeklyReportRow
              report={latestReport}
              checkInDates={retention.checkInDates}
              onOpen={() => setShownReport(latestReport)}
            />
          </motion.div>
        )}

        {/* 오늘의 기운 (옵트인 리워드 광고) — 콘텐츠가 끝난 맨 아래 자리.
            지원 플랫폼이 아니면 null 렌더라 자체 motion 으로 등장을 처리
            (stagger 래퍼로 감싸면 웹 프로덕션에서 빈 div 가 space-y 간격을 남긴다). */}
        <FortuneCard />
      </motion.div>

      <AnimatePresence>
        {shownReport && (
          <WeeklyReportSheet
            key={shownReport.weekStart}
            report={shownReport}
            onClose={() => setShownReport(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLoginOverlay && (
          <LoginOverlay onDismiss={() => setShowLoginOverlay(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
