import { useCallback } from "react";
import { useGameStore } from "@/store/useGameStore";
import { playSound as playSoundLib, type SoundName } from "@/lib/sounds";

export function useSound() {
  const soundEnabled = useGameStore((s) => s.progress.soundEnabled ?? true);

  const play = useCallback(
    (name: SoundName) => {
      if (soundEnabled) playSoundLib(name);
    },
    [soundEnabled]
  );

  return { play };
}
