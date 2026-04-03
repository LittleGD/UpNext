"use client";

import { useEffect } from "react";
import { useGameStore } from "@/store/useGameStore";

/**
 * 언어별 폰트 동적 로딩
 * - KO: next/font/local (layout.tsx에서 빌드타임 로딩)
 * - EN: Typekit (layout.tsx에서 afterInteractive 로딩)
 * - JA/ZH: Google Fonts CSS를 언어 전환 시점에 동적 주입
 *
 * 왜 next/font/google을 쓰지 않는가:
 * preload:false여도 CJK 폰트의 수십 개 unicode-range @font-face 규칙이
 * 메인 CSS 번들에 포함되어 렌더 블로킹을 330ms까지 비대화시켰음.
 */
const FONT_CSS: Record<string, string> = {
  ja: "https://fonts.googleapis.com/css2?family=WDXL+Lubrifont+JP+N&display=swap",
  zh: "https://fonts.googleapis.com/css2?family=ZCOOL+QingKe+HuangYou&display=swap",
};

const loaded = new Set<string>();

function injectFontCSS(lang: string) {
  const url = FONT_CSS[lang];
  if (!url || loaded.has(lang)) return;
  loaded.add(lang);

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  document.head.appendChild(link);
}

export default function LanguageSync() {
  const language = useGameStore((s) => s.progress.language);

  useEffect(() => {
    document.documentElement.lang = language;

    // JA/ZH 폰트는 해당 언어로 전환할 때만 로딩
    if (language in FONT_CSS) {
      injectFontCSS(language);
    }
  }, [language]);

  return null;
}
