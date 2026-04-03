"use client";

import { motion } from "framer-motion";
import { useAuthStore } from "@/store/useAuthStore";
import { saveToStorage } from "@/lib/storage";
import { springSnappy } from "@/lib/motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { useTranslation } from "@/hooks/useTranslation";
import { useSound } from "@/hooks/useSound";

export default function LoginOverlay({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation();
  const { play } = useSound();
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const isSignedIn = useAuthStore((s) => s.isSignedIn);
  const isSigningIn = useAuthStore((s) => s.isSigningIn);
  const signInError = useAuthStore((s) => s.signInError);

  const handleGoogleLogin = async () => {
    play("select");
    await signInWithGoogle();
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
  if (isSignedIn) {
    onDismiss();
    return null;
  }

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

        {/* Google 로그인 버튼 */}
        <div className="space-y-3">
          <button
            onClick={handleGoogleLogin}
            disabled={isSigningIn}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-lg bg-white text-[#1f1f1f] font-semibold typo-body transition-transform hover:bg-gray-100 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSigningIn ? (
              <div className="w-[18px] h-[18px] border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
            )}
            {isSigningIn ? t("auth.section.signingIn") : t("auth.section.signInGoogle")}
          </button>
          {signInError && (
            <p className="typo-caption text-accent-secondary text-center">{signInError}</p>
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
