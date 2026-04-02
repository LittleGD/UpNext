"use client";

import { create } from "zustand";
import { signInWithPopup, signOut as firebaseSignOut } from "firebase/auth";
import { auth, googleProvider, isFirebaseConfigured } from "@/lib/firebase";
import type { AuthUser } from "@/types/auth";

interface AuthState {
  user: AuthUser | null;
  isSignedIn: boolean;
  isLoading: boolean;
  isSigningIn: boolean;
  signInError: string | null;

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
      await signInWithPopup(auth!, googleProvider!);
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code === "auth/popup-blocked") {
        set({ signInError: "팝업이 차단되었어요. 브라우저 설정에서 팝업을 허용해 주세요." });
      } else if (code === "auth/popup-closed-by-user") {
        // 사용자가 직접 닫은 경우 — 에러 표시 불필요
      } else {
        set({ signInError: "로그인에 실패했어요. 다시 시도해 주세요." });
      }
      console.error("Google sign-in failed:", error);
    } finally {
      set({ isSigningIn: false });
    }
  },

  signOut: async () => {
    if (!isFirebaseConfigured) return;
    try {
      await firebaseSignOut(auth!);
    } catch (error) {
      console.error("Sign-out failed:", error);
    }
  },
}));
