"use client";

/**
 * AndroidMigrationBanner — TWA(Play Store) 사용자 대상 마이그레이션 로그인 유도.
 * (트랙 3 Phase D-1: Capacitor 전환 최소 2주 전 웹 배포에 편승해 노출)
 *
 * TWA → Capacitor 업데이트는 저장소가 격리되어(Chrome 프로필 → WebView)
 * 로그인 없이는 스트릭·XP·진행도가 이전되지 않는다. 전환 전에 클라우드
 * 동기화를 걸어두도록 정직한 문구로 안내한다.
 *
 * 동시에 Chrome 기반 셸(TWA · 설치형 PWA)의 "진행도 위험" 안내를 겸한다:
 * 브라우저 데이터 삭제는 localStorage · IndexedDB 사진 · Firebase Auth 세션을
 * 한 번에 지우므로(익명 인증도 같은 origin 저장소라 구제 불가), 로그인만이
 * 되찾을 길이다. 본문 아래 androidMigration.banner.risk 한 줄이 그 역할.
 * isAndroidTwa() 의 폴백(Android UA + display-mode standalone)이 TWA 와 설치형
 * PWA 를 모두 이 배너로 보내므로 대상 집합이 정확히 일치한다.
 *
 * TWA 여부 판정은 마운트 지점(src/app/page.tsx 의 isTwaClient 분기) 책임 —
 * 이 컴포넌트는 TWA 에서만 마운트된다는 전제로 노출 조건만 본다:
 *  - Firebase 설정됨 (CTA 가 로그인 오버레이라 미설정이면 무의미)
 *  - 로그인 안 함 (로그인하면 클라우드 동기화 활성 → 목적 달성)
 *  - totalDaysCompleted > 0 (지킬 진행도가 있는 익명 사용자만)
 *    또는 Up Hero 진행(코인 > 0 / 인벤토리 · 도감 보유) — 지킬은 손대지
 *    않았지만 Up Hero 만 플레이해 잃을 데이터가 있는 사용자도 커버.
 *  - 이전 dismiss 후 REMIND_AGAIN_AFTER_DAYS 경과 (램프: 노출 시작
 *    D+7 부터는 1일로 단축 — 전환 시점이 다가올수록 리마인드를 조인다)
 *
 * 시각 패턴은 BackupReminderBanner 를 답습하되, 경고 톤 대신
 * 업데이트 예고에 맞는 accent(라임) 톤을 사용한다. 카드에 border 를 쓰지
 * 않는 디자인 규칙에 따라 배경 단계 + 라임 글로우로 위계를 만든다.
 * 노출 상태도 같은 uSES 파생 패턴 (react-hooks/set-state-in-effect 준수).
 * 노출 조건 · dismiss 주기(3일, D+7 뒤 1일) · 저장 키 · CTA 배선은 그대로.
 */

import { useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "@/store/useGameStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useTranslation } from "@/hooks/useTranslation";
import { isFirebaseConfigured } from "@/lib/firebase";
import { loadFromStorage, saveToStorage } from "@/lib/storage";
import PixelIcon from "@/components/icons/PixelIcon";

interface AndroidMigrationBannerProps {
  onLogin: () => void;
}

// 같은 키에 { first, last } 로 저장한다 — first 는 "노출 시작일"(최초 dismiss
// 시점)의 기준점, last 는 기존과 동일하게 "다시 언제 보여줄지" 계산에 쓴다.
// 과거(레거시) 저장분은 raw number 하나뿐이라 아래 getRecentlyDismissedSnapshot
// 에서 { first: raw, last: raw } 로 보정한다.
interface DismissRecord {
  first: number;
  last: number;
}

const STORAGE_KEY = "android_migration_dismissed_at";
const REMIND_AGAIN_AFTER_DAYS = 3;
const REMIND_AGAIN_AFTER_DAYS_RAMPED = 1;
const RAMP_AFTER_DAYS = 7;

const noopSubscribe = () => () => {};
const getRecentlyDismissedSnapshot = () => {
  const raw = loadFromStorage<DismissRecord | number>(STORAGE_KEY);
  if (!raw) return false;
  const record: DismissRecord = typeof raw === "number" ? { first: raw, last: raw } : raw;
  const daysSinceFirst = (Date.now() - record.first) / (1000 * 60 * 60 * 24);
  const remindAfterDays =
    daysSinceFirst >= RAMP_AFTER_DAYS ? REMIND_AGAIN_AFTER_DAYS_RAMPED : REMIND_AGAIN_AFTER_DAYS;
  const daysSinceLast = (Date.now() - record.last) / (1000 * 60 * 60 * 24);
  return daysSinceLast < remindAfterDays;
};
const getRecentlyDismissedServerSnapshot = () => true;

export default function AndroidMigrationBanner({ onLogin }: AndroidMigrationBannerProps) {
  const { t } = useTranslation();
  const isSignedIn = useAuthStore((s) => s.isSignedIn);
  const totalDaysCompleted = useGameStore((s) => s.progress.totalDaysCompleted);
  const upHeroCoins = useUpHeroStore((s) => s.coins);
  const upHeroInventoryCount = useUpHeroStore((s) => s.inventory.length);
  const upHeroCodexCount = useUpHeroStore(
    (s) => s.codex.monsters.length + s.codex.bosses.length + s.codex.equipment.length,
  );
  const hasUpHeroProgress = upHeroCoins > 0 || upHeroInventoryCount > 0 || upHeroCodexCount > 0;
  const [hiddenThisSession, setHiddenThisSession] = useState(false);
  const recentlyDismissed = useSyncExternalStore(
    noopSubscribe,
    getRecentlyDismissedSnapshot,
    getRecentlyDismissedServerSnapshot,
  );

  const visible =
    isFirebaseConfigured &&
    !isSignedIn &&
    ((totalDaysCompleted ?? 0) > 0 || hasUpHeroProgress) &&
    !recentlyDismissed &&
    !hiddenThisSession;

  const dismiss = () => {
    const prev = loadFromStorage<DismissRecord | number>(STORAGE_KEY);
    const prevFirst = prev ? (typeof prev === "number" ? prev : prev.first) : null;
    const now = Date.now();
    const record: DismissRecord = { first: prevFirst ?? now, last: now };
    saveToStorage(STORAGE_KEY, record);
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
            boxShadow: "0 0 18px rgba(205, 245, 100, 0.14)",
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
            <p className="typo-caption text-text-secondary mt-1 leading-snug">
              {t("androidMigration.banner.risk")}
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
