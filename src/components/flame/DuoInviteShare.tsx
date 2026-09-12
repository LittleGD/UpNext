"use client";
import { useState } from "react";
import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";
import { useGameStore } from "@/store/useGameStore";
import { useDuoStore } from "@/store/useDuoStore";
import { duoInviteURL } from "@/lib/duoInviteLink";
import PixelIcon from "@/components/icons/PixelIcon";
import copy from "@/data/duoInviteCopy.json";
export default function DuoInviteShare({ code }: { code: string | null }) {
  const language = useGameStore((s) => s.progress.language);
  const working = useDuoStore((s) => s.isWorking);
  const [copied, setCopied] = useState(false);
  const url = code ? duoInviteURL(code) : null;
  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  async function share() {
    if (!url) {
      await useDuoStore.getState().createInvite();
      return;
    }
    try {
      if (Capacitor.isNativePlatform())
        await Share.share({ title: copy.title[language], url });
      else if (navigator.share)
        await navigator.share({ title: copy.title[language], url });
      else await copyLink();
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "AbortError")
        await copyLink();
    }
  }
  return (
    <div className="w-full space-y-1.5">
      <button
        onClick={() => void share()}
        disabled={working}
        className="press-affordance w-full h-[52px] rounded-xl bg-accent-cyan text-bg-primary typo-body flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <PixelIcon name="Link" size={18} />
        {copy[url ? "share" : "create"][language]}
      </button>
      {url && (
        <>
          <button
            onClick={() => void copyLink()}
            className="press-affordance min-h-11 typo-caption text-text-secondary"
          >
            {copy[copied ? "copied" : "copy"][language]}
          </button>
          <p className="allow-select typo-caption text-text-tertiary break-all">
            {url}
          </p>
        </>
      )}
    </div>
  );
}
