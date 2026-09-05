"use client";

import { motion } from "framer-motion";
import { useMinigameStore } from "@/store/useMinigameStore";
import { useTranslation } from "@/hooks/useTranslation";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import RarityTexture from "@/components/cards/RarityTexture";
import { RARITY_CONFIG, rarityLabel } from "@/data/rarityConfig";

const rarityGlowVar = (rarity: string) => {
  if (rarity === "legend") return "var(--glow-rarity-legend)";
  if (rarity === "unique") return "var(--glow-rarity-unique)";
  if (rarity === "rare") return "var(--glow-rarity-rare)";
  return "var(--glow-rarity-common)";
};

export default function MinigameRewardDraft() {
  const { t, language } = useTranslation();
  const rewardOffer = useMinigameStore((s) => s.rewardOffer);
  const pickReward = useMinigameStore((s) => s.pickReward);

  if (!rewardOffer || rewardOffer.length === 0) return null;

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center justify-center min-h-[80vh] px-6 py-8 gap-6"
    >
      <motion.div variants={fadeInUp} className="text-center">
        <h2 className="typo-display text-text-primary mb-2">
          {t("minigame.reward.draft.heading")}
        </h2>
        <p className="typo-body text-text-secondary">
          {t("minigame.reward.draft.subheading")}
        </p>
      </motion.div>

      <motion.div
        variants={fadeInUp}
        className="w-full max-w-sm flex flex-col gap-3"
      >
        {rewardOffer.map((reward) => {
          const color = RARITY_CONFIG[reward.tier].color;
          return (
            <motion.button
              key={reward.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => pickReward(reward.id)}
              className="press-affordance text-left rounded-xl p-4 relative overflow-hidden min-h-[72px] transition-[filter] duration-200 ease-out hover:brightness-110"
              style={{
                background: "var(--bg-surface)",
                border: `2px solid ${color}`,
                boxShadow: rarityGlowVar(reward.tier),
              }}
              aria-label={`${t(reward.nameKey as "minigame.title")}: ${rarityLabel(reward.tier, language)}`}
            >
              <RarityTexture rarity={reward.tier} borderRadius={12} />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className="typo-body text-text-primary mb-1">
                    {t(reward.nameKey as "minigame.title")}
                  </h3>
                  <p className="typo-caption text-text-secondary">
                    {t(reward.descKey as "minigame.title")}
                  </p>
                </div>
                <span
                  className="typo-micro uppercase px-2 py-0.5 rounded whitespace-nowrap"
                  style={{
                    background: `${color}22`,
                    color: color,
                  }}
                >
                  {rarityLabel(reward.tier, language)}
                </span>
              </div>
            </motion.button>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
