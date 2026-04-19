"use client";

import { create } from "zustand";
import { isFirebaseConfigured, getFirebase } from "@/lib/firebase";
import type { AuthUser } from "@/types/auth";

/** Sign-in 실패 분류 — UI 는 i18n key 로 renderer 가 t() 호출. */
export type SignInErrorKind =
  | "popup-blocked"
  | "unauthorized-domain"
  | "not-allowed"
  | "generic";

export interface SignInError {
  kind: SignInErrorKind;
  /** firebase error code (for "generic" fallback — Korean literal 제거). */
  code?: string;
}

interface AuthState {
  user: AuthUser | null;
  isSignedIn: boolean;
  isLoading: boolean;
  isSigningIn: boolean;
  signInError: SignInError | null;

  setUser: (user: AuthUser | null) => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isSignedIn: false,
  isLoading: true,
  isSigningIn: false,
  signInError: null,

  setUser: (user) =>
    set({
      user,
      isSignedIn: user !== null,
      isLoading: false,
    }),

  signInWithGoogle: async () => {
    if (!isFirebaseConfigured) return;
    set({ isSigningIn: true, signInError: null });
    try {
      const { auth, googleProvider } = await getFirebase();
      const { signInWithPopup } = await import("firebase/auth");
      await signInWithPopup(auth, googleProvider);
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      const message = (error as { message?: string })?.message;
      console.error("Google sign-in failed:", code, message, error);

      if (code === "auth/popup-blocked") {
        set({ signInError: { kind: "popup-blocked" } });
      } else if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        // 사용자가 직접 닫은 경우 — 에러 표시 불필요
      } else if (code === "auth/unauthorized-domain") {
        set({ signInError: { kind: "unauthorized-domain" } });
      } else if (code === "auth/operation-not-allowed") {
        set({ signInError: { kind: "not-allowed" } });
      } else {
        set({ signInError: { kind: "generic", code: code || "unknown" } });
      }
    } finally {
      set({ isSigningIn: false });
    }
  },

  signOut: async () => {
    if (!isFirebaseConfigured) return;
    try {
      // Phase 11c R4 보안 수정 — Firebase Auth session 만 지우면 localStorage /
      //   Zustand / IndexedDB 에 이전 유저의 데이터가 남아 다음 로그인 유저에게 노출.
      //   SyncProvider 는 로컬 데이터가 cloud 보다 최신이면 자동 upload → 다른
      //   유저 Firestore doc 을 덮어쓰는 cross-account write 위험. 순서 중요:
      //     1) localStorage + IndexedDB wipe (sync upload trigger 차단 위해 먼저)
      //     2) Zustand in-memory reset (Phase 14 — reload fallback 이중 방어)
      //     3) Firebase Auth signOut (SyncProvider 가 listener stop)
      //     4) reload (clean slate — 실패해도 2) 로 이미 UI 는 안전)
      const { clearAllAppStorage } = await import("@/lib/storage");
      const { clearAllPhotoStorage } = await import("@/lib/photoStorage");
      clearAllAppStorage();
      await clearAllPhotoStorage();

      // Phase 14 security — in-memory Zustand singleton 명시적 reset. reload 가
      //   SW / navigation 인터럽트로 실패해도 이전 유저 state 가 UI 에 드러나지
      //   않도록. 동적 import 로 순환 의존 회피.
      const [gameStoreMod, growthStoreMod, upHeroStoreMod] = await Promise.all([
        import("@/store/useGameStore"),
        import("@/store/useGrowthStore"),
        import("@/store/useUpHeroStore"),
      ]);
      gameStoreMod.useGameStore.getState().resetForSignOut();
      growthStoreMod.useGrowthStore.getState().resetForSignOut();
      upHeroStoreMod.useUpHeroStore.getState().resetForSignOut();

      const { auth } = await getFirebase();
      const { signOut: firebaseSignOut } = await import("firebase/auth");
      await firebaseSignOut(auth);

      // reload — 위 reset 으로 이미 안전하지만 clean slate + 모든 effect
      //   재초기화를 위해 여전히 수행. 실패해도 보안 속성은 유지.
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    } catch (error) {
      console.error("Sign-out failed:", error);
    }
  },
}));
