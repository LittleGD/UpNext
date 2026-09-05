import { describe, it, expect } from "vitest";
import { BOSS_FRAMES, getMonsterFrames } from "./bossSprites";
import { FRAMES } from "./monsterFrames";
import { ALL_MONSTER_TEMPLATES } from "@/data/upHeroMonsters";

/**
 * Phase 6-E (Track E, 피드백 29) — 보스 스프라이트 카탈로그 형태/유일성.
 * iOS BossSprites.swift 가 같은 리터럴을 복사하므로 여기서 잡히면 양쪽 다 틀린 것.
 */
const bossIds = ALL_MONSTER_TEMPLATES.filter((t) => t.isBoss).map((t) => t.id);

describe("BOSS_FRAMES", () => {
  it("보스 템플릿 24개와 키가 정확히 일치한다", () => {
    expect(bossIds.length).toBe(24);
    expect(Object.keys(BOSS_FRAMES).sort()).toEqual([...bossIds].sort());
  });

  it("각 항목은 2프레임 × 12행 × 12자, 문자는 '#'/'.' 뿐", () => {
    for (const [id, frames] of Object.entries(BOSS_FRAMES)) {
      expect(frames.length, id).toBe(2);
      for (const frame of frames) {
        expect(frame.length, id).toBe(12);
        for (const row of frame) {
          expect(row.length, `${id}: "${row}"`).toBe(12);
          expect(/^[#.]{12}$/.test(row), `${id}: "${row}"`).toBe(true);
        }
      }
    }
  });

  it("프레임 1 과 2 는 다르다 (idle 애니메이션)", () => {
    for (const [id, [f1, f2]] of Object.entries(BOSS_FRAMES)) {
      expect(f1.join("|") !== f2.join("|"), id).toBe(true);
    }
  });

  it("모든 보스의 프레임 1 은 서로 다르고 kind large 폴백과도 다르다", () => {
    const seen = new Map<string, string>();
    const large = FRAMES.large[0].join("|");
    for (const [id, [f1]] of Object.entries(BOSS_FRAMES)) {
      const key = f1.join("|");
      expect(seen.get(key), `${id} duplicates ${seen.get(key)}`).toBeUndefined();
      seen.set(key, id);
      expect(key !== large, `${id} equals FRAMES.large`).toBe(true);
    }
  });

  it("프레임마다 최소 24 픽셀은 채워져 있다 (빈 실루엣 방지)", () => {
    for (const [id, frames] of Object.entries(BOSS_FRAMES)) {
      for (const frame of frames) {
        const filled = frame.join("").split("#").length - 1;
        expect(filled, id).toBeGreaterThanOrEqual(24);
      }
    }
  });
});

describe("getMonsterFrames", () => {
  it("templateId 가 없거나 카탈로그에 없으면 kind 프레임", () => {
    expect(getMonsterFrames("large", undefined)).toBe(FRAMES.large);
    expect(getMonsterFrames("beast", "fit_wolf")).toBe(FRAMES.beast);
  });

  it("보스 templateId 는 보스 프레임", () => {
    expect(getMonsterFrames("large", "boss_mountain_wolf")).toBe(
      BOSS_FRAMES.boss_mountain_wolf,
    );
  });
});
