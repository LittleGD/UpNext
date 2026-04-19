"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useGameStore } from "@/store/useGameStore";
import {
  t,
  ensureLanguage,
  subscribeI18n,
  getI18nVersion,
  type DictKey,
} from "@/i18n";
import type { Language } from "@/types/game";

/**
 * Phase 14 code-review High #12 — lazy-loaded 언어 dict 와 호환되는 hook.
 *   language 변경 시 `ensureLanguage` 로 필요 시 import() triggered,
 *   `useSyncExternalStore` 로 dict-load 완료 시점에 re-render.
 */
export function useTranslation() {
  const language = useGameStore((s) => s.progress.language) as Language;

  useEffect(() => {
    ensureLanguage(language);
  }, [language]);

  // version 을 구독 — ensureLanguage 완료 시 bump 되어 re-render 트리거.
  useSyncExternalStore(subscribeI18n, getI18nVersion, getI18nVersion);

  return {
    t: (key: DictKey, params?: Record<string, string | number>) =>
      t(key, language, params),
    language,
  };
}
