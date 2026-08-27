"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import AuraScratch from "@/components/flame/AuraScratch";
import { showRewardedAd } from "@/lib/ads";
import {
  AURA_KINDS,
  computeAura,
  type AuraInput,
  type AuraKind,
  type AuraOmen,
  type AuraReading,
  type AuraTier,
} from "@/lib/aura";
import {
  ensureAuraSnapshot,
  markAuraOpened,
  readAuraState,
  readFortuneState,
} from "@/lib/fortune";
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
 */
/** 조짐 문장 — 같은 조짐 안에서도 reading.variant 로 표현이 갈린다. */
const OMEN_BASE: Record<AuraOmen, string> = {
  closing: "aura.omen.closing",
  gathering: "aura.omen.gathering",
  rhythm: "aura.omen.rhythm",
  carried: "aura.omen.carried",
  resting: "aura.omen.resting",
  unformed: "aura.omen.unformed",
};

/** 조언 문장 — 기운·등급에 표현 번호를 더해 키를 만든다. */
const ADVICE_BASE: Record<AuraKind, string> = {
  wealth: "aura.advice.wealth",
  relationship: "aura.advice.relationship",
  health: "aura.advice.health",
};

function omenKey(r: AuraReading): DictKey {
  return `${OMEN_BASE[r.omen]}.${r.variant}` as DictKey;
}
function adviceKey(r: AuraReading): DictKey {
  return `${ADVICE_BASE[r.kind]}.${r.tier}.${r.variant}` as DictKey;
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
   */
  const pendingRitualRef = useRef<Set<AuraKind>>(new Set());

  if (store.day !== today) {
    // 날짜가 넘어갔다 — readAuraState 가 어제 기록을 걸러 빈 값을 돌려준다.
    const state = readAuraState(today);
    setStore({ day: today, opened: state.opened, snapshot: state.snapshot });
    setView(null);
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
      const ritual = !opened.includes(kind) || pendingRitualRef.current.has(kind);
      if (ritual) pendingRitualRef.current.add(kind);
      setView({ kind, ritual });
    },
    [history, retention, duoActive, today, opened],
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
    <div className="mt-4">
      <p className="typo-micro text-text-tertiary">
        {allOpened ? t("aura.done") : t("aura.pick.title")}
      </p>

      <div className="mt-2 grid grid-cols-3 gap-2">
        {AURA_KINDS.map((kind) => {
          const isOpened = opened.includes(kind);
          const locked = !isOpened && opened.length > 0;
          const loading = phase.kind === "loading" && phase.target === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => void handlePick(kind)}
              disabled={phase.kind === "loading" || !ready}
              className="press-affordance flex flex-col items-center gap-1.5 rounded-xl bg-bg-elevated px-2 py-3 disabled:opacity-60"
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
              <span className="typo-micro text-text-primary text-center">
                {t(NAME_KEY[kind])}
              </span>
              <span
                className="typo-micro text-center"
                style={{
                  color: isOpened && snapshot ? colorHex : "var(--text-tertiary)",
                }}
              >
                {isOpened && snapshot
                  ? t(TIER_KEY[snapshot[kind].tier])
                  : locked
                    ? t("aura.locked.cta")
                    : ""}
              </span>
            </button>
          );
        })}
      </div>

      {phase.kind === "fail" && (
        <p className="mt-2 typo-micro text-text-tertiary">{t("fortune.fail")}</p>
      )}

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {view && reading && (
              <AuraOverlay
                reading={reading}
                colorHex={colorHex}
                ritual={view.ritual}
                onRevealed={() => pendingRitualRef.current.delete(view.kind)}
                onClose={() => setView(null)}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

/**
 * 리딩 오버레이 — 폴라로이드와 같은 인화지 위에 올린다.
 * 처음 여는 기운은 가림막을 문질러 드러낸 뒤에야 읽힌다.
 */
function AuraOverlay({
  reading,
  colorHex,
  ritual,
  onRevealed,
  onClose,
}: {
  reading: AuraReading;
  colorHex: string;
  ritual: boolean;
  /** 가림막을 실제로 걷어낸 순간 — 중도 이탈과 구분하려고 따로 알린다 */
  onRevealed: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { play } = useSound();
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(!ritual);

  // Esc 닫기 / focus trap / scroll lock / focus 복원
  useModalA11y(containerRef, onClose);

  const handleReveal = useCallback(() => {
    setRevealed(true);
    onRevealed();
    play("confirm");
  }, [onRevealed, play]);

  // 공개 직후 결과로 포커스를 옮긴다 — 가림막 버튼이 사라지면 포커스가 body 로
  // 떨어져 스크린리더가 아무것도 읽지 못한다.
  useEffect(() => {
    if (!revealed) return;
    contentRef.current?.focus();
  }, [revealed]);

  const name = t(NAME_KEY[reading.kind]);
  const tone = TIER_STYLE[reading.tier];

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
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/60 px-8 backdrop-blur-sm"
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
            </div>

            <div className="space-y-3 px-0.5 pt-3 pb-2 text-left">
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

              {/* 조짐 — 실측 신호가 고른 문장 한 줄. 수치는 인용하지 않는다. */}
              <p className="typo-caption" style={{ color: INK }}>
                {t(omenKey(reading))}
              </p>
              <p className="typo-caption" style={{ color: INK_SOFT }}>
                {t(adviceKey(reading))}
              </p>
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
