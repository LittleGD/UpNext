"use client";

import { useEffect } from "react";
import { useGameStore } from "@/store/useGameStore";

export default function LanguageSync() {
  const language = useGameStore((s) => s.progress.language);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return null;
}
