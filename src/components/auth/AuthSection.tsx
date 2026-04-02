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
    <div className="space-y-3">
      <h3 className="text-body font-semibold text-text-secondary">{t("auth.section.heading")}</h3>

      {isSignedIn && user ? (
        <div className="bg-bg-surface rounded-lg p-4 grid-border space-y-3">
          <div className="flex items-center gap-3">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                className="w-10 h-10 rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-bg-elevated flex items-center justify-center">
                <PixelIcon name="User" size={20} color="var(--text-tertiary)" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">
                {user.displayName || t("auth.section.user")}
              </p>
              <p className="text-[12px] text-text-tertiary truncate">
                {user.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[12px] text-accent">
            <PixelIcon name="Reload" size={14} color="var(--accent-primary)" />
            <span>{t("auth.section.syncing")}</span>
          </div>

          <button
            onClick={signOut}
            className="px-4 py-2.5 rounded-md bg-bg-elevated text-text-secondary text-sm font-semibold"
          >
            {t("auth.section.signOut")}
          </button>
        </div>
      ) : (
        <div className="bg-bg-surface rounded-lg p-4 grid-border space-y-3">
          <p className="text-sm text-text-secondary">
            {t("auth.section.prompt")}
          </p>
          <button
            onClick={signInWithGoogle}
            disabled={isSigningIn}
            className="flex items-center gap-3 px-5 py-3 rounded-lg bg-white text-[#1f1f1f] font-semibold text-sm transition-all hover:bg-gray-100 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
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
            <p className="text-[12px] text-accent-secondary">{signInError}</p>
          )}
        </div>
      )}
    </div>
  );
}
