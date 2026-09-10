import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AudioProvider from './AudioProvider';

const mocks = vi.hoisted(() => ({
  listener: null as null | ((state: { isActive: boolean }) => void),
  pause: null as null | (() => void),
  remove: vi.fn(),
  setActive: vi.fn(),
  setEnabled: vi.fn(),
  unlock: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(async (event, listener) => {
  if (event === 'pause') mocks.pause = listener;
  else mocks.listener = listener;
  return { remove: mocks.remove };
}) } }));
vi.mock('@/lib/audio', () => ({ appAudio: mocks }));
vi.mock('@/store/useGameStore', () => ({ useGameStore: () => true }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('resumes after native foreground even when WebView visibility does not change', async () => {
  const { unmount } = render(<AudioProvider />);
  expect(document.hidden).toBe(false);
  act(() => mocks.pause?.());
  expect(mocks.setActive).toHaveBeenLastCalledWith(false);
  act(() => window.dispatchEvent(new Event('pageshow')));
  expect(mocks.setActive).toHaveBeenLastCalledWith(false);
  act(() => mocks.listener?.({ isActive: true }));
  expect(mocks.setActive).toHaveBeenLastCalledWith(true);
  unmount();
  await act(async () => {});
  expect(mocks.remove).toHaveBeenCalledTimes(2);
  expect(mocks.setActive).toHaveBeenLastCalledWith(false);
});
