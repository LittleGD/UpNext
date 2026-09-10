import { beforeEach, describe, expect, it, vi } from "vitest";

const { permission, pending, schedule, capabilities, android } = vi.hoisted(() => ({
  permission: vi.fn(), pending: vi.fn(), schedule: vi.fn(), capabilities: vi.fn(), android: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({ registerPlugin: () => ({ getSetupState: capabilities }) }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: {
  requestPermissions: permission, checkPermissions: permission, getPending: pending,
} }));
vi.mock("@/lib/notificationsNative", () => ({ nativeScheduleDailyReminder: schedule }));
vi.mock("@/lib/platform", () => ({ isAndroidNative: android }));
import { enableNativeDailyReminder, getRetentionSetupCapabilities } from "./retentionSetupNative";

beforeEach(() => {
  vi.clearAllMocks();
  android.mockReturnValue(true);
  permission.mockResolvedValue({ display: "granted" });
  pending.mockResolvedValue({ notifications: [{ id: 1001 }] });
  schedule.mockResolvedValue(undefined);
});

describe("native setup confirmation", () => {
  it("requires the actual pending daily reminder before reporting success", async () => {
    expect(await enableNativeDailyReminder("20:00", "Tomorrow", "en")).toBe(true);
    expect(schedule).toHaveBeenCalledWith("20:00", "Tomorrow", "en");
    pending.mockResolvedValue({ notifications: [] });
    await expect(enableNativeDailyReminder("20:00", "Tomorrow", "en")).rejects.toThrow("registration failed");
  });
  it("does not schedule after a permission denial", async () => {
    permission.mockResolvedValue({ display: "denied" });
    expect(await enableNativeDailyReminder("09:00", "Tomorrow", "ko")).toBe(false);
    expect(schedule).not.toHaveBeenCalled();
  });
  it("surfaces a native scheduling error and rejects invalid time", async () => {
    schedule.mockRejectedValueOnce(new Error("native error"));
    await expect(enableNativeDailyReminder("09:00", "Tomorrow", "ko")).rejects.toThrow("native error");
    await expect(enableNativeDailyReminder("25:00", "Tomorrow", "ko")).rejects.toThrow("Invalid reminder time");
  });
  it("hides unsupported flows in old Android shells and browsers", async () => {
    capabilities.mockRejectedValueOnce(new Error("not implemented"));
    expect(await getRetentionSetupCapabilities()).toBeNull();
    android.mockReturnValue(false);
    expect(await getRetentionSetupCapabilities()).toBeNull();
    expect(capabilities).toHaveBeenCalledTimes(1);
  });
});
