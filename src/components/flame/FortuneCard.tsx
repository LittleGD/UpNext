"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import PolaroidTilt from "@/components/growth/PolaroidTilt";
import RarityBackdrop from "@/components/cards/RarityBackdrop";
import FortuneDrawIntro from "@/components/flame/FortuneDrawIntro";
import AuraSection from "@/components/flame/AuraSection";
import {
  FORTUNE_AUTO_OPEN_EVENT,
  FORTUNE_AUTO_OPEN_KEY,
} from "@/components/flame/FortunePromptModal";
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
import { useUIStore } from "@/store/useUIStore";
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
  const prefersReducedMotion = useReducedMotion();
  // 오버레이가 떠 있는 동안 하단 네비를 숨긴다 (useUIStore 주석 참고)
  const setFortuneOverlayOpen = useUIStore((s) => s.setFortuneOverlayOpen);

  // SSR/웹 프로덕션 안전: 마운트 후에만 판정 (네이티브 브리지 의존)
  const [available, setAvailable] = useState(false);
  const [phase, setPhase] = useState<"idle" | "loading" | "fail">("idle");
  const [revealed, setRevealed] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  // 뽑기 연출 재생 중 — 끝나면 폴라로이드로 넘어간다. 그날 첫 공개에만 true.
  const [drawing, setDrawing] = useState(false);
  // 뽑기 연출 직후에는 폴라로이드 오버레이의 스크림 페이드인을 건너뛴다.
  // 두 스크림이 겹쳐 페이드하면 배경이 잠깐 두 겹으로 어두워져 끊겨 보인다.
  const [skipOverlayEnter, setSkipOverlayEnter] = useState(false);
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

  // 네비 숨김 — cleanup 으로 반드시 false 를 돌려놓는다. 언마운트(탭 이동)나
  // 렌더 도중 에러로 오버레이가 사라져도 네비가 영영 숨은 채 남으면 안 된다.
  // 기운 리딩은 이 오버레이 안에서만 열리므로 여기 한 상태로 충분하다.
  useEffect(() => {
    setFortuneOverlayOpen(overlayOpen);
    return () => setFortuneOverlayOpen(false);
  }, [overlayOpen, setFortuneOverlayOpen]);

  const fortune = useMemo<DailyFortune | null>(
    () => (salt ? computeDailyFortune(today, salt, unlockedCardIds) : null),
    [salt, today, unlockedCardIds],
  );

  // 자동 열기 effect(아래)가 참조하므로 early return 위에 둔다 — 평소 CTA 와
  // 완전히 같은 경로를 재사용해야 광고 옵트인 흐름이 하나로 유지된다.
  const handleTap = useCallback(async () => {
    if (phase === "loading") return;
    play("select");
    // 이미 열었으면 광고 없이 다시 보여준다 — 재열람은 뽑기 연출을 건너뛰고
    // 곧장 폴라로이드로 간다(같은 연출을 하루에 몇 번씩 다시 보게 하지 않는다).
    if (revealed) {
      setDrawing(false);
      setSkipOverlayEnter(false);
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
      // 그날 첫 공개에만 뽑기 연출을 앞에 붙인다. reduced motion 이면 통째로 건너뛴다.
      const withDraw = !prefersReducedMotion;
      setDrawing(withDraw);
      setSkipOverlayEnter(withDraw);
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
  }, [phase, play, revealed, today, prefersReducedMotion]);

  // 진입 팝업("지금 열기")의 자동 열기 신호를 소비한다 — FortunePromptModal 의 계약.
  // 광고 판정(available)과 오늘의 기운 계산(fortune)이 끝난 뒤에만 읽는다.
  // 신호는 1회성이라 읽는 즉시 지운다: 날짜가 어긋났거나 뽑을 카드가 없으면
  // 값만 지우고 조용히 흘린다(다음 렌더마다 광고가 불쑥 뜨지 않게).
  useEffect(() => {
    if (!available || salt === null) return;

    const consume = () => {
      let signal: string | null = null;
      try {
        signal = sessionStorage.getItem(FORTUNE_AUTO_OPEN_KEY);
      } catch {
        return; // sessionStorage 차단 환경 — 유저가 CTA 를 직접 누르면 된다
      }
      if (!signal) return;
      try {
        sessionStorage.removeItem(FORTUNE_AUTO_OPEN_KEY);
      } catch {
        // 제거 실패해도 아래 today 비교가 다음 날엔 걸러낸다
      }
      // 자정 롤오버 사이 — 소비만 하고 자동 열기는 안 한다
      if (signal !== today) return;
      if (fortune === null) return; // 해금 카드 없음 = 죽은 CTA
      void handleTap();
    };

    // 다른 탭에서 /flame 으로 넘어온 경우는 이 마운트 시점 1회로 잡히고,
    // 이미 /flame 에 있던 경우는 이벤트로 잡힌다.
    consume();
    window.addEventListener(FORTUNE_AUTO_OPEN_EVENT, consume);
    return () => window.removeEventListener(FORTUNE_AUTO_OPEN_EVENT, consume);
  }, [available, salt, today, fortune, handleTap]);

  if (!available) return null;

  // 해금 카드가 하나도 없으면 뽑을 게 없다 — 안내만 두고 광고 진입을 막는다.
  const empty = salt !== null && fortune === null;

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
          <>
            {/* 뽑기 연출 → 폴라로이드. 연출은 AnimatePresence 밖에 둔다 —
                끝나는 순간 같은 스크림 위에서 딱 바꿔치기해야 이어져 보인다. */}
            {overlayOpen && drawing && fortune && (
              <FortuneDrawIntro
                colorHex={fortune.color.hex}
                onComplete={() => setDrawing(false)}
              />
            )}
            <AnimatePresence>
              {overlayOpen && !drawing && fortune && (
                <FortuneOverlay
                  fortune={fortune}
                  today={today}
                  skipEnter={skipOverlayEnter}
                  onClose={() => {
                    setOverlayOpen(false);
                    setSkipOverlayEnter(false);
                  }}
                />
              )}
            </AnimatePresence>
          </>,
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
 *
 * 기운 3종(AuraSection)은 폴라로이드 **아래로 이어지는 추가 콘텐츠**다. 별도
 * 섹션으로 탭 페이지에 늘어놓지 않는다 — 오늘의 기운을 본 사람만, 그 흐름 안에서
 * 이어 본다. 폴라로이드는 첫 화면에 온전히 앉고 기운 선택은 아래로 걸쳐,
 * 스크롤할 것이 있다는 사실 자체가 어포던스가 된다.
 */
function FortuneOverlay({
  fortune,
  today,
  skipEnter,
  onClose,
}: {
  fortune: DailyFortune;
  /** daily.date — 기운 열람 기록의 자정 롤오버 기준 */
  today: string;
  /** 뽑기 연출이 이미 같은 스크림을 깔아 뒀을 때 true — 스크림 페이드인을 생략한다 */
  skipEnter?: boolean;
  onClose: () => void;
}) {
  const { t, language } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  // 진입 포커스 — 기본값(첫 focusable)은 화면 밖 기운 칩이라 스크린리더가
  // 폴라로이드를 통째로 건너뛴다. 본문 래퍼를 먼저 읽히고 Tab 으로 내려가게 한다.
  const polaroidRef = useRef<HTMLDivElement>(null);
  // 기운 리딩이 이 위에 떠 있는 동안은 Esc 를 넘겨준다 — 한 번의 Esc 로 두 겹이
  // 한꺼번에 닫히면 유저는 리딩만 닫으려다 폴라로이드까지 잃는다.
  const [auraOpen, setAuraOpen] = useState(false);
  // Esc 닫기 / focus trap / scroll lock / focus 복원
  useModalA11y(containerRef, onClose, { noEscape: auraOpen, initialFocus: polaroidRef });

  /**
   * 기운 블록 입력 게이트. 등장 애니메이션은 opacity 0 으로 시작해 1.1초 뒤에야
   * 페이드인하는데, 그동안에도 블록은 레이아웃에 남아 히트테스트를 통과한다.
   * 폴라로이드가 날아드는 사이 화면 하단(방금 사라진 네비 자리)을 탭하면 보이지도
   * 않는 칩이 눌려 그날 무료 기운 1장이 소모되거나 리워드 광고가 재생됐다.
   *
   * 애니메이션이 끝난 뒤에만 입력을 받는다. onAnimationComplete 가 주 경로이고,
   * 콜백이 유실돼 칩이 영영 죽는 일이 없도록 같은 길이의 타이머를 보조로 둔다.
   * reduced motion 이면 지연이 0 이라 곧바로 열린다.
   */
  const [auraInteractive, setAuraInteractive] = useState(false);
  useEffect(() => {
    const id = setTimeout(
      () => setAuraInteractive(true),
      prefersReducedMotion ? 420 : 1520,
    );
    return () => clearTimeout(id);
  }, [prefersReducedMotion]);

  const { card, color, phrase, quote } = fortune;
  // 실존 인물 인용에만 author 가 채워진다. 앱 오리지널 문구는 undefined 라 아무것도 그리지 않는다.
  const quoteAuthor = quote.author;
  // 착지(0.42s) → 현상(0.5s~) 뒤에 텍스트가 하나씩. reduced motion 이면 지연 0.
  const step = (i: number) => (prefersReducedMotion ? 0 : 0.62 + i * 0.16);

  return (
    <motion.div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("fortune.title")}
      initial={skipEnter ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-50 overflow-hidden bg-black/80 backdrop-blur-md"
    >
      {/* 배경 연출 층 — 스크롤 레이어 밖에 둔다. 기운 선택으로 내려갈 때 빛과
          입자까지 따라 흐르면 착지의 잔상이 아니라 배경 이미지가 된다.
          아래 6rem 은 기운 선택이 첫 화면에 걸치는 만큼 — 폴라로이드가 앉는 칸의
          중심과 연출의 중심을 맞춘다. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 bottom-24"
        aria-hidden="true"
      >
        {/* 오늘 카드의 등급 빛기둥 — 폴라로이드 뒤, 스크림 앞.
            CSS keyframes + contain 으로 성능 튜닝된 컴포넌트라 그대로 재사용한다. */}
        <RarityBackdrop rarity={card.rarity} />

        {/* 오늘의 색 글로우 — 착지 순간 부풀었다가 가라앉으며 공기를 만든다 */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={prefersReducedMotion ? { opacity: 0.55 } : { opacity: 0, scale: 0.7 }}
          animate={
            prefersReducedMotion
              ? { opacity: 0.55 }
              : { opacity: [0, 0.95, 0.55], scale: [0.7, 1.15, 1] }
          }
          transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.26, duration: 0.75, times: [0, 0.4, 1] }}
          style={{
            background: `radial-gradient(60% 45% at 50% 45%, ${color.hex}2e, transparent 70%)`,
          }}
        />

        {/* 착지 임팩트 — 화면 전체가 오늘의 색으로 한 번 번쩍인다 */}
        {!prefersReducedMotion && (
          <motion.div
            className="absolute inset-0 pointer-events-none mix-blend-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.22, 0] }}
            transition={{ delay: 0.3, duration: 0.36, times: [0, 0.25, 1] }}
            style={{ backgroundColor: color.hex }}
          />
        )}

        {/* 착지와 함께 튀는 입자 — 오늘의 색으로 흩어졌다 사라진다 */}
        {!prefersReducedMotion && (
          <div className="absolute inset-0 pointer-events-none">
            {SPARKS.map((s, i) => (
              <motion.span
                key={i}
                className="absolute left-1/2 top-1/2 rounded-full"
                style={{ width: s.size, height: s.size, backgroundColor: color.hex }}
                initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                animate={{
                  x: Math.cos(s.angle) * s.distance,
                  y: Math.sin(s.angle) * s.distance,
                  opacity: [0, 1, 0],
                  scale: [0.4, 1, 0.3],
                }}
                transition={{ delay: 0.32 + s.delay, duration: 0.72, ease: "easeOut" }}
              />
            ))}
          </div>
        )}
      </div>

      {/* 스크롤 레이어 — z-10 으로 배경 연출 위에 온다. 배경 탭으로 닫는 어포던스는
          여기 남기고, 아래 기운 블록에서 전파를 끊어 스크롤·선택과 다투지 않게 한다.
          overflow-x-hidden 은 폴라로이드가 던져질 때의 x 오프셋이 가로 스크롤을
          만들지 않게 막는다. */}
      <div
        className="relative z-10 h-full overflow-y-auto overflow-x-hidden overscroll-contain px-8"
        onClick={onClose}
      >
        {/* 첫 화면 — 폴라로이드는 온전히 보이고, 기운 선택이 아래로 걸친다 */}
        <div className="flex min-h-[calc(100%_-_6rem)] items-center justify-center py-8">
          {/* enabled 를 도중에 바꾸면 안 된다. PolaroidTilt 는 비활성일 때 children 을 그대로
              반환하고 활성일 때만 래퍼를 씌우는데, 그 전환이 자식을 리마운트시켜
              던지기 애니메이션이 처음부터 다시 시작된다. 틸트는 자체 래퍼에 transform 을
              걸어 카드의 착지 스프링과 합성되므로 처음부터 켜 두어도 충돌하지 않는다. */}
          <PolaroidTilt enabled={!prefersReducedMotion} autoHint={false}>
            {/* 위에서 빠르게 던져져 살짝 튕기며 자리를 잡는다.
                opacity 는 짧게 끊어 "던졌다" 가 "서서히 나타났다" 로 읽히지 않게 한다. */}
            <motion.div
              initial={
                prefersReducedMotion
                  ? { opacity: 0, y: 12 }
                  : { y: -560, x: 26, rotate: -16, scale: 1.08, opacity: 0 }
              }
              animate={
                prefersReducedMotion
                  ? { opacity: 1, y: 0 }
                  : { y: 0, x: 0, rotate: -2, scale: 1, opacity: 1 }
              }
              exit={{ y: 90, opacity: 0, rotate: 5, transition: { duration: 0.18 } }}
              transition={
                prefersReducedMotion
                  ? { duration: 0.2 }
                  : {
                      type: "spring",
                      stiffness: 420,
                      damping: 26,
                      mass: 0.9,
                      opacity: { duration: 0.1 },
                    }
              }
              ref={polaroidRef}
              tabIndex={-1}
              className="relative w-[264px] max-w-full bg-[#f2f1ee] rounded-sm p-[10px] shadow-2xl overflow-hidden outline-none"
            >
              {/* 인화지 위를 한 번 스치는 빛 — 착지 직후 "열린다" 는 신호 */}
              {!prefersReducedMotion && (
                <motion.div
                  className="absolute inset-y-0 w-1/2 pointer-events-none"
                  aria-hidden="true"
                  initial={{ x: "-160%" }}
                  animate={{ x: "260%" }}
                  transition={{ delay: 0.44, duration: 0.8, ease: "easeInOut" }}
                  style={{
                    background:
                      "linear-gradient(100deg, transparent, rgba(255,255,255,0.72), transparent)",
                  }}
                />
              )}

              {/* 사진 영역 — 폴라로이드가 현상되듯 어둡고 흐린 상태에서 서서히 잡힌다 */}
              <div className="relative aspect-[154/157] w-full bg-bg-primary flex items-center justify-center overflow-hidden">
                <motion.span
                  initial={
                    prefersReducedMotion
                      ? { opacity: 1 }
                      : { opacity: 0, scale: 1.18, filter: "blur(9px) brightness(0.25)" }
                  }
                  animate={
                    prefersReducedMotion
                      ? { opacity: 1 }
                      : { opacity: 1, scale: 1, filter: "blur(0px) brightness(1)" }
                  }
                  transition={
                    prefersReducedMotion
                      ? { duration: 0 }
                      : { delay: 0.5, duration: 0.8, ease: [0.16, 1, 0.3, 1] }
                  }
                >
                  <PixelIcon name={card.icon} size={56} color={color.hex} />
                </motion.span>
                {/* 현상 전 인화지의 잔여 어둠이 걷힌다 */}
                {!prefersReducedMotion && (
                  <motion.div
                    className="absolute inset-0 bg-black pointer-events-none"
                    aria-hidden="true"
                    initial={{ opacity: 0.92 }}
                    animate={{ opacity: 0 }}
                    transition={{ delay: 0.46, duration: 0.85, ease: "easeOut" }}
                  />
                )}
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
        </div>

        {/* 폴라로이드 아래로 이어지는 추가 콘텐츠 — 오늘의 기운을 본 사람만
            그 흐름 안에서 기운 3종을 고른다. 전파를 끊어 여기서의 탭이 오버레이를
            닫지 않게 한다. 리딩 오버레이는 body 포털이지만 React 트리로는 이
            안쪽이라 같은 보호를 받는다. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: prefersReducedMotion ? 0 : 1.1, duration: 0.35 }}
          onAnimationComplete={() => setAuraInteractive(true)}
          className={`mx-auto w-[264px] max-w-full pb-[calc(env(safe-area-inset-bottom)+32px)] ${
            auraInteractive ? "" : "pointer-events-none"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <AuraSection today={today} colorHex={color.hex} onOverlayChange={setAuraOpen} />

          {/* 명시적 닫기 — 스크롤 제스처와 다투지 않는 확실한 출구.
              배경 탭으로 닫는 길도 그대로 살아 있다. */}
          <button
            type="button"
            onClick={onClose}
            className="press-affordance mt-5 w-full rounded-xl bg-bg-elevated py-2.5"
          >
            <span className="typo-caption text-text-secondary">{t("fortune.close")}</span>
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}

/**
 * 착지 입자 — 각도·거리·크기를 고정 테이블로 둔다.
 * Math.random 을 쓰면 리렌더마다 궤적이 바뀌어 애니메이션이 끊긴다.
 */
const SPARKS = [
  { angle: -1.9, distance: 132, size: 5, delay: 0 },
  { angle: -1.2, distance: 168, size: 4, delay: 0.04 },
  { angle: -0.5, distance: 120, size: 6, delay: 0.02 },
  { angle: 0.1, distance: 152, size: 4, delay: 0.06 },
  { angle: 0.8, distance: 128, size: 5, delay: 0.01 },
  { angle: 1.5, distance: 174, size: 3, delay: 0.05 },
  { angle: 2.2, distance: 116, size: 5, delay: 0.03 },
  { angle: 2.9, distance: 160, size: 4, delay: 0.07 },
  { angle: 3.6, distance: 124, size: 6, delay: 0.02 },
  { angle: 4.3, distance: 148, size: 3, delay: 0.05 },
  { angle: -2.6, distance: 140, size: 4, delay: 0.04 },
  { angle: 5.1, distance: 112, size: 5, delay: 0.06 },
] as const;
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
