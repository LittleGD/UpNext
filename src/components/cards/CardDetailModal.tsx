"use client";

import { useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import type { ChallengeCard } from "@/types/card";
import type { Language } from "@/types/game";
import { useScrollLock } from "@/hooks/useScrollLock";
import { useSound } from "@/hooks/useSound";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { cardOverlayEnter, cardOverlayExit } from "@/lib/motion";
import Card3DViewer from "./Card3DViewer";
import RarityBackdrop from "./RarityBackdrop";
import { cardTitle } from "@/i18n";

interface CardDetailModalProps {
  card: ChallengeCard;
  language: Language;
  onClose: () => void;
}

// 백드롭은 opacity 만 — spring 대신 짧은 ease-out 으로 GPU 레이어 재사용
const backdropTransition = { duration: 0.22, ease: [0.23, 1, 0.32, 1] as const };

/**
 * 컬렉션 카드 디테일 모달.
 * AnimatePresence 안에서 렌더되어야 함.
 * Preview/Final 과 동일한 cardOverlayEnter/Exit 프리셋 공유 — 3 컨텍스트 모션 통일.
 */
export default function CardDetailModal({ card, language, onClose }: CardDetailModalProps) {
  useScrollLock();
  const { play } = useSound();

  // 진입 사운드
  useEffect(() => {
    play("cardPreview");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = useCallback(() => {
    play("collect");
    onClose();
  }, [onClose, play]);

  // ESC 키로 닫기 — 키보드 접근성
  useEscapeKey(handleClose);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={backdropTransition}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md overflow-hidden"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      onClick={handleClose}
    >
      {/* 등급별 뒷배경 이펙트 — 카드 뒤에 위치 */}
      <RarityBackdrop rarity={card.rarity} />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={cardTitle(card, language)}
        initial={{ opacity: 0, scale: 0.95, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 24, transition: cardOverlayExit }}
        transition={cardOverlayEnter}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10"
      >
        <Card3DViewer card={card} language={language} variant="detail" />
      </motion.div>
    </motion.div>
  );
}
