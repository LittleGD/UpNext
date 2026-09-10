"use client";

import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useGameStore } from "@/store/useGameStore";
import { useGrowthStore } from "@/store/useGrowthStore";
import { useUIStore } from "@/store/useUIStore";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useRetentionSetupStore, type SetupKind } from "@/store/useRetentionSetupStore";
import { getRetentionSetupCapabilities, hasNativeDailyReminder } from "@/lib/retentionSetupNative";
import PixelIcon from "@/components/icons/PixelIcon";
import RetentionSetupModal from "@/components/RetentionSetupModal";
import copy from "@/data/retentionSetupCopy.json";

export default function RetentionSetupProvider({ blocked }: { blocked: boolean }) {
  const kind = useRetentionSetupStore(s => s.queue[0]);
  const manual = useRetentionSetupStore(s => s.manual);
  const loaded = useGameStore(s => s.isLoaded && s.hasCompletedOnboarding);
  const pack = useGameStore(s => s.isOpeningPack);
  const capture = useGrowthStore(s => s.pendingCaptureCardId);
  const splash = useUIStore(s => s.splashActive || s.fortuneOverlayOpen);
  const dungeon = useUpHeroStore(s => s.currentSession !== null || s.pendingClassChoice !== null || s.pendingHeroLevelUp != null || s.pendingWelcomeGrant != null);
  const [presentation, setPresentation] = useState<{ kind: SetupKind; canPin: boolean } | null>(null);
  const paused = blocked || !loaded || pack || !!capture || splash || dungeon;

  useEffect(() => {
    if (!kind || paused) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function present() {
      // Local completion/reward dialogs own focus until they close.
      if (document.querySelector('[role="dialog"]:not([data-testid="retention-setup"])')) {
        timer = setTimeout(present, 350);
        return;
      }
      const capabilities = await getRetentionSetupCapabilities();
      if (cancelled) return;
      const state = useRetentionSetupStore.getState();
      if (!capabilities) { state.finish(kind); return; }
      let configured = capabilities.installed;
      if (kind === "notifications") {
        try { configured = await hasNativeDailyReminder(); }
        catch { configured = false; }
      }
      if (cancelled) return;
      if (manual !== kind && configured && state.awaitingExternal !== kind) {
        state.finish(kind);
      } else {
        setPresentation({ kind, canPin: capabilities.canPin });
      }
    }
    timer = setTimeout(present, 850);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [kind, manual, paused]);

  return <AnimatePresence>{!paused && kind && presentation?.kind === kind &&
    <RetentionSetupModal key={kind} kind={kind} canPin={presentation.canPin} />
  }</AnimatePresence>;
}

export function RetentionSetupSettings() {
  const language = useGameStore(s => s.progress.language);
  const [supported, setSupported] = useState(false);
  useEffect(() => { void getRetentionSetupCapabilities().then(value => setSupported(!!value)); }, []);
  if (!supported) return null;
  return <section className="overflow-hidden rounded-xl bg-bg-surface">
    {([['notifications', '알림 설정 가이드'], ['widget', '홈 화면 위젯 가이드']] as const).map(([kind, key]) =>
      <button key={kind} onClick={() => useRetentionSetupStore.getState().open(kind)} className="flex min-h-[52px] w-full items-center justify-between px-4 py-3.5 text-left typo-body text-text-primary">
        {copy[key][language]}<PixelIcon name="ChevronRight" size={20} color="var(--text-secondary)" />
      </button>)}
  </section>;
}
