"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { springSnappy } from "@/lib/motion";
import PixelIcon from "@/components/icons/PixelIcon";

interface Props {
  front: React.ReactNode;
  back: React.ReactNode;
  flipped?: boolean;
  onFlip?: (isFlipped: boolean) => void;
  showFlipHint?: boolean; // 플립 힌트 버튼 표시
}

export default function PolaroidFlip({ front, back, flipped: controlledFlipped, onFlip, showFlipHint = true }: Props) {
  const [internalFlipped, setInternalFlipped] = useState(false);
  const isFlipped = controlledFlipped ?? internalFlipped;

  const handleFlip = () => {
    const next = !isFlipped;
    if (onFlip) onFlip(next);
    else setInternalFlipped(next);
  };

  return (
    <div className="relative">
      <div
        className="relative"
        style={{ perspective: 800 }}
      >
        <motion.div
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={springSnappy}
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* Front */}
          <div style={{ backfaceVisibility: "hidden" }}>
            {front}
          </div>

          {/* Back */}
          <div
            className="absolute inset-0"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            {back}
          </div>
        </motion.div>
      </div>

      {/* 플립 버튼 — 항상 접근 가능 (stopPropagation 영향 없음) */}
      {showFlipHint && (
        <button
          onClick={handleFlip}
          className="absolute -bottom-3 right-2 z-30 w-8 h-8 rounded-full bg-bg-elevated/90 backdrop-blur-sm flex items-center justify-center shadow-md active:scale-90 transition-transform"
        >
          <PixelIcon name="Redo" size={14} color="var(--text-secondary)" />
        </button>
      )}
    </div>
  );
}
