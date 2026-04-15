"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import type { ChallengeCard } from "@/types/card";
import type { Language } from "@/types/game";
import { useScrollLock } from "@/hooks/useScrollLock";
import { useSound } from "@/hooks/useSound";
import Card3DViewer from "./Card3DViewer";

interface CardDetailModalProps {
  card: ChallengeCard;
  language: Language;
  onClose: () => void;
}

const backdropSpring = { type: "spring" as const, duration: 0.35, bounce: 0 };
const cardSpring = { type: "spring" as const, duration: 0.5, bounce: 0.18 };

/**
 * 컬렉션 카드 디테일 모달.
 * AnimatePresence 안에서 렌더되어야 함.
 * 기존 5개 모달과 동일한 패턴: fixed backdrop + spring-in + scrollLock.
 */
export default function CardDetailModal({ card, language, onClose }: CardDetailModalProps) {
  useScrollLock();
  const { play } = useSound();

  // 진입 사운드
  useEffect(() => {
    play("cardPreview");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    play("collect");
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={backdropSpring}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-lg"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      onClick={handleClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 60, opacity: 0, scale: 0.95 }}
        transition={cardSpring}
        onClick={(e) => e.stopPropagation()}
      >
        <Card3DViewer card={card} language={language} />
      </motion.div>
    </motion.div>
  );
}
