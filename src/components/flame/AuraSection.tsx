"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import AuraScratch from "@/components/flame/AuraScratch";
import { showRewardedAd } from "@/lib/ads";
import {
  AURA_KINDS,
  auraCautionIndex,
  auraHintIndex,
  computeAura,
  type AuraInput,
  type AuraKind,
  type AuraReading,
  type AuraTier,
} from "@/lib/aura";
import {
  ensureAuraSnapshot,
  markAuraOpened,
  readAuraState,
  readFortuneState,
} from "@/lib/fortune";
import { playSound, triggerHaptic } from "@/lib/sounds";
import type { DictKey } from "@/i18n";
import { useGameStore } from "@/store/useGameStore";
import { useRetentionStore } from "@/store/useRetentionStore";
import { useDuoStore } from "@/store/useDuoStore";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * 기운 3종 리딩 — 폴라로이드를 본 뒤 재물·관계·건강 중 하나를 골라 본다.
 *
 * 규칙:
 *  - 첫 번째는 무료. 오늘의 기운 광고를 이미 봤으니 그 값을 여기서 치른다.
 *  - 나머지 둘은 각각 리워드 광고 1회. 옵트인이며, 중도 이탈은 아무 일도 아니다.
 *  - 이미 연 기운은 그날 안에서 광고 없이 다시 볼 수 있다(재시청 유도 금지).
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
/** 조언 문장 — 기운·등급에 표현 번호를 더해 키를 만든다. */
function adviceKey(r: AuraReading): DictKey {
  return `aura.advice.${r.kind}.${r.tier}.${r.variant}` as DictKey;
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

type Phase = { kind: "idle" } | { kind: "loading"; target: AuraKind } | { kind: "fail" };

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
  }>(() => {
    const state = readAuraState(today);
    return { day: today, opened: state.opened, snapshot: state.snapshot };
  });
  const [view, setView] = useState<{ kind: AuraKind; ritual: boolean } | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const failTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    setStore({ day: today, opened: state.opened, snapshot: state.snapshot });
    setView(null);
    setPendingRitual(new Set());
  }

  const { opened, snapshot } = store;

  useEffect(
    () => () => {
      if (failTimerRef.current) clearTimeout(failTimerRef.current);
    },
    [],
  );

  // 불꽃 페이지가 이미 부르지만 멱등이다. 체크인·방패 이력이 등급과 조짐을
  // 고르는 이상, 복원 전 빈 이력으로 스냅샷이 굳는 경로는 남겨두면 안 된다.
  useEffect(() => {
    if (!retentionLoaded) retentionInitialize();
  }, [retentionLoaded, retentionInitialize]);

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
      setStore({ day: today, opened: nextOpened, snapshot: snap });
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

      // 이미 연 기운 · 그날의 첫 기운은 광고 없이 바로 연다.
      if (opened.includes(kind) || opened.length === 0) {
        openReading(kind);
        return;
      }

      if (failTimerRef.current) {
        clearTimeout(failTimerRef.current);
        failTimerRef.current = null;
      }
      setPhase({ kind: "loading", target: kind });
      const result = await showRewardedAd("fortune");
      if (result === "rewarded") {
        setPhase({ kind: "idle" });
        openReading(kind);
        play("confirm");
      } else if (result === "unavailable") {
        play("cancel");
        setPhase({ kind: "fail" });
        failTimerRef.current = setTimeout(() => {
          failTimerRef.current = null;
          setPhase((prev) => (prev.kind === "fail" ? { kind: "idle" } : prev));
        }, 3000);
      } else {
        // 중도 이탈 — 조용히 원상 복귀. 보상도 소모도 없다.
        setPhase({ kind: "idle" });
      }
    },
    [phase, play, opened, openReading],
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

      {phase.kind === "fail" && (
        <p className="mt-2 typo-micro text-text-tertiary text-center">{t("fortune.fail")}</p>
      )}

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {view && reading && (
              <AuraOverlay
                reading={reading}
                today={today}
                colorHex={colorHex}
                ritual={view.ritual}
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
  onRevealed,
  onClose,
}: {
  reading: AuraReading;
  /** daily.date — 실마리·흘려보낼 것 선택 시드에 들어간다 */
  today: string;
  colorHex: string;
  ritual: boolean;
  /** 가림막을 실제로 걷어낸 순간 — 중도 이탈과 구분하려고 따로 알린다 */
  onRevealed: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
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
    contentRef.current?.focus();
  }, [revealed]);

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
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-black/60 px-8 backdrop-blur-sm"
    >
      {/* 오늘의 색 글로우 — 폴라로이드 오버레이와 같은 공기 */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background: `radial-gradient(60% 45% at 50% 45%, ${colorHex}2e, transparent 70%)`,
        }}
      />

      <div className="relative z-10 w-[264px] max-w-full">
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
                {t(adviceKey(reading))}
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
            </div>
          </div>

          <AnimatePresence>
            {!revealed && <AuraScratch colorHex={colorHex} onReveal={handleReveal} />}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* 문지르는 동안에는 닫기 버튼을 숨긴다 — 가림막 바로 아래에 안내 문구가
          들어와 서로 자리를 다툰다. */}
      {revealed && (
        <motion.button
          type="button"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.24 }}
          className="press-affordance absolute bottom-[calc(env(safe-area-inset-bottom)+40px)] left-1/2 -translate-x-1/2 rounded-xl bg-bg-elevated px-5 py-2.5"
        >
          <span className="typo-caption text-text-primary">{t("aura.back")}</span>
        </motion.button>
      )}
    </motion.div>
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
