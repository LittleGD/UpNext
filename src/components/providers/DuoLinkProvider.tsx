"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import {
  parseDuoInviteURL,
  readPendingDuoInvite,
  savePendingDuoInvite,
} from "@/lib/duoInviteLink";
export default function DuoLinkProvider() {
  const router = useRouter();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    let received = false;
    const open = (url: string) => {
      const code = parseDuoInviteURL(url);
      if (code && !disposed) {
        savePendingDuoInvite(code);
        router.push(`/i/${code}`);
      }
    };
    const listener = App.addListener("appUrlOpen", ({ url }) => {
      if (parseDuoInviteURL(url)) {
        received = true;
        open(url);
      }
    }).catch(() => null);
    void App.getLaunchUrl()
      .then((link) => {
        if (received || disposed) return;
        let launchCode = link && parseDuoInviteURL(link.url);
        // Capacitor keeps the initial launch URL even after a newer warm link.
        // A WebView reload must restore the latest pending invite instead.
        if (launchCode && link) {
          try {
            const key = "upnext.handledDuoLaunchURL";
            if (sessionStorage.getItem(key) === link.url) launchCode = null;
            else sessionStorage.setItem(key, link.url);
          } catch { /* The current link still works without session storage. */ }
        }
        if (launchCode && link) open(link.url);
        else {
          const pending = readPendingDuoInvite();
          if (pending) router.push(`/i/${pending}`);
        }
      })
      .catch(() => {});
    return () => {
      disposed = true;
      void listener.then((handle) => handle?.remove()).catch(() => {});
    };
  }, [router]);
  return null;
}
