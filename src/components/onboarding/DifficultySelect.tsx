"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { GameMode } from "@/types/game";
import PixelIcon from "@/components/icons/PixelIcon";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import type { DictKey } from "@/i18n";

interface DifficultySelectProps {
  onSelect: (mode: GameMode) => void;
}

const difficulties: {
  key: GameMode;
  labelKey: DictKey;
  cards: number;
  descriptionKey: DictKey;
  icon: string;
}[] = [
  { key: "normal", labelKey: "onboarding.difficulty.normal", cards: 1, descriptionKey: "onboarding.difficulty.normal.desc", icon: "SpeedSlow" },
  { key: "godlife", labelKey: "onboarding.difficulty.godlife", cards: 2, descriptionKey: "onboarding.difficulty.godlife.desc", icon: "SpeedMedium" },
  { key: "ultra", labelKey: "onboarding.difficulty.ultra", cards: 3, descriptionKey: "onboarding.difficulty.ultra.desc", icon: "SpeedFast" },
];

export default function DifficultySelect({ onSelect }: DifficultySelectProps) {
  const { play } = useSound();
  const [selected, setSelected] = useState<GameMode | null>(null);
  const { t } = useTranslation();

  return (
    <div className="flex flex-col min-h-[100dvh] px-6 relative z-[1] max-w-md mx-auto w-full">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="flex-1 flex flex-col justify-center gap-8 pt-6"
      >
        <motion.div variants={fadeInUp}>
          <h1 className="text-heading-1 text-text-primary">
            {t("onboarding.difficulty.heading")}
          </h1>
          <p className="text-body text-text-secondary mt-2">
            {t("onboarding.difficulty.subheading")}
          </p>
        </motion.div>

        <div className="space-y-3">
          {difficulties.map((diff) => (
            <motion.button
              key={diff.key}
              variants={fadeInUp}
              whileTap={{ scale: 0.97 }}
              onClick={() => { play("select"); setSelected(diff.key); }}
              className={`
                w-full text-left p-4 rounded-lg transition-all
                ${
                  selected === diff.key
                    ? "bg-accent text-bg-primary"
                    : "bg-bg-surface text-text-primary hover:bg-bg-elevated"
                }
              `}
            >
              <div className="flex items-center gap-3">
                <PixelIcon
                  name={diff.icon}
                  size={28}
                  color={selected === diff.key ? "#0A0A0A" : "var(--text-secondary)"}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`font-semibold ${selected === diff.key ? "text-bg-primary" : "text-text-primary"}`}>{t(diff.labelKey)}</p>
                    <span className={`text-sm font-bold px-2 py-0.5 rounded-sm ${
                      selected === diff.key ? "bg-black/20 text-bg-primary" : "bg-bg-elevated text-text-tertiary"
                    }`}>
                      {diff.cards}{t("common.cardsPerDay")}
                    </span>
                  </div>
                  <p className={`text-sm mt-0.5 ${selected === diff.key ? "text-bg-primary/70" : "text-text-secondary"}`}>{t(diff.descriptionKey)}</p>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </motion.div>

      <div className="pb-[calc(env(safe-area-inset-bottom)+24px)] w-full">
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: selected ? 1 : 0.3, y: 0 }}
          whileTap={selected ? { scale: 0.95 } : {}}
          onClick={() => selected && onSelect(selected)}
          disabled={!selected}
          className="w-full py-4 bg-accent text-bg-primary rounded-md font-semibold text-lg disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {t("common.next")}
        </motion.button>
      </div>
    </div>
  );
}
