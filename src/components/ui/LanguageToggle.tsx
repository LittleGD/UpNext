"use client";

import { useGameStore } from "@/store/useGameStore";
import { useTranslation } from "@/hooks/useTranslation";

export default function LanguageToggle() {
  const setLanguage = useGameStore((s) => s.setLanguage);
  const { t, language } = useTranslation();

  const toggle = () => {
    setLanguage(language === "ko" ? "en" : "ko");
  };

  return (
    <button
      onClick={toggle}
      className="w-full py-4 rounded-md font-semibold text-lg border border-accent/40 text-text-primary hover:border-accent/70 hover:bg-accent/5 transition-colors"
    >
      {t("language.toggle")}
    </button>
  );
}
