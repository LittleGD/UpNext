"use client";

/**
 * BackupReminderBanner — 미로그인 사용자가 데이터를 잃기 전에 백업 유도.
 *
 * 트리거:
 *  - Firebase 설정됨
 *  - 로그인 안 함
 *  - totalDaysCompleted >= MIN_DAYS_THRESHOLD (의미있는 진행)
 *  - 이전 dismiss 후 REMIND_AGAIN_AFTER_DAYS 경과
 *
 * 유저 피드백 "로그인했어. 백업? 잘 모르겠고 다시 0일차 됨" 의 시나리오 A
 * (storage evict + 백업 미진행) 를 사전 차단하기 위한 UX 안전망.
 */

import { useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "@/store/useGameStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useTranslation } from "@/hooks/useTranslation";
import { isFirebaseConfigured } from "@/lib/firebase";
import { loadFromStorage, saveToStorage } from "@/lib/storage";
import PixelIcon from "@/components/icons/PixelIcon";

interface BackupReminderBannerProps {
  onLogin: () => void;
}

const STORAGE_KEY = "backup_reminder_dismissed_at";
const REMIND_AGAIN_AFTER_DAYS = 7;
const MIN_DAYS_THRESHOLD = 3;

// localStorage 의 "최근 dismiss 여부"를 uSES 로 읽는다 — SSR/첫 hydration 은 true(숨김) 취급.
// (기존 useEffect + setState 초기화를 react-hooks/set-state-in-effect 준수 형태로 대체)
const noopSubscribe = () => () => {};
const getRecentlyDismissedSnapshot = () => {
  const dismissedAt = loadFromStorage<number>(STORAGE_KEY);
  if (!dismissedAt) return false;
  const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
  return daysSince < REMIND_AGAIN_AFTER_DAYS;
};
const getRecentlyDismissedServerSnapshot = () => true;

export default function BackupReminderBanner({ onLogin }: BackupReminderBannerProps) {
  const { t } = useTranslation();
  const isSignedIn = useAuthStore((s) => s.isSignedIn);
  const totalDaysCompleted = useGameStore((s) => s.progress.totalDaysCompleted);
  // 이번 세션에서 사용자가 닫았는지 (dismiss 는 storage 에도 기록되지만, 로그인 버튼은 세션 내 숨김만)
  const [hiddenThisSession, setHiddenThisSession] = useState(false);
  const recentlyDismissed = useSyncExternalStore(
    noopSubscribe,
    getRecentlyDismissedSnapshot,
    getRecentlyDismissedServerSnapshot,
  );

  const visible =
    isFirebaseConfigured &&
    !isSignedIn &&
    (totalDaysCompleted ?? 0) >= MIN_DAYS_THRESHOLD &&
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
          key="backup-reminder"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="rounded-md p-3 mb-3 flex items-start gap-3"
          style={{
            background: "rgba(232, 139, 122, 0.08)",
            border: "1px solid rgba(232, 139, 122, 0.4)",
          }}
          role="status"
        >
          <div style={{ color: "#E88B7A", flexShrink: 0, marginTop: 2 }}>
            <PixelIcon name="WarningDiamond" size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="typo-caption font-semibold text-text-primary">
              {t("backup.banner.title", { days: totalDaysCompleted ?? 0 })}
            </p>
            <p className="typo-caption text-text-secondary mt-0.5 leading-snug">
              {t("backup.banner.body")}
            </p>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={handleLogin}
                className="typo-caption px-3 py-1.5 rounded font-semibold bg-accent text-bg-primary"
              >
                {t("backup.banner.cta")}
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="typo-caption px-3 py-1.5 rounded text-text-tertiary"
              >
                {t("backup.banner.later")}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
