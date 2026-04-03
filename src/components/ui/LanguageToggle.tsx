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
      {/* 인라인 행 — 설정 카드 내부에서 사용 */}
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-bg-elevated"
      >
        <div className="flex items-center gap-3">
          <PixelIcon name="Languages" size={20} color="var(--text-secondary)" />
          <span className="typo-body text-text-primary">{t("language.toggle")}</span>
        </div>
        <div className="flex items-center gap-1.5 text-text-tertiary">
          <span className="typo-body">{currentLanguageLabel(language)}</span>
          <PixelIcon name="ChevronRight" size={16} color="var(--text-tertiary)" />
        </div>
      </button>

      {/* 언어 선택 모달 */}
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
              className="w-full max-w-sm bg-bg-elevated rounded-2xl p-5"
            >
              <p className="typo-heading text-text-primary text-center mb-3">
                {t("language.toggle")}
              </p>
              <div className="rounded-md overflow-hidden bg-bg-surface">
                {LANGUAGE_OPTIONS.map((opt, i) => (
                  <button
                    key={opt.code}
                    onClick={() => handleSelect(opt.code)}
                    className={`w-full flex items-center justify-between px-4 py-3 transition-colors relative ${
                      language === opt.code
                        ? "text-accent bg-accent/10"
                        : "text-text-primary hover:bg-bg-elevated"
                    }`}
                  >
                    <span className="typo-body font-semibold">{opt.label}</span>
                    {language === opt.code && (
                      <PixelIcon name="Check" size={18} color="var(--accent-primary)" />
                    )}
                    {i < LANGUAGE_OPTIONS.length - 1 && (
                      <div className="absolute bottom-0 left-4 right-4 h-px bg-white/[0.06]" />
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
