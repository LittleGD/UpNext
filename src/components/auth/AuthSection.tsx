"use client";

import { useAuthStore } from "@/store/useAuthStore";
import { isFirebaseConfigured } from "@/lib/firebase";
import PixelIcon from "@/components/icons/PixelIcon";
import { useTranslation } from "@/hooks/useTranslation";

export default function AuthSection() {
  const user = useAuthStore((s) => s.user);
  const isSignedIn = useAuthStore((s) => s.isSignedIn);
  const isLoading = useAuthStore((s) => s.isLoading);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signOut = useAuthStore((s) => s.signOut);
  const isSigningIn = useAuthStore((s) => s.isSigningIn);
  const signInError = useAuthStore((s) => s.signInError);

  const { t } = useTranslation();

  if (!isFirebaseConfigured) return null;
  if (isLoading) return null;

  return (
    <section className="space-y-2">
      <h3 className="typo-heading uppercase tracking-wider px-1">{t("auth.section.heading")}</h3>

      {isSignedIn && user ? (
        <div className="rounded-lg bg-bg-surface grid-border overflow-hidden">
          {/* 유저 정보 */}
          <div className="flex items-center gap-3 px-4 py-3.5">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                className="w-9 h-9 rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-bg-elevated flex items-center justify-center">
                <PixelIcon name="User" size={18} color="var(--text-tertiary)" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="typo-body text-text-primary truncate">
                {user.displayName || t("auth.section.user")}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <PixelIcon name="Reload" size={12} color="var(--accent-primary)" />
                <span className="typo-micro text-accent">{t("auth.section.syncing")}</span>
              </div>
            </div>
          </div>
          {/* 구분선 */}
          <div className="h-px bg-white/[0.06]" />
          {/* 로그아웃 */}
          <button
            onClick={signOut}
            className="w-full text-left px-4 py-3 typo-body text-text-tertiary hover:bg-bg-elevated transition-colors"
          >
            {t("auth.section.signOut")}
          </button>
        </div>
      ) : (
        <div className="rounded-lg bg-bg-surface grid-border p-4 space-y-3">
          <p className="typo-caption text-text-tertiary">
            {t("auth.section.prompt")}
          </p>
          <button
            onClick={signInWithGoogle}
            disabled={isSigningIn}
            className="flex items-center gap-3 px-5 py-3 rounded-lg bg-white text-[#1f1f1f] font-semibold typo-body transition-all hover:bg-gray-100 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSigningIn ? (
              <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
            )}
            {isSigningIn ? t("auth.section.signingIn") : t("auth.section.signInGoogle")}
          </button>
          {signInError && (
            <p className="typo-caption text-accent-secondary">{signInError}</p>
          )}
        </div>
      )}
    </section>
  );
}
