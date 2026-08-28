import { create } from "zustand";

/**
 * 전역 UI 상태 — 비영속(ephemeral), 세션 단위.
 * 페이지간 네비게이션에도 유지되지만 앱 재시작 시 초기화 (스플래시 재표시 조건).
 *
 * splashActive  — 스플래시가 화면을 덮고 있는 동안 true. nav/header 가 이 플래그로
 *                  렌더링을 차단해 스플래시 뒤에 잔상이 남지 않게 함.
 * splashDismissed — 한 세션에 한 번이라도 스플래시가 끝났는지. 사용자가 /collection
 *                  등으로 이동 후 / 로 돌아와도 page.tsx 가 스플래시를 재시작하지 않음.
 * syncSettled — SyncProvider 초기 동기화(auth 확인 + 클라우드 페치/머지) 완료 여부.
 *                  /flame 체크인 CTA 등 "부트스트랩 전 로컬 fresh 상태에 쓰면 안 되는"
 *                  액션의 게이트 (iOS 는 phase .loading 이 UI 전체를 가리는 것에 대응).
 *                  SyncProvider 만 set 한다.
 * fortuneOverlayOpen — 오늘의 기운 오버레이(뽑기 연출 + 폴라로이드)가 떠 있는 동안 true.
 *                  하단 네비를 숨기는 데 쓴다. 오버레이가 전체 화면을 덮는 연출이라
 *                  네비가 함께 보이면 몰입이 깨진다(던전의 hideForUpHero 와 같은 취급).
 */
interface UIState {
  splashActive: boolean;
  splashDismissed: boolean;
  syncSettled: boolean;
  fortuneOverlayOpen: boolean;
  setSplashActive: (active: boolean) => void;
  dismissSplash: () => void;
  setSyncSettled: (settled: boolean) => void;
  setFortuneOverlayOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  splashActive: false,
  splashDismissed: false,
  syncSettled: false,
  fortuneOverlayOpen: false,
  setSplashActive: (active) => set({ splashActive: active }),
  dismissSplash: () => set({ splashActive: false, splashDismissed: true }),
  setSyncSettled: (settled) => set({ syncSettled: settled }),
  setFortuneOverlayOpen: (open) => set({ fortuneOverlayOpen: open }),
}));
