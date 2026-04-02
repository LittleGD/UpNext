"use client";

import { useGameStore } from "@/store/useGameStore";
import { t, type DictKey } from "@/i18n";
import type { Language } from "@/types/game";

export function useTranslation() {
  const language = useGameStore((s) => s.progress.language);

  return {
    t: (key: DictKey, params?: Record<string, string | number>) =>
      t(key, language, params),
    language: language as Language,
  };
}
