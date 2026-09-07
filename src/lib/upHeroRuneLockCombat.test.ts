import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSession, resolveChoice, resolveRuneLock } from "./upHeroCombat";
import { resetRng } from "./upHeroRng";
import { SLOT_EVENT } from "@/data/flavor/slot";
import { SLOT_GRANTS, applyRuneLockBonus, type RuneLockTier } from "./upHeroSlot";
import { createDefaultHero, type CombatSession } from "@/types/uphero";

/**
 * 룬 자물쇠 해소 — 전투 레이어 배선.
 *
 * 기본 보상은 `spinSlot` 이 이미 지급했다. `resolveRuneLock` 은 등급을 적고
 * **코인 차액만** 얹는다. 그래서:
 *  - 조작을 안 해도(= plain) 낸 코인만큼의 기본 보상은 이미 손에 있다.
 *  - 같은 엔트리를 두 번 해소해도 보너스가 두 번 붙지 않는다 (멱등).
 *  - 세션 상태 머신에 새 대기 상태가 생기지 않는다 — 다른 기기에서 동기화된
 *    세션이 그대로 이어진다.
 */
function armSlotChoice(s: CombatSession): CombatSession {
  const idx = s.log.length;
  s.log.push({
    type: "choice",
    prompt: SLOT_EVENT.prompt,
    promptKey: SLOT_EVENT.promptKey,
    options: SLOT_EVENT.options,
    timestamp: Date.now(),
  });
  s.status = "awaitingChoice";
  s.pendingChoiceIndex = idx;
  return s;
}

function newSession(coins: number): CombatSession {
  const s = createSession("fitness", createDefaultHero("ko"), 1);
  s.rewards.coins = coins;
  return s;
}

function lastSlotIndex(s: CombatSession): number {
  for (let i = s.log.length - 1; i >= 0; i -= 1) {
    const e = s.log[i];
    if (e.type === "choiceResult" && e.slot) return i;
  }
  return -1;
}

/**
 * 코인 결과가 확정될 때까지 굴려 (세션, 상자 엔트리 idx) 를 돌려준다.
 * 롤 자체는 세션 RNG 라, 첫 난수를 고정해 원하는 결과를 뽑는다.
 */
function spinCoin(roll: number): { session: CombatSession; idx: number } {
  const s = armSlotChoice(newSession(1000));
  const spy = vi.spyOn(Math, "random");
  spy.mockReturnValueOnce(roll);
  spy.mockReturnValue(0.5);
  const next = resolveChoice(s, 0, { slotSpinsToday: 0, slotBlankStreak: 0 });
  spy.mockRestore();
  return { session: next, idx: lastSlotIndex(next) };
}

/** 원시 표에서 coinSmall(490..684) 에 떨어지는 난수. */
const ROLL_COIN_SMALL = 0.6;
/** 원시 표에서 blank(0..490) 에 떨어지는 난수. */
const ROLL_BLANK = 0.1;

describe("resolveRuneLock — 등급 보너스", () => {
  // 롤을 `Math.random` 스파이로 고정하므로 세션 RNG 는 시드를 물리지 않는다
  //   (`rng()` 는 미설정이면 Math.random 에 위임한다).
  beforeEach(() => resetRng());
  afterEach(() => {
    resetRng();
    vi.restoreAllMocks();
  });

  it("세 등급이 코인 보상에 정확히 배율만큼 얹는다", () => {
    const expected: Record<RuneLockTier, number> = { plain: 100, good: 115, perfect: 130 };
    for (const tier of ["plain", "good", "perfect"] as RuneLockTier[]) {
      const { session, idx } = spinCoin(ROLL_COIN_SMALL);
      const entry = session.log[idx];
      if (entry.type !== "choiceResult" || !entry.slot) throw new Error("상자 결과 없음");
      expect(entry.slot.outcome).toBe("coinSmall");
      const before = session.rewards.coins;
      const after = resolveRuneLock(session, idx, tier);
      const grant = SLOT_GRANTS.coinSmall;
      if (grant.kind !== "coins") throw new Error("코인 지급이 아니다");
      // 차액만 얹는다 — 기본 100 은 이미 지급된 상태다.
      expect(after.rewards.coins - before).toBe(expected[tier] - grant.amount);
      const done = after.log[idx];
      if (done.type !== "choiceResult" || !done.slot) throw new Error("상자 결과 없음");
      expect(done.slot.lockTier).toBe(tier);
      expect(done.effectSummaryData?.coins).toBe(expected[tier]);
    }
  });

  it("plain 은 코인을 한 닢도 바꾸지 않는다 — 조작을 못 해도 손해가 없다", () => {
    const { session, idx } = spinCoin(ROLL_COIN_SMALL);
    const after = resolveRuneLock(session, idx, "plain");
    expect(after.rewards.coins).toBe(session.rewards.coins);
    const done = after.log[idx];
    if (done.type !== "choiceResult" || !done.slot) throw new Error("상자 결과 없음");
    expect(done.slot.lockTier).toBe("plain");
  });

  it("꽝은 등급이 붙어도 그대로 꽝이다 — 0 에 배율을 곱해도 0", () => {
    const { session, idx } = spinCoin(ROLL_BLANK);
    const entry = session.log[idx];
    if (entry.type !== "choiceResult" || !entry.slot) throw new Error("상자 결과 없음");
    expect(entry.slot.outcome).toBe("blank");
    const after = resolveRuneLock(session, idx, "perfect");
    expect(after.rewards.coins).toBe(session.rewards.coins);
    expect(after.rewards.drops).toEqual(session.rewards.drops);
  });

  it("멱등 — 이미 등급이 적힌 엔트리는 두 번째 호출에서 같은 객체를 돌려준다", () => {
    const { session, idx } = spinCoin(ROLL_COIN_SMALL);
    const once = resolveRuneLock(session, idx, "perfect");
    const twice = resolveRuneLock(once, idx, "perfect");
    expect(twice).toBe(once);
    // 다른 등급으로 다시 불러도 마찬가지 — 보너스를 갈아끼울 수 없다.
    expect(resolveRuneLock(once, idx, "good")).toBe(once);
  });

  it("상자 결과가 아닌 인덱스·범위 밖은 무시한다", () => {
    const { session, idx } = spinCoin(ROLL_COIN_SMALL);
    expect(resolveRuneLock(session, -1, "perfect")).toBe(session);
    expect(resolveRuneLock(session, session.log.length + 5, "perfect")).toBe(session);
    expect(resolveRuneLock(session, idx - 1, "perfect")).toBe(session);
  });

  it("이미 정산된 세션에는 붙지 않는다 — 수입이 지갑으로 넘어간 뒤다", () => {
    const { session, idx } = spinCoin(ROLL_COIN_SMALL);
    const completed: CombatSession = { ...session, status: "completed" };
    expect(resolveRuneLock(completed, idx, "perfect")).toBe(completed);
  });

  it("세션 상태 머신을 건드리지 않는다 — 새 대기 상태가 생기지 않는다", () => {
    const { session, idx } = spinCoin(ROLL_COIN_SMALL);
    const after = resolveRuneLock(session, idx, "good");
    expect(after.status).toBe(session.status);
    expect(after.pendingChoiceIndex).toBe(session.pendingChoiceIndex);
    expect(after.pendingMinigame).toBe(session.pendingMinigame);
    expect(after.log.length).toBe(session.log.length);
  });

  it("로그에 실리는 한국어 fallback 에도 도박 어휘가 없다 (2.3.6)", () => {
    // i18n 키가 없는 경로(구버전 저장본·전투 로그 원문)로 화면에 나가는 문자열이다.
    const banned = [/굴림/, /드럼/, /레버/, /손잡이/, /슬롯/, /잭팟/, /대박/, /아깝다/];
    for (const roll of [ROLL_BLANK, ROLL_COIN_SMALL]) {
      const { session, idx } = spinCoin(roll);
      const entry = session.log[idx];
      if (entry.type !== "choiceResult") throw new Error("상자 결과 없음");
      const texts = [
        entry.text,
        entry.resultTextFallback ?? "",
        entry.actionLabelFallback ?? "",
      ];
      for (const text of texts) {
        for (const rx of banned) {
          expect(rx.test(text), `"${text}" 에 ${rx} 가 있다`).toBe(false);
        }
      }
      expect(entry.actionLabelFallback).toBe("자물쇠를 맞춘다");
      // 로그 라벨 키에 {cost} 가 없어야 한다 — 인자 없이 풀리는 자리라 그대로 찍힌다.
      expect(entry.actionLabelKey).toBe("uphero.slot.log.action");
    }
  });

  it("전투 레이어의 차액과 순수 함수의 계산이 같은 값이다", () => {
    for (const tier of ["plain", "good", "perfect"] as RuneLockTier[]) {
      const { session, idx } = spinCoin(ROLL_COIN_SMALL);
      const base = SLOT_GRANTS.coinSmall;
      const bonused = applyRuneLockBonus(base, tier);
      if (base.kind !== "coins" || bonused.kind !== "coins") throw new Error("코인 아님");
      const after = resolveRuneLock(session, idx, tier);
      expect(after.rewards.coins - session.rewards.coins).toBe(
        bonused.amount - base.amount,
      );
    }
  });
});
