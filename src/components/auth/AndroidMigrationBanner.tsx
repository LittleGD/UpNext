"use client";

/**
 * AndroidMigrationBanner — TWA(Play Store) 사용자 대상 마이그레이션 로그인 유도.
 * (트랙 3 Phase D-1: Capacitor 전환 최소 2주 전 웹 배포에 편승해 노출)
 *
 * TWA → Capacitor 업데이트는 저장소가 격리되어(Chrome 프로필 → WebView)
 * 로그인 없이는 스트릭·XP·진행도가 이전되지 않는다. 전환 전에 클라우드
 * 동기화를 걸어두도록 정직한 문구로 안내한다.
 *
 * TWA 여부 판정은 마운트 지점(src/app/page.tsx 의 isTwaClient 분기) 책임 —
 * 이 컴포넌트는 TWA 에서만 마운트된다는 전제로 노출 조건만 본다:
 *  - Firebase 설정됨 (CTA 가 로그인 오버레이라 미설정이면 무의미)
 *  - 로그인 안 함 (로그인하면 클라우드 동기화 활성 → 목적 달성)
 *  - totalDaysCompleted > 0 (지킬 진행도가 있는 익명 사용자만)
 *  - 이전 dismiss 후 REMIND_AGAIN_AFTER_DAYS(3일) 경과
 *
 * 시각 패턴은 BackupReminderBanner 를 답습하되, 경고 톤 대신
 * 업데이트 예고에 맞는 accent(라임) 톤을 사용한다. 노출 상태도 같은
 * uSES 파생 패턴 (react-hooks/set-state-in-effect 준수).
 */

import { useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "@/store/useGameStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useTranslation } from "@/hooks/useTranslation";
import { isFirebaseConfigured } from "@/lib/firebase";
import { loadFromStorage, saveToStorage } from "@/lib/storage";
import PixelIcon from "@/components/icons/PixelIcon";

interface AndroidMigrationBannerProps {
  onLogin: () => void;
}

const STORAGE_KEY = "android_migration_dismissed_at";
const REMIND_AGAIN_AFTER_DAYS = 3;

const noopSubscribe = () => () => {};
const getRecentlyDismissedSnapshot = () => {
  const dismissedAt = loadFromStorage<number>(STORAGE_KEY);
  if (!dismissedAt) return false;
  const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
  return daysSince < REMIND_AGAIN_AFTER_DAYS;
};
const getRecentlyDismissedServerSnapshot = () => true;

export default function AndroidMigrationBanner({ onLogin }: AndroidMigrationBannerProps) {
  const { t } = useTranslation();
  const isSignedIn = useAuthStore((s) => s.isSignedIn);
  const totalDaysCompleted = useGameStore((s) => s.progress.totalDaysCompleted);
  const [hiddenThisSession, setHiddenThisSession] = useState(false);
  const recentlyDismissed = useSyncExternalStore(
    noopSubscribe,
    getRecentlyDismissedSnapshot,
    getRecentlyDismissedServerSnapshot,
  );

  const visible =
    isFirebaseConfigured &&
    !isSignedIn &&
    (totalDaysCompleted ?? 0) > 0 &&
    !recentlyDismissed &&
    !hiddenThisSession;

  const dismiss = () => {
    saveToStorage(STORAGE_KEY, Date.now());
    setHiddenThisSession(true);
  };

  const handleLogin = () => {
    setHiddenThisSession(true);
    onLogin();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="android-migration"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="rounded-md p-3 mb-3 flex items-start gap-3"
          style={{
            background: "rgba(205, 245, 100, 0.08)",
            border: "1px solid rgba(205, 245, 100, 0.35)",
          }}
          role="status"
        >
          <div style={{ color: "var(--accent-primary)", flexShrink: 0, marginTop: 2 }}>
            <PixelIcon name="Gift" size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="typo-caption font-semibold text-text-primary">
              {t("androidMigration.banner.title")}
            </p>
            <p className="typo-caption text-text-secondary mt-0.5 leading-snug">
              {t("androidMigration.banner.body")}
            </p>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={handleLogin}
                className="typo-caption px-3 py-1.5 rounded font-semibold bg-accent text-bg-primary"
              >
                {t("androidMigration.banner.cta")}
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="typo-caption px-3 py-1.5 rounded text-text-tertiary"
              >
                {t("androidMigration.banner.later")}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
