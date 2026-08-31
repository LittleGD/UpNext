"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import AuraScratch from "@/components/flame/AuraScratch";
import { isAdAvailable, showRewardedAd } from "@/lib/ads";
import {
  AURA_KINDS,
  auraAdviceVariant,
  auraCautionIndex,
  auraHintIndex,
  auraTarotOffer,
  computeAura,
  type AuraInput,
  type AuraKind,
  type AuraReading,
  type AuraTier,
} from "@/lib/aura";
import {
  ensureAuraSnapshot,
  markAuraOpened,
  markAuraTarot,
  readAuraState,
  readFortuneState,
} from "@/lib/fortune";
import { TAROT_DECK, type TarotCard } from "@/data/tarotPool";
import type { L10nText } from "@/data/fortunePool";
import { playSound, triggerHaptic } from "@/lib/sounds";
import type { DictKey } from "@/i18n";
import { SHOP_PRICES } from "@/types/uphero";
import { useGameStore } from "@/store/useGameStore";
import { useRetentionStore } from "@/store/useRetentionStore";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useDuoStore } from "@/store/useDuoStore";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * 기운 3종 리딩 — 폴라로이드를 본 뒤 재물·관계·건강 중 하나를 골라 본다.
 *
 * 규칙:
 *  - 첫 번째는 무료. 오늘의 기운을 이미 열었으니 그 값을 여기서 치른다.
 *  - 나머지 둘은 각각 리워드 광고 1회. 옵트인이며, 중도 이탈은 아무 일도 아니다.
 *  - 광고를 재생할 수 없는 환경(브라우저·TWA·동의 거부·오프라인)에서는 대신
 *    코인(SHOP_PRICES.auraReading)으로 연다. 광고가 유일한 경로가 되면 브라우저
 *    유저는 영영 하나만 보게 된다 — FortuneCard 와 같은 원칙이다.
 *  - 이미 연 기운은 그날 안에서 광고도 코인도 없이 다시 볼 수 있다(재시청 유도 금지).
 *
 * 리딩은 첫 기운을 여는 순간 3종을 한꺼번에 계산해 고정한다(fortune.ts).
 * 오전에 본 재물기운이 오후에 카드를 하나 더 깼다고 달라지면 점이 아니라
 * 대시보드가 된다.
 *
 * **화면에 수치를 그리지 않는다.** 점수는 tier 를 고르는 데서 역할이 끝나고,
 * 유저가 보는 것은 등급 라벨 · 조짐 문장 · 조언 셋뿐이다. 숫자나 막대를 주면
 * 유저가 역산하려 들고, 그 순간 점집이 성적표가 된다. 강조는 색과 타이포로만.
 */

/* ── 문자열 키 매핑 — DictKey 로 좁혀 두면 오타가 빌드에서 걸린다 ── */

const NAME_KEY: Record<AuraKind, DictKey> = {
  wealth: "aura.wealth.name",
  relationship: "aura.relationship.name",
  health: "aura.health.name",
};

const TIER_KEY: Record<AuraTier, DictKey> = {
  great: "aura.tier.great",
  good: "aura.tier.good",
  fair: "aura.tier.fair",
  care: "aura.tier.care",
};

/**
 * 조짐 문장. 파라미터 치환이 없다 — 키 하나가 문장 하나다.
 * 실측 신호는 aura.ts 에서 이 키를 고르는 데까지만 쓰이고 화면으로는 넘어오지 않는다.
 *
 * 키는 기운별로 갈린다(aura.omen.{kind}.{omen}.{variant}) — 같은 "모임"의 조짐도
 * 재물과 관계에서 다른 문장으로 읽혀야 세 리딩이 복붙으로 안 보인다.
 */
function omenKey(r: AuraReading): DictKey {
  return `aura.omen.${r.kind}.${r.omen}.${r.variant}` as DictKey;
}
/**
 * 조언 문장 — 기운·등급에 조언 전용 변주(0..5)를 더해 키를 만든다.
 * AuraReading.variant(0..2)는 조짐 몫이고, 조언은 auraAdviceVariant 가 6종을 돈다 —
 * 같은 등급이 이어져도 조언까지 어제와 같은 문장이 나오는 날을 줄인다.
 */
function adviceKey(r: AuraReading, today: string, salt: string): DictKey {
  return `aura.advice.${r.kind}.${r.tier}.${auraAdviceVariant(today, salt, r.kind)}` as DictKey;
}
/**
 * 오늘의 실마리·흘려보낼 것 — 조짐·조언과 같은 시드 재료(오늘+salt+기운)에서
 * 결정론적으로 하나를 고른다. 하루 안에서 문구가 바뀌면 리딩의 "그럴싸함"이 무너진다.
 * 인덱스 계산은 aura.ts 의 auraHintIndex/auraCautionIndex 단일 출처를 쓴다 —
 * iOS Aura.hintIndex/cautionIndex 와 픽스처로 묶인 함수라 여기서 복제하면 드리프트가 생긴다.
 */
function hintKey(kind: AuraKind, today: string, salt: string): DictKey {
  return `aura.hint.${kind}.${auraHintIndex(today, salt, kind)}` as DictKey;
}
function cautionKey(kind: AuraKind, today: string, salt: string): DictKey {
  return `aura.caution.${kind}.${auraCautionIndex(today, salt, kind)}` as DictKey;
}

const KIND_ICON: Record<AuraKind, string> = {
  wealth: "Coins",
  relationship: "Users",
  health: "Heart",
};

/* 인화지 위 잉크 — 폴라로이드(FortuneCard)와 같은 관례 */
const INK = "#2a2a28";
const INK_SOFT = "#4a4a46";
const INK_FAINT = "#9a9a94";

/**
 * 등급별 강조. 인화지(#f2f1ee) 위에서는 밝은 오늘의 색이 읽히지 않으므로
 * 색 대비는 잉크 농도로 만들고, 오늘의 색은 사진 영역(어두운 바탕)에만 실어
 * 한 벌로 묶는다.
 *
 * 눈금·막대·점 열은 쓰지 않는다. 네 칸 중 하나만 켜는 다이얼도 결국
 * "4분의 1짜리 게이지"로 읽혀서, 잔잔이 텅 빈 그림이 된다.
 * 등급 차이는 잉크 농도(ink)와 사진 영역 글로우 세기(glow)로만 드러낸다.
 */
const TIER_STYLE: Record<AuraTier, { ink: string; glow: number }> = {
  great: { ink: INK, glow: 0.55 },
  good: { ink: INK, glow: 0.4 },
  fair: { ink: INK_SOFT, glow: 0.26 },
  care: { ink: INK_SOFT, glow: 0.16 },
};

type Phase =
  | { kind: "idle" }
  | { kind: "loading"; target: AuraKind }
  /** 코인 경로인데 잔액이 모자란다 — 3초 안내 후 idle 로 돌아간다 */
  | { kind: "noCoins" };

export default function AuraSection({
  today,
  colorHex,
  onOverlayChange,
}: {
  /** daily.date — 자정 롤오버 시 열람 기록이 리셋된다 */
  today: string;
  /** 오늘의 색. 폴라로이드와 같은 액센트를 쓴다. */
  colorHex: string;
  /** 오버레이 개폐 알림 — 부모가 하단 네비 숨김을 한 곳에서 관리한다 */
  onOverlayChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { play } = useSound();

  // AuraInput 재료 — 전부 이미 로컬에 있는 실측 신호다. 새로 묻지 않는다.
  const history = useGameStore((s) => s.progress.completionHistory);
  const retention = useRetentionStore((s) => s.retention);
  const retentionLoaded = useRetentionStore((s) => s.isLoaded);
  const retentionInitialize = useRetentionStore((s) => s.initialize);
  const duoActive = useDuoStore((s) => (s.activeDuo?.memberIds.length ?? 0) >= 2);

  // 코인 경로 — 차감은 Up Hero 스토어의 기존 공개 API 를 그대로 쓴다.
  const spendCoins = useUpHeroStore((s) => s.spendCoins);
  const heroLoaded = useUpHeroStore((s) => s.isLoaded);
  const heroInitialize = useUpHeroStore((s) => s.initialize);

  /**
   * 광고 판정. 이 컴포넌트는 폴라로이드를 본 뒤에만 마운트돼 서버에서 렌더되지
   * 않으므로(위 store 초기값과 같은 근거) 초기값에서 네이티브 브리지를 읽어도
   * hydration 이 어긋나지 않는다 — FortuneCard 처럼 effect 로 미룰 이유가 없다.
   *
   * `adDeadEnd` 는 이번 세션에서 광고가 **실제로** 실패했다는 확정이다. isAdAvailable()
   * 은 환경만 보고 낙관적으로 true 를 돌려주므로(동의 거부·no fill·오프라인을 모른다)
   * 그것만으로는 판정할 수 없다.
   */
  const [adAvailable] = useState(() => isAdAvailable());
  const [adDeadEnd, setAdDeadEnd] = useState(false);
  const usesCoinPath = adDeadEnd || !adAvailable;

  /**
   * 저장된 열람 기록 + 스냅샷. day 를 함께 들고 다녀 자정 롤오버를 렌더 중
   * prev-비교로 잡는다(effect 안 setState 는 cascading render 를 만든다).
   *
   * 이 컴포넌트는 폴라로이드를 이미 본 뒤에만 마운트되므로 서버에서 렌더되지
   * 않는다. 그래서 초기값에서 localStorage 를 읽어도 hydration 이 어긋나지 않는다.
   */
  const [store, setStore] = useState<{
    day: string;
    opened: AuraKind[];
    snapshot: Record<AuraKind, AuraReading> | null;
    tarot: Partial<Record<AuraKind, number>>;
  }>(() => {
    const state = readAuraState(today);
    return { day: today, opened: state.opened, snapshot: state.snapshot, tarot: state.tarot };
  });
  const [view, setView] = useState<{ kind: AuraKind; ritual: boolean } | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  /** 잔액 부족 안내를 3초 뒤 되돌리는 타이머 */
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * 권리는 얻었지만 아직 문질러 드러내지는 않은 기운.
   * 열람 기록은 광고를 본 순간 남기므로(문지르다 나가도 값을 지키려고),
   * 그것만으로는 "이미 봤다"와 "받아만 뒀다"를 구분할 수 없다.
   * 이 세션 안에서는 여기로 구분해 의식을 다시 보여준다.
   *
   * ref 가 아니라 state 다 — 칩의 등급 표시도 이 구분을 따라야 하는데,
   * ref 는 바뀌어도 리렌더를 부르지 않아 칩이 옛 상태로 남는다.
   */
  const [pendingRitual, setPendingRitual] = useState<ReadonlySet<AuraKind>>(
    () => new Set(),
  );

  if (store.day !== today) {
    // 날짜가 넘어갔다 — readAuraState 가 어제 기록을 걸러 빈 값을 돌려준다.
    const state = readAuraState(today);
    setStore({ day: today, opened: state.opened, snapshot: state.snapshot, tarot: state.tarot });
    setView(null);
    setPendingRitual(new Set());
  }

  const { opened, snapshot, tarot } = store;

  useEffect(
    () => () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    [],
  );

  // 불꽃 페이지가 이미 부르지만 멱등이다. 체크인·방패 이력이 등급과 조짐을
  // 고르는 이상, 복원 전 빈 이력으로 스냅샷이 굳는 경로는 남겨두면 안 된다.
  useEffect(() => {
    if (!retentionLoaded) retentionInitialize();
  }, [retentionLoaded, retentionInitialize]);

  // 코인 경로에서만 Up Hero 스토어를 깨운다. 홈·아지트를 거치지 않고 /flame 으로
  // 곧장 들어온 사용자는 잔액이 0 으로 보여, 코인이 있는데도 "부족해요" 를 만난다.
  // initialize 는 멱등이다(isLoaded 가드). FortuneCard 도 같은 보험을 든다.
  useEffect(() => {
    if (usesCoinPath && !heroLoaded) heroInitialize();
  }, [usesCoinPath, heroLoaded, heroInitialize]);

  useEffect(() => {
    onOverlayChange?.(view !== null);
  }, [view, onOverlayChange]);

  // 언마운트(탭 이동)로 오버레이가 사라져도 네비가 숨은 채 남지 않게 한다.
  useEffect(() => () => onOverlayChange?.(false), [onOverlayChange]);

  const openReading = useCallback(
    (kind: AuraKind) => {
      const input: AuraInput = {
        history,
        checkInDates: retention.checkInDates,
        usedSaverDates: retention.usedSaverDates,
        streak: retention.currentLightStreak,
        duoActive,
        today,
        // 하루치 흔들림 시드. 빼면 흔들림이 0 이 되어 습관이 안정된 유저는 매일
        // 같은 등급을 보게 되고(= 점이 아니라 통계표), iOS 와 다른 tier 가 나온다.
        salt: readFortuneState().salt,
      };
      // 이미 오늘 스냅샷이 있으면 그대로 쓴다 — 하루 안에서 점수는 불변이다.
      const snap = ensureAuraSnapshot(today, () => computeAura(input));
      // 열람 기록은 "볼 권리를 얻은 순간" 남긴다. 문지르다 나가도 광고값은 지킨다.
      const nextOpened = markAuraOpened(today, kind);
      setStore((prev) => ({
        day: today,
        opened: nextOpened,
        snapshot: snap,
        // 렌더 가드가 롤오버를 먼저 잡아주지만, 혹시 낡은 prev 가 남아 있으면
        // 어제 타로 선택이 오늘 화면에 얹히지 않게 여기서 한 번 더 거른다.
        tarot: prev.day === today ? prev.tarot : readAuraState(today).tarot,
      }));
      // 처음 여는 기운만 의식을 거친다. 재열람은 곧장 결과로.
      const ritual = !opened.includes(kind) || pendingRitual.has(kind);
      if (ritual) {
        setPendingRitual((prev) => {
          if (prev.has(kind)) return prev;
          const next = new Set(prev);
          next.add(kind);
          return next;
        });
      }
      setView({ kind, ritual });
    },
    [history, retention, duoActive, today, opened, pendingRitual],
  );

  const handlePick = useCallback(
    async (kind: AuraKind) => {
      if (phase.kind === "loading") return;
      play("select");

      // 이미 연 기운 · 그날의 첫 기운은 대가 없이 바로 연다.
      if (opened.includes(kind) || opened.length === 0) {
        openReading(kind);
        return;
      }

      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = null;
      }

      // 코인 경로 — 광고를 못 받는 상태에서만 온다. 가격은 칩 아래 안내줄에 이미
      // 떠 있고, 이 탭이 곧 결제 확정이다(기습 결제 금지: 값을 보고 누른 탭이다).
      if (usesCoinPath) {
        if (!spendCoins(SHOP_PRICES.auraReading)) {
          play("cancel");
          setPhase({ kind: "noCoins" });
          noticeTimerRef.current = setTimeout(() => {
            noticeTimerRef.current = null;
            setPhase((prev) => (prev.kind === "noCoins" ? { kind: "idle" } : prev));
          }, 3000);
          return;
        }
        openReading(kind);
        play("confirm");
        return;
      }

      setPhase({ kind: "loading", target: kind });
      const result = await showRewardedAd("fortune");
      if (result === "rewarded") {
        setPhase({ kind: "idle" });
        openReading(kind);
        play("confirm");
      } else if (result === "unavailable") {
        // 막다른 길이던 자리 — 예전엔 "지금은 보여줄 광고가 없어요"를 3초 띄우고
        // 원복해, 아무리 눌러도 열리지 않는 상태가 무한 반복됐다. 이제 광고가 실제로
        // 죽었음을 확정하고 코인 경로로 전환한다. 여기서 차감하지는 않는다 —
        // 다음 탭부터 안내줄이 가격을 달고 뜨고, 그걸 보고 다시 눌러야 결제된다.
        play("cancel");
        setAdDeadEnd(true);
        setPhase({ kind: "idle" });
      } else {
        // 중도 이탈 — 조용히 원상 복귀. 보상도 소모도 없다.
        setPhase({ kind: "idle" });
      }
    },
    [phase, play, opened, openReading, usesCoinPath, spendCoins],
  );

  /**
   * 타로 선택 — 저장이 진실의 원천이다. markAuraTarot 은 이미 있으면 덮지 않고
   * 기존 값을 돌려주므로(하루 고정), 화면 상태는 그 반환값을 그대로 따라간다.
   */
  const handleTarotPick = useCallback(
    (kind: AuraKind, cardId: number) => {
      const fixed = markAuraTarot(today, kind, cardId);
      setStore((prev) => {
        if (prev.day !== today || prev.tarot[kind] === fixed) return prev;
        return { ...prev, tarot: { ...prev.tarot, [kind]: fixed } };
      });
    },
    [today],
  );

  // 리텐션 복원 전이면 체크인 이력이 비어 보인다. 그 상태로 스냅샷을 고정하면
  // 하루 종일 엉뚱한 등급과 조짐을 보게 되므로 첫 리딩만 잠깐 미룬다.
  const ready = retentionLoaded || snapshot !== null;
  const allOpened = opened.length === AURA_KINDS.length;
  const reading = view && snapshot ? snapshot[view.kind] : null;

  return (
    <div className="w-full">
      <p className="typo-micro text-text-tertiary text-center">
        {allOpened ? t("aura.done") : t("aura.pick.title")}
      </p>

      {/* items-stretch + h-full — 세 장의 높이를 가장 큰 것에 맞춘다. 등급 라벨이
          한 줄이든 두 줄이든 카드 높이는 같아야 나란히 놓인 한 벌로 읽힌다. */}
      <div className="mt-2.5 grid grid-cols-3 items-stretch gap-2">
        {AURA_KINDS.map((kind) => {
          const isOpened = opened.includes(kind);
          // 등급은 "볼 권리를 얻었다"가 아니라 "실제로 걷어냈다"에서만 드러난다.
          // 광고만 보고 Esc 로 리딩을 닫으면 의식이 그대로 남는데, 그 사이 칩에
          // 등급이 먼저 찍히면 다시 열었을 때 아는 답을 문지르게 된다.
          const revealed = isOpened && !pendingRitual.has(kind);
          const locked = !isOpened && opened.length > 0;
          const loading = phase.kind === "loading" && phase.target === kind;
          const name = t(NAME_KEY[kind]);
          /**
           * 화면 문구 없이 자물쇠 하나로 잠금을 알리는 자리라, 상태가 접근 이름에
           * 전혀 실리지 않았다(아이콘은 이름에 0을 기여한다). 보이는 것은 그대로
           * 두고 접근 이름에만 상태를 합성한다 — 화면에는 새 문구가 늘지 않는다.
           */
          const label =
            revealed && snapshot
              ? `${name}, ${t(TIER_KEY[snapshot[kind].tier])}, ${t("aura.opened.a11y")}`
              : locked
                ? `${name}, ${t("aura.locked.a11y")}`
                : name;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => void handlePick(kind)}
              disabled={phase.kind === "loading" || !ready}
              aria-label={label}
              className="press-affordance flex h-full flex-col items-center gap-1.5 rounded-xl bg-bg-elevated px-2 py-3 disabled:opacity-60"
            >
              <motion.span
                animate={loading ? { opacity: [1, 0.35, 1] } : { opacity: 1 }}
                transition={
                  loading ? { duration: 1.1, repeat: Infinity, ease: "easeInOut" } : undefined
                }
                aria-hidden="true"
              >
                <PixelIcon
                  name={KIND_ICON[kind]}
                  size={18}
                  color={isOpened ? colorHex : "var(--text-tertiary)"}
                />
              </motion.span>
              {/* 잠금의 흐릿함은 이름 텍스트에만 건다. 버튼 전체에 걸면 자물쇠까지
                  함께 흐려지는데(2.24:1), 문구를 걷어낸 지금 자물쇠는 잠금을 알리는
                  유일한 시각 신호라 비-텍스트 대비 3:1 아래로 내려가면 안 된다. */}
              <span
                className={`typo-micro text-text-primary text-center ${
                  locked ? "opacity-75" : ""
                }`}
              >
                {name}
              </span>
              {/* 상태 줄 — 늘 같은 자리를 차지한다. 잠금은 문구 없이 자물쇠만 두고,
                  탭하면 광고가 뜬다는 사실은 눌러 보면 알게 된다.
                  내용은 위 aria-label 이 이미 담고 있어 접근성 트리에서 감춘다. */}
              <span
                className="flex min-h-[18px] items-center justify-center"
                aria-hidden="true"
              >
                {revealed && snapshot ? (
                  <span className="typo-micro text-center" style={{ color: colorHex }}>
                    {t(TIER_KEY[snapshot[kind].tier])}
                  </span>
                ) : locked ? (
                  <PixelIcon name="Lock" size={12} color="var(--text-secondary)" />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {/* 안내줄 — 코인 경로의 가격을 **누르기 전에** 알린다. 칩에는 문구를 얹을
          자리가 없어(자물쇠 하나로 잠금을 알린다) 가격이 여기에 서지 않으면 탭이
          곧 기습 결제가 된다. 잠긴 칩이 남아 있을 때만 뜬다.
          잔액 부족은 에러가 아니라 안내다 — 에러색을 쓰지 않는다. */}
      {phase.kind === "noCoins" ? (
        <p className="mt-2 typo-micro text-text-tertiary text-center">
          {t("aura.noCoins", { cost: SHOP_PRICES.auraReading })}
        </p>
      ) : usesCoinPath && opened.length > 0 && !allOpened ? (
        <p className="mt-2 typo-micro text-text-tertiary text-center">
          {t("aura.coin.hint", { cost: SHOP_PRICES.auraReading })}
        </p>
      ) : null}

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {view && reading && (
              <AuraOverlay
                reading={reading}
                today={today}
                colorHex={colorHex}
                ritual={view.ritual}
                tarotCardId={tarot[view.kind] ?? null}
                onPickTarot={(cardId) => handleTarotPick(view.kind, cardId)}
                onRevealed={() =>
                  setPendingRitual((prev) => {
                    if (!prev.has(view.kind)) return prev;
                    const next = new Set(prev);
                    next.delete(view.kind);
                    return next;
                  })
                }
                onClose={() => setView(null)}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

/** 공개 이펙트가 화면에 머무는 시간(ms). 끝나면 노드를 내려 rAF 부하를 없앤다. */
const FX_LIFETIME_MS = 1900;

/**
 * 리딩 오버레이 — 폴라로이드와 같은 인화지 위에 올린다.
 * 처음 여는 기운은 가림막을 문질러 드러낸 뒤에야 읽힌다.
 */
function AuraOverlay({
  reading,
  today,
  colorHex,
  ritual,
  tarotCardId,
  onPickTarot,
  onRevealed,
  onClose,
}: {
  reading: AuraReading;
  /** daily.date — 실마리·흘려보낼 것·타로 제시 시드에 들어간다 */
  today: string;
  colorHex: string;
  ritual: boolean;
  /** 오늘 이 기운에서 이미 뒤집은 카드 id. 미선택이면 null. */
  tarotCardId: number | null;
  /** 카드를 뒤집은 순간 — 선택 즉시 저장한다(하루 고정, 재선택 불가) */
  onPickTarot: (cardId: number) => void;
  /** 가림막을 실제로 걷어낸 순간 — 중도 이탈과 구분하려고 따로 알린다 */
  onRevealed: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(!ritual);
  /**
   * 공개 이펙트는 "문질러 드러난 순간"에만 튄다. 재열람 마운트에서 또 터지면
   * 보상 연출이 헐값이 되고, 등급 차등(잔잔~대길)의 의미도 무뎌진다.
   */
  const [fx, setFx] = useState(false);
  const fxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const greatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // useSound.play 는 사운드·햅틱을 한 이름으로 묶는데, 공개 순간은 소리(확정음)와
  // 진동(성공 패턴)의 격이 달라 같은 경로의 재료를 직접 조합한다.
  const soundEnabled = useGameStore((s) => s.progress.soundEnabled ?? true);
  const hapticEnabled = useGameStore((s) => s.progress.hapticEnabled ?? true);

  // Esc 닫기 / focus trap / scroll lock / focus 복원
  useModalA11y(containerRef, onClose);

  const handleReveal = useCallback(() => {
    setRevealed(true);
    setFx(true);
    if (fxTimerRef.current) clearTimeout(fxTimerRef.current);
    fxTimerRef.current = setTimeout(() => setFx(false), FX_LIFETIME_MS);
    onRevealed();
    if (soundEnabled) playSound("confirm");
    // 공개 햅틱은 성공 패턴(success). reduced-motion 의 탭 폴백도 이 함수를
    // 그대로 타므로 그 경로에서도 유지된다. great 만 한 박자 뒤 한 번 더 —
    // "대길"의 무게를 손끝으로 반복해 준다.
    if (hapticEnabled) {
      triggerHaptic("complete");
      if (reading.tier === "great") {
        greatTimerRef.current = setTimeout(() => triggerHaptic("complete"), 220);
      }
    }
  }, [onRevealed, soundEnabled, hapticEnabled, reading.tier]);

  useEffect(
    () => () => {
      if (fxTimerRef.current) clearTimeout(fxTimerRef.current);
      if (greatTimerRef.current) clearTimeout(greatTimerRef.current);
    },
    [],
  );

  // 공개 직후 결과로 포커스를 옮긴다 — 가림막 버튼이 사라지면 포커스가 body 로
  // 떨어져 스크린리더가 아무것도 읽지 못한다.
  useEffect(() => {
    if (!revealed) return;
    // preventScroll — 이제 카드가 스크롤 레이어 안에 있다. 그냥 focus 하면
    // 브라우저가 카드를 "보이게" 하려고 스크롤을 옮기는데, 카드가 화면보다
    // 길면 그 결과로 카드 윗머리가 잘린 채 열린다. 시작은 늘 맨 위여야 한다.
    contentRef.current?.focus({ preventScroll: true });
  }, [revealed]);

  // 리딩은 언제나 맨 위에서 시작한다 — 마운트에서 한 번, 기운이 바뀌면 다시.
  // 퇴장 애니메이션 도중에 다음 리딩이 들어오면 AnimatePresence 가 스크롤 레이어
  // DOM 을 그대로 재사용해 이전 스크롤 위치가 남는데, 그러면 다음 리딩이 해설
  // 중간부터 열린다. 페인트 전에 되돌려 튐이 보이지 않게 한다.
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [reading.kind]);

  const name = t(NAME_KEY[reading.kind]);
  const tone = TIER_STYLE[reading.tier];

  // salt 는 기기 고정 — 마운트에 한 번 읽으면 충분하다.
  const [salt] = useState(() => readFortuneState().salt);

  /**
   * 읽어 내려가는 점괘 리듬 — 조짐부터 흘려보낼 것까지 순서대로 떠오른다.
   * 문지르는 동안에는 숨겨 둔다: 가림막 틈으로 문장이 미리 새면 공개가 밋밋해지고,
   * 걷어낸 순간 등급(제목)만 먼저 보인 뒤 문장이 하나씩 오는 편이 "점괘"답다.
   * opacity 로만 숨기므로 카드 높이는 문지르는 동안에도 흔들리지 않는다.
   */
  const block = (order: number) => ({
    initial: prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 7 },
    animate: revealed
      ? { opacity: 1, y: 0 }
      : prefersReducedMotion
        ? { opacity: 0 }
        : { opacity: 0, y: 7 },
    transition: revealed
      ? {
          duration: prefersReducedMotion ? 0.2 : 0.45,
          delay:
            (prefersReducedMotion ? 0.05 : 0.3) +
            order * (prefersReducedMotion ? 0.1 : 0.3),
          ease: "easeOut" as const,
        }
      : { duration: 0 },
  });

  // z-[60] — 리딩은 오늘의 기운 폴라로이드 오버레이(z-50) 위에 떠야 한다.
  // 둘 다 body 포털이라 같은 z 를 쓰면 DOM 삽입 순서에 앞뒤를 맡기게 된다.
  return (
    <motion.div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={name}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[60] overflow-hidden bg-black/60 backdrop-blur-sm"
    >
      {/* 오늘의 색 글로우 — 폴라로이드 오버레이와 같은 공기.
          스크롤 레이어 밖에 둔다: 해설을 따라 빛까지 흐르면 공기가 아니라
          배경 이미지가 된다(FortuneCard 오버레이와 같은 계약). */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background: `radial-gradient(60% 45% at 50% 45%, ${colorHex}2e, transparent 70%)`,
        }}
      />

      {/* 스크롤 레이어 — 오버레이는 화면을 다 덮되 넘치는 건 내용뿐이다.
          1.2.0 에서 실마리·흘려보낼 것·타로가 붙어 카드가 700~840px 가 됐다.
          예전엔 루트가 overflow-hidden 인 채 가운데 정렬이라 세로 720 미만에서
          해설 위아래가 잘리고 볼 방법이 없었다(iOS AuraReadingView 의
          ScrollView + minHeight 패턴을 웹으로 옮긴다).
          overflow-x-hidden 은 카드 등장 애니메이션의 rotate 가 가로 스크롤을
          만들지 않게 막고, overscroll-contain 은 스크롤이 아래 폴라로이드
          오버레이로 새는 것을 막는다. 배경 탭으로 닫는 경로가 없는 오버레이라
          (닫기는 명시 버튼과 Esc 뿐) 스크롤 제스처와 다툴 닫기가 애초에 없다.
          문지르기(AuraScratch)는 touch-action:none 이라 스크롤을 가져가지 않는다. */}
      <div
        ref={scrollRef}
        className="relative z-10 h-full overflow-y-auto overflow-x-hidden overscroll-contain px-8"
      >
        {/* min-h-full + justify-center — 짧으면 기존처럼 가운데,
            넘치면 위에서부터 자라며 스크롤이 생긴다. */}
        <div className="flex min-h-full flex-col items-center justify-center py-8 pb-[calc(env(safe-area-inset-bottom)+24px)]">
          <div className="w-[264px] max-w-full">
            <motion.div
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 18, rotate: -1.5 }}
              animate={{ opacity: 1, y: 0, rotate: -1 }}
              exit={{ opacity: 0, y: 24, transition: { duration: 0.16 } }}
              transition={
                prefersReducedMotion
                  ? { duration: 0.18 }
                  : { type: "spring", stiffness: 380, damping: 28 }
              }
              className="relative"
            >
              <div
                ref={contentRef}
                tabIndex={-1}
                aria-hidden={!revealed}
                className="rounded-sm bg-[#f2f1ee] p-[10px] shadow-2xl outline-none"
              >
                {/* 사진 영역 — 폴라로이드와 같은 자리에 기운의 상징이 앉는다.
                    오늘의 색은 여기서만 원색으로 쓴다(인화지 위 텍스트로는 안 읽힌다). */}
                <div className="relative flex aspect-[154/86] w-full items-center justify-center overflow-hidden bg-bg-primary">
                  <div
                    className="pointer-events-none absolute inset-0"
                    aria-hidden="true"
                    style={{
                      background: `radial-gradient(70% 90% at 50% 50%, ${colorHex}, transparent 72%)`,
                      opacity: tone.glow,
                    }}
                  />
                  <PixelIcon name={KIND_ICON[reading.kind]} size={40} color={colorHex} />
                  {/* 공개 이펙트 — 사진 영역 안에서만 논다. 카드 밖으로 튀면
                      인화지의 물성(한 장의 사진)이 깨진다. */}
                  {fx && (
                    <RevealFx
                      tier={reading.tier}
                      colorHex={colorHex}
                      reduced={prefersReducedMotion}
                    />
                  )}
                </div>

                <div className="space-y-3 px-0.5 pt-3 pb-2 text-left">
                  {/* 기운 이름 + 등급은 가림막 아래에서도 보인다 — 문지르기의 보상은
                      등급이고, 문장들은 공개 후에 순서대로 온다. */}
                  <div>
                    <p className="typo-micro" style={{ color: INK_FAINT }}>
                      {name}
                    </p>
                    {/* 등급 라벨이 주인공이다. 옆에 숫자를 붙이는 순간 라벨은
                        숫자의 캡션으로 격하되고, 유저는 점수를 올리는 게임을 시작한다. */}
                    <p
                      className="typo-title"
                      style={{ color: tone.ink, letterSpacing: "0.02em" }}
                    >
                      {t(TIER_KEY[reading.tier])}
                    </p>
                  </div>

                  {/* 정보 위계: 조짐 > 조언 > 실마리 > 흘려보낼 것.
                      조짐만 진한 잉크, 나머지는 부드러운 잉크 + 라벨로 급을 낮춘다. */}
                  {/* 조짐 — 실측 신호가 고른 문장 한 줄. 수치는 인용하지 않는다. */}
                  <motion.p {...block(0)} className="typo-caption" style={{ color: INK }}>
                    {t(omenKey(reading))}
                  </motion.p>
                  <motion.p {...block(1)} className="typo-caption" style={{ color: INK_SOFT }}>
                    {t(adviceKey(reading, today, salt))}
                  </motion.p>
                  <motion.div {...block(2)}>
                    <p className="typo-micro" style={{ color: INK_FAINT }}>
                      {t("aura.hint.label" as DictKey)}
                    </p>
                    <p className="mt-0.5 typo-caption" style={{ color: INK_SOFT }}>
                      {t(hintKey(reading.kind, today, salt))}
                    </p>
                  </motion.div>
                  <motion.div {...block(3)}>
                    <p className="typo-micro" style={{ color: INK_FAINT }}>
                      {t("aura.caution.label" as DictKey)}
                    </p>
                    <p className="mt-0.5 typo-caption" style={{ color: INK_SOFT }}>
                      {t(cautionKey(reading.kind, today, salt))}
                    </p>
                  </motion.div>
                  {/* 타로 — 읽어 내려가는 리듬의 마지막 박자. 제시 3장은 결정론이지만
                      무엇을 뒤집을지는 여기서 유일하게 유저 몫이다(하루 고정). */}
                  <motion.div {...block(4)}>
                    <TarotBlock
                      offer={auraTarotOffer(today, salt, reading.kind)}
                      selectedId={tarotCardId}
                      tier={reading.tier}
                      colorHex={colorHex}
                      active={revealed}
                      reduced={prefersReducedMotion}
                      onPick={onPickTarot}
                    />
                  </motion.div>
                </div>
              </div>

              <AnimatePresence>
                {!revealed && <AuraScratch colorHex={colorHex} onReveal={handleReveal} />}
              </AnimatePresence>
            </motion.div>
          </div>

          {/* 닫기 자리 — 스크롤 흐름 안에 둔다(iOS 는 ScrollView 안 VStack).
              예전엔 루트에 absolute 로 띄워 뒀는데, 카드가 길어지자 카드가
              만든 쌓임 맥락(relative z-10) 아래로 들어가 인화지에 통째로
              가려졌다. 375x667 에서는 눌 수도 볼 수도 없는 버튼이었다.
              높이는 공개 전후로 늘 잡아 둔다: 여기서 자리가 생겼다 없어지면
              가운데 정렬이 흔들려 가림막을 걷는 순간 카드가 위로 튄다.
              그 자리는 문지르기 안내 문구(AuraScratch 의 top-full)가 앉는
              자리이기도 하다. */}
          <div className="flex min-h-[76px] w-full shrink-0 items-center justify-center">
            {revealed && (
              <motion.button
                type="button"
                onClick={onClose}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.24 }}
                className="press-affordance rounded-xl bg-bg-elevated px-5 py-2.5"
              >
                <span className="typo-caption text-text-primary">{t("aura.back")}</span>
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ── 타로 — 리딩의 마지막 박자, 유일하게 유저가 고르는 한 장 ──
   제시 3장은 결정론(auraTarotOffer)이지만 무엇을 뒤집을지는 유저 몫이고,
   선택은 하루 고정이다(markAuraTarot — 재선택 불가). 엎어진 면은 필름 프레임 결,
   뒤집힌 면은 미니 폴라로이드 — 오늘의 색은 여기서도 사진 영역(어두운 바탕)에만. */

/**
 * L10nText 렌더 — fortunePool 소비부(FortuneCard) 선례를 따르되, 콘텐츠가 뒤
 * 단계에서 채워지는 스켈레톤 기간에 빈 문자열이 오면 ko 로 폴백한다.
 */
function l10n(text: L10nText, lang: keyof L10nText): string {
  return text[lang] || text.ko;
}

/** 필름 퍼포레이션 구멍 수 — 엎어진 면 위아래 한 줄씩 */
const TAROT_PERF = [0, 1, 2, 3];

function TarotBlock({
  offer,
  selectedId,
  tier,
  colorHex,
  active,
  reduced,
  onPick,
}: {
  /** 오늘 이 기운에 제시된 카드 id 3장 — auraTarotOffer 산출, 서로 다름 보장 */
  offer: [number, number, number];
  /** 오늘 이미 뒤집은 카드 id. 미선택이면 null. */
  selectedId: number | null;
  /** 해설은 그날 그 기운의 등급을 따른다 — readings[tier] */
  tier: AuraTier;
  colorHex: string;
  /** 가림막을 걷어낸 뒤에만 만질 수 있다(히트테스트 게이트). opacity 0 으로
      숨어 있는 동안 탭·포커스가 새면 공개 의식이 무의미해진다. */
  active: boolean;
  reduced: boolean;
  onPick: (cardId: number) => void;
}) {
  const { t, language } = useTranslation();
  const soundEnabled = useGameStore((s) => s.progress.soundEnabled ?? true);
  const hapticEnabled = useGameStore((s) => s.progress.hapticEnabled ?? true);

  // 저장이 0..39 를 보장하지만(관용 디코드) 인덱싱 한 번은 방어적으로.
  const selected: TarotCard | null =
    selectedId !== null ? (TAROT_DECK[selectedId] ?? null) : null;

  const handlePick = (cardId: number) => {
    if (!active || selected !== null) return;
    if (soundEnabled) playSound("cardFlip");
    if (hapticEnabled) triggerHaptic("cardFlip");
    onPick(cardId);
  };

  return (
    <div>
      <p className="typo-micro" style={{ color: INK_FAINT }}>
        {selected ? t("aura.tarot.locked") : t("aura.tarot.prompt")}
      </p>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        {offer.map((cardId, i) => {
          const card = TAROT_DECK[cardId];
          const isUp = selectedId === cardId;
          const dimmed = selected !== null && !isUp;
          return (
            <TarotFlipCard
              key={cardId}
              card={card}
              up={isUp}
              dimmed={dimmed}
              disabled={!active || selected !== null}
              colorHex={colorHex}
              reduced={reduced}
              label={
                isUp
                  ? l10n(card.name, language)
                  : `${t("aura.tarot.card.a11y")} ${i + 1}${
                      dimmed ? `, ${t("aura.locked.a11y")}` : ""
                    }`
              }
              onPick={() => handlePick(cardId)}
            />
          );
        })}
      </div>
      {/* 해설 — 카드가 뒤집히고 한 박자 뒤에 떠오른다. 등급별 해설이라
          같은 카드도 그날 하늘(tier)에 따라 다르게 읽힌다. */}
      <AnimatePresence>
        {selected && (
          <motion.p
            initial={{ opacity: 0, y: reduced ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduced ? 0.2 : 0.45,
              delay: reduced ? 0.1 : 0.3,
              ease: "easeOut",
            }}
            className="mt-2 typo-caption"
            style={{ color: INK_SOFT }}
          >
            {l10n(selected.readings[tier], language)}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function TarotFlipCard({
  card,
  up,
  dimmed,
  disabled,
  colorHex,
  reduced,
  label,
  onPick,
}: {
  card: TarotCard;
  up: boolean;
  /** 다른 카드가 선택됨 — 흐리게, 재선택 불가 */
  dimmed: boolean;
  disabled: boolean;
  colorHex: string;
  reduced: boolean;
  label: string;
  onPick: () => void;
}) {
  const { language } = useTranslation();

  // 엎어진 면 — 필름 프레임 결. 위아래 퍼포레이션이 "같은 롤의 한 프레임"을 말한다.
  const back = (
    <span className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-sm bg-[#20201e]">
      <span className="absolute inset-x-1.5 top-1 flex justify-between" aria-hidden="true">
        {TAROT_PERF.map((i) => (
          <span key={i} className="h-[3px] w-[3px] rounded-[1px] bg-[#f2f1ee] opacity-20" />
        ))}
      </span>
      <span className="absolute inset-x-1.5 bottom-1 flex justify-between" aria-hidden="true">
        {TAROT_PERF.map((i) => (
          <span key={i} className="h-[3px] w-[3px] rounded-[1px] bg-[#f2f1ee] opacity-20" />
        ))}
      </span>
      <span style={{ opacity: 0.75 }}>
        <PixelIcon name="Sparkle" size={16} color={colorHex} />
      </span>
    </span>
  );

  // 뒤집힌 면 — 미니 폴라로이드. 오늘의 색은 사진 영역(어두운 바탕)에만 싣는다.
  const front = (
    <span className="flex h-full w-full flex-col overflow-hidden rounded-sm bg-[#e9e8e4] p-1">
      <span className="relative flex flex-1 items-center justify-center overflow-hidden bg-bg-primary">
        <span
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background: `radial-gradient(70% 90% at 50% 50%, ${colorHex}, transparent 72%)`,
            opacity: 0.3,
          }}
        />
        <PixelIcon name={card.icon} size={20} color={colorHex} />
      </span>
      <span className="block pt-1 pb-0.5 text-center typo-micro" style={{ color: INK_SOFT }}>
        {l10n(card.name, language)}
      </span>
    </span>
  );

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-label={label}
      className={`press-affordance relative aspect-[5/7] w-full transition-opacity duration-300 ${
        dimmed ? "opacity-40" : ""
      }`}
      style={{ perspective: 600 }}
    >
      {reduced ? (
        // reduced-motion — 뒤집기 대신 페이드 교차. initial={false}: 재진입
        // 마운트에서는 애니메이션 없이 곧장 최종 상태로 선다.
        <span className="relative block h-full w-full">
          <motion.span
            className="absolute inset-0 block"
            initial={false}
            animate={{ opacity: up ? 0 : 1 }}
            transition={{ duration: 0.25 }}
          >
            {back}
          </motion.span>
          <motion.span
            className="absolute inset-0 block"
            initial={false}
            animate={{ opacity: up ? 1 : 0 }}
            transition={{ duration: 0.25 }}
          >
            {front}
          </motion.span>
        </span>
      ) : (
        // 3D 뒤집기 — 세션 중 선택 순간에만 돈다(initial={false} 로 재진입 마운트는
        // 이미 뒤집힌 채 선다). FortuneCard 착지 어휘와 같은 easeOutExpo 계열.
        <motion.span
          className="relative block h-full w-full"
          style={{ transformStyle: "preserve-3d" }}
          initial={false}
          animate={{ rotateY: up ? 180 : 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <span
            className="absolute inset-0 block"
            style={{ backfaceVisibility: "hidden" }}
          >
            {back}
          </span>
          <span
            className="absolute inset-0 block"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            {front}
          </span>
        </motion.span>
      )}
    </button>
  );
}

/* ── 공개 이펙트 — 등급이 하늘의 답이라면, 이펙트는 그 답의 크기다 ──
   RarityBackdrop / FortuneCard 착지 연출의 입자·글로우 어휘를 따르되, 반복 루프가
   아니라 1회성이므로 framer-motion 으로 돌린다(rAF 부하가 공개 순간에만 그친다).
   전부 장식이라 aria-hidden + pointer-events-none. */

const FX_RING = Array.from({ length: 10 }, (_, i) => i);
const FX_BURST = Array.from({ length: 14 }, (_, i) => i);
/** fair 반짝임 위치(%) — 결정론적 고정 좌표. 리렌더마다 흔들리지 않는다. */
const FX_TWINKLES = [
  { x: 24, y: 30, s: 3 },
  { x: 68, y: 22, s: 2 },
  { x: 46, y: 60, s: 3 },
  { x: 82, y: 58, s: 2 },
  { x: 32, y: 74, s: 2 },
];

function RevealFx({
  tier,
  colorHex,
  reduced,
}: {
  tier: AuraTier;
  colorHex: string;
  reduced: boolean;
}) {
  if (reduced) {
    // reduced-motion 강등 — 움직임 없이 글로우가 한 번 부풀었다 잦아드는 페이드.
    // 등급 차이는 페이드의 세기로만 남긴다.
    const peak =
      tier === "great" ? 0.5 : tier === "good" ? 0.36 : tier === "fair" ? 0.24 : 0.14;
    return (
      <motion.div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, peak, 0] }}
        transition={{ duration: 1.1, times: [0, 0.3, 1], ease: "easeInOut" }}
        style={{
          background: `radial-gradient(70% 90% at 50% 50%, ${colorHex}, transparent 72%)`,
        }}
      />
    );
  }

  if (tier === "care") {
    // 차분한 가라앉음 — 어스름이 한 번 내려앉았다 걷힌다. 입자 없음.
    // "나쁨"의 연출이 아니라 "고요함"의 연출이어야 한다(운세가 아니라 렌즈).
    return (
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: [0, 0.3, 0], y: [-10, 4, 8] }}
          transition={{ duration: 1.5, times: [0, 0.4, 1], ease: "easeInOut" }}
          style={{ background: "linear-gradient(180deg, transparent 20%, #16161a 100%)" }}
        />
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.18, 0] }}
          transition={{ duration: 1.5, times: [0, 0.45, 1], ease: "easeInOut" }}
          style={{
            background: `radial-gradient(60% 80% at 50% 62%, ${colorHex}, transparent 70%)`,
          }}
        />
      </div>
    );
  }

  if (tier === "fair") {
    // 잔잔한 반짝임 — 몇 점이 순서대로 깜빡이고 만다.
    return (
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {FX_TWINKLES.map(({ x, y, s }, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 1, 0], scale: [0.4, 1, 0.5] }}
            transition={{ duration: 0.85, delay: 0.1 + i * 0.14, ease: "easeInOut" }}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: s,
              height: s,
              background: "#fff",
              boxShadow: `0 0 ${s * 3}px ${colorHex}, 0 0 ${s * 6}px ${colorHex}aa`,
            }}
          />
        ))}
      </div>
    );
  }

  if (tier === "good") {
    // 입자 링 — 중심에서 고리 하나가 번져 나간다 (rb-frag-emanate 의 1회성 버전).
    // 주의: framer 가 transform 을 직접 쓰므로 가운데 정렬은 translate 클래스가
    // 아니라 margin 으로 잡는다(덮어써지면 좌상단 기준으로 틀어진다).
    return (
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <motion.div
          className="absolute left-1/2 top-1/2 rounded-full"
          initial={{ opacity: 0.5, scale: 0.35 }}
          animate={{ opacity: 0, scale: 1.5 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          style={{
            width: 96,
            height: 96,
            marginLeft: -48,
            marginTop: -48,
            background: `radial-gradient(circle, ${colorHex}55 0%, ${colorHex}22 45%, transparent 70%)`,
          }}
        />
        {FX_RING.map((i) => {
          const angle = (i / FX_RING.length) * Math.PI * 2;
          const s = 3 + (i % 2);
          return (
            <motion.span
              key={i}
              className="absolute left-1/2 top-1/2 rounded-full"
              initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
              animate={{
                x: Math.cos(angle) * 62,
                y: Math.sin(angle) * 62,
                opacity: [0, 1, 0],
                scale: [0.4, 1, 0.6],
              }}
              transition={{ duration: 0.85, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
              style={{
                width: s,
                height: s,
                marginLeft: -s / 2,
                marginTop: -s / 2,
                background: colorHex,
                boxShadow: `0 0 ${s * 3}px ${colorHex}`,
              }}
            />
          );
        })}
      </div>
    );
  }

  // great — 버스트 + 빛 번쩍임. 흰 플래시가 먼저 치고, 오늘의 색 글로우가 부풀며,
  // 입자가 두 겹 반경으로 흩어진다. legend 급 어휘의 1회성 압축.
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.85, 0] }}
        transition={{ duration: 0.55, times: [0, 0.18, 1], ease: "easeOut" }}
        style={{ background: "#fff" }}
      />
      <motion.div
        className="absolute left-1/2 top-1/2 rounded-full"
        initial={{ opacity: 0.8, scale: 0.3 }}
        animate={{ opacity: 0, scale: 1.9 }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        style={{
          width: 128,
          height: 128,
          marginLeft: -64,
          marginTop: -64,
          background: `radial-gradient(circle, ${colorHex} 0%, ${colorHex}44 40%, transparent 70%)`,
        }}
      />
      {FX_BURST.map((i) => {
        const angle = (i / FX_BURST.length) * Math.PI * 2 + (i % 3) * 0.11;
        const dist = 58 + (i % 4) * 16;
        const s = 3 + (i % 3);
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 rounded-full"
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
            animate={{
              x: Math.cos(angle) * dist,
              y: Math.sin(angle) * dist,
              opacity: [0, 1, 0],
              scale: [0.4, 1, 0.5],
            }}
            transition={{
              duration: 1.0,
              delay: 0.08 + (i % 4) * 0.04,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{
              width: s,
              height: s,
              marginLeft: -s / 2,
              marginTop: -s / 2,
              background: i % 3 === 0 ? "#fff" : colorHex,
              boxShadow: `0 0 ${s * 3}px ${colorHex}, 0 0 ${s * 6}px ${colorHex}88`,
            }}
          />
        );
      })}
    </div>
  );
}
