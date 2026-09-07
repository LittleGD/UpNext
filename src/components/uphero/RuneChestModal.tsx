"use client";

/**
 * Up Hero — 룬 상자(rune chest) 연출 모달.
 *
 * **기본 보상은 이미 확정돼 있다.** `upHeroCombat.applyChoiceEffect` 의 `spinSlot`
 * 분기가 롤·지급까지 끝낸 상태로 로그 엔트리에 실어 보낸다. 이 컴포넌트가 하는
 * 일은 두 가지다:
 *   1. 상자를 여는 짧은 조작(룬 자물쇠 걸쇠 맞추기)을 받는다.
 *   2. 그 등급을 `onResolveLock` 으로 돌려준다 — 스토어가 `resolveRuneLock` 으로
 *      코인 보너스 차액만 얹는다.
 * 여기서 세션 RNG 를 굴리는 코드는 한 줄도 없다. 목표 위치와 표식 속도는 표시
 * 전용 난수(`Math.random`)이고 저장되지 않는다.
 *
 * ── 왜 조작이 있는가 (2026-09, 애플 2.3.6) ─────────────────────────────
 *
 * 이전 판은 룬 드럼 세 개가 돌아가는 장치였고, 개인 개발자 계정의 simulated
 * gambling 금지(가이드라인 2.3.6)에 걸려 1.3.0 이 거절됐다. 돌아가는 드럼을
 * 그냥 지우면 "코인 넣으면 결과가 뜬다" 는 밋밋한 상자만 남는다. 그래서 도파민을
 * 확률이 아니라 **내 손끝**에 옮겼다: 표식을 노려 멈추면 보상이 최대 +30% 늘어난다.
 * 확률표는 바뀌지 않고, 빗나가도 상자는 열린다 (실패 상태 없음).
 *
 * 흐름: lock(걸쇠 맞추기) → opening(뚜껑 400ms) → revealed(보상 + 3초 자동 닫힘).
 *  - 트랙 자체가 버튼이다. 탭·Space·Enter 가 전부 "멈춤". 배경 탭도 같은 동작.
 *  - reduced-motion: 왕복 주기를 2배로 늘리고(= 절반 속도) 흔들림·플래시를 뺀다.
 *    **자동 해소하지 않는다** — 조작은 그대로 살아 있어야 공정하다.
 *  - 앱이 백그라운드로 가면 여기서 `"plain"`(보너스 0)으로 마감한다. 조작 없이
 *    닫히는 경로는 **호출자**가 `onDismiss` 에서 `"plain"` 을 부른다 — 언마운트
 *    정리에 두면 React StrictMode 의 마운트-언마운트-재마운트 예행에서 첫 프레임에
 *    해소돼 자물쇠가 죽는다 (ref 는 재마운트를 넘어 살아남는다). 두 경로 모두
 *    스토어 쪽이 멱등해 중복 적용되지 않는다.
 *  - pity: 스트릭이 임계에 닿았으면 "다음은 반드시 나와요". 값은 스토어가 만든다.
 *  - "한 번 더": 남은 횟수·코인이 있을 때만 CTA 가 뜬다.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { GB, GB_HINT, GB_LEGEND, EASE_OUT, EASE_DRAWER } from "@/lib/upHeroPalette";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useTranslation } from "@/hooks/useTranslation";
import { useSound } from "@/hooks/useSound";
import type { SoundName } from "@/lib/sounds";
import PixelIcon from "@/components/icons/PixelIcon";
import {
  RUNE_LOCK_INNER_HALF,
  RUNE_LOCK_OUTER_HALF,
  SLOT_SPIN_COST,
  isSlotWin,
  isSlotPityArmed,
  runeLockBonusPercent,
  runeLockTier,
  slotTier,
  type RuneLockTier,
  type SlotOutcomeId,
  type SlotTier,
} from "@/lib/upHeroSlot";

/** 뚜껑이 열리는 데 걸리는 시간. 결과가 붙기 전의 짧은 숨. */
const OPEN_MS = 420;
/** 보상이 뜬 뒤 자동으로 닫히기까지. */
const AUTO_DISMISS_MS = 3000;
/** 표식 왕복 주기(ms) 범위. 매번 조금씩 달라 외워서 누를 수 없다. */
const SWEEP_MIN_MS = 1000;
const SWEEP_MAX_MS = 1400;
/** reduced-motion 배수 — 주기를 2배로 늘리면 속도가 절반이 된다. */
const SWEEP_REDUCED_MULT = 2;

/**
 * 티어별 착지 사운드. 카지노 큐(릴·잭팟)는 전부 걷어내고 기존 상자/수집/확인
 * 계열만 재사용한다.
 */
const TIER_SOUND: Record<SlotTier, SoundName> = {
  none: "collect",
  small: "rewardChoose",
  mid: "packOpen",
  big: "levelUp",
};

/** 로그 엔트리(`choiceResult.slot`) 가 그대로 넘어온다. 표시에 필요한 전부다. */
export interface RuneChestResultPayload {
  outcome: SlotOutcomeId;
  cost: number;
  destroyGuards?: number;
  downGuards?: number;
  buff?: { pct: number; battles: number };
  /** 이미 해소된 상자면 등급이 적혀 있다 — 조작을 건너뛰고 보상부터 보여준다. */
  lockTier?: RuneLockTier;
}

export interface RuneChestModalProps {
  result: RuneChestResultPayload;
  /**
   * 이 상자에서 받은 코인. 등급 보너스가 이미 반영된 값이다 (스토어가
   * `resolveRuneLock` 에서 요약 수치를 갱신한다).
   */
  coins?: number;
  /**
   * 이 상자 **뒤**의 연속 꽝 스트릭. `isSlotPityArmed` 면 "다음은 반드시 나와요"
   * 힌트를 띄운다. 값은 스토어(UpHeroState.slotBlankStreak)가 만든다. 표시만.
   */
  blankStreak?: number;
  /**
   * "한 번 더" CTA. 호출자가 남은 횟수와 지갑을 넘기면 모달이 게이트를 건다
   * (chestsLeft > 0 && wallet >= cost). 없으면 CTA 도 없다.
   */
  openAgain?: { chestsLeft: number; wallet: number; onOpen: () => void };
  /**
   * 걸쇠 등급 확정. 조작을 끝냈을 때, 또는 앱이 백그라운드로 갔을 때 호출된다.
   * 스토어가 보너스 차액을 얹는다 (같은 상자를 두 번 해소하지 않는 멱등 계약).
   */
  onResolveLock: (tier: RuneLockTier) => void;
  /**
   * 닫기. 조작 없이 닫히는 경우를 대비해 **호출자가 여기서 `onResolveLock("plain")`
   * 도 함께 불러야 한다** — 세션에 미해소 상자를 남기지 않기 위해서다.
   */
  onDismiss: () => void;
}

type Phase = "lock" | "opening" | "revealed";

/** 목표대가 트랙 밖으로 삐져나오지 않도록 중심을 접는 여유. */
const CENTER_MARGIN = RUNE_LOCK_OUTER_HALF + 0.06;

/** 표시 전용 난수 — 세션 RNG 를 쓰지 않고, 저장하지도 않는다. */
function rollTrack(): { center: number; periodMs: number } {
  return {
    center: CENTER_MARGIN + Math.random() * (1 - CENTER_MARGIN * 2),
    periodMs: SWEEP_MIN_MS + Math.random() * (SWEEP_MAX_MS - SWEEP_MIN_MS),
  };
}

/** 삼각파 — 0 → 1 → 0 왕복. `t` 는 주기 안의 진행도(0~1). */
function sweepPosition(t: number): number {
  return t < 0.5 ? t * 2 : 2 - t * 2;
}

export default function RuneChestModal({
  result,
  coins,
  blankStreak = 0,
  openAgain,
  onResolveLock,
  onDismiss,
}: RuneChestModalProps) {
  const { outcome, cost = SLOT_SPIN_COST } = result;
  const reducedMotion = useReducedMotion();
  const { t } = useTranslation();
  const { play } = useSound();
  const containerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLSpanElement>(null);
  const won = isSlotWin(outcome);
  const tier = slotTier(outcome);
  const pityArmed = isSlotPityArmed(blankStreak);
  const canOpenAgain =
    !!openAgain && openAgain.chestsLeft > 0 && openAgain.wallet >= cost;

  // 목표 위치·속도는 마운트당 한 번. 리렌더로 흔들리면 조준이 불가능해진다.
  const [track] = useState(rollTrack);
  const periodMs = reducedMotion ? track.periodMs * SWEEP_REDUCED_MULT : track.periodMs;

  // 이미 해소된 상자(다른 기기에서 동기화됐거나 리마운트)는 조작을 건너뛴다.
  const [phase, setPhase] = useState<Phase>(result.lockTier ? "revealed" : "lock");
  const [lockTier, setLockTier] = useState<RuneLockTier | null>(
    result.lockTier ?? null,
  );
  /**
   * 표식의 현재 위치(0~1). 상태가 아니라 ref 다 — 60fps 로 setState 하면 모달
   * 전체가 매 프레임 리렌더되고, 그 비용이 곧 조준 지연이 된다.
   */
  const markerPosRef = useRef(0);

  // DungeonView 가 inline arrow 로 넘기므로 identity 가 매 렌더 바뀐다.
  //   타이머·언마운트 정리 deps 에 넣으면 튀므로 ref 로 고정한다.
  const onDismissRef = useRef(onDismiss);
  const onResolveLockRef = useRef(onResolveLock);
  useEffect(() => {
    onDismissRef.current = onDismiss;
    onResolveLockRef.current = onResolveLock;
  });

  useModalA11y(containerRef, onDismiss, { noScrollLock: true });

  /**
   * 등급 확정 — 정확히 한 번. 조작으로도, 닫힘/백그라운드로도 여기로 모인다.
   * 이미 해소된 페이로드로 마운트됐으면 처음부터 잠겨 있다.
   */
  const resolvedRef = useRef<boolean>(result.lockTier != null);
  const finish = useCallback((next: RuneLockTier) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setLockTier(next);
    setPhase("opening");
    onResolveLockRef.current(next);
  }, []);

  /** 걸쇠 멈춤 — 표식의 현재 위치로 등급을 가른다. */
  const stop = useCallback(() => {
    if (resolvedRef.current) return;
    play("confirm");
    finish(runeLockTier(markerPosRef.current, track.center));
  }, [finish, play, track.center]);

  // ── 표식 왕복 ────────────────────────────────────────────────────────
  //   DOM 을 직접 민다 (위 markerPosRef 주석 참조).
  useEffect(() => {
    if (phase !== "lock") return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = sweepPosition(((now - start) % periodMs) / periodMs);
      markerPosRef.current = p;
      const el = markerRef.current;
      if (el) el.style.left = `${p * 100}%`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase, periodMs]);

  // 백그라운드 진입 — 조작이 끝나지 않았으면 plain 으로 마감한다.
  //   (돌아왔을 때 표식만 계속 돌고 보상은 안 나오는 상태를 만들지 않는다.)
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && !resolvedRef.current) {
        finish("plain");
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [finish]);

  // 뚜껑 → 보상.
  useEffect(() => {
    if (phase !== "opening") return;
    play("packOpen");
    const id = window.setTimeout(() => setPhase("revealed"), reducedMotion ? 160 : OPEN_MS);
    return () => window.clearTimeout(id);
  }, [phase, reducedMotion, play]);

  // 보상 등장 순간 — 티어 사운드 + 햅틱. 한 번만.
  const revealFxFired = useRef(false);
  useEffect(() => {
    if (phase !== "revealed" || revealFxFired.current) return;
    revealFxFired.current = true;
    play(TIER_SOUND[tier]);
  }, [phase, tier, play]);

  // 자동 닫힘 + 카운트다운 bar.
  const [remaining, setRemaining] = useState(AUTO_DISMISS_MS);
  useEffect(() => {
    if (phase !== "revealed") return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const left = Math.max(0, AUTO_DISMISS_MS - (now - start));
      setRemaining(left);
      if (left <= 0) {
        onDismissRef.current();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // ── 문구 ─────────────────────────────────────────────────────────────
  const resultText = t(
    `uphero.slot.result.${outcome}` as import("@/i18n").DictKey,
  );
  const lockLine = lockTier
    ? t(`uphero.slot.lock.${lockTier}` as import("@/i18n").DictKey)
    : null;
  const bonusPct = lockTier ? runeLockBonusPercent(lockTier) : 0;
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

  const revealed = phase === "revealed";
  const opened = phase !== "lock";
  const accent = revealed && won ? (tier === "big" ? GB_LEGEND : GB.lightest) : GB.light;
  const showFx = revealed && !reducedMotion;

  /** 배경 탭 — 조작 중엔 멈춤, 보상 뒤엔 닫기. 뚜껑이 열리는 동안은 죽어 있다. */
  const backdropActive = phase === "lock" || revealed;

  return (
    <div
      className="chest-root absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{ zIndex: 45 }}
      data-phase={phase}
    >
      <button
        type="button"
        aria-label={phase === "lock" ? t("uphero.slot.lock.aria") : t("uphero.slot.aria.dismiss")}
        onClick={phase === "lock" ? stop : onDismiss}
        disabled={!backdropActive}
        className="chest-backdrop absolute inset-0 pointer-events-auto"
        style={{
          background: `${GB.darkest}dd`,
          backdropFilter: "blur(2px)",
          border: "none",
          padding: 0,
        }}
      />

      <div
        ref={containerRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="rune-chest-text"
        className="chest-card relative pointer-events-auto mx-4 w-full max-w-xs rounded-md overflow-hidden"
        style={{
          background: GB.darkest,
          // 보더 대신 톤 글로우 링.
          boxShadow: revealed
            ? `0 0 0 2px ${accent}44, 0 0 22px 3px ${accent}2e, 0 12px 32px ${GB.darkest}cc`
            : `0 0 0 1px ${GB.dark}, 0 12px 32px ${GB.darkest}cc`,
          transition: `box-shadow 240ms ${EASE_OUT}`,
          outline: "none",
        }}
      >
        {/* 헤더 — 상자 이름 + 넣은 코인. 순손익을 숨기지 않는다. */}
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

        {/* 상자 — 픽셀 결의 단순 도형. 아이콘을 박스 안에 넣지 않는다. */}
        <div
          className="chest-stage relative flex items-end justify-center px-4 pt-3 pb-4"
          data-tier={revealed ? tier : "pending"}
          data-fx={showFx ? "true" : "false"}
        >
          <div className="chest-figure relative" aria-hidden="true">
            {/* 뚜껑 안쪽 — 열리면 드러나는 어둠. 뚜껑 뒤에 깔린다. */}
            <span className="chest-inside" style={{ background: GB.darkest }} />
            <span
              className="chest-lid"
              data-open={opened ? "true" : "false"}
              style={{ background: GB.dark }}
            >
              {/* 뚜껑 결 — 위로 갈수록 밝아지는 한 줄. 보더 대신 톤으로 면을 가른다. */}
              <span className="chest-lid-band" style={{ background: `${GB.light}26` }} />
            </span>
            <span className="chest-body" style={{ background: GB.dark }} />
            {/* 세로 띠 두 줄 — 상자의 실루엣을 만드는 최소한의 결. */}
            <span className="chest-strap chest-strap-l" style={{ background: `${GB.darkest}b3` }} />
            <span className="chest-strap chest-strap-r" style={{ background: `${GB.darkest}b3` }} />
            <span
              className="chest-plate"
              data-open={opened ? "true" : "false"}
              style={{ background: opened ? accent : GB.light }}
            />
            {showFx && (tier === "mid" || tier === "big") && (
              <span className="chest-glow" style={{ background: accent }} />
            )}
          </div>
        </div>

        {/* 룬 자물쇠 — 트랙 자체가 버튼이다 (탭·Space·Enter). */}
        {phase === "lock" && (
          <div className="px-4 pb-1">
            <p
              className="typo-micro text-center mb-1.5"
              style={{ color: GB_HINT, letterSpacing: "0.04em" }}
            >
              {t("uphero.slot.lock.instruction")}
            </p>
            <button
              type="button"
              onClick={stop}
              aria-label={t("uphero.slot.lock.aria")}
              className="chest-track relative block w-full rounded"
              style={{
                height: 44,
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <span
                className="chest-rail absolute left-0 right-0 rounded-sm"
                style={{ top: 16, height: 12, background: GB.dark }}
              />
              <span
                className="chest-zone absolute rounded-sm"
                style={{
                  top: 16,
                  height: 12,
                  left: `${(track.center - RUNE_LOCK_OUTER_HALF) * 100}%`,
                  width: `${RUNE_LOCK_OUTER_HALF * 200}%`,
                  background: `${GB.light}59`,
                }}
              />
              <span
                className="chest-zone absolute rounded-sm"
                style={{
                  top: 16,
                  height: 12,
                  left: `${(track.center - RUNE_LOCK_INNER_HALF) * 100}%`,
                  width: `${RUNE_LOCK_INNER_HALF * 200}%`,
                  background: GB.lightest,
                }}
              />
              <span
                ref={markerRef}
                className="chest-marker absolute"
                style={{
                  top: 10,
                  left: "0%",
                  marginLeft: -2,
                  width: 4,
                  height: 24,
                  background: GB_LEGEND,
                }}
              />
            </button>
          </div>
        )}

        {/* 보상 */}
        <div
          className="px-4 pb-3 pt-1 text-center"
          style={{
            opacity: revealed ? 1 : 0,
            transform: revealed ? "translateY(0)" : "translateY(4px)",
            transition: `opacity 220ms ${EASE_OUT}, transform 260ms ${EASE_DRAWER}`,
            minHeight: phase === "lock" ? 0 : 44,
          }}
        >
          {revealed && lockLine && (
            <p
              className="chest-lockline typo-caption mb-1"
              style={{ color: GB.light, letterSpacing: "0.04em" }}
            >
              {lockLine}
            </p>
          )}
          <p
            id="rune-chest-text"
            className="typo-body leading-relaxed"
            style={{ color: won ? GB.lightest : GB.light }}
            aria-live="polite"
          >
            {revealed ? resultText : ""}
          </p>
          {revealed && (rewardLabel || bonusPct > 0) && (
            <span className="inline-flex items-center gap-1.5 mt-2">
              {rewardLabel && (
                <span
                  className="chest-reward typo-caption tabular-nums inline-block"
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
              {bonusPct > 0 && (
                <span
                  className="chest-bonus typo-micro tabular-nums inline-block"
                  style={{
                    color: GB_LEGEND,
                    background: `${GB.dark}`,
                    padding: "3px 8px",
                    borderRadius: 4,
                    fontWeight: 700,
                  }}
                >
                  {t("uphero.slot.lock.bonus", { pct: bonusPct })}
                </span>
              )}
            </span>
          )}
          {/* 투명 pity — 다음 상자가 보장되면 숨기지 않고 말한다. */}
          {revealed && pityArmed && (
            <span
              className="chest-pity typo-caption inline-flex items-center gap-1.5 mt-2"
              style={{ color: GB.lightest }}
            >
              <PixelIcon name="Sparkle" size={12} color={GB.lightest} />
              {t("uphero.slot.pityHint")}
            </span>
          )}
        </div>

        {/* 푸터 — 카운트다운 + CTA. */}
        <div className="px-3 py-2.5 flex items-center gap-2">
          <div
            aria-hidden="true"
            className="flex-1 h-[2px] rounded-full overflow-hidden"
            style={{ background: GB.dark }}
          >
            <div
              style={{
                width: revealed ? `${(remaining / AUTO_DISMISS_MS) * 100}%` : "0%",
                height: "100%",
                background: accent,
              }}
            />
          </div>

          {revealed && canOpenAgain && openAgain && (
            <button
              type="button"
              onClick={openAgain.onOpen}
              className="chest-cta chest-cta-again typo-caption rounded flex flex-col items-center"
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
                {t("uphero.slot.spinsLeft", { n: openAgain.chestsLeft })}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={phase === "lock" ? stop : onDismiss}
            disabled={phase === "opening"}
            className="chest-cta typo-caption rounded"
            style={{
              minHeight: 44,
              padding: "8px 14px",
              background: revealed ? accent : "transparent",
              color: revealed ? GB.darkest : GB.light,
              border: "none",
              boxShadow: revealed ? "none" : `inset 0 0 0 1px ${GB.dark}`,
              fontWeight: 600,
            }}
            autoFocus={revealed && !canOpenAgain}
          >
            {phase === "lock"
              ? t("uphero.slot.lock.stop")
              : t("uphero.choice.continue")}
          </button>
        </div>
      </div>

      <style jsx>{`
        .chest-card {
          animation: chest-in 220ms ${EASE_OUT} both;
        }
        .chest-backdrop {
          animation: chest-fade 180ms ${EASE_OUT} both;
        }
        .chest-cta {
          transition: transform 120ms ${EASE_OUT}, background 160ms ${EASE_OUT};
        }
        .chest-cta:active {
          transform: scale(0.97);
        }
        .chest-cta:focus-visible,
        .chest-track:focus-visible {
          outline: 2px solid ${GB.lightest};
          outline-offset: 2px;
        }
        .chest-reward,
        .chest-bonus,
        .chest-pity,
        .chest-lockline {
          animation: chest-pop 300ms ${EASE_DRAWER} both;
        }
        .chest-figure {
          width: 88px;
          height: 70px;
        }
        /* 상자 몸통 — 아래 42px. */
        .chest-body {
          position: absolute;
          left: 0;
          bottom: 0;
          width: 88px;
          height: 42px;
          border-radius: 2px;
        }
        /* 뚜껑 — 위 22px. 몸통과 2px 틈을 두어 이음매가 생긴다. */
        .chest-lid {
          position: absolute;
          left: 0;
          bottom: 44px;
          width: 88px;
          height: 22px;
          border-radius: 3px 3px 0 0;
          transform-origin: bottom center;
          transition: transform ${OPEN_MS}ms ${EASE_DRAWER};
        }
        .chest-lid-band {
          position: absolute;
          left: 0;
          right: 0;
          top: 4px;
          height: 5px;
        }
        .chest-lid[data-open="true"] {
          transform: translateY(-7px) rotate(-9deg);
        }
        /* 뚜껑 안쪽 — 열릴 때만 보이는 어둠. */
        .chest-inside {
          position: absolute;
          left: 6px;
          right: 6px;
          bottom: 40px;
          height: 12px;
          border-radius: 2px;
        }
        /* 세로 띠 — 뚜껑 위부터 바닥까지 관통해 상자처럼 보이게 한다. */
        .chest-strap {
          position: absolute;
          bottom: 0;
          width: 7px;
          height: 66px;
        }
        .chest-strap-l {
          left: 14px;
        }
        .chest-strap-r {
          right: 14px;
        }
        /* 자물쇠 판 — 뚜껑과 몸통의 이음매에 걸린다. 열리면 accent 로 물든다. */
        .chest-plate {
          position: absolute;
          left: 36px;
          bottom: 34px;
          width: 16px;
          height: 16px;
          border-radius: 2px;
          transition: background 240ms ${EASE_OUT}, transform 240ms ${EASE_DRAWER};
        }
        .chest-plate[data-open="true"] {
          transform: translateY(3px) rotate(12deg);
        }
        .chest-glow {
          position: absolute;
          left: 50%;
          bottom: 34px;
          width: 4px;
          height: 4px;
          margin-left: -2px;
          border-radius: 50%;
          animation: chest-glow 620ms ${EASE_OUT} both;
        }
        .chest-marker {
          border-radius: 1px;
        }
        /* 보상 등장 — 티어별 숨 한 번. reduced-motion 은 data-fx=false 라 안 돈다. */
        .chest-stage[data-fx="true"][data-tier="mid"] {
          animation: chest-breathe 420ms ${EASE_OUT} both;
        }
        .chest-stage[data-fx="true"][data-tier="big"] {
          animation: chest-breathe-big 520ms ${EASE_OUT} both;
        }
        @keyframes chest-in {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes chest-fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes chest-pop {
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
        @keyframes chest-glow {
          from {
            opacity: 0.9;
            transform: scale(1);
          }
          to {
            opacity: 0;
            transform: scale(22);
          }
        }
        @keyframes chest-breathe {
          0% {
            transform: scale(1);
          }
          45% {
            transform: scale(1.04);
          }
          100% {
            transform: scale(1);
          }
        }
        @keyframes chest-breathe-big {
          0% {
            transform: scale(1);
          }
          40% {
            transform: scale(1.08);
          }
          100% {
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}
