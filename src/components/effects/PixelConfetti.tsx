"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  dx: number;
  dy: number;
  rotation: number;
}

const COLORS = [
  "var(--accent-primary)",
  "var(--accent-cyan)",
  "var(--accent-fushia)",
  "var(--accent-secondary)",
  "#FFFFFF",
];

function createParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: 50 + (Math.random() - 0.5) * 20,
    y: 40,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: Math.random() > 0.5 ? 6 : 4,
    dx: (Math.random() - 0.5) * 60,
    dy: -(Math.random() * 40 + 20),
    rotation: Math.random() * 360,
  }));
}

export default function PixelConfetti({ trigger }: { trigger: boolean }) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (trigger) {
      setParticles(createParticles(24));
      const timer = setTimeout(() => setParticles([]), 1500);
      return () => clearTimeout(timer);
    }
  }, [trigger]);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
      <AnimatePresence>
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              opacity: 1,
              rotate: 0,
            }}
            animate={{
              left: `${p.x + p.dx}%`,
              top: `${p.y - p.dy}%`,
              opacity: 0,
              rotate: p.rotation,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="absolute"
            style={{
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
