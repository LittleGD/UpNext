"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";

/* ── FortuneCard 와의 계약 (자동 열기 신호) ──
   "지금 열기" 는 광고를 직접 부르지 않는다. 광고 재생·뽑기 연출·폴라로이드는
   전부 FortuneCard 소유이므로, 여기서는 sessionStorage 에 가벼운 신호만 남기고
   /flame 으로 보낸다. FortuneCard 는 마운트 후 이 값을 읽어 자기 today 와 같으면
   consume(제거) 하고 평소의 탭 핸들러를 그대로 실행하면 된다.

   - 값: 신호를 남긴 시점의 제품일 "YYYY-MM-DD" (useGameStore.daily.date 와 동일 기준)
   - sessionStorage 라 앱을 껐다 켜면 사라진다 — 스테일 신호로 광고가 뜨는 일이 없다
   - 날짜가 어긋나면(자정 롤오버 사이) 자동 열기 없이 값만 지운다 */
export const FORTUNE_AUTO_OPEN_KEY = "upnext_fortune_autoopen";

/** sessionStorage 를 쓰지 않고도 신호가 닿게 하는 브로드캐스트 (아래 주석 참고) */
export const FORTUNE_AUTO_OPEN_EVENT = "upnext:fortune-autoopen";

/** "지금 열기" 로 /flame 에 들어갔음을 알린다. 실패해도 치명적이지 않다(수동 탭 가능). */
export function markFortuneAutoOpen(today: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(FORTUNE_AUTO_OPEN_KEY, today);
  } catch {
    // 저장 실패 — 유저가 /flame 에서 직접 탭하면 된다
  }
  // 이미 /flame 에 있으면 router.push 가 no-op 이라 FortuneCard 가 리마운트도
  // 리렌더도 되지 않는다. 그 경우 저장만으로는 신호가 영영 소비되지 않으므로
  // 마운트돼 있는 카드에게 직접 알린다 (iOS FortuneAutoOpen.pending 대응).
  window.dispatchEvent(new Event(FORTUNE_AUTO_OPEN_EVENT));
}

/* ── 오늘 물어봤는지 (하루 1회 게이트) ──
   fortune.ts 의 revealedDate 와는 다른 축이다. revealedDate 는 "열었는지",
   이쪽은 "물어봤는지". 광고를 중도 이탈해도 같은 날 팝업이 다시 뜨면 안 된다. */
const PROMPT_STORAGE_KEY = "upnext_fortune_prompt";

/** 오늘 이미 물어봤는지 */
export function wasFortunePromptAsked(today: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(PROMPT_STORAGE_KEY) === today;
  } catch {
    // 읽기 실패 — 세션 플래그가 남아 있으니 한 번 더 묻는 정도로 그친다
    return false;
  }
}

/** 어느 경로로 닫히든 1회 기록 ("지금 열기" 포함 — 오늘 다시 묻지 않는다) */
export function markFortunePromptAsked(today: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PROMPT_STORAGE_KEY, today);
  } catch {
    // 저장 실패는 세션 플래그가 커버한다
  }
}

interface FortunePromptModalProps {
  /** "지금 열기" — 호출측이 신호를 남기고 /flame 으로 보낸다 */
  onConfirm: () => void;
  /** "나중에" — 닫기만 한다 */
  onSkip: () => void;
}

/**
 * 오늘의 기운 진입 팝업 — 앱 실행 체인(충돌 → 패치 노트 → 여기) 의 마지막 칸.
 *
 * 원칙:
 *  - **알림이지 광고가 아니다.** 여기서 광고를 부르지 않는다. 유저가 "지금 열기" 를
 *    누르면 불꽃 탭으로 데려다줄 뿐, 실제 옵트인은 FortuneCard 의 CTA 가 받는다.
 *    (AdMob 정책: 자동 재생·자동 노출 금지)
 *  - **언제나 스킵 가능.** "나중에" 는 대등한 선택지로 보여야 한다.
 *  - 하루 1회, 세션 1회. 게이트는 SyncProvider 가 판단한다.
 */
export default function FortunePromptModal({
  onConfirm,
  onSkip,
}: FortunePromptModalProps) {
  const { t } = useTranslation();
  const { play } = useSound();
  const containerRef = useRef<HTMLDivElement>(null);
  // 전정계 민감 사용자 — 카드가 솟아오르는 spring 을 페이드로 대체.
  const reducedMotion = useReducedMotion();

  // Esc 닫기 + focus trap + 배경 스크롤 락. Esc 는 "나중에" 와 같은 취급.
  useModalA11y(containerRef, onSkip);

  const handleConfirm = () => {
    play("confirm");
    onConfirm();
  };

  const handleSkip = () => {
    play("select");
    onSkip();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg"
      style={{
        // viewportFit: cover 환경에서 모달이 status bar / nav bar 뒤로 밀리지 않도록
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
      }}
      onClick={handleSkip}
    >
      <motion.div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fortune-prompt-title"
        aria-describedby="fortune-prompt-desc"
        initial={reducedMotion ? false : { y: 60, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={reducedMotion ? { opacity: 0 } : { y: 60, opacity: 0, scale: 0.95 }}
        transition={
          reducedMotion
            ? { duration: 0.12 }
            : { type: "spring", duration: 0.5, bounce: 0.18 }
        }
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs rounded-2xl overflow-hidden relative"
        style={{
          backgroundColor: "var(--bg-elevated)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5), 0 0 60px rgba(223,255,0,0.10)",
        }}
      >
        {/* 봉투 밖으로 새어나오는 빛 — 뒤에 뽑기 연출이 기다린다는 암시.
            아이콘을 박스에 가두지 않고 배경 wash 로만 처리한다. */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(120% 70% at 50% 0%, rgba(223,255,0,0.14) 0%, transparent 60%)",
          }}
        />

        <div className="relative z-10 px-6 pt-8 pb-6 flex flex-col items-center text-center">
          <motion.span
            initial={reducedMotion ? false : { opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: reducedMotion ? 0 : 0.12, duration: 0.32 }}
            aria-hidden="true"
          >
            <PixelIcon name="Sparkles" size={28} color="var(--accent-primary)" />
          </motion.span>

          <motion.h3
            id="fortune-prompt-title"
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reducedMotion ? 0 : 0.18 }}
            className="typo-heading text-text-primary leading-snug mt-4"
          >
            {t("fortune.prompt.title")}
          </motion.h3>

          <motion.p
            id="fortune-prompt-desc"
            initial={reducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reducedMotion ? 0 : 0.22 }}
            className="typo-caption text-text-tertiary leading-relaxed mt-2"
          >
            {t("fortune.locked.desc")}
          </motion.p>

          <motion.button
            type="button"
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reducedMotion ? 0 : 0.28 }}
            onClick={handleConfirm}
            className="w-full py-3.5 mt-6 rounded-xl text-black typo-body transition-[transform,filter] duration-160 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] active:brightness-90"
            style={{ backgroundColor: "var(--accent-primary)" }}
          >
            {t("fortune.prompt.confirm")}
          </motion.button>

          {/* 스킵은 언제나 대등한 선택지 — 라임 버튼 아래 텍스트 버튼으로 두되
              터치 영역(44px)은 그대로 확보한다. */}
          <motion.button
            type="button"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reducedMotion ? 0 : 0.32 }}
            onClick={handleSkip}
            className="w-full min-h-[44px] mt-1 typo-caption text-text-tertiary transition-colors hover:text-text-secondary"
          >
            {t("fortune.prompt.skip")}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
