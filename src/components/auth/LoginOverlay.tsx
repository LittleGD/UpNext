"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useAuthStore } from "@/store/useAuthStore";
import { saveToStorage } from "@/lib/storage";
import { springSnappy } from "@/lib/motion";
import { isIos } from "@/lib/platform";
import PixelIcon from "@/components/icons/PixelIcon";
import { useTranslation } from "@/hooks/useTranslation";
import { useSound } from "@/hooks/useSound";

export default function LoginOverlay({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation();
  const { play } = useSound();
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signInWithApple = useAuthStore((s) => s.signInWithApple);
  const isSignedIn = useAuthStore((s) => s.isSignedIn);
  const isSigningIn = useAuthStore((s) => s.isSigningIn);
  const signInError = useAuthStore((s) => s.signInError);
  // Apple 로그인은 iOS 네이티브에서만 노출 — Guideline 4.8 충족 + 웹/Android는 Google만.
  const showAppleButton = isIos();

  const handleGoogleLogin = async () => {
    play("select");
    await signInWithGoogle();
    if (useAuthStore.getState().isSignedIn) {
      saveToStorage("login_prompt_seen", true);
      onDismiss();
    }
  };

  const handleAppleLogin = async () => {
    play("select");
    await signInWithApple();
    if (useAuthStore.getState().isSignedIn) {
      saveToStorage("login_prompt_seen", true);
      onDismiss();
    }
  };

  const handleSkip = () => {
    play("select");
    saveToStorage("login_prompt_seen", true);
    onDismiss();
  };

  // 로그인 성공하면 자동 dismiss
  useEffect(() => {
    if (isSignedIn) onDismiss();
  }, [isSignedIn, onDismiss]);

  if (isSignedIn) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
    >
      <motion.div
        initial={{ y: 40, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.95 }}
        transition={springSnappy}
        className="w-full max-w-sm bg-bg-elevated rounded-2xl px-6 pt-8 pb-6 space-y-6"
      >
        {/* 아이콘 + 제목 */}
        <div className="text-center space-y-3">
          <div className="mx-auto w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center">
            <PixelIcon name="Monitor" size={28} color="var(--accent-primary)" />
          </div>
          <div className="space-y-1.5">
            <h2 className="typo-heading text-text-primary">
              {t("auth.login.heading")}
            </h2>
            <p className="typo-body text-text-secondary leading-relaxed whitespace-pre-line">
              {t("auth.login.description")}
            </p>
          </div>
        </div>

        {/* 로그인 버튼 — iOS는 Apple + Google, 웹/Android는 Google only */}
        <div className="space-y-2.5">
          {showAppleButton && (
            <button
              onClick={handleAppleLogin}
              disabled={isSigningIn}
              className="w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-lg bg-black text-white font-semibold typo-body transition-transform hover:bg-[#1a1a1a] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {/* Apple HIG — SF Symbols "apple.logo" 대체. 18px white glyph. */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              {isSigningIn ? t("auth.section.signingIn") : t("auth.section.signInApple")}
            </button>
          )}
          <button
            onClick={handleGoogleLogin}
            disabled={isSigningIn}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-lg bg-white text-[#1f1f1f] font-semibold typo-body transition-transform hover:bg-gray-100 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSigningIn ? (
              <div className="w-[18px] h-[18px] border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
            )}
            {isSigningIn ? t("auth.section.signingIn") : t("auth.section.signInGoogle")}
          </button>
          {signInError && (
            <p className="typo-caption text-accent-secondary text-center">
              {signInError.kind === "popup-blocked"
                ? t("auth.error.popupBlocked")
                : signInError.kind === "unauthorized-domain"
                  ? t("auth.error.unauthorizedDomain")
                  : signInError.kind === "not-allowed"
                    ? t("auth.error.notAllowed")
                    : t("auth.error.generic", { code: signInError.code ?? "unknown" })}
            </p>
          )}
        </div>

        {/* 건너뛰기 */}
        <button
          onClick={handleSkip}
          className="w-full text-center typo-caption text-text-tertiary hover:text-text-secondary transition-colors pt-1"
        >
          {t("auth.login.skip")}
        </button>
      </motion.div>
    </motion.div>
  );
}
