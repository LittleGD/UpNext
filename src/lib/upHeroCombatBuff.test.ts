import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Phase 15 통합 — 굴림틀 전투 버프 `pct` 단위가 **모든 층위에서 하나**임을 못박는다.
 *
 * 왜 이 파일이 따로 있나: 세션 층위 테스트(`upHeroSlotCombat.test.ts`)와 상태
 * 층위 테스트(`useUpHeroStore.test.ts`)는 각각 자기 층위 안에서만 일관되면
 * 통과한다. 그래서 두 층위가 **서로 다른 단위**를 써도 양쪽 다 초록불이 뜬다 —
 * 실제로 한동안 그랬다. 세션은 퍼센트 포인트(10 = +10%)로, 상태·클라우드는
 * 비율([0,1] 클램프)로 읽는 바람에, 굴림틀이 준 +10% 가 탐험을 한 번 넘길
 * 때마다 pct 10 → 1 로 접혀 **+1%** 가 됐다.
 *
 * 그 이음매를 지키는 게 이 파일의 전부다. 층위를 건너는 경로만 본다.
 */

vi.mock("@/lib/storage", () => ({
  saveToStorage: vi.fn(),
  loadFromStorage: vi.fn(() => null),
  removeFromStorage: vi.fn(),
  clearAllAppStorage: vi.fn(),
}));

import { createSession } from "./upHeroCombat";
import { normalizeUpHeroState } from "./sync";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { createDefaultHero } from "@/types/uphero";
import { SLOT_GRANTS } from "./upHeroSlot";

/** 굴림틀이 실제로 거는 값. 이 숫자가 모든 층위를 그대로 통과해야 한다. */
const GRANT = SLOT_GRANTS.battleBuff;
const PCT = GRANT.kind === "combatBuff" ? GRANT.pct : 0;
const BATTLES = GRANT.kind === "combatBuff" ? GRANT.battles : 0;

/** 전투 계산(`sessionStats`)이 쓰는 배율 식. 여기서만 재현한다. */
const multiplierOf = (pct: number) => 1 + pct / 100;

describe("전투 버프 pct — 층위를 건너도 단위가 하나다", () => {
  beforeEach(() => {
    useUpHeroStore.setState({ combatBuff: undefined });
  });

  it("굴림틀 보상표의 pct 는 퍼센트 포인트이고 +10% 를 뜻한다", () => {
    expect(PCT).toBe(10);
    expect(BATTLES).toBe(3);
    expect(multiplierOf(PCT)).toBeCloseTo(1.1, 10);
  });

  it("상태 층위가 굴림틀 값을 접지 않는다", () => {
    useUpHeroStore.getState().grantCombatBuff(PCT, BATTLES);
    // 예전 상한 Math.min(1, pct) 는 여기서 10 을 1 로 만들었다.
    expect(useUpHeroStore.getState().combatBuff).toEqual({
      pct: PCT,
      battlesLeft: BATTLES,
    });
  });

  it("다음 탐험이 이어받은 버프가 여전히 +10% 다", () => {
    useUpHeroStore.getState().grantCombatBuff(PCT, BATTLES);
    const carried = createSession("fitness", createDefaultHero("ko"), 1, undefined, {
      combatBuff: useUpHeroStore.getState().combatBuff,
    });
    expect(carried.combatBuff).toEqual({ pct: PCT, battlesLeft: BATTLES });
    // 이 배율이 1.01 로 떨어지는 게 원래 버그였다.
    expect(multiplierOf(carried.combatBuff!.pct)).toBeCloseTo(1.1, 10);
  });

  it("클라우드 왕복을 거쳐도 +10% 그대로다", () => {
    const wire = normalizeUpHeroState({
      combatBuff: { pct: PCT, battlesLeft: BATTLES },
    }).combatBuff;
    expect(wire).toEqual({ pct: PCT, battlesLeft: BATTLES });

    const backInSession = createSession(
      "fitness",
      createDefaultHero("ko"),
      1,
      undefined,
      { combatBuff: wire },
    );
    expect(multiplierOf(backInSession.combatBuff!.pct)).toBeCloseTo(1.1, 10);
  });

  it("손상된 과대 값만 상한(배율 2배)에 걸린다", () => {
    useUpHeroStore.getState().grantCombatBuff(9999, 3);
    const buff = useUpHeroStore.getState().combatBuff!;
    expect(buff.pct).toBe(100);
    expect(multiplierOf(buff.pct)).toBe(2);
  });
});
