import { describe, it, expect } from "vitest";
import {
  RUNE_LOCK_BONUS,
  RUNE_LOCK_INNER_HALF,
  RUNE_LOCK_OUTER_HALF,
  SLOT_GRANTS,
  applyRuneLockBonus,
  runeLockBonusPercent,
  runeLockTier,
  type RuneLockTier,
} from "./upHeroSlot";

/**
 * 룬 자물쇠 — 상자를 여는 짧은 조작의 순수 규칙.
 *
 * 이 파일이 고정하는 계약:
 *  - 등급은 세 개뿐이고 실패 등급이 없다 (빗나가도 plain, 배율 1).
 *  - 배율은 코인에만 붙고 방지권·장비·버프는 개수까지 그대로다.
 *  - 반올림은 JS `Math.round` — iOS `jsRound` 와 같은 규칙 (동치성 fixture 참조).
 */
const TIERS: RuneLockTier[] = ["plain", "good", "perfect"];

describe("runeLockTier — 걸쇠 판정", () => {
  it("안쪽 반폭 안은 perfect, 바깥쪽까지는 good, 그 밖은 plain", () => {
    // 경계값 자체(c ± HALF)는 부동소수 오차가 붙는 위치라 안팎으로 1‰ 씩 비켜 본다.
    const c = 0.5;
    const eps = 0.001;
    expect(runeLockTier(c, c)).toBe("perfect");
    expect(runeLockTier(c + RUNE_LOCK_INNER_HALF - eps, c)).toBe("perfect");
    expect(runeLockTier(c - RUNE_LOCK_INNER_HALF + eps, c)).toBe("perfect");
    expect(runeLockTier(c + RUNE_LOCK_INNER_HALF + eps, c)).toBe("good");
    expect(runeLockTier(c + RUNE_LOCK_OUTER_HALF - eps, c)).toBe("good");
    expect(runeLockTier(c - RUNE_LOCK_OUTER_HALF + eps, c)).toBe("good");
    expect(runeLockTier(c + RUNE_LOCK_OUTER_HALF + eps, c)).toBe("plain");
    expect(runeLockTier(0, c)).toBe("plain");
    expect(runeLockTier(1, c)).toBe("plain");
  });

  it("안쪽이 바깥쪽보다 좁다 — 노려야 최고 등급이 나온다", () => {
    expect(RUNE_LOCK_INNER_HALF).toBeLessThan(RUNE_LOCK_OUTER_HALF);
    expect(RUNE_LOCK_OUTER_HALF).toBeLessThan(0.5);
  });

  it("목표가 트랙 어디에 있든 판정은 거리만 본다 — 좌우 대칭", () => {
    for (const c of [0.19, 0.35, 0.5, 0.72, 0.81]) {
      for (const d of [0, 0.03, 0.08, 0.11, 0.2]) {
        expect(runeLockTier(c + d, c)).toBe(runeLockTier(c - d, c));
      }
    }
  });

  it("실패 등급은 없다 — 어떤 위치에서도 세 등급 중 하나가 나온다", () => {
    for (let m = 0; m <= 1.0001; m += 0.01) {
      expect(TIERS).toContain(runeLockTier(m, 0.5));
    }
  });
});

describe("applyRuneLockBonus — 코인만, 나머지는 그대로", () => {
  it("배율은 1 / 1.15 / 1.3", () => {
    expect(RUNE_LOCK_BONUS.plain).toBe(1);
    expect(RUNE_LOCK_BONUS.good).toBe(1.15);
    expect(RUNE_LOCK_BONUS.perfect).toBe(1.3);
  });

  it("코인 보상 — 세 등급의 반올림 결과 (iOS fixture 와 같은 숫자)", () => {
    const coin = (amount: number, tier: RuneLockTier) => {
      const out = applyRuneLockBonus({ kind: "coins", amount }, tier);
      return out.kind === "coins" ? out.amount : -1;
    };
    // coinSmall 100
    expect(coin(100, "plain")).toBe(100);
    expect(coin(100, "good")).toBe(115);
    expect(coin(100, "perfect")).toBe(130);
    // coinMid 250 — 287.5 는 위로 붙는다 (Math.round = floor(x + 0.5))
    expect(coin(250, "plain")).toBe(250);
    expect(coin(250, "good")).toBe(288);
    expect(coin(250, "perfect")).toBe(325);
    // coinJackpot 700 — 804.9999... 부동소수 오차가 반올림을 넘기지 못한다
    expect(coin(700, "plain")).toBe(700);
    expect(coin(700, "good")).toBe(805);
    expect(coin(700, "perfect")).toBe(910);
  });

  it("표의 코인 결과 셋이 전부 등급을 타고, plain 은 액면 그대로다", () => {
    for (const id of ["coinSmall", "coinMid", "coinJackpot"] as const) {
      const base = SLOT_GRANTS[id];
      expect(base.kind).toBe("coins");
      expect(applyRuneLockBonus(base, "plain")).toBe(base);
      const good = applyRuneLockBonus(base, "good");
      const perfect = applyRuneLockBonus(base, "perfect");
      if (base.kind !== "coins" || good.kind !== "coins" || perfect.kind !== "coins") {
        throw new Error("코인 지급이 아니다");
      }
      expect(good.amount).toBeGreaterThan(base.amount);
      expect(perfect.amount).toBeGreaterThan(good.amount);
    }
  });

  it("방지권·장비·버프·꽝은 등급과 무관하게 그대로다 — 개수까지", () => {
    for (const id of ["blank", "rankProtect", "destroyProtect", "itemBox", "battleBuff"] as const) {
      const base = SLOT_GRANTS[id];
      for (const tier of TIERS) {
        expect(applyRuneLockBonus(base, tier)).toEqual(base);
      }
    }
  });

  it("순수 함수 — 입력 객체를 변형하지 않는다", () => {
    const base = { kind: "coins", amount: 250 } as const;
    const snapshot = { ...base };
    applyRuneLockBonus(base, "perfect");
    expect(base).toEqual(snapshot);
  });

  it("보너스 퍼센트 표시는 0 / 15 / 30", () => {
    expect(runeLockBonusPercent("plain")).toBe(0);
    expect(runeLockBonusPercent("good")).toBe(15);
    expect(runeLockBonusPercent("perfect")).toBe(30);
  });
});
