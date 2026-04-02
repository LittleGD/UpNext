"use client";

import { motion } from "framer-motion";
import { useAuthStore } from "@/store/useAuthStore";
import { saveToStorage } from "@/lib/storage";
import { springSnappy } from "@/lib/motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { useTranslation } from "@/hooks/useTranslation";

export default function LoginOverlay({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation();
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const isSignedIn = useAuthStore((s) => s.isSignedIn);
  const isSigningIn = useAuthStore((s) => s.isSigningIn);
  const signInError = useAuthStore((s) => s.signInError);

  const handleGoogleLogin = async () => {
    await signInWithGoogle();
    if (useAuthStore.getState().isSignedIn) {
      saveToStorage("login_prompt_seen", true);
      onDismiss();
    }
  };

  const handleSkip = () => {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6"
    >
      <motion.div
        initial={{ y: 40, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.95 }}
        transition={springSnappy}
        className="w-full max-w-sm bg-bg-elevated rounded-xl p-6 space-y-5"
      >
        {/* 아이콘 + 제목 */}
        <div className="text-center space-y-2">
          <div className="mx-auto">
            <PixelIcon name="DeviceLaptop" size={36} color="var(--accent-primary)" />
          </div>
          <h2 className="text-heading-2 text-text-primary">
            {t("auth.login.heading")}
          </h2>
          <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
            {t("auth.login.description")}
          </p>
        </div>

        {/* Google 로그인 버튼 */}
        <button
          onClick={handleGoogleLogin}
          disabled={isSigningIn}
          className="mx-auto flex items-center gap-3 px-6 py-3.5 rounded-lg bg-white text-[#1f1f1f] font-semibold text-sm transition-all hover:bg-gray-100 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
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
          <p className="text-[12px] text-accent-secondary text-center">{signInError}</p>
        )}

        {/* 건너뛰기 */}
        <div className="text-center space-y-1">
          <button
            onClick={handleSkip}
            className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
          >
            {t("auth.login.skip")}
          </button>
          <p className="text-[11px] text-text-tertiary">
            {t("auth.login.skipHint")}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
