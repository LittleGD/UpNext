import { describe, expect, it, vi } from "vitest";

// Capacitor creates a callable proxy for any property, including `then`.
const { calls, proxy } = vi.hoisted(() => {
  const calls: string[] = [];
  const proxy = new Proxy({}, { get: (_, name: string) => {
    if (name === "then") throw new Error("Native proxies must not be awaited");
    return async () => { calls.push(name); return { ok: true }; };
  } });
  return { calls, proxy };
});
vi.mock("@capacitor/core", () => ({ registerPlugin: () => proxy }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: proxy }));
vi.mock("@/lib/platform", () => ({ isNative: () => true }));
import { nativeScheduleDailyReminder } from "./notificationsNative";
import { endAllChallengeActivities } from "./widget";

describe("Capacitor proxy handoff", () => {
  it("calls native methods directly without treating the plugin as a Promise", async () => {
    await nativeScheduleDailyReminder("20:00", "Tomorrow", "en");
    await endAllChallengeActivities();
    expect(calls).toEqual(["createChannel", "createChannel", "cancel", "schedule", "endAllActivities"]);
  });
});
