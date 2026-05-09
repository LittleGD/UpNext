"use client";

/**
 * AndroidFirstLaunchModal — Capacitor Android 앱 첫 실행 시 1회만 표시.
 *
 *  배경: Play Store 의 Android 앱은 Chrome PWA 와 별도 storage 영역을 사용.
 *  사용자가 PWA 로 진행하던 데이터가 Android 앱으로 자동 전이되지 않음.
 *  → Firebase 로그인이 유일한 데이터 보존 경로.
 *
 *  트리거: Android Capacitor + 첫 실행 (localStorage 미세팅) + 미로그인.
 *  닫힘: 사용자가 "로그인" / "나중에" 선택. 다시 안 뜸.
 *
 *  BackupReminderBanner (P2) 와의 차이:
 *   - 배너: 미로그인 + 누적 진행 사용자에게 7일 주기. Android/PWA 공통.
 *   - 본 모달: Android Capacitor 첫 실행 1회 강제. PWA → Android 전환 시점 특화.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/useAuthStore";
import { useTranslation } from "@/hooks/useTranslation";
import { isAndroidNative } from "@/lib/platform";
import { isFirebaseConfigured } from "@/lib/firebase";
import { loadFromStorage, saveToStorage } from "@/lib/storage";
import PixelIcon from "@/components/icons/PixelIcon";
import { GB } from "@/lib/upHeroPalette";

interface AndroidFirstLaunchModalProps {
  onLogin: () => void;
}

const STORAGE_KEY = "android_first_launch_seen_v1";

export default function AndroidFirstLaunchModal({ onLogin }: AndroidFirstLaunchModalProps) {
  const { t } = useTranslation();
  const isSignedIn = useAuthStore((s) => s.isSignedIn);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    if (!isAndroidNative()) return;
    if (isSignedIn) return;
    const seen = loadFromStorage<boolean>(STORAGE_KEY);
    if (seen) return;
    // 마운트 후 약간 지연 — splash / 초기 렌더와 겹치지 않게.
    const t = window.setTimeout(() => setVisible(true), 800);
    return () => window.clearTimeout(t);
  }, [isSignedIn]);

  const dismiss = () => {
    saveToStorage(STORAGE_KEY, true);
    setVisible(false);
  };

  const handleLogin = () => {
    saveToStorage(STORAGE_KEY, true);
    setVisible(false);
    onLogin();
  };

  const accent = GB.lightest;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="android-first-launch"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[90] flex items-center justify-center p-6"
          style={{ background: "rgba(0, 0, 0, 0.85)" }}
          onClick={dismiss}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
            className="relative max-w-sm w-full rounded-2xl p-6 flex flex-col gap-4 grid-border"
            style={{ background: "rgba(10, 31, 10, 0.96)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div style={{ color: accent }}>
                <PixelIcon name="WarningDiamond" size={28} />
              </div>
              <h2 className="typo-heading" style={{ color: accent }}>
                {t("androidFirstLaunch.title")}
              </h2>
            </div>

            <p className="typo-body text-text-primary leading-snug">
              {t("androidFirstLaunch.body1")}
            </p>
            <p className="typo-caption text-text-secondary leading-snug">
              {t("androidFirstLaunch.body2")}
            </p>

            <div className="flex flex-col gap-2 mt-2">
              <button
                type="button"
                onClick={handleLogin}
                className="w-full px-6 py-3 bg-accent text-bg-primary rounded-md typo-body font-semibold"
              >
                {t("androidFirstLaunch.cta")}
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="w-full px-6 py-2 text-text-tertiary typo-caption"
              >
                {t("androidFirstLaunch.later")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
