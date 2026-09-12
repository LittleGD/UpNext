import { appAudio } from "@/lib/audio";
import { useCallback } from "react";
import { useGameStore } from "@/store/useGameStore";
import { playSound as playSoundLib, triggerHaptic, type SoundName } from "@/lib/sounds";

export function useSound() {
  const soundEnabled = useGameStore((s) => s.progress.soundEnabled ?? true);
  const hapticEnabled = useGameStore((s) => s.progress.hapticEnabled ?? true);

  const play = useCallback(
    (name: SoundName) => {
      if (soundEnabled) playSoundLib(name);
      if (hapticEnabled) triggerHaptic(name);
    },
    [soundEnabled, hapticEnabled]
  );

  const startCardShuffle = useCallback(() => {
    if (soundEnabled) {
      appAudio.unlock();
      appAudio.startCardShuffle();
    }
    if (hapticEnabled) triggerHaptic("chargeUp");
  }, [soundEnabled, hapticEnabled]);
  const stopCardShuffle = useCallback(() => appAudio.stopCardShuffle(), []);

  return { play, startCardShuffle, stopCardShuffle };
}
