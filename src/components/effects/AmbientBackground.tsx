"use client";

import { useEffect, useState } from "react";

/**
 * Aurora ambient background — rendered with inline styles
 * to avoid CSS purge issues in production builds.
 *
 * Phase 3B: requestIdleCallback으로 마운트 지연
 * → FCP 시점의 GPU 블러 연산 제거
 */
export default function AmbientBackground() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => setReady(true));
      return () => window.cancelIdleCallback(id);
    } else {
      // Safari fallback
      const timer = setTimeout(() => setReady(true), 200);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!ready) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {/* Layer 1 — deep purple base */}
      <div
        style={{
          position: "absolute",
          bottom: "-15%",
          left: "-25%",
          width: "150%",
          height: "60%",
          background: [
            "radial-gradient(ellipse 100% 70% at 35% 90%, rgba(59,7,100,0.45) 0%, transparent 70%)",
            "radial-gradient(ellipse 80% 60% at 65% 95%, rgba(30,6,56,0.35) 0%, transparent 65%)",
          ].join(", "),
          filter: "blur(60px)",
          opacity: 0.8,
          animation: "aurora-drift 20s ease-in-out infinite",
          willChange: "transform",
        }}
      />

      {/* Layer 2 — main aurora band */}
      <div
        style={{
          position: "absolute",
          bottom: "5%",
          left: "-20%",
          width: "140%",
          height: "45%",
          background: [
            "radial-gradient(ellipse 70% 80% at 20% 60%, rgba(120,40,190,0.25) 0%, transparent 60%)",
            "radial-gradient(ellipse 60% 70% at 55% 55%, rgba(170,50,150,0.15) 0%, transparent 55%)",
            "radial-gradient(ellipse 65% 75% at 85% 65%, rgba(90,30,170,0.2) 0%, transparent 55%)",
          ].join(", "),
          filter: "blur(70px)",
          animation: "aurora-drift-alt 25s ease-in-out infinite, aurora-breathe 8s ease-in-out infinite",
          willChange: "transform, opacity",
        }}
      />

      {/* Layer 3 — top edge highlight */}
      <div
        style={{
          position: "absolute",
          bottom: "20%",
          left: "-15%",
          width: "130%",
          height: "25%",
          background: [
            "radial-gradient(ellipse 50% 90% at 28% 55%, rgba(160,120,230,0.1) 0%, transparent 60%)",
            "radial-gradient(ellipse 40% 80% at 72% 50%, rgba(220,180,240,0.06) 0%, transparent 55%)",
          ].join(", "),
          filter: "blur(80px)",
          animation: "aurora-drift 18s ease-in-out infinite",
          animationDelay: "-6s",
          willChange: "transform",
        }}
      />

      {/* Keyframes injected via style tag */}
      <style>{`
        @keyframes aurora-drift {
          0%, 100% { transform: translateX(0%) translateY(0%) scaleX(1); }
          25% { transform: translateX(3%) translateY(-8px) scaleX(1.05); }
          50% { transform: translateX(-2%) translateY(4px) scaleX(0.97); }
          75% { transform: translateX(-4%) translateY(-4px) scaleX(1.03); }
        }
        @keyframes aurora-drift-alt {
          0%, 100% { transform: translateX(0%) translateY(0%) scaleX(1) rotate(0deg); }
          30% { transform: translateX(-5%) translateY(6px) scaleX(1.08) rotate(0.5deg); }
          60% { transform: translateX(4%) translateY(-6px) scaleX(0.95) rotate(-0.5deg); }
        }
        @keyframes aurora-breathe {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
