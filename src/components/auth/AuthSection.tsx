"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { isFirebaseConfigured } from "@/lib/firebase";
import { getLastBackupAt } from "@/lib/sync";
import { isIos } from "@/lib/platform";
import { GB, GB_DANGER, EASE_OUT } from "@/lib/upHeroPalette";
import PixelIcon from "@/components/icons/PixelIcon";
import GbConfirm from "@/components/uphero/GbConfirm";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import type { DictKey } from "@/i18n";

/**
 * P3 — "N분 전 / N시간 전" 등 사람이 읽을 수 있는 상대 시간.
 * Intl.RelativeTimeFormat 으로 4 locale 자동 처리.
 */
function formatRelativeTime(ts: number, language: string): string {
  const diffSec = Math.round((ts - Date.now()) / 1000); // 음수
  const abs = Math.abs(diffSec);
  let unit: Intl.RelativeTimeFormatUnit;
  let value: number;
  if (abs < 60) { unit = "second"; value = diffSec; }
  else if (abs < 3600) { unit = "minute"; value = Math.round(diffSec / 60); }
  else if (abs < 86_400) { unit = "hour"; value = Math.round(diffSec / 3600); }
  else if (abs < 86_400 * 30) { unit = "day"; value = Math.round(diffSec / 86_400); }
  else if (abs < 86_400 * 365) { unit = "month"; value = Math.round(diffSec / (86_400 * 30)); }
  else { unit = "year"; value = Math.round(diffSec / (86_400 * 365)); }
  try {
    const rtf = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
    return rtf.format(value, unit);
  } catch {
    return new Date(ts).toLocaleString(language);
  }
}

export default function AuthSection() {
  const user = useAuthStore((s) => s.user);
  const isSignedIn = useAuthStore((s) => s.isSignedIn);
  const isLoading = useAuthStore((s) => s.isLoading);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signInWithApple = useAuthStore((s) => s.signInWithApple);
  const signOut = useAuthStore((s) => s.signOut);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const isSigningIn = useAuthStore((s) => s.isSigningIn);
  const signInError = useAuthStore((s) => s.signInError);
  const showAppleButton = isIos();

  const { t, language } = useTranslation();
  const { play } = useSound();

  // 트랙 2-3: 계정 삭제 플로우 상태. 확인 다이얼로그 → 진행 스피너 →
  // 실패/취소 시 결과 알럿 (성공은 deleteAccountWeb 내부 reload 로 종료).
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteResultKey, setDeleteResultKey] = useState<DictKey | null>(null);

  const handleDeleteAccount = async () => {
    setDeleteConfirmOpen(false);
    setIsDeleting(true);
    const result = await deleteAccount();
    // 성공 시 내부에서 로컬 소거 + reload 되므로 아래는 실패/취소 경로만 실행.
    if (!result.ok) {
      setIsDeleting(false);
      setDeleteResultKey(
        result.reason === "cancelled"
          ? "settings.account.deleteCancelled"
          : result.reason === "data-delete-failed"
            ? "settings.account.deleteDataFailed"
            : "settings.account.deleteFailed",
      );
    }
  };

  // P3 — 마지막 백업 시각 표시. 60초 마다 갱신해서 "1분 전 → 2분 전" 자동.
  // localStorage 폴링이라 비용 무시 가능.
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLastBackupAt(getLastBackupAt());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

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
                <span className="typo-micro text-accent">
                  {lastBackupAt
                    ? t("backup.lastSyncedAt", { ago: formatRelativeTime(lastBackupAt, language) })
                    : t("auth.section.syncing")}
                </span>
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
          {/* 구분선 */}
          <div className="h-px bg-white/[0.06]" />
          {/* 계정 삭제: iOS(App Store 5.1.1(v) 대응)와 동일한 경로를 웹에도 제공.
                복구 불가 액션이라 danger 톤 + GbConfirm 확인 후 진행. */}
          <button
            onClick={() => {
              play("select");
              setDeleteConfirmOpen(true);
            }}
            disabled={isDeleting}
            className="w-full text-left px-4 py-3 typo-body text-accent-secondary hover:bg-bg-elevated transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isDeleting && (
              <div
                className="w-3.5 h-3.5 border-2 border-accent-secondary/30 border-t-accent-secondary rounded-full animate-spin"
                aria-hidden="true"
              />
            )}
            {t("settings.account.delete")}
          </button>
        </div>
      ) : (
        <div className="rounded-lg bg-bg-surface grid-border p-4 space-y-3">
          <p className="typo-caption text-text-tertiary">
            {t("auth.section.prompt")}
          </p>
          <div className="flex flex-col gap-2">
            {showAppleButton && (
              <button
                onClick={signInWithApple}
                disabled={isSigningIn}
                className="flex items-center gap-2.5 px-5 py-3 rounded-lg bg-black text-white font-semibold typo-body transition-all hover:bg-[#1a1a1a] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                {isSigningIn ? t("auth.section.signingIn") : t("auth.section.signInApple")}
              </button>
            )}
            <button
              onClick={signInWithGoogle}
              disabled={isSigningIn}
              className="flex items-center gap-3 px-5 py-3 rounded-lg bg-white text-[#1f1f1f] font-semibold typo-body transition-all hover:bg-gray-100 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSigningIn ? (
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                  <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
              )}
              {isSigningIn ? t("auth.section.signingIn") : t("auth.section.signInGoogle")}
            </button>
          </div>
          {signInError && (
            <p className="typo-caption text-accent-secondary">
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
      )}

      {/* 계정 삭제 확인: settings 리셋과 동일하게 GbConfirm danger 변형 사용 */}
      <GbConfirm
        open={deleteConfirmOpen}
        danger
        title={t("settings.account.deleteConfirmTitle")}
        body={t("settings.account.deleteConfirmBody")}
        confirmLabel={t("settings.account.deleteConfirmCta")}
        cancelLabel={t("common.cancelDefault")}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteAccount}
      />
      {/* 실패/취소 결과 통지: 취소는 정보 톤, 나머지는 danger 톤 */}
      <GbAlert
        open={deleteResultKey !== null}
        danger={deleteResultKey !== "settings.account.deleteCancelled"}
        title={deleteResultKey ? t(deleteResultKey) : ""}
        onClose={() => setDeleteResultKey(null)}
      />
    </section>
  );
}

/**
 * GbConfirm 의 단일 버튼(확인만) 변형: 결과 통지용 알럿.
 * 웹에 공용 알럿 컴포넌트가 아직 없어 AuthSection 로컬로 최소 구현했다.
 * GbConfirm 과 동일한 GB 팔레트 / role="alertdialog" / useModalA11y 계약을 따른다.
 */
function GbAlert({
  open,
  title,
  danger = false,
  onClose,
}: {
  open: boolean;
  title: string;
  danger?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  useModalA11y(containerRef, onClose, { disabled: !open });

  if (!open) return null;
  if (typeof window === "undefined") return null;

  const tone = danger ? GB_DANGER : GB.lightest;

  return createPortal(
    <div
      className="gb-alert-backdrop fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: `${GB.darkest}e0` }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="gb-alert-title"
        className="gb-alert-card w-full max-w-xs rounded-md"
        style={{
          background: GB.darkest,
          border: `1px solid ${tone}`,
          outline: "none",
        }}
      >
        <div className="px-4 pt-4 pb-3 flex items-start gap-2">
          <PixelIcon
            name={danger ? "WarningDiamond" : "InfoBox"}
            size={16}
            color={tone}
          />
          <div
            id="gb-alert-title"
            className="typo-body flex-1 leading-snug"
            style={{ color: GB.lightest }}
          >
            {title}
          </div>
        </div>
        <div
          className="px-3 py-3 flex items-center justify-end"
          style={{ borderTop: `1px solid ${GB.dark}` }}
        >
          <button
            type="button"
            onClick={onClose}
            className="gb-alert-btn typo-caption rounded"
            style={{
              minHeight: 44,
              padding: "10px 14px",
              background: tone,
              color: GB.darkest,
              border: `1px solid ${tone}`,
              fontWeight: 600,
            }}
            autoFocus
          >
            {t("common.confirmDefault")}
          </button>
        </div>
      </div>
      <style jsx>{`
        .gb-alert-backdrop {
          animation: gb-alert-fade 180ms ${EASE_OUT} both;
        }
        .gb-alert-card {
          animation: gb-alert-in 200ms ${EASE_OUT} both;
        }
        .gb-alert-btn {
          transition: transform 120ms ${EASE_OUT}, filter 160ms ${EASE_OUT};
        }
        .gb-alert-btn:active {
          transform: scale(0.97);
        }
        .gb-alert-btn:hover {
          filter: brightness(1.06);
        }
        @keyframes gb-alert-fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes gb-alert-in {
          from {
            opacity: 0;
            transform: scale(0.96);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .gb-alert-backdrop,
          .gb-alert-card {
            animation: none !important;
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
