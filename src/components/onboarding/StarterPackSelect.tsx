"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { STARTER_PACKS } from "@/data/starterPacks";
import { ALL_CARDS } from "@/data/cards";
import { RARITY_CONFIG, rarityLabel } from "@/data/rarityConfig";
import { fadeInUp, staggerContainer, springBouncy } from "@/lib/motion";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import { cardTitle, packName as getPackName, packDesc as getPackDesc } from "@/i18n";

interface StarterPackSelectProps {
  onSelect: (packId: string) => void;
}

type Phase = "select" | "revealing";

export default function StarterPackSelect({ onSelect }: StarterPackSelectProps) {
  const { play } = useSound();
  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("select");
  const { t, language } = useTranslation();

  const handleStart = () => {
    if (!selectedPack) return;
    play("packOpen");
    setPhase("revealing");
  };

  const handleRevealDone = () => {
    if (selectedPack) onSelect(selectedPack);
  };

  // 카드 리빌 화면
  if (phase === "revealing" && selectedPack) {
    const pack = STARTER_PACKS.find((p) => p.id === selectedPack)!;
    const resolvedPackName = getPackName(pack, language);
    const cards = pack.cardIds.map((id) => ALL_CARDS.find((c) => c.id === id)!).filter(Boolean);

    return (
      <div className="flex flex-col min-h-[100dvh] px-6 relative z-[1] max-w-md mx-auto w-full">
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <motion.h2
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="typo-title text-accent text-center"
        >
          {resolvedPackName}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="typo-caption text-center"
        >
          {t("onboarding.starter.revealMessage")}
        </motion.p>

        {/* 카드 그리드 — 3x2 */}
        <div className="grid grid-cols-3 gap-3 mt-2 w-full">
          {cards.map((card, i) => {
            const rarity = RARITY_CONFIG[card.rarity];
            return (
              <motion.div
                key={card.id}
                initial={{ y: 80, scale: 0.3, opacity: 0, rotate: (i % 3 - 1) * 12 }}
                animate={{ y: 0, scale: 1, opacity: 1, rotate: 0 }}
                transition={{ ...springBouncy, delay: 0.3 + i * 0.12 }}
                className="w-full rounded-lg p-3 flex flex-col items-center gap-2 bg-bg-elevated grid-border"
                style={{}}
              >
                <span
                  className="typo-caption font-bold px-1.5 py-0.5 rounded-sm self-start"
                  style={{ backgroundColor: rarity.color, color: "#0A0A0A" }}
                >
                  {rarityLabel(card.rarity, language)}
                </span>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ ...springBouncy, delay: 0.6 + i * 0.12 }}
                  style={{ color: rarity.color }}
                >
                  <PixelIcon name={card.icon} size={28} />
                </motion.div>
                <p className="typo-caption font-semibold text-text-primary text-center leading-tight">
                  {cardTitle(card, language)}
                </p>
              </motion.div>
            );
          })}
        </div>
        </div>

        <div className="pb-[calc(env(safe-area-inset-bottom)+24px)] w-full">
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + cards.length * 0.12 + 0.3 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => { play("select"); handleRevealDone(); }}
            className="w-full py-4 bg-accent text-bg-primary rounded-md typo-body"
          >
            {t("common.start")}
          </motion.button>
        </div>
      </div>
    );
  }

  // 팩 선택 화면 — 카드 미리보기 없음
  return (
    <div className="flex flex-col min-h-[100dvh] px-6 relative z-[1] max-w-md mx-auto w-full">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="flex-1 flex flex-col justify-center gap-6 pt-6"
      >
        <motion.div variants={fadeInUp}>
          <h1 className="typo-title text-text-primary">
            {t("onboarding.starter.heading")}
          </h1>
          <p className="typo-body text-text-secondary mt-2">
            {t("onboarding.starter.subheading")}
          </p>
        </motion.div>

        <div className="space-y-3">
          {STARTER_PACKS.map((pack) => {
            const packName = getPackName(pack, language);
            const packDesc = getPackDesc(pack, language);
            return (
              <motion.button
                key={pack.id}
                variants={fadeInUp}
                whileTap={{ scale: 0.97 }}
                onClick={() => { play("select"); setSelectedPack(pack.id); }}
                className={`
                  w-full text-left rounded-lg transition-all p-4
                  ${
                    selectedPack === pack.id
                      ? "bg-accent text-bg-primary"
                      : "bg-bg-surface text-text-primary hover:bg-bg-elevated"
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <PixelIcon
                    name={pack.icon}
                    size={32}
                    color={selectedPack === pack.id ? "#0A0A0A" : "var(--text-secondary)"}
                  />
                  <div className="flex-1">
                    <p className={`typo-body font-semibold ${selectedPack === pack.id ? "text-bg-primary" : "text-text-primary"}`}>
                      {packName}
                    </p>
                    <p className={`typo-caption mt-0.5 ${selectedPack === pack.id ? "text-bg-primary/70" : "text-text-secondary"}`}>
                      {packDesc}
                    </p>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      <div className="pb-[calc(env(safe-area-inset-bottom)+24px)] w-full">
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: selectedPack ? 1 : 0.3, y: 0 }}
          whileTap={selectedPack ? { scale: 0.95 } : {}}
          onClick={handleStart}
          disabled={!selectedPack}
          className="w-full py-4 bg-accent text-bg-primary rounded-md typo-body disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {t("onboarding.starter.openPack")}
        </motion.button>
      </div>
    </div>
  );
}
