"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Capacitor } from "@capacitor/core";
import PixelIcon from "@/components/icons/PixelIcon";
import { useGameStore } from "@/store/useGameStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useDuoStore } from "@/store/useDuoStore";
import { useUIStore } from "@/store/useUIStore";
import { useTranslation } from "@/hooks/useTranslation";
import { loadFromStorage } from "@/lib/storage";
import {
  ANDROID_STORE_URL,
  IOS_STORE_URL,
  savePendingDuoInvite,
} from "@/lib/duoInviteLink";
import copy from "@/data/duoInviteCopy.json";
const LoginOverlay = dynamic(() => import("@/components/auth/LoginOverlay"), {
  ssr: false,
});
const subscribePlatform = () => () => {};
const clientPlatform = () =>
  Capacitor.isNativePlatform()
    ? "native"
    : /Android/i.test(navigator.userAgent)
      ? "android"
      : "ios";
export default function DuoInviteLanding({ code }: { code: string }) {
  const language = useGameStore((s) => s.progress.language);
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.isLoading);
  const settled = useUIStore((s) => s.syncSettled);
  const duo = useDuoStore((s) => s.activeDuo);
  const working = useDuoStore((s) => s.isWorking);
  const message = useDuoStore((s) => s.message);
  const [login, setLogin] = useState(false);
  const [joined, setJoined] = useState(false);
  useEffect(() => {
    const saved = loadFromStorage("progress");
    useGameStore.getState().initialize();
    if (!saved) {
      const language =
        (["ko", "ja", "zh"] as const).find((lang) =>
          navigator.language.startsWith(lang),
        ) ?? "en";
      useGameStore.getState().setLanguage(language);
    }
  }, []);
  const platform = useSyncExternalStore(
    subscribePlatform,
    clientPlatform,
    () => "web",
  );
  const native = platform === "native";
  const label = (key: keyof typeof copy) => copy[key][language];
  const openURL =
    platform === "android"
      ? `intent://up-next-phi.vercel.app/i/${code}#Intent;scheme=https;package=app.vercel.upnext;S.browser_fallback_url=${encodeURIComponent(ANDROID_STORE_URL)};end`
      : `upnext://invite/${code}`;
  async function join() {
    if (!user) {
      setLogin(true);
      return;
    }
    await useDuoStore.getState().joinInvite(code);
    if (useDuoStore.getState().message?.key === "flame.duo.msg.started") {
      savePendingDuoInvite(null);
      setJoined(true);
    }
  }
  const button =
    "press-affordance w-full h-[52px] rounded-xl flex items-center justify-center typo-body bg-accent-cyan text-bg-primary disabled:opacity-50";
  return (
    <div className="mx-auto max-w-[420px] px-5 py-10">
      <section
        className="rounded-[18px] bg-bg-surface p-5 space-y-5 text-center"
        aria-labelledby="duo-invite-title"
      >
        <div
          className="flex justify-center items-center gap-6 py-3"
          aria-hidden="true"
        >
          <PixelIcon name="Fire" size={40} color="var(--accent-cyan)" />
          <PixelIcon name="Plus" size={18} color="var(--text-tertiary)" />
          <PixelIcon name="Fire" size={40} color="var(--accent-cyan)" />
        </div>
        <h1 id="duo-invite-title" className="typo-title text-text-primary">
          {label("title")}
        </h1>
        {duo && !joined && (
          <p className="typo-body text-text-secondary">{label("connected")}</p>
        )}
        {joined || duo ? (
          <Link
            href="/flame"
            onClick={() => savePendingDuoInvite(null)}
            className={button}
          >
            {label("done")}
          </Link>
        ) : (
          <>
            {!native && (
              <a className={button} href={openURL}>
                {label("open")}
              </a>
            )}
            <button
              className={
                native
                  ? button
                  : "press-affordance w-full min-h-11 typo-body text-accent-cyan"
              }
              onClick={() => void join()}
              disabled={working || loading || (!!user && !settled)}
            >
              {label(user ? (native ? "join" : "web") : "login")}
            </button>
            {native && (
              <Link
                href="/flame"
                onClick={() => savePendingDuoInvite(null)}
                className="flex min-h-11 items-center justify-center typo-body text-text-secondary"
              >
                {label("later")}
              </Link>
            )}
          </>
        )}
        {message && !joined && (
          <p role="status" className="typo-caption text-text-secondary">
            {t(message.key, message.params)}
          </p>
        )}
        {!native && (
          <div className="space-y-2 pt-2">
            <a
              className="inline-flex min-h-11 items-center gap-2 typo-body text-text-primary"
              href={platform === "android" ? ANDROID_STORE_URL : IOS_STORE_URL}
            >
              <PixelIcon name="Download" size={18} />
              {label("install")}
            </a>
            <p className="typo-caption text-text-tertiary">{label("return")}</p>
          </div>
        )}
      </section>
      {login && <LoginOverlay onDismiss={() => setLogin(false)} />}
    </div>
  );
}
