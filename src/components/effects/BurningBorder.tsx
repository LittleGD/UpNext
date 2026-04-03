"use client";

import { motion, AnimatePresence } from "framer-motion";

interface BurningBorderProps {
  phase: "extra" | "super";
  active: boolean;
}

const PHASE_SHADOWS = {
  extra: [
    "inset 0 0 60px rgba(255,70,50,0.25), inset 0 0 120px rgba(255,100,0,0.1)",
    "inset 0 0 60px rgba(255,70,50,0.15), inset 0 0 120px rgba(255,100,0,0.06)",
  ],
  super: [
    "inset 0 0 80px rgba(255,70,50,0.35), inset 0 0 150px rgba(255,50,100,0.15)",
    "inset 0 0 80px rgba(255,70,50,0.2), inset 0 0 150px rgba(255,50,100,0.08)",
  ],
};

export default function BurningBorder({ phase, active }: BurningBorderProps) {
  const shadows = PHASE_SHADOWS[phase];

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="fixed inset-0 pointer-events-none z-40"
          aria-hidden="true"
        >
          <style>{`
            @keyframes burning-border-breathe {
              0%, 100% {
                box-shadow: ${shadows[0]};
              }
              50% {
                box-shadow: ${shadows[1]};
              }
            }
          `}</style>
          <div
            className="absolute inset-0"
            style={{
              animation: "burning-border-breathe 3s ease-in-out infinite",
              boxShadow: shadows[0],
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
