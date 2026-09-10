import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isAndroidNative } from "@/lib/platform";

export type SetupKind = "notifications" | "widget";
interface RetentionSetupState {
  queue: SetupKind[];
  seen: SetupKind[];
  manual: SetupKind | null;
  time: string | null;
  step: number;
  awaitingExternal: SetupKind | null;
  recordCompletion(total: number): void;
  open(kind: SetupKind): void;
  finish(kind: SetupKind): void;
  draft(values: Partial<Pick<RetentionSetupState, "time" | "step" | "awaitingExternal">>): void;
}

/** Device setup is local. Cloud hydration and XP rewards never enqueue prompts. */
export const useRetentionSetupStore = create<RetentionSetupState>()(persist((set, get) => ({
  queue: [], seen: [], manual: null, time: null, step: 0, awaitingExternal: null,
  recordCompletion(total) {
    if (!isAndroidNative()) return;
    const kind = total === 1 ? "notifications" : total === 2 ? "widget" : null;
    if (!kind || get().seen.includes(kind)) return;
    set({ seen: [...get().seen, kind], queue: [...get().queue, kind] });
  },
  open(kind) {
    set({ manual: kind, queue: get().queue.includes(kind) ? get().queue : [...get().queue, kind] });
  },
  finish(kind) {
    set({ queue: get().queue.filter(value => value !== kind), manual: null,
      time: null, step: 0, awaitingExternal: null });
  },
  draft(values) { set(values); },
}), { name: "upnext-retention-setup-v1" }));
