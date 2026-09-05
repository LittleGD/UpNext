import { describe, it, expect, afterEach, vi } from "vitest";
import {
  rollPackTier,
  rollFullPackTier,
  drawTierPack,
  shortfallCompensation,
  PACK_SHORTFALL_COMPENSATION,
  FULL_PACK_CARD_COUNT,
  FULL_PACK_TIER_FLOOR,
  FULL_PACK_COLLECTION_REFUND_COINS,
  COLLECTION_COMPENSATION_BONUS,
} from "./packTier";
import { SHOP_PRICES } from "@/types/uphero";
import type { ChallengeCard } from "@/types/card";

/**
 * Track I (피드백 13) — 풀 카드팩 tier 굴림 / 부족분 보상 계약.
 *
 * - 풀팩은 normal 을 뺀 가중치를 재정규화해 rare 60 / unique 30 / legend 10.
 * - 레벨업 팩(rollPackTier) 은 기존 50/30/15/5 그대로 (회귀).
 * - 부족분 보상 단가는 결제액 비례 (160 * 5 = 800) 와 COLLECTION_COMPENSATION_BONUS 에 묶인다.
 * iOS 미러: UpNextTests/PackTierTests.swift
 */

afterEach(() => {
  vi.restoreAllMocks();
});

function roll(r: number) {
  vi.spyOn(Math, "random").mockReturnValue(r);
}

describe("rollFullPackTier — rare 60 / unique 30 / legend 10", () => {
  it("경계값: 0 → rare, 0.6 → rare(포함), 0.61 → unique, 0.9 → unique, 0.91 → legend, 0.999 → legend", () => {
    roll(0);
    expect(rollFullPackTier()).toBe("rare");
    roll(0.6);
    expect(rollFullPackTier()).toBe("rare");
    roll(0.61);
    expect(rollFullPackTier()).toBe("unique");
    roll(0.9);
    expect(rollFullPackTier()).toBe("unique");
    roll(0.91);
    expect(rollFullPackTier()).toBe("legend");
    roll(0.999);
    expect(rollFullPackTier()).toBe("legend");
  });

  it("1000회 굴려도 normal 은 절대 나오지 않는다", () => {
    for (let i = 0; i < 1000; i++) {
      expect(rollFullPackTier()).not.toBe("normal");
    }
  });

  it("상수: 5장 고정, tier 하한 rare", () => {
    expect(FULL_PACK_CARD_COUNT).toBe(5);
    expect(FULL_PACK_TIER_FLOOR).toBe("rare");
  });
});

describe("rollPackTier — 레벨업 팩 회귀 (normal 50 / rare 30 / unique 15 / legend 5)", () => {
  it("경계값이 그대로다", () => {
    roll(0);
    expect(rollPackTier()).toBe("normal");
    roll(0.5);
    expect(rollPackTier()).toBe("normal");
    roll(0.51);
    expect(rollPackTier()).toBe("rare");
    roll(0.8);
    expect(rollPackTier()).toBe("rare");
    roll(0.81);
    expect(rollPackTier()).toBe("unique");
    roll(0.95);
    expect(rollPackTier()).toBe("unique");
    roll(0.96);
    expect(rollPackTier()).toBe("legend");
  });
});

describe("drawTierPack — 풀 고갈 (shortfall)", () => {
  it("풀에 2장뿐이면 5장 요청해도 2장 (중복 없이) 만 돌려준다", () => {
    const pool = [
      { id: "a", rarity: "rare", category: "fitness" },
      { id: "b", rarity: "normal", category: "fitness" },
    ] as unknown as ChallengeCard[];
    const drawn = drawTierPack(pool, "rare", 5);
    expect(drawn).toHaveLength(2);
    expect(new Set(drawn.map((c) => c.id)).size).toBe(2);
  });
});

describe("shortfallCompensation", () => {
  it("full 3장 부족 → 코인 480, XP 0", () => {
    expect(shortfallCompensation("full", 3)).toEqual({ xp: 0, coins: 480 });
  });
  it("levelUp 2장 부족 → XP 50, 코인 100", () => {
    expect(shortfallCompensation("levelUp", 2)).toEqual({ xp: 50, coins: 100 });
  });
  it("0 또는 음수 부족분은 0", () => {
    expect(shortfallCompensation("full", 0)).toEqual({ xp: 0, coins: 0 });
    expect(shortfallCompensation("full", -2)).toEqual({ xp: 0, coins: 0 });
    expect(shortfallCompensation("levelUp", -1)).toEqual({ xp: 0, coins: 0 });
  });
  it("불변식: full 장당 코인 * 5 = 상점 풀팩 가격, 환급 800, levelUp = COLLECTION_COMPENSATION_BONUS", () => {
    expect(PACK_SHORTFALL_COMPENSATION.full.coins * FULL_PACK_CARD_COUNT).toBe(SHOP_PRICES.cardPackFull);
    expect(FULL_PACK_COLLECTION_REFUND_COINS).toBe(800);
    expect(PACK_SHORTFALL_COMPENSATION.levelUp).toEqual(COLLECTION_COMPENSATION_BONUS);
  });
});
