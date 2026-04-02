"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "@/store/useGameStore";
import { useTranslation } from "@/hooks/useTranslation";
import PixelIcon from "@/components/icons/PixelIcon";
import { useSound } from "@/hooks/useSound";
import { springSnappy } from "@/lib/motion";
import type { Language } from "@/types/game";

const LANGUAGE_OPTIONS: { code: Language; label: string }[] = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
];

function currentLanguageLabel(lang: Language): string {
  return LANGUAGE_OPTIONS.find((o) => o.code === lang)?.label ?? "한국어";
}

export default function LanguageToggle() {
  const setLanguage = useGameStore((s) => s.setLanguage);
  const { t, language } = useTranslation();
  const { play } = useSound();
  const [open, setOpen] = useState(false);

  const handleSelect = (lang: Language) => {
    play("select");
    setLanguage(lang);
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full py-4 rounded-md font-semibold text-lg bg-bg-elevated text-text-primary hover:bg-bg-hover transition-colors flex items-center justify-center gap-2"
      >
        <PixelIcon name="Languages" size={22} color="var(--text-secondary)" />
        {currentLanguageLabel(language)}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={springSnappy}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-bg-elevated rounded-lg p-6 space-y-2"
            >
              <p className="text-body text-text-primary text-center font-semibold mb-4">
                {t("language.toggle")}
              </p>
              <div className="space-y-1">
                {LANGUAGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.code}
                    onClick={() => handleSelect(opt.code)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-md transition-colors ${
                      language === opt.code
                        ? "bg-bg-hover text-accent"
                        : "text-text-primary hover:bg-bg-hover"
                    }`}
                  >
                    <span className="text-lg font-semibold">{opt.label}</span>
                    {language === opt.code && (
                      <PixelIcon name="Check" size={20} color="var(--accent-primary)" />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
