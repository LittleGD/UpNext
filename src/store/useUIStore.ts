import { create } from "zustand";

/**
 * 전역 UI 상태 — 비영속(ephemeral), 세션 단위.
 * 페이지간 네비게이션에도 유지되지만 앱 재시작 시 초기화 (스플래시 재표시 조건).
 *
 * splashActive  — 스플래시가 화면을 덮고 있는 동안 true. nav/header 가 이 플래그로
 *                  렌더링을 차단해 스플래시 뒤에 잔상이 남지 않게 함.
 * splashDismissed — 한 세션에 한 번이라도 스플래시가 끝났는지. 사용자가 /collection
 *                  등으로 이동 후 / 로 돌아와도 page.tsx 가 스플래시를 재시작하지 않음.
 */
interface UIState {
  splashActive: boolean;
  splashDismissed: boolean;
  setSplashActive: (active: boolean) => void;
  dismissSplash: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  splashActive: false,
  splashDismissed: false,
  setSplashActive: (active) => set({ splashActive: active }),
  dismissSplash: () => set({ splashActive: false, splashDismissed: true }),
}));
