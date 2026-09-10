'use client';

import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { appAudio } from '@/lib/audio';
import { useGameStore } from '@/store/useGameStore';

export default function AudioProvider() {
  const enabled = useGameStore(s => s.progress.soundEnabled ?? true);
  useEffect(() => { appAudio.setEnabled(enabled); }, [enabled]);
  useEffect(() => {
    let nativeActive = true;
    const unlock = () => appAudio.unlock();
    const visibility = () => appAudio.setActive(nativeActive && !document.hidden);
    const hide = () => appAudio.setActive(false);
    const nativeListeners = Capacitor.isNativePlatform() ? [
        App.addListener('pause', () => {
          nativeActive = false;
          visibility();
        }),
        App.addListener('appStateChange', ({ isActive }) => {
          nativeActive = isActive;
          visibility();
        }),
      ].map(listener => listener.catch(() => null)) : [];
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
      for (const listener of nativeListeners) void listener.then(handle => handle?.remove()).catch(() => {});
      hide();
    };
  }, []);
  return null;
}
