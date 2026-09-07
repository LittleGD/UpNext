import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EVENT_POOL } from "@/data/upHeroFlavor";
import { createDefaultHero, type ChoiceEffect } from "@/types/uphero";
import { createSession, resolveChoice, resolveMinigame } from "./upHeroCombat";
import { calculateIdleReward } from "./idleAccrual";

describe("hero XP balance", () => {
  it.each([
    { floor: 1, ng: 0, xpScale: 26 / 15 },
    { floor: 50, ng: 0, xpScale: 320 / 15 },
    { floor: 50, ng: 2, xpScale: 576 / 15 },
  ])("pays each minigame once with existing floor $floor / NG+ $ng scaling", ({ floor, ng, xpScale }) => {
    let count = 0;
    for (const dungeon of Object.values(EVENT_POOL)) {
      for (const event of dungeon) {
        for (const option of event.options) {
          if (option.effect?.kind !== "startMinigame") continue;
          const s = createSession("fitness", createDefaultHero("ko"), floor, undefined, { ngPlusLevel: ng });
          s.pendingChoiceIndex = s.log.length;
          s.status = "awaitingChoice";
          s.log.push({ type: "choice", prompt: event.prompt, options: [option], timestamp: 0 });
          const playing = resolveChoice(s, 0);
          expect(playing.status).toBe("awaitingMinigame");
          expect(playing.rewards.xp).toBe(0);
          const result = resolveMinigame(playing, true);
          const reward = option.effect.successEffects.find(e => e.kind === "reward") as Extract<ChoiceEffect, { kind: "reward" }>;
          const baseXp = reward.xp ?? 0;
          expect(baseXp).toBeGreaterThanOrEqual(18);
          expect(baseXp).toBeLessThanOrEqual(36);
          // Basic rewards were reduced to 40%; existing floor/NG+ scaling still applies once.
          const xp = Math.round(baseXp * xpScale);
          const previousXp = Math.round(baseXp * 2.5 * xpScale);
          expect(xp / previousXp).toBeCloseTo(0.4, 1);
          expect(result.rewards.xp).toBe(xp);
          const log = [...result.log].reverse().find(entry => entry.type === "choiceResult");
          expect(log?.type === "choiceResult" && log.effectSummaryData?.xp).toBe(xp);
          expect(resolveMinigame(result, true).rewards.xp).toBe(xp);
          expect(resolveMinigame(playing, false).rewards.xp).toBe(0);
          count++;
        }
      }
    }
    expect(count).toBe(30);
  });

  it("ships the same dungeon rewards in the iOS bundle", () => {
    const bundle = JSON.parse(readFileSync("upnext-ios/UpNext/UpNext/Flavor.json", "utf8"));
    expect(bundle.eventPool).toEqual(JSON.parse(JSON.stringify(EVENT_POOL)));
  });

  it("halves idle XP while retaining coins, the 8-hour cap and minimum wait", () => {
    expect(calculateIdleReward(4 * 60_000, 1)).toBeNull();
    expect(calculateIdleReward(8 * 60 * 60_000, 1)).toMatchObject({ xp: 120, coins: 144 });
    expect(calculateIdleReward(24 * 60 * 60_000, 1)).toMatchObject({ xp: 120, elapsedMin: 480 });
    expect(calculateIdleReward(8 * 60 * 60_000, 10)).toMatchObject({ xp: 174, coins: 209 });
  });
});
