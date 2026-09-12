import { describe, expect, it, vi } from "vitest";
import {
  duoInviteURL,
  parseDuoInviteURL,
  duoInviteCode,
  readPendingDuoInvite,
  savePendingDuoInvite,
} from "./duoInviteLink";
describe("duo invitation URLs", () => {
  it("uses the same code for web and app handoff", () => {
    expect(duoInviteURL("abcd23")).toBe(
      "https://up-next-phi.vercel.app/i/ABCD23",
    );
    for (const url of [
      "https://up-next-phi.vercel.app/i/abcd23",
      "upnext://invite/ABCD23",
    ])
      expect(parseDuoInviteURL(url)).toBe("ABCD23");
  });
  it("rejects unrelated hosts, paths, schemes, credentials and malformed codes", () => {
    for (const url of [
      "https://up-next-phi.vercel.app.evil.com/i/ABCD23",
      "http://up-next-phi.vercel.app/i/ABCD23",
      "https://x@up-next-phi.vercel.app/i/ABCD23",
      "https://up-next-phi.vercel.app/i/ABCD23/extra",
      "upnext://daily/ABCD23",
      "upnext://invite/ABC123",
      "upnext://invite:90/ABCD23",
      "javascript:alert(1)",
    ])
      expect(parseDuoInviteURL(url)).toBeNull();
    expect(duoInviteCode("../foo")).toBeNull();
    expect(() => duoInviteURL("bad")).toThrow();
  });
  it("keeps the pending invite across sign-in and clears it only on completion or dismissal", () => {
    const items = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
      removeItem: (key: string) => items.delete(key),
    });
    savePendingDuoInvite("ABCD23");
    expect(readPendingDuoInvite()).toBe("ABCD23");
    savePendingDuoInvite(null);
    expect(readPendingDuoInvite()).toBeNull();
    vi.unstubAllGlobals();
  });
});
