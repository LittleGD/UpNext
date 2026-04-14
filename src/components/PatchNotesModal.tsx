"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import type { PatchNote } from "@/data/patchNotes";

interface PatchNotesModalProps {
  patch: PatchNote;
  onClose: () => void;
}

export default function PatchNotesModal({ patch, onClose }: PatchNotesModalProps) {
  const { play } = useSound();
  const { t, language } = useTranslation();

  // 모달이 열려있는 동안 배경 스크롤 락
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const headline = patch.headline[language];
  const entries = patch.entries[language];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 60, opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", duration: 0.5, bounce: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl overflow-hidden relative"
        style={{
          backgroundColor: "var(--bg-elevated)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5), 0 0 60px rgba(223,255,0,0.10)",
        }}
      >
        {/* Subtle top gradient wash */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(160deg, rgba(223,255,0,0.06) 0%, transparent 50%)",
          }}
        />

        <div className="relative z-10 px-6 pt-7 pb-6 flex flex-col">
          {/* Header — version tag + icon */}
          <div className="flex items-center justify-between mb-5">
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="flex items-center gap-2"
            >
              <PixelIcon name="Sparkle" size={18} color="var(--accent-primary)" />
              <span className="typo-micro text-text-tertiary">
                {t("patchnotes.version", { version: patch.version })}
              </span>
            </motion.div>
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="typo-micro text-text-quaternary"
            >
              {patch.date}
            </motion.span>
          </div>

          {/* Title */}
          <motion.h3
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="typo-heading text-text-primary leading-snug mb-1"
          >
            {t("patchnotes.title")}
          </motion.h3>

          {/* Headline */}
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
            className="typo-body text-text-secondary leading-relaxed mb-5"
          >
            {headline}
          </motion.p>

          {/* Entries — scrollable if too tall */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.26 }}
            className="flex flex-col gap-4 max-h-[50vh] overflow-y-auto pr-1"
          >
            {entries.map((entry, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.05 }}
                className="flex gap-3"
              >
                {entry.icon && (
                  <div
                    className="shrink-0 mt-0.5"
                    style={{ color: "var(--accent-primary)" }}
                  >
                    <PixelIcon name={entry.icon} size={18} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="typo-body text-text-primary leading-snug mb-1">
                    {entry.title}
                  </p>
                  <p className="typo-caption text-text-tertiary leading-relaxed">
                    {entry.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Close button */}
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            onClick={() => {
              play("select");
              onClose();
            }}
            className="w-full py-3.5 mt-6 rounded-xl text-black typo-body transition-all active:scale-[0.97] active:brightness-90"
            style={{ backgroundColor: "var(--accent-primary)" }}
          >
            {t("patchnotes.close")}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
