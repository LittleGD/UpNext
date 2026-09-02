import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createSession, resolveChoice, tickSession } from "./upHeroCombat";
import { setRngSeed, resetRng } from "./upHeroRng";
import { SLOT_EVENT, isSlotEvent } from "@/data/flavor/slot";
import { SLOT_SPIN_COST, SLOT_DAILY_SPIN_CAP } from "./upHeroSlot";
import { createDefaultHero, type CombatSession } from "@/types/uphero";

/** 굴림틀 choice 엔트리를 세션에 꽂고 대기 상태로 만든다. */
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

/** 마지막 choiceResult 엔트리를 꺼낸다. */
function lastResult(s: CombatSession) {
  for (let i = s.log.length - 1; i >= 0; i -= 1) {
    const e = s.log[i];
    if (e.type === "choiceResult") return e;
  }
  return null;
}

describe("굴림틀 — 전투 배선", () => {
  beforeEach(() => setRngSeed(12345));
  afterEach(() => resetRng());

  it("이벤트 데이터의 첫 선택지가 spinSlot, 비용은 상수와 일치", () => {
    expect(isSlotEvent(SLOT_EVENT)).toBe(true);
    const spin = SLOT_EVENT.options[0];
    expect(spin.effect).toEqual({ kind: "spinSlot", cost: SLOT_SPIN_COST });
    // resultText 가 비어 있어야 일반 결과 모달이 중복으로 뜨지 않는다.
    expect(spin.resultText).toBeUndefined();
  });

  it("굴리면 비용이 빠지고 결과 payload 가 로그에 남는다", () => {
    const s = resolveChoice(armSlotChoice(newSession(500)), 0);
    const entry = lastResult(s);
    expect(entry?.slot).toBeDefined();
    expect(entry?.slot?.cost).toBe(SLOT_SPIN_COST);
    expect(entry?.slot?.symbols).toHaveLength(3);
    // 오늘 굴림 횟수는 세션이 갖지 않는다 — 스토어(shopDaily.slotSpins)가 센다.
    expect("slotSpins" in s).toBe(false);
    // 순수 손실이거나 (꽝) 보상이 얹힌 값이거나 — 어느 쪽이든 비용은 빠졌다.
    expect(s.rewards.coins).toBeLessThanOrEqual(500);
  });

  it("표시 심볼은 결과와 모순되지 않는다 — 꽝은 셋이 다 같을 수 없고(near-miss 허용), 보상은 셋 다 같다", () => {
    for (let seed = 1; seed <= 120; seed += 1) {
      setRngSeed(seed);
      const s = resolveChoice(armSlotChoice(newSession(500)), 0);
      const slot = lastResult(s)?.slot;
      if (!slot) throw new Error("missing slot payload");
      const distinct = new Set(slot.symbols).size;
      // near-miss(두 개 동일 + 하나 다름)는 꽝 확정 뒤의 표시 선택이라 허용된다 (upHeroSlot.renderSymbols).
      if (slot.outcome === "blank") expect(distinct).toBeGreaterThanOrEqual(2);
      else expect(distinct).toBe(1);
    }
  });

  it("코인이 모자라면 굴림 자체가 없다 — 잔액도 횟수도 그대로", () => {
    const s = resolveChoice(armSlotChoice(newSession(SLOT_SPIN_COST - 1)), 0);
    expect(s.rewards.coins).toBe(SLOT_SPIN_COST - 1);
    expect(lastResult(s)?.slot).toBeUndefined();
    expect(lastResult(s)?.resultTextKey).toBe("uphero.slot.result.unavailable");
  });

  it("오늘 굴림 횟수(ctx.slotSpinsToday)가 상한이면 드럼이 돌지 않는다 — 잔액 그대로", () => {
    const blocked = resolveChoice(armSlotChoice(newSession(100_000)), 0, {
      slotSpinsToday: SLOT_DAILY_SPIN_CAP,
    });
    expect(lastResult(blocked)?.slot).toBeUndefined();
    expect(lastResult(blocked)?.resultTextKey).toBe("uphero.slot.result.unavailable");
    expect(blocked.rewards.coins).toBe(100_000);
  });

  it("상한 직전(cap - 1)이면 아직 돈다 — 하루 세 번째 굴림까지 허용", () => {
    const s = resolveChoice(armSlotChoice(newSession(100_000)), 0, {
      slotSpinsToday: SLOT_DAILY_SPIN_CAP - 1,
    });
    expect(lastResult(s)?.slot).toBeDefined();
    expect(s.rewards.coins).toBeLessThanOrEqual(100_000);
  });

  it("보상은 코인·방지권·장비·버프 중 하나로 실제 배선된다", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 600 && seen.size < 4; seed += 1) {
      setRngSeed(seed);
      const before = newSession(500);
      const beforeCoins = before.rewards.coins;
      const s = resolveChoice(armSlotChoice(before), 0);
      const slot = lastResult(s)?.slot;
      if (!slot) continue;
      if (s.rewards.coins > beforeCoins - SLOT_SPIN_COST) seen.add("coins");
      if ((s.rewards.destroyGuards ?? 0) > 0) seen.add("destroyGuards");
      if ((s.rewards.downGuards ?? 0) > 0) seen.add("downGuards");
      if (s.rewards.drops.length > 0) seen.add("drops");
      if (s.combatBuff) seen.add("buff");
    }
    // 코인·방지권 두 종류·장비·버프 중 최소 4가지 경로가 실제로 관측되어야 한다.
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it("전투 버프는 세션에 실리고 잔여 횟수가 3", () => {
    // battleBuff 가 나오는 시드를 찾아 고정 검증.
    let hit: CombatSession | null = null;
    for (let seed = 1; seed <= 4000 && !hit; seed += 1) {
      setRngSeed(seed);
      const s = resolveChoice(armSlotChoice(newSession(500)), 0);
      if (lastResult(s)?.slot?.outcome === "battleBuff") hit = s;
    }
    expect(hit).not.toBeNull();
    expect(hit!.combatBuff).toEqual({ pct: 10, battlesLeft: 3 });
  });

  it("createSession 이 넘겨받은 버프를 세션으로 들여온다 (소진된 것은 버린다)", () => {
    const carried = createSession("fitness", createDefaultHero("ko"), 1, undefined, {
      combatBuff: { pct: 10, battlesLeft: 2 },
    });
    expect(carried.combatBuff).toEqual({ pct: 10, battlesLeft: 2 });

    const spent = createSession("fitness", createDefaultHero("ko"), 1, undefined, {
      combatBuff: { pct: 10, battlesLeft: 0 },
    });
    expect(spent.combatBuff).toBeUndefined();
  });

  it("전투가 끝날 때마다 버프 잔여 횟수가 정확히 1씩 준다", () => {
    // setRngSeed 만으로는 전투가 결정론이 되지 않는다 — 몬스터 추첨
    // (upHeroMonsters.rollMonster) 과 이벤트 추첨 (upHeroFlavor.pickEvent) 이
    // 아직 upHeroRng.rng() 가 아니라 Math.random() 을 직접 쓴다. 그래서 한 세션이
    // 3처치에 닿기 전에 끝나는 경우가 실측 10% (20회 중 2회) 있었다.
    //
    // 검증하려는 계약은 "처치할 때마다 정확히 1씩 준다" 이지 "한 세션에 3처치가
    // 난다" 가 아니므로, 세션이 모자라면 다음 세션을 이어 붙여 감소분을 계속
    // 관찰한다. 시드 하나에 기대던 우연을 걷어내되 단조 감소 계약은 그대로 건다.
    setRngSeed(2026);
    const mkSession = () =>
      createSession("fitness", createDefaultHero("ko"), 1, undefined, {
        // 이어 붙일 때도 "남은 횟수" 를 그대로 물려준다.
        combatBuff: { pct: 10, battlesLeft: 3 - victories },
      });
    let victories = 0;
    let s = mkSession();
    for (let i = 0; i < 20000 && victories < 3; i += 1) {
      // encounter choice ("싸운다") 가 걸리면 0번 선택지로 진행.
      if (s.status === "awaitingChoice") {
        s = resolveChoice(s, 0);
        continue;
      }
      if (s.status !== "active") {
        s = mkSession(); // 세션이 끝났으면 남은 횟수를 물려 새 세션으로 잇는다.
        continue;
      }
      const before = s.log.length;
      s = tickSession(s);
      for (let j = before; j < s.log.length; j += 1) {
        if (s.log[j].type === "victory") {
          victories += 1;
          // 처치 직후 잔여 횟수는 3 - victories. 0 이 되면 껍데기를 남기지 않는다.
          const left = 3 - victories;
          if (left > 0) expect(s.combatBuff?.battlesLeft).toBe(left);
          else expect(s.combatBuff).toBeUndefined();
        }
      }
    }
    expect(victories).toBe(3);
  });

  it("굴림틀은 돌릴 수 없을 때 이벤트 후보에서 빠진다", async () => {
    const { pickEvent } = await import("@/data/upHeroFlavor");
    for (let i = 0; i < 400; i += 1) {
      const ev = pickEvent({ dungeonId: "fitness", slotAvailable: false });
      expect(isSlotEvent(ev)).toBe(false);
    }
  });

  it("돌릴 수 있으면 굴림틀도 후보에 든다", async () => {
    const { pickEvent } = await import("@/data/upHeroFlavor");
    let seen = 0;
    for (let i = 0; i < 2000; i += 1) {
      if (isSlotEvent(pickEvent({ dungeonId: "fitness", slotAvailable: true })))
        seen += 1;
    }
    expect(seen).toBeGreaterThan(0);
  });
});
