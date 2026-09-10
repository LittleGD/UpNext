'use client';

import { useEffect } from 'react';
import { appAudio } from '@/lib/audio';
import { useGameStore } from '@/store/useGameStore';

export default function AudioProvider() {
  const enabled = useGameStore(s => s.progress.soundEnabled ?? true);
  useEffect(() => { appAudio.setEnabled(enabled); }, [enabled]);
  useEffect(() => {
    const unlock = () => appAudio.unlock();
    const visibility = () => appAudio.setActive(!document.hidden);
    const hide = () => appAudio.setActive(false);
    visibility();
    document.addEventListener('pointerdown', unlock, { capture: true });
    document.addEventListener('keydown', unlock, { capture: true });
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', visibility);
    return () => {
      document.removeEventListener('pointerdown', unlock, { capture: true });
      document.removeEventListener('keydown', unlock, { capture: true });
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', visibility);
      hide();
    };
  }, []);
  return null;
}
