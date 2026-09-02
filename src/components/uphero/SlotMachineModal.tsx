"use client";

/**
 * Up Hero — 굴림틀(rune drum) 연출 모달.
 *
 * **표시 전용이다.** 결과는 이미 `upHeroCombat.applyChoiceEffect` 의 `spinSlot`
 * 분기에서 확정되고 지급까지 끝난 상태로 로그 엔트리에 실려 온다. 이 컴포넌트는
 * 그 결과를 드럼 세 칸으로 옮겨 그릴 뿐이라, 연출을 건너뛰거나 앱이 죽어도
 * 보상이 어긋나지 않는다. 여기서 난수를 굴리는 코드는 한 줄도 없어야 한다.
 *
 * 흐름: idle(레버) → spinning → landed → 3초 뒤 자동 닫힘.
 *  - 레버를 당겨야 돈다 (탭·드래그·Enter 전부 "당김"). 당김에 rigid 햅틱 1회.
 *    결과는 이미 정해져 있지만 "내가 당겼다" 는 감각이 도파민의 절반이다.
 *  - 릴 정지 시각은 `reelTimings(symbols)` (upHeroSlot) 이 준다. 웹과 iOS 가 같은
 *    숫자를 쓴다. 릴1·릴2 가 같은 룬이면 릴3 가 +700ms 늦게 서고 그동안 감속
 *    틱(소리+햅틱)이 돈다. 당첨이든 near-miss 든 같은 서스펜스다.
 *  - near-miss(꽝의 30%, `renderSymbols` 가 고른 표시)는 릴3 착지에 3px 오버슈트와
 *    "아깝다!" 한 줄. 결과가 꽝으로 확정된 뒤의 그림일 뿐 확률과 무관하다.
 *  - 꽝: 둔탁음 + light 햅틱 + 프레임 15% 디밍 250ms. 에러색(#FF4632) 은 쓰지 않는다.
 *  - 축하 티어(`slotTier`): small 플래시 / mid 링+더블 햅틱 / big 버스트+2px 셰이크
 *    +스파크 낙하+트리플 햅틱+"대박!".
 *  - pity: 스트릭이 임계에 닿았으면 "다음은 반드시 나와요" 힌트. 스트릭 값은
 *    스토어가 만든다 (prop `blankStreak`). 여기서는 표시만.
 *  - "한 번 더": 남은 스핀·코인이 있을 때만 CTA 가 뜬다 (`spinAgain` prop).
 *  - reduced-motion: 레버·스핀 생략, 200ms 크로스페이드로 결과부터. 셰이크·스파크
 *    제거, 햅틱은 유지, 자동 닫힘 유지.
 *  - 착지 후 탭: 어디를 눌러도 닫힌다. 회전 중 탭은 "건너뛰기".
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  GB,
  GB_HINT,
  GB_LEGEND,
  EASE_OUT,
  EASE_DRAWER,
} from "@/lib/upHeroPalette";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useTranslation } from "@/hooks/useTranslation";
import { useSound } from "@/hooks/useSound";
import type { SoundName } from "@/lib/sounds";
import PixelIcon from "@/components/icons/PixelIcon";
import {
  SLOT_SPIN_COST,
  isSlotWin,
  isNearMiss,
  isSlotPityArmed,
  hasReelSuspense,
  reelTimings,
  suspenseTickTimes,
  slotTier,
  type SlotOutcomeId,
  type SlotSymbol,
  type SlotSymbols,
  type SlotTier,
} from "@/lib/upHeroSlot";

/** 룬 → pixelarticons 이름. 픽셀아트 결의 던전 도상. */
const SYMBOL_ICON: Record<SlotSymbol, string> = {
  blank: "Moon",
  coin: "Coins",
  coins: "Money",
  gem: "DiamondGem",
  // 하락방지권 — 막아선다.
  shield: "Shield",
  // 소실방지권 — 잠가둔다. 방패와 뜻이 겹치지 않게 자물쇠로 갈랐다.
  cloth: "Lock",
  chest: "Package",
  star: "Zap",
};

/** 회전 중 스쳐 지나갈 얼굴들. 확률과 무관한 순수 장식이다. */
const REEL_FACES: readonly SlotSymbol[] = [
  "coin",
  "cloth",
  "chest",
  "coins",
  "star",
  "shield",
  "gem",
];

/** 드럼 한 칸 높이(px). strip translate 계산의 기준이라 CSS 와 값이 같아야 한다. */
const CELL = 56;
/** 1.4s 기본 스핀에 스쳐 갈 칸 수. 더 긴 스핀은 비례해 늘려 속도감을 유지한다. */
const SPIN_CELLS_PER_1400MS = 14;
/** transition 이 끝난 뒤 "섰다" 로 넘기기까지의 여유. 한 프레임 일찍 끊기면 튄다. */
const STOP_SETTLE_MS = 90;
/** 착지 후 자동으로 닫히기까지. */
const AUTO_DISMISS_MS = 3000;
/** 레버를 이만큼 끌어내리면 당긴 것으로 본다. 그보다 짧은 탭도 당김이다. */
const LEVER_PULL_PX = 24;

/** 기본 릴 감속 커브. */
const REEL_EASE = "cubic-bezier(0.16, 0.84, 0.24, 1)";
/** 서스펜스 릴3 — 더 일찍 느려져 오래 기어간다. */
const REEL_EASE_SUSPENSE = "cubic-bezier(0.1, 0.9, 0.2, 1)";

/** 티어 → 착지 사운드. 햅틱 intent 는 `sounds.ts` 의 HAPTIC_INTENT 가 짝지어 준다. */
const TIER_SOUND: Record<SlotTier, SoundName> = {
  none: "slotThud",
  small: "slotWinSmall",
  mid: "slotWinMid",
  big: "slotWinBig",
};

/** big 티어 픽셀 스파크. 좌표를 고정해 hydration mismatch 와 리렌더 튐을 막는다. */
const SPARKS: readonly { x: number; delay: number; s: number; drift: number }[] = [
  { x: 8, delay: 0, s: 3, drift: 6 },
  { x: 17, delay: 90, s: 2, drift: -5 },
  { x: 26, delay: 40, s: 4, drift: 8 },
  { x: 35, delay: 160, s: 2, drift: -7 },
  { x: 44, delay: 20, s: 3, drift: 4 },
  { x: 52, delay: 120, s: 2, drift: -4 },
  { x: 60, delay: 70, s: 4, drift: 7 },
  { x: 68, delay: 200, s: 3, drift: -6 },
  { x: 76, delay: 30, s: 2, drift: 5 },
  { x: 84, delay: 140, s: 3, drift: -8 },
  { x: 91, delay: 60, s: 2, drift: 6 },
  { x: 97, delay: 180, s: 3, drift: -5 },
];

/** 로그 엔트리(`choiceResult.slot`) 가 그대로 넘어온다. 표시에 필요한 전부다. */
export interface SlotResultPayload {
  outcome: SlotOutcomeId;
  symbols: SlotSymbols;
  cost: number;
  destroyGuards?: number;
  downGuards?: number;
  buff?: { pct: number; battles: number };
}

export interface SlotMachineModalProps {
  result: SlotResultPayload;
  /** 이 굴림으로 받은 코인 (없으면 undefined). 보상 칩 문구에 쓰인다. */
  coins?: number;
  /**
   * 이 굴림 **뒤**의 연속 꽝 스트릭. `isSlotPityArmed` 면 "다음은 반드시 나와요"
   * 힌트를 띄운다. 값은 스토어(UpHeroState.slotBlankStreak)가 만든다. 표시만.
   */
  blankStreak?: number;
  /**
   * "한 번 더" CTA. 호출자가 남은 스핀 수와 지갑을 넘기면 모달이 게이트를 건다
   * (spinsLeft > 0 && wallet >= cost). 없으면 CTA 도 없다.
   * `onSpin` 은 호출자가 이 결과를 seen 처리하고 새 스핀을 트리거해야 한다.
   */
  spinAgain?: { spinsLeft: number; wallet: number; onSpin: () => void };
  onDismiss: () => void;
}

type Phase = "idle" | "spinning" | "landed";

export default function SlotMachineModal({
  result,
  coins,
  blankStreak = 0,
  spinAgain,
  onDismiss,
}: SlotMachineModalProps) {
  const { outcome, symbols, cost = SLOT_SPIN_COST } = result;
  const reducedMotion = useReducedMotion();
  const { t } = useTranslation();
  const { play } = useSound();
  const containerRef = useRef<HTMLDivElement>(null);
  const won = isSlotWin(outcome);
  const tier = slotTier(outcome);
  const nearMiss = !won && isNearMiss(symbols);
  const timings = useMemo(() => reelTimings(symbols), [symbols]);
  const suspense = hasReelSuspense(symbols);
  const pityArmed = isSlotPityArmed(blankStreak);
  const canSpinAgain =
    !!spinAgain && spinAgain.spinsLeft > 0 && spinAgain.wallet >= cost;

  // 결과 문구 / 보상 칩은 여기서 현재 언어로 푼다. 호출자가 i18n 을 알 필요 없다.
  const resultText = t(
    `uphero.slot.result.${outcome}` as import("@/i18n").DictKey,
  );
  const rewardLabel = (() => {
    if (!won) return null;
    if (coins && coins > 0) return t("uphero.slot.reward.coins", { n: coins });
    if (result.destroyGuards)
      return t("uphero.slot.reward.destroyGuard", { n: result.destroyGuards });
    if (result.downGuards)
      return t("uphero.slot.reward.downGuard", { n: result.downGuards });
    if (result.buff)
      return t("uphero.slot.reward.buff", {
        pct: result.buff.pct,
        battles: result.buff.battles,
      });
    if (outcome === "itemBox") return t("uphero.slot.reward.itemBox");
    return null;
  })();

  // ── 페이즈 ────────────────────────────────────────────────────────────
  const [pulled, setPulled] = useState(false);
  const [stopped, setStopped] = useState<[boolean, boolean, boolean]>([
    false,
    false,
    false,
  ]);
  // reduced-motion 은 레버·스핀을 건너뛰고 결과부터. useState 초기값이 아니라
  //   파생으로 계산해 SSR 스냅샷(false)과 어긋나지 않게 한다.
  const landed = reducedMotion || stopped.every(Boolean);
  const phase: Phase = landed ? "landed" : pulled ? "spinning" : "idle";

  // DungeonView 가 inline arrow 로 넘기므로 identity 가 매 렌더 바뀐다.
  //   타이머 deps 에 넣으면 카운트다운이 튀므로 ref 로 고정.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useModalA11y(containerRef, onDismiss, { noScrollLock: true });

  /** 레버 당김 — 스핀 시작. 결과는 이미 정해져 있다. 두 번 당겨도 한 번만. */
  const pulledRef = useRef(false);
  const pull = useCallback(() => {
    if (pulledRef.current) return;
    pulledRef.current = true;
    play("slotLever");
    setPulled(true);
  }, [play]);

  /** 회전 건너뛰기 — 남은 드럼을 즉시 세운다. */
  const skip = useCallback(() => setStopped([true, true, true]), []);

  // 드럼 착지 타이머 + 서스펜스 틱. 전부 스핀 시작(당김) 기준.
  //   transition 은 당김 다음 커밋에 시작하므로 duration 과 정확히 같게 잡으면
  //   한 프레임 일찍 끊겨 미세하게 튄다. 여유(STOP_SETTLE_MS)를 준다.
  useEffect(() => {
    if (phase !== "spinning") return;
    const spinStart = performance.now();
    mark("slot:spin");
    const timers: number[] = [];
    timings.forEach((ms, i) => {
      timers.push(
        window.setTimeout(() => {
          mark(`slot:reel${i + 1}`, performance.now() - spinStart);
          // 릴1·릴2 착지음. 릴3 는 티어 사운드가 대신한다 (landed 효과).
          if (i < 2) play("slotStop");
          setStopped((prev) => {
            if (prev[i]) return prev;
            const next: [boolean, boolean, boolean] = [...prev];
            next[i] = true;
            return next;
          });
        }, ms + STOP_SETTLE_MS),
      );
    });
    // 감속 틱 — 릴2 정지 뒤부터 릴3 착지까지, 간격이 벌어진다.
    for (const at of suspenseTickTimes(symbols)) {
      if (at >= timings[2]) continue; // 마지막 틱은 착지음과 겹치므로 생략
      timers.push(window.setTimeout(() => play("slotTick"), at));
    }
    return () => timers.forEach((id) => window.clearTimeout(id));
    // symbols/timings 는 페이로드와 함께 고정. play 는 useCallback.
  }, [phase, timings, symbols, play]);

  // 착지 순간 — 티어 사운드 + 햅틱. 한 번만.
  const landedFxFired = useRef(false);
  useEffect(() => {
    if (!landed || landedFxFired.current) return;
    landedFxFired.current = true;
    mark("slot:landed");
    play(TIER_SOUND[tier]);
  }, [landed, tier, play]);

  // 착지 후 자동 닫힘 + 카운트다운 bar.
  const [remaining, setRemaining] = useState(AUTO_DISMISS_MS);
  useEffect(() => {
    if (!landed) return;
    const start = performance.now();
    let rafId = 0;
    const tick = (now: number) => {
      const left = Math.max(0, AUTO_DISMISS_MS - (now - start));
      setRemaining(left);
      if (left <= 0) {
        onDismissRef.current();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [landed]);

  // 각 드럼의 strip — 장식 얼굴 n 개 + 마지막 칸이 실제 결과.
  //   useMemo 로 고정해 리렌더마다 얼굴이 바뀌지 않게 한다 (바뀌면 깜빡인다).
  //   긴 스핀(서스펜스)은 칸을 비례해 늘려 "느려지는데 계속 도는" 느낌을 낸다.
  const strips = useMemo(
    () =>
      symbols.map((final, drum) => {
        const cells = Math.round(
          (SPIN_CELLS_PER_1400MS * timings[drum]) / 1400,
        );
        const faces: SlotSymbol[] = [];
        for (let i = 0; i < cells; i += 1) {
          faces.push(REEL_FACES[(i * 3 + drum * 2) % REEL_FACES.length]);
        }
        faces.push(final);
        return faces;
      }),
    [symbols, timings],
  );

  const accent = won ? (tier === "big" ? GB_LEGEND : GB.lightest) : GB.light;

  /** 배경 탭 — idle 은 당김, 회전 중은 건너뛰기, 착지 후는 닫기. */
  const onBackdrop = phase === "idle" ? pull : phase === "spinning" ? skip : onDismiss;
  const backdropAria =
    phase === "idle"
      ? t("uphero.slot.lever.aria")
      : phase === "spinning"
        ? t("uphero.slot.aria.skip")
        : t("uphero.slot.aria.dismiss");

  const showFx = landed && !reducedMotion;

  return (
    <div
      className="slot-root absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{ zIndex: 45 }}
      data-shake={showFx && tier === "big" ? "true" : "false"}
      data-phase={phase}
    >
      <button
        type="button"
        aria-label={backdropAria}
        onClick={onBackdrop}
        className="slot-backdrop absolute inset-0 pointer-events-auto"
        style={{
          background: `${GB.darkest}dd`,
          backdropFilter: "blur(2px)",
          border: "none",
          padding: 0,
        }}
      />

      {/* big 티어 — 픽셀 스파크 낙하. 카드 위를 지나 떨어진다. */}
      {showFx && tier === "big" && (
        <div className="slot-sparks absolute inset-0 overflow-hidden" aria-hidden="true">
          {SPARKS.map((p, i) => (
            <span
              key={i}
              className="slot-spark"
              style={
                {
                  "--x": `${p.x}%`,
                  "--s": `${p.s}px`,
                  "--delay": `${p.delay}ms`,
                  "--drift": `${p.drift}px`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}

      <div
        ref={containerRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="slot-result-text"
        className="slot-card relative pointer-events-auto mx-4 w-full max-w-xs rounded-md overflow-hidden"
        style={{
          background: GB.darkest,
          // 보더 대신 톤 글로우 링.
          boxShadow: landed
            ? `0 0 0 2px ${accent}44, 0 0 22px 3px ${accent}2e, 0 12px 32px ${GB.darkest}cc`
            : `0 0 0 1px ${GB.dark}, 0 12px 32px ${GB.darkest}cc`,
          transition: `box-shadow 240ms ${EASE_OUT}`,
          outline: "none",
        }}
      >
        {/* 헤더 — 장치 이름 + 들어간 코인. 순손익을 숨기지 않는다. */}
        <div className="px-3 py-2 flex items-center justify-between">
          <span
            className="typo-micro"
            style={{ color: GB.light, letterSpacing: "0.12em", fontSize: 10 }}
          >
            {t("uphero.slot.title")}
          </span>
          <span
            className="typo-micro tabular-nums"
            style={{ color: GB_HINT, fontSize: 10 }}
          >
            {t("uphero.slot.stake", { cost })}
          </span>
        </div>

        {/* 드럼 3칸 + 레버 */}
        <div
          className="slot-drums relative flex items-center justify-center gap-2 px-4 py-5"
          data-tier={landed ? tier : "pending"}
          data-fx={showFx ? "true" : "false"}
        >
          {strips.map((faces, i) => (
            <Drum
              key={i}
              faces={faces}
              phase={stopped[i] || landed ? "stopped" : phase === "spinning" ? "spinning" : "idle"}
              durationMs={timings[i]}
              easing={i === 2 && suspense ? REEL_EASE_SUSPENSE : REEL_EASE}
              highlight={landed && won}
              highlightColor={accent}
              overshoot={i === 2 && nearMiss && !reducedMotion}
              crossfade={reducedMotion}
            />
          ))}

          <Lever
            phase={phase}
            onPull={pull}
            label={t("uphero.slot.lever.aria")}
          />

          {/* 보상 착지 플레어 — mid 이상. 사각 링이 한 번 퍼졌다 사라진다.
               픽셀 결을 지키려고 원이 아니라 정사각 아웃라인이다. */}
          {showFx && (tier === "mid" || tier === "big") && (
            <span className="slot-flare" aria-hidden="true" style={{ borderColor: accent }} />
          )}
          {showFx && tier === "big" && (
            <span
              className="slot-flare slot-flare-2"
              aria-hidden="true"
              style={{ borderColor: accent }}
            />
          )}
        </div>

        {/* 결과 */}
        <div
          className="px-4 pb-3 pt-1 text-center"
          style={{
            opacity: landed ? 1 : 0,
            transform: landed ? "translateY(0)" : "translateY(4px)",
            transition: `opacity 220ms ${EASE_OUT}, transform 260ms ${EASE_DRAWER}`,
            minHeight: 44,
          }}
        >
          {landed && tier === "big" && (
            <p
              className="slot-big typo-caption mb-1"
              style={{
                color: GB_LEGEND,
                letterSpacing: "0.16em",
                fontWeight: 700,
              }}
            >
              {t("uphero.slot.big")}
            </p>
          )}
          {landed && nearMiss && (
            <p
              className="slot-near typo-caption mb-1"
              style={{ color: GB.light, letterSpacing: "0.08em", fontWeight: 600 }}
            >
              {t("uphero.slot.nearMiss")}
            </p>
          )}
          <p
            id="slot-result-text"
            className="typo-body leading-relaxed"
            style={{ color: won ? GB.lightest : GB.light }}
            aria-live="polite"
          >
            {landed ? resultText : ""}
          </p>
          {landed && rewardLabel && (
            <span
              className="slot-reward typo-caption tabular-nums inline-block mt-2"
              style={{
                color: GB.darkest,
                background: tier === "big" ? GB_LEGEND : GB.lightest,
                padding: "3px 10px",
                borderRadius: 4,
                fontWeight: 700,
              }}
            >
              {rewardLabel}
            </span>
          )}
          {/* 투명 pity — 다음 굴림이 보장되면 숨기지 않고 말한다. */}
          {landed && pityArmed && (
            <span
              className="slot-pity typo-caption inline-flex items-center gap-1.5 mt-2"
              style={{ color: GB.lightest }}
            >
              <PixelIcon name="Sparkle" size={12} color={GB.lightest} />
              {t("uphero.slot.pityHint")}
            </span>
          )}
        </div>

        {/* 푸터 — 카운트다운 + CTA. 회전 중엔 "건너뛰기", idle 엔 "레버 당기기". */}
        <div className="px-3 py-2.5 flex items-center gap-2">
          <div
            aria-hidden="true"
            className="flex-1 h-[2px] rounded-full overflow-hidden"
            style={{ background: GB.dark }}
          >
            <div
              style={{
                width: landed ? `${(remaining / AUTO_DISMISS_MS) * 100}%` : "0%",
                height: "100%",
                background: accent,
              }}
            />
          </div>

          {landed && canSpinAgain && spinAgain && (
            <button
              type="button"
              onClick={spinAgain.onSpin}
              className="slot-cta slot-cta-again typo-caption rounded flex flex-col items-center"
              style={{
                minHeight: 44,
                padding: "6px 12px",
                background: `${GB.dark}`,
                color: GB.lightest,
                border: "none",
                fontWeight: 600,
                lineHeight: 1.15,
              }}
              autoFocus
            >
              <span>{t("uphero.slot.again")}</span>
              <span
                className="typo-micro tabular-nums"
                style={{ color: GB.light, fontSize: 10, fontWeight: 500 }}
              >
                {t("uphero.slot.spinsLeft", { n: spinAgain.spinsLeft })}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onBackdrop}
            className="slot-cta typo-caption rounded"
            style={{
              minHeight: 44,
              padding: "8px 14px",
              background: landed ? accent : "transparent",
              color: landed ? GB.darkest : GB.light,
              border: "none",
              boxShadow: landed ? "none" : `inset 0 0 0 1px ${GB.dark}`,
              fontWeight: 600,
            }}
            // idle 은 레버가, 착지 후 "한 번 더" 가 있으면 그쪽이 포커스를 받는다.
            autoFocus={landed && !canSpinAgain}
          >
            {phase === "idle"
              ? t("uphero.slot.lever.aria")
              : phase === "spinning"
                ? t("uphero.slot.skip")
                : t("uphero.choice.continue")}
          </button>
        </div>

      </div>

      {/* styled-jsx 는 이 태그를 품은 요소의 서브트리에만 스코프 클래스를 찍는다.
          루트 셰이크·스파크(카드 형제)까지 맞히려면 루트 바로 아래에 둔다. */}
      <style jsx>{`
        .slot-card {
          animation: slot-in 220ms ${EASE_OUT} both;
        }
        .slot-backdrop {
          animation: slot-fade 180ms ${EASE_OUT} both;
        }
        .slot-cta {
          transition: transform 120ms ${EASE_OUT}, background 160ms ${EASE_OUT};
        }
        .slot-cta:active {
          transform: scale(0.97);
        }
        .slot-cta:focus-visible {
          outline: 2px solid ${GB.lightest};
          outline-offset: 2px;
        }
        .slot-reward,
        .slot-pity,
        .slot-near {
          animation: slot-pop 300ms ${EASE_DRAWER} both;
        }
        .slot-big {
          animation: slot-pop 340ms ${EASE_DRAWER} both, slot-big-glow 900ms ease-in-out 340ms 2;
        }
        /* 꽝 — 프레임이 15% 어두워졌다 돌아온다 (250ms). */
        .slot-drums[data-fx="true"][data-tier="none"] {
          animation: slot-dim 250ms ${EASE_OUT} both;
        }
        /* small — 명도 플래시 2프레임. */
        .slot-drums[data-fx="true"][data-tier="small"] {
          animation: slot-flash 120ms linear both;
        }
        /* mid — 한 번 숨을 쉰다. */
        .slot-drums[data-fx="true"][data-tier="mid"] {
          animation: slot-breathe 420ms ${EASE_OUT} both;
        }
        /* big — 더 크게 숨 쉬고 링이 두 번 퍼진다. 셰이크는 루트에. */
        .slot-drums[data-fx="true"][data-tier="big"] {
          animation: slot-breathe-big 520ms ${EASE_OUT} both;
        }
        .slot-flare {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 96px;
          height: 60px;
          margin: -30px 0 0 -48px;
          border: 2px solid ${GB.lightest};
          pointer-events: none;
          animation: slot-flare 520ms ${EASE_OUT} both;
        }
        .slot-flare-2 {
          animation: slot-flare 760ms ${EASE_OUT} 140ms both;
        }
        .slot-spark {
          position: absolute;
          top: -6px;
          left: var(--x);
          width: var(--s);
          height: var(--s);
          background: ${GB_LEGEND};
          opacity: 0;
          animation: slot-spark-fall 900ms cubic-bezier(0.3, 0, 0.7, 1) var(--delay) both;
        }
        @keyframes slot-in {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes slot-fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes slot-pop {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          60% {
            transform: scale(1.06);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes slot-big-glow {
          0%,
          100% {
            text-shadow: 0 0 0 transparent;
          }
          50% {
            text-shadow: 0 0 10px ${GB_LEGEND}aa;
          }
        }
        @keyframes slot-dim {
          0% {
            filter: brightness(1);
          }
          20% {
            filter: brightness(0.85);
          }
          70% {
            filter: brightness(0.85);
          }
          100% {
            filter: brightness(1);
          }
        }
        @keyframes slot-flash {
          0% {
            filter: brightness(1);
          }
          15% {
            filter: brightness(1.7);
          }
          30% {
            filter: brightness(1.7);
          }
          100% {
            filter: brightness(1);
          }
        }
        @keyframes slot-breathe {
          0% {
            transform: scale(1);
          }
          40% {
            transform: scale(1.04);
          }
          100% {
            transform: scale(1);
          }
        }
        @keyframes slot-breathe-big {
          0% {
            transform: scale(1);
          }
          35% {
            transform: scale(1.07);
          }
          100% {
            transform: scale(1);
          }
        }
        @keyframes slot-flare {
          from {
            opacity: 0.9;
            transform: scale(0.6);
          }
          to {
            opacity: 0;
            transform: scale(1.8);
          }
        }
        @keyframes slot-spark-fall {
          0% {
            opacity: 0;
            transform: translate3d(0, 0, 0);
          }
          12% {
            opacity: 1;
          }
          80% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate3d(var(--drift), 300px, 0);
          }
        }
        /* 루트 셰이크 — big 티어 300ms, 2px. 카드·배경·스파크가 함께 흔들린다.
           styled-jsx 는 컴포넌트당 style 태그 하나라 여기 같이 둔다. */
        .slot-root[data-shake="true"] {
          animation: slot-shake 300ms linear both;
        }
        @keyframes slot-shake {
          0%,
          100% {
            transform: translate(0, 0);
          }
          15% {
            transform: translate(2px, -1px);
          }
          30% {
            transform: translate(-2px, 1px);
          }
          45% {
            transform: translate(2px, 1px);
          }
          60% {
            transform: translate(-2px, -1px);
          }
          75% {
            transform: translate(1px, 0);
          }
          90% {
            transform: translate(-1px, 0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .slot-root[data-shake="true"],
          .slot-card,
          .slot-backdrop,
          .slot-reward,
          .slot-pity,
          .slot-near,
          .slot-big,
          .slot-drums,
          .slot-flare,
          .slot-spark {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * 타이밍 실측용 performance mark. 프로덕션에서는 무음. 이름: slot:spin,
 * slot:reel1..3, slot:landed. `performance.getEntriesByType("mark")` 로 읽는다.
 */
function mark(name: string, detail?: number): void {
  if (process.env.NODE_ENV === "production") return;
  try {
    performance.mark(name, detail === undefined ? undefined : { detail });
  } catch {
    /* non-critical */
  }
}

/**
 * 드럼 한 칸.
 *
 * strip 을 위(0)에서 시작해 마지막 칸(`-(n-1) × CELL`)까지 밀어 내리는 방식.
 * 마지막 얼굴이 결과라서, 애니메이션이 끝나면 창에 남는 건 언제나 실제 결과다.
 * 중간에 멈춰도 (skip) transition 없이 결과 칸으로 스냅되므로 어긋날 수 없다.
 *
 *  - idle     : 첫 장식 얼굴이 보인다. transition 없음.
 *  - spinning : 결과 칸으로 transition (`durationMs`, `easing`).
 *  - stopped  : 결과 칸에 고정. `overshoot` 면 3px 아래서 튕겨 올라온다 (near-miss).
 *  - crossfade: reduced-motion — 결과 칸에 고정된 채 200ms 페이드인.
 */
function Drum({
  faces,
  phase,
  durationMs,
  easing,
  highlight,
  highlightColor,
  overshoot,
  crossfade,
}: {
  faces: SlotSymbol[];
  phase: "idle" | "spinning" | "stopped";
  durationMs: number;
  easing: string;
  highlight: boolean;
  highlightColor: string;
  overshoot: boolean;
  crossfade: boolean;
}) {
  const finalOffset = -(faces.length - 1) * CELL;
  const y = phase === "idle" ? 0 : finalOffset;

  return (
    <div
      className="relative overflow-hidden rounded-sm"
      style={{
        width: CELL,
        height: CELL,
        background: GB.darkest,
        boxShadow: `inset 0 0 0 1px ${highlight ? highlightColor : GB.dark}`,
        transition: `box-shadow 200ms ${EASE_OUT}`,
      }}
      aria-hidden="true"
    >
      <div
        className={[
          "slot-strip",
          phase === "stopped" && overshoot ? "slot-strip-overshoot" : "",
          phase === "stopped" && crossfade ? "slot-strip-crossfade" : "",
        ].join(" ")}
        style={
          {
            "--final": `${finalOffset}px`,
            transform: `translateY(${y}px)`,
            transition:
              phase === "spinning" ? `transform ${durationMs}ms ${easing}` : "none",
          } as React.CSSProperties
        }
      >
        {faces.map((face, i) => (
          <div
            key={i}
            className="flex items-center justify-center"
            style={{ height: CELL }}
          >
            <PixelIcon
              name={SYMBOL_ICON[face]}
              size={26}
              color={highlight ? highlightColor : GB.light}
            />
          </div>
        ))}
      </div>
      {/* 위아래 가림막 — 드럼이 통 안에서 도는 느낌. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-2 pointer-events-none"
        style={{
          background: `linear-gradient(to bottom, ${GB.darkest}, transparent)`,
        }}
      />
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-2 pointer-events-none"
        style={{
          background: `linear-gradient(to top, ${GB.darkest}, transparent)`,
        }}
      />
      <style jsx>{`
        /* near-miss 착지 — 3px 아래로 넘쳤다가 제자리. "덜컹" 한 번. */
        .slot-strip-overshoot {
          animation: slot-overshoot 180ms ${EASE_OUT} both;
        }
        .slot-strip-crossfade {
          animation: slot-crossfade 200ms linear both;
        }
        @keyframes slot-overshoot {
          0% {
            transform: translateY(calc(var(--final) + 3px));
          }
          100% {
            transform: translateY(var(--final));
          }
        }
        @keyframes slot-crossfade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .slot-strip-overshoot {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * 픽셀 레버. 세로 트랙 위의 손잡이를 끌어내리거나 탭하면 `onPull`.
 * 당긴 뒤에는 손잡이가 내려간 채 잠깐 머물다 스프링으로 돌아온다.
 * 제스처: pointerdown 후 LEVER_PULL_PX 이상 아래로 끌면 당김. 그 전에 손을 떼도
 * 탭으로 간주해 당김 — 아무도 여기서 막히지 않는다. 키보드는 버튼 기본(Enter/Space).
 */
function Lever({
  phase,
  onPull,
  label,
}: {
  phase: Phase;
  onPull: () => void;
  label: string;
}) {
  const startY = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);
  const armed = phase === "idle";

  const onDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!armed) return;
    startY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!armed || startY.current === null) return;
    const dy = Math.max(0, Math.min(LEVER_PULL_PX + 6, e.clientY - startY.current));
    setDrag(dy);
    if (dy >= LEVER_PULL_PX) {
      startY.current = null;
      onPull();
    }
  };
  const onUp = () => {
    if (!armed) return;
    if (startY.current !== null) {
      startY.current = null;
      onPull();
    }
  };

  // 당긴 뒤: 손잡이는 끝까지 내려간 상태로 그린다 (spinning). landed 면 스프링 복귀.
  const knobY = phase === "spinning" ? LEVER_PULL_PX + 6 : phase === "landed" ? 0 : drag;

  return (
    <button
      type="button"
      aria-label={label}
      disabled={!armed}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onClick={(e) => {
        // pointer 경로가 이미 당겼으면 click 은 무시. 키보드 활성화는 pointer 없이 click 만 온다.
        if (e.detail === 0 && armed) onPull();
      }}
      className="slot-lever relative shrink-0 rounded-sm"
      style={{
        width: 22,
        height: CELL,
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: armed ? "grab" : "default",
        touchAction: "none",
        opacity: armed ? 1 : 0.55,
        transition: `opacity 240ms ${EASE_OUT}`,
      }}
      autoFocus={armed}
    >
      {/* 트랙 */}
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1 bottom-1 -translate-x-1/2"
        style={{ width: 4, background: GB.dark }}
      />
      {/* 손잡이 — 픽셀 정사각 + 목 */}
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1 -translate-x-1/2"
        style={{
          width: 14,
          height: 14,
          background: armed ? GB.lightest : GB.light,
          transform: `translate(-50%, ${knobY}px)`,
          transition:
            phase === "landed"
              ? `transform 420ms ${EASE_DRAWER}`
              : phase === "spinning"
                ? `transform 120ms ${EASE_OUT}`
                : "none",
        }}
      />
      <style jsx>{`
        .slot-lever:focus-visible {
          outline: 2px solid ${GB.lightest};
          outline-offset: 2px;
        }
        .slot-lever:active {
          cursor: grabbing;
        }
      `}</style>
    </button>
  );
}
