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
import { SHOP_PRICES } from "@/types/uphero";
import { useGameStore } from "@/store/useGameStore";
import { useUIStore } from "@/store/useUIStore";
import { useUpHeroStore } from "@/store/useUpHeroStore";
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
 * 노출 조건: **항상 렌더한다.** 예전에는 `isAdAvailable()` 이 false 면 카드를 통째로
 * 숨겼는데(죽은 CTA 금지 취지), 그 결과 광고를 구조적으로 못 받는 사용자
 * (순수 웹 브라우저·TWA·EEA 동의 거부·미승인 지역·오프라인)는 기능의 **존재조차
 * 몰랐다.** 이제 코인 경로(SHOP_PRICES.fortune)가 병존하므로 CTA 가 죽지 않는다.
 *
 * 경로 선택 — 광고가 기본, 코인은 탈출구.
 *  광고를 볼 수 있으면 광고 CTA 가 그대로 기본 경로다. 코인 CTA 는 광고가 불가능할
 *  때만 나타난다. 둘을 항상 나란히 두면 "코인 아까우니 광고 봐야지"라는 압박이 새로
 *  생겨서, 접근성을 고치려다 다른 강요를 만드는 꼴이 된다.
 *
 * iOS 네이티브 앱은 FortuneCardView.swift 에 같은 두 경로를 별도 구현.
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

  // 코인 경로 — 잔액 차감은 Up Hero 스토어의 기존 공개 API 를 그대로 쓴다.
  const spendCoins = useUpHeroStore((s) => s.spendCoins);
  const heroLoaded = useUpHeroStore((s) => s.isLoaded);
  const heroInitialize = useUpHeroStore((s) => s.initialize);

  // SSR/웹 프로덕션 안전: 마운트 후에만 판정 (네이티브 브리지 의존).
  // 초기값 false = 코인 경로. 판정 전 한 프레임 동안 광고 CTA 를 먼저 보여 주면
  // 정작 광고를 못 받는 다수에게 열리지 않는 문구를 먼저 읽히게 된다.
  const [available, setAvailable] = useState(false);
  /**
   * 이번 세션에서 광고 경로가 실제로 실패했다. 한 번 확인되면 코인 경로로 전환한다.
   * `isAdAvailable()` 은 환경만 보고 낙관적으로 true 를 돌려주므로(동의 거부·no fill·
   * 오프라인을 모른다) 그것만으로는 판정할 수 없다. 실제 "unavailable" 을 받아야 확정된다.
   */
  const [adDeadEnd, setAdDeadEnd] = useState(false);
  const [phase, setPhase] = useState<"idle" | "loading" | "noCoins">("idle");
  const [revealed, setRevealed] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  // 뽑기 연출 재생 중 — 끝나면 폴라로이드로 넘어간다. 그날 첫 공개에만 true.
  const [drawing, setDrawing] = useState(false);
  // 뽑기 연출 직후에는 폴라로이드 오버레이의 스크림 페이드인을 건너뛴다.
  // 두 스크림이 겹쳐 페이드하면 배경이 잠깐 두 겹으로 어두워져 끊겨 보인다.
  const [skipOverlayEnter, setSkipOverlayEnter] = useState(false);
  // localStorage 는 마운트 후에만 읽는다 — SSR 에서는 salt 가 없어 계산을 미룬다.
  const [salt, setSalt] = useState<string | null>(null);
  const noCoinsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setAvailable(isAdAvailable());
    setSalt(readFortuneState().salt);
  }, []);

  /**
   * 코인 경로로 갈 때만 필요한 상태.
   *   광고를 볼 수 있으면 **광고가 기본 경로**다. 코인은 광고가 불가능할 때만 나타난다.
   */
  const usesCoinPath = adDeadEnd || !available;

  /**
   * Up Hero 스토어는 홈(뽑기 화면)·아지트에서만 초기화된다. /flame 으로 곧장 들어온
   * 사용자는 잔액이 0 으로 보여, 코인이 있는데도 "부족해요" 를 만나게 된다.
   * initialize 는 멱등이라(isLoaded 가드) 다른 화면과 충돌하지 않는다.
   * 광고 경로에서는 부르지 않는다 — 필요 없는 곳에서 스토어를 깨우지 않는다.
   */
  useEffect(() => {
    if (usesCoinPath && !heroLoaded) heroInitialize();
  }, [usesCoinPath, heroLoaded, heroInitialize]);

  useEffect(() => {
    setRevealed(isFortuneRevealed(today));
  }, [today]);

  useEffect(
    () => () => {
      if (noCoinsTimerRef.current) clearTimeout(noCoinsTimerRef.current);
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

  /**
   * 공개 확정 — 광고 완주와 코인 결제가 **같은 절차**를 타야 한다.
   * (그날 1회 마킹 + 표시 상태 + 뽑기 연출 예약 + 오버레이 열기)
   */
  const openRevealed = useCallback(() => {
    markFortuneRevealed(today);
    setRevealed(true);
    setPhase("idle");
    // 그날 첫 공개에만 뽑기 연출을 앞에 붙인다. reduced motion 이면 통째로 건너뛴다.
    const withDraw = !prefersReducedMotion;
    setDrawing(withDraw);
    setSkipOverlayEnter(withDraw);
    setOverlayOpen(true);
    play("confirm");
  }, [today, prefersReducedMotion, play]);

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
    // 안내 타이머가 남아 있으면 먼저 끊는다 — 3초 뒤 idle 복구가
    // 새로 시작한 loading 을 덮어쓰는 것을 막는다.
    if (noCoinsTimerRef.current) {
      clearTimeout(noCoinsTimerRef.current);
      noCoinsTimerRef.current = null;
    }

    // 코인 경로 — 광고를 못 받는 상태에서만 온다. 가격은 CTA 에 이미 적혀 있고
    // 이 탭이 곧 결제 확정이다(리롤과 같은 규약: 별도 확인 다이얼로그 없음).
    if (usesCoinPath) {
      if (!spendCoins(SHOP_PRICES.fortune)) {
        play("cancel");
        setPhase("noCoins");
        // 함수형 갱신 + 타이머 정리로 이중 가드 — 이 타이머가 뒤늦게 깨어나도
        // 그 사이 다른 상태로 넘어갔다면 아무것도 하지 않는다.
        noCoinsTimerRef.current = setTimeout(() => {
          noCoinsTimerRef.current = null;
          setPhase((prev) => (prev === "noCoins" ? "idle" : prev));
        }, 3000);
        return;
      }
      openRevealed();
      return;
    }

    setPhase("loading");
    const result = await showRewardedAd("fortune");
    if (result === "rewarded") {
      openRevealed();
    } else if (result === "unavailable") {
      // 막다른 길이던 자리. 예전엔 "지금은 보여줄 광고가 없어요"를 3초 띄우고
      // 원복해, 아무리 눌러도 열 수 없는 상태가 무한 반복됐다. 이제 광고 경로가
      // 실제로 죽었다는 사실을 확정하고 코인 경로로 전환한다 — 다음 탭부터 CTA 가
      // 가격을 달고 나온다. 여기서 코인을 자동 차감하지는 않는다(기습 결제 금지:
      // 사용자가 가격을 보고 한 번 더 눌러야 한다).
      play("cancel");
      setAdDeadEnd(true);
      setPhase("idle");
    } else {
      // 중도 이탈 — 조용히 원상 복귀
      setPhase("idle");
    }
  }, [phase, play, revealed, usesCoinPath, spendCoins, openRevealed]);

  // 진입 팝업("지금 열기")의 자동 열기 신호를 소비한다 — FortunePromptModal 의 계약.
  // 오늘의 기운 계산(fortune)이 끝난 뒤에만 읽는다.
  // 신호는 1회성이라 읽는 즉시 지운다: 날짜가 어긋났거나 뽑을 카드가 없으면
  // 값만 지우고 조용히 흘린다(다음 렌더마다 광고가 불쑥 뜨지 않게).
  useEffect(() => {
    if (salt === null) return;

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
      // 코인 경로에서는 자동으로 열지 않는다. 팝업의 "지금 열기" 는 광고 옵트인을
      // 전제로 만든 신호라, 여기서 그대로 태우면 가격을 보지 못한 채 코인이 빠진다
      // (기습 결제 금지). 신호는 이미 소비했으니 카드의 CTA 가 가격을 달고 기다린다.
      if (usesCoinPath) return;
      void handleTap();
    };

    // 다른 탭에서 /flame 으로 넘어온 경우는 이 마운트 시점 1회로 잡히고,
    // 이미 /flame 에 있던 경우는 이벤트로 잡힌다.
    consume();
    window.addEventListener(FORTUNE_AUTO_OPEN_EVENT, consume);
    return () => window.removeEventListener(FORTUNE_AUTO_OPEN_EVENT, consume);
  }, [salt, today, fortune, usesCoinPath, handleTap]);

  // 해금 카드가 하나도 없으면 뽑을 게 없다 — 안내만 두고 진입을 막는다.
  const empty = salt !== null && fortune === null;

  const caption = empty
    ? t("fortune.empty")
    : phase === "loading"
      ? t("fortune.loading")
      : phase === "noCoins"
        ? t("fortune.noCoins", { cost: SHOP_PRICES.fortune })
        : revealed
          ? t("fortune.opened")
          : usesCoinPath
            ? // 광고를 못 받는 상태 — 왜 코인을 쓰는지 밝혀야 납득이 된다.
              t("fortune.coin.desc")
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
            {/* 잔액 부족은 에러가 아니라 안내다 — accent-secondary(에러색)를 쓰지 않는다.
                오늘의 기운은 렌즈이지 심판이 아니고, 코인이 모자란 것도 잘못이 아니다. */}
            <span className="block typo-caption truncate text-text-tertiary">
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
            {/* 로딩/부족 안내는 위 캡션이 맡는다 — 버튼 라벨은 경로에 따라서만 갈린다.
                코인 경로일 땐 가격을 라벨에 박아 둔다: 눌러야 차감되므로 기습 결제가
                없다(리롤의 `리롤 · 100코인` 과 같은 규약). */}
            <span className="typo-caption text-text-primary">
              {usesCoinPath
                ? t("fortune.cta.coin", { cost: SHOP_PRICES.fortune })
                : t("fortune.cta")}
            </span>
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
const INK_SOFT = "#6b6b66";
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
   * 콜백이 유실돼 칩이 영영 죽는 일이 없도록 타이머를 보조로 둔다. 하단 고정
   * 닫기 바도 같은 게이트를 쓴다 — iOS 는 1.60s 에 탭이 살아난다.
   * reduced motion 이면 지연이 0 이라 곧바로 열린다.
   */
  const [auraInteractive, setAuraInteractive] = useState(false);
  useEffect(() => {
    const id = setTimeout(
      () => setAuraInteractive(true),
      prefersReducedMotion ? 420 : 1600,
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
          박스는 화면 전체(iOS 의 ignoresSafeArea 층들과 같다). 예전엔 아래 6rem 을
          잘라 연출 중심을 폴라로이드 자리에 맞췄는데, RarityBackdrop 의 contain 이
          그 선에서 빛기둥을 딱 잘라 안드로이드에서 하단 띠로 보였다. 지금은 빛기둥과
          플래시는 풀블리드로 두고 글로우·입자만 transform 으로 48px 올린다. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {/* 오늘 카드의 등급 빛기둥 — 폴라로이드 뒤, 스크림 앞.
            CSS keyframes + contain 으로 성능 튜닝된 컴포넌트라 그대로 재사용한다. */}
        <RarityBackdrop rarity={card.rarity} />

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

        {/* 글로우·입자 — 폴라로이드가 앉는 칸(첫 화면은 아래 6rem 을 기운 선택에
            내준다)의 중심에 맞춰 그 절반만큼 올린다. 클립이 아니라 이동이라
            가장자리가 잘리지 않는다. */}
        <div className="absolute inset-0 -translate-y-12" aria-hidden="true">
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
      </div>

      {/* 스크롤 레이어 — z-10 으로 배경 연출 위에 온다. 배경 탭으로 닫는 어포던스는
          여기 남기고, 아래 기운 블록에서 전파를 끊어 스크롤·선택과 다투지 않게 한다.
          overflow-x-hidden 은 폴라로이드가 던져질 때의 x 오프셋이 가로 스크롤을
          만들지 않게 막는다. */}
      <div
        className="relative z-10 h-full overflow-y-auto overflow-x-hidden overscroll-contain px-5"
        onClick={onClose}
      >
        {/* 첫 화면 — 폴라로이드는 온전히 보이고, 기운 선택이 아래로 걸친다 */}
        <div className="flex min-h-[calc(100%_-_6rem)] items-center justify-center pt-6 pb-8">
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
              className="relative w-[268px] max-w-full bg-[#f2f1ee] rounded-sm p-[10px] shadow-2xl overflow-hidden outline-none"
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

              {/* 사진 영역(248×132, iOS 와 같은 판형) — 현상되듯 어둡고 흐린 상태에서 서서히 잡힌다 */}
              <div className="relative h-[132px] w-full bg-bg-primary flex items-center justify-center overflow-hidden">
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
                  <PixelIcon name={card.icon} size={52} color={color.hex} />
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

              {/* 폴라로이드 하단 캡션 여백 — 네 요소를 순차 공개(가운데 정렬, iOS 와 같은 간격) */}
              <div className="pt-3.5 pb-2 px-1.5 space-y-2.5 text-center">
                <FortuneRow label={t("fortune.label.card")} delay={step(0)}>
                  <p className="typo-body" style={{ color: INK }}>
                    {cardTitle(card, language)}
                  </p>
                </FortuneRow>

                <FortuneRow label={t("fortune.label.color")} delay={step(1)}>
                  <span className="flex items-center justify-center gap-2">
                    <span
                      className="flex-shrink-0 w-3.5 h-3.5 rounded-sm"
                      style={{ backgroundColor: color.hex }}
                      aria-hidden="true"
                    />
                    <span className="typo-caption" style={{ color: INK_SOFT }}>
                      {color.name[language]}
                    </span>
                  </span>
                </FortuneRow>

                <FortuneRow label={t("fortune.label.phrase")} delay={step(2)}>
                  <p className="typo-caption" style={{ color: INK_SOFT }}>
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
          className={`w-full pb-[calc(env(safe-area-inset-bottom)+92px)] ${
            auraInteractive ? "" : "pointer-events-none"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <AuraSection today={today} colorHex={color.hex} onOverlayChange={setAuraOpen} />
        </motion.div>
      </div>

      {/* 하단 고정 닫기(iOS closeBar) — 스크롤이 붙은 화면에서 "어디를 눌러야
          닫히나"를 남겨두면 유저가 갇힌다. 연출이 끝나는 1.3s 에 페이드인하고
          기운 블록과 같은 게이트(auraInteractive)로 탭이 살아난다. 스크롤 콘텐츠는
          위에서 92px 을 비워 마지막 줄이 바 아래로 들어가지 않는다.
          배경 탭으로 닫는 길도 그대로 살아 있다. */}
      <motion.div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center pb-[calc(env(safe-area-inset-bottom)+28px)] ${
          auraInteractive ? "" : "[&>button]:pointer-events-none"
        }`}
        initial={{ opacity: prefersReducedMotion ? 1 : 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: prefersReducedMotion ? 0 : 1.3, duration: 0.3, ease: "easeIn" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="press-affordance pointer-events-auto rounded-xl bg-bg-surface/90 px-[26px] py-[11px]"
        >
          <span className="typo-caption text-text-secondary">{t("fortune.close")}</span>
        </button>
      </motion.div>
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
      className="space-y-[3px] text-center"
    >
      <p className="typo-micro" style={{ color: INK_FAINT }}>
        {label}
      </p>
      {children}
    </motion.div>
  );
}
