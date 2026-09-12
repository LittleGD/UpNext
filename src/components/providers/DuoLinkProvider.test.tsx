import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DuoLinkProvider from "./DuoLinkProvider";
import { readPendingDuoInvite, savePendingDuoInvite } from "@/lib/duoInviteLink";

const bridge = vi.hoisted(() => ({
  push: vi.fn(),
  getLaunchUrl: vi.fn(),
  onURL: null as null | ((event: { url: string }) => void),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: bridge.push }) }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/app", () => ({ App: {
  getLaunchUrl: bridge.getLaunchUrl,
  addListener: vi.fn((_name, callback) => {
    bridge.onURL = callback;
    return Promise.resolve({ remove: vi.fn() });
  }),
} }));
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
}
beforeEach(() => {
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  bridge.push.mockClear();
  bridge.getLaunchUrl.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("native invitation handoff", () => {
  it("restores a newer warm invite instead of Capacitor's stale launch URL", async () => {
    bridge.getLaunchUrl.mockResolvedValue({ url: "https://up-next-phi.vercel.app/i/ABCD23" });
    const first = render(<DuoLinkProvider />);
    await waitFor(() => expect(bridge.push).toHaveBeenLastCalledWith("/i/ABCD23"));
    act(() => bridge.onURL?.({ url: "https://up-next-phi.vercel.app/i/WXYZ23" }));
    expect(readPendingDuoInvite()).toBe("WXYZ23");
    first.unmount();
    bridge.push.mockClear();
    const reloaded = render(<DuoLinkProvider />);
    await waitFor(() => expect(bridge.push).toHaveBeenLastCalledWith("/i/WXYZ23"));
    reloaded.unmount();
    savePendingDuoInvite(null);
    bridge.push.mockClear();
    render(<DuoLinkProvider />);
    await act(async () => {});
    expect(bridge.push).not.toHaveBeenCalled();
  });
  it("lets a new app launch link replace an older saved invitation", async () => {
    savePendingDuoInvite("WXYZ23");
    bridge.getLaunchUrl.mockResolvedValue({ url: "https://up-next-phi.vercel.app/i/ABCD23" });
    render(<DuoLinkProvider />);
    await waitFor(() => expect(bridge.push).toHaveBeenLastCalledWith("/i/ABCD23"));
    expect(readPendingDuoInvite()).toBe("ABCD23");
  });
  it("restores an invitation when opened from the launcher and ignores unrelated URLs", async () => {
    savePendingDuoInvite("ABCD23");
    bridge.getLaunchUrl.mockResolvedValue(undefined);
    render(<DuoLinkProvider />);
    act(() => bridge.onURL?.({ url: "upnext://oauth/callback" }));
    await waitFor(() => expect(bridge.push).toHaveBeenLastCalledWith("/i/ABCD23"));
    expect(readPendingDuoInvite()).toBe("ABCD23");
  });
});
