"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import PolaroidTilt from "@/components/growth/PolaroidTilt";
import { isAdAvailable, showRewardedAd } from "@/lib/ads";
import {
  computeDailyFortune,
  isFortuneRevealed,
  markFortuneRevealed,
  readFortuneState,
  type DailyFortune,
} from "@/lib/fortune";
import { cardTitle } from "@/i18n";
import { useGameStore } from "@/store/useGameStore";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * 오늘의 기운 카드 (불꽃 탭 맨 아래) — 옵트인 리워드 광고 진입점.
 *
 * 원칙:
 *  - 유저가 눌러야만 광고가 뜬다. 자동 노출 금지.
 *  - 하루 1회. 한 번 열면 그날은 광고 없이 다시 볼 수 있다(재시청 유도 금지).
 *  - 결과는 유저 자신의 덱에서 결정론적으로 뽑는다 (src/lib/fortune.ts).
 *
 * 노출 조건: 광고를 재생할 수 있는 환경에서만 렌더한다. 순수 웹 브라우저
 * 프로덕션은 모바일 광고 SDK 가 없어 카드 자체를 숨긴다. iOS 네이티브 앱은
 * RecordTabView 에 동일 카드를 별도 구현.
 */
export default function FortuneCard() {
  // 데이 롤오버 재렌더 — flame 페이지의 daily.date 구독과 동일 패턴
  const today = useGameStore((s) => s.daily.date);
  const unlockedCardIds = useGameStore((s) => s.progress.unlockedCardIds);
  const { t, language } = useTranslation();
  const { play } = useSound();

  // SSR/웹 프로덕션 안전: 마운트 후에만 판정 (네이티브 브리지 의존)
  const [available, setAvailable] = useState(false);
  const [phase, setPhase] = useState<"idle" | "loading" | "fail">("idle");
  const [revealed, setRevealed] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  // localStorage 는 마운트 후에만 읽는다 — SSR 에서는 salt 가 없어 계산을 미룬다.
  const [salt, setSalt] = useState<string | null>(null);
  const failTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setAvailable(isAdAvailable());
    setSalt(readFortuneState().salt);
  }, []);

  useEffect(() => {
    setRevealed(isFortuneRevealed(today));
  }, [today]);

  useEffect(
    () => () => {
      if (failTimerRef.current) clearTimeout(failTimerRef.current);
    },
    [],
  );

  const fortune = useMemo<DailyFortune | null>(
    () => (salt ? computeDailyFortune(today, salt, unlockedCardIds) : null),
    [salt, today, unlockedCardIds],
  );

  if (!available) return null;

  // 해금 카드가 하나도 없으면 뽑을 게 없다 — 안내만 두고 광고 진입을 막는다.
  const empty = salt !== null && fortune === null;

  const handleTap = async () => {
    if (phase === "loading") return;
    play("select");
    // 이미 열었으면 광고 없이 다시 보여준다
    if (revealed) {
      setOverlayOpen(true);
      return;
    }
    // 실패 안내 타이머가 남아 있으면 먼저 끊는다 — 3초 뒤 idle 복구가
    // 새로 시작한 loading 을 덮어쓰는 것을 막는다.
    if (failTimerRef.current) {
      clearTimeout(failTimerRef.current);
      failTimerRef.current = null;
    }
    setPhase("loading");
    const result = await showRewardedAd("fortune");
    if (result === "rewarded") {
      markFortuneRevealed(today);
      setRevealed(true);
      setPhase("idle");
      setOverlayOpen(true);
      play("confirm");
    } else if (result === "unavailable") {
      play("cancel");
      setPhase("fail");
      // 함수형 갱신 + 타이머 정리로 이중 가드 — 이 타이머가 뒤늦게 깨어나도
      // 그 사이 다시 loading 으로 넘어갔다면 아무것도 하지 않는다.
      failTimerRef.current = setTimeout(() => {
        failTimerRef.current = null;
        setPhase((prev) => (prev === "fail" ? "idle" : prev));
      }, 3000);
    } else {
      // 중도 이탈 — 조용히 원상 복귀
      setPhase("idle");
    }
  };

  const caption = empty
    ? t("fortune.empty")
    : revealed
      ? t("fortune.opened")
      : phase === "loading"
        ? t("fortune.loading")
        : phase === "fail"
          ? t("fortune.fail")
          : t("fortune.locked.desc");

  const accent = revealed && fortune ? fortune.color.hex : "var(--accent-primary)";

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-bg-surface rounded-2xl p-4"
      >
        <div className="flex items-center gap-3">
          <motion.span
            animate={phase === "loading" ? { opacity: [1, 0.35, 1] } : { opacity: 1 }}
            transition={
              phase === "loading"
                ? { duration: 1.1, repeat: Infinity, ease: "easeInOut" }
                : undefined
            }
            className="flex-shrink-0"
            aria-hidden="true"
          >
            <PixelIcon
              name="Sparkles"
              size={20}
              color={empty ? "var(--text-tertiary)" : accent}
            />
          </motion.span>
          <span className="flex-1 min-w-0">
            <span className="block typo-body text-text-primary">
              {t("fortune.title")}
            </span>
            <span
              className={`block typo-caption truncate ${
                phase === "fail" ? "text-accent-secondary" : "text-text-tertiary"
              }`}
            >
              {caption}
            </span>
          </span>
        </div>

        {/* 이미 열었으면 결과 요약을 카드 안에 인라인으로 남긴다 —
            탭하면 광고 없이 오버레이가 다시 열린다. */}
        {revealed && fortune && (
          <button
            type="button"
            onClick={handleTap}
            className="press-affordance mt-3 w-full flex items-center gap-2.5 text-left"
          >
            <span
              className="flex-shrink-0 w-4 h-4 rounded-sm"
              style={{ backgroundColor: fortune.color.hex }}
              aria-hidden="true"
            />
            <span className="flex-1 min-w-0 typo-caption text-text-secondary truncate">
              {cardTitle(fortune.card, language)}
            </span>
            <PixelIcon name="ChevronRight" size={12} color="var(--text-tertiary)" />
          </button>
        )}

        {!revealed && !empty && (
          <button
            type="button"
            onClick={handleTap}
            disabled={phase === "loading"}
            className="press-affordance mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-bg-elevated py-2.5 disabled:opacity-60"
          >
            {/* 로딩/실패 안내는 위 캡션이 맡는다 — 버튼 라벨은 늘 같은 문구로 고정 */}
            <span className="typo-caption text-text-primary">{t("fortune.cta")}</span>
          </button>
        )}
      </motion.div>

      {/* 오버레이는 body 포털로 — 이 카드는 스태거 컨테이너(framer transform) 안에
          있어서 제자리에 두면 fixed 가 컨테이너 기준으로 갇혀 콘텐츠 뒤에 깔린다. */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {overlayOpen && fortune && (
              <FortuneOverlay
                fortune={fortune}
                onClose={() => setOverlayOpen(false)}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

/* 인화지 위 잉크 색 — 실물 폴라로이드라 테마와 무관하게 고정
   (PolaroidFrameBase 의 #f2f1ee 관례) */
const INK = "#2a2a28";
const INK_SOFT = "#4a4a46";
const INK_FAINT = "#9a9a94";

/**
 * 오늘의 기운 폴라로이드 오버레이 — 광고 시청 직후, 또는 이미 본 날 재열람 시.
 *
 * 포춘쿠키처럼 카드 → 색 → 문구 → 명언 순서로 하나씩 들어온다. 오늘의 색은
 * 배경 글로우와 사진 영역 아이콘에만 쓴다: 인화지(#f2f1ee) 위 텍스트로 쓰면
 * "빈 책상 화이트" 같은 밝은 색이 읽히지 않는다.
 */
function FortuneOverlay({
  fortune,
  onClose,
}: {
  fortune: DailyFortune;
  onClose: () => void;
}) {
  const { t, language } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  // Esc 닫기 / focus trap / scroll lock / focus 복원
  useModalA11y(containerRef, onClose);

  const { card, color, phrase, quote } = fortune;
  // 실존 인물 인용에만 author 가 채워진다. 앱 오리지널 문구는 undefined 라 아무것도 그리지 않는다.
  const quoteAuthor = quote.author;
  // 순차 등장 — reduced motion 이면 지연 없이 한 번에 보여준다.
  const step = (i: number) => (prefersReducedMotion ? 0 : 0.18 + i * 0.22);

  return (
    <motion.div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("fortune.title")}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-8"
      onClick={onClose}
    >
      {/* 오늘의 색 글로우 — 매일 다른 공기를 만든다 */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background: `radial-gradient(60% 45% at 50% 45%, ${color.hex}2e, transparent 70%)`,
        }}
      />
      <PolaroidTilt enabled autoHint>
        <motion.div
          initial={{ y: 140, opacity: 0, rotate: 6 }}
          animate={{ y: 0, opacity: 1, rotate: -2 }}
          exit={{ y: 80, opacity: 0, rotate: 4 }}
          transition={{ type: "spring", stiffness: 240, damping: 22 }}
          className="w-[264px] max-w-full bg-[#f2f1ee] rounded-sm p-[10px] shadow-2xl"
        >
          {/* 사진 영역 — 다크 지면 위에 오늘의 카드를 오늘의 색으로 인화 */}
          <div className="aspect-[154/157] w-full bg-bg-primary flex items-center justify-center overflow-hidden">
            <motion.span
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: step(0), type: "spring", stiffness: 260, damping: 20 }}
            >
              <PixelIcon name={card.icon} size={56} color={color.hex} />
            </motion.span>
          </div>

          {/* 폴라로이드 하단 캡션 여백 — 네 요소를 순차 공개 */}
          <div className="pt-3 pb-2 px-0.5 space-y-2.5 text-left">
            <FortuneRow label={t("fortune.label.card")} delay={step(0)}>
              <p className="typo-body" style={{ color: INK }}>
                {cardTitle(card, language)}
              </p>
            </FortuneRow>

            <FortuneRow label={t("fortune.label.color")} delay={step(1)}>
              <span className="flex items-center gap-2">
                <span
                  className="flex-shrink-0 w-3.5 h-3.5 rounded-sm"
                  style={{ backgroundColor: color.hex }}
                  aria-hidden="true"
                />
                <span className="typo-caption" style={{ color: INK }}>
                  {color.name[language]}
                </span>
              </span>
            </FortuneRow>

            <FortuneRow label={t("fortune.label.phrase")} delay={step(2)}>
              <p className="typo-caption" style={{ color: INK }}>
                {phrase[language]}
              </p>
            </FortuneRow>

            <FortuneRow label={t("fortune.label.quote")} delay={step(3)}>
              <p className="typo-caption" style={{ color: INK_SOFT }}>
                {quote[language]}
              </p>
              {quoteAuthor && (
                <p className="typo-micro pt-0.5" style={{ color: INK_FAINT }}>
                  {`· ${quoteAuthor[language]}`}
                </p>
              )}
            </FortuneRow>
          </div>
        </motion.div>
      </PolaroidTilt>
      <p className="absolute bottom-[calc(env(safe-area-inset-bottom)+40px)] left-0 right-0 text-center typo-caption text-text-tertiary">
        {t("fortune.close")}
      </p>
    </motion.div>
  );
}

/** 라벨 + 값 한 줄. delay 만큼 늦게 들어와 포춘쿠키처럼 하나씩 읽히게 한다. */
function FortuneRow({
  label,
  delay,
  children,
}: {
  label: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: "easeOut" }}
    >
      <p className="typo-micro" style={{ color: INK_FAINT }}>
        {label}
      </p>
      {children}
    </motion.div>
  );
}
