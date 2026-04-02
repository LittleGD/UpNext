"use client";

import { useEffect, useRef } from "react";

/**
 * 1px twinkling pixel stars background
 * Stars are always present — they fade in/out very slowly like real stars.
 * No sudden appearance or fast blinking.
 */

interface Star {
  x: number;
  y: number;
  baseAlpha: number;
  phase: number;       // animation phase offset (randomized so no sync)
  speed: number;       // twinkle speed — very slow
  color: number;       // 0=white, 1=accent, 2=cyan
  birthAlpha: number;  // fade-in factor (0→1 over several seconds)
}

const STAR_DENSITY = 0.00018; // slightly sparser
const COLORS = [
  [240, 240, 240],     // white
  [205, 245, 100],     // accent (citric)
  [155, 240, 225],     // cyan
];

export default function PixelStars() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
      canvas!.style.width = window.innerWidth + "px";
      canvas!.style.height = window.innerHeight + "px";

      const area = canvas!.width * canvas!.height;
      const count = Math.floor(area * STAR_DENSITY);
      starsRef.current = Array.from({ length: count }, () => ({
        x: Math.floor(Math.random() * canvas!.width),
        y: Math.floor(Math.random() * canvas!.height),
        baseAlpha: 0.15 + Math.random() * 0.45,
        // Spread phases widely so stars are never in sync
        phase: Math.random() * Math.PI * 20,
        // Very slow twinkle: full cycle takes 10-30 seconds
        speed: 0.04 + Math.random() * 0.12,
        color: Math.random() < 0.88 ? 0 : Math.random() < 0.6 ? 1 : 2,
        // Stagger birth so stars fade in over the first few seconds
        birthAlpha: 0,
      }));
    }

    resize();
    window.addEventListener("resize", resize);

    const startTime = performance.now();

    function animate(time: number) {
      if (!ctx || !canvas) return;
      const elapsed = (time - startTime) * 0.001; // seconds since mount

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const stars = starsRef.current;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];

        // Gentle fade-in over first 3-6 seconds, staggered per star
        const fadeInDelay = (i / stars.length) * 4; // 0-4s stagger
        const fadeInProgress = Math.min((elapsed - fadeInDelay) / 2, 1); // 2s fade duration
        if (fadeInProgress <= 0) continue;
        s.birthAlpha = Math.max(0, fadeInProgress);

        s.phase += s.speed * 0.016; // ~60fps fixed step for consistency

        // Very slow sine — feels like real starlight
        const twinkle = Math.sin(s.phase) * 0.4 + 0.6;
        const alpha = s.baseAlpha * twinkle * s.birthAlpha;

        if (alpha < 0.03) continue;

        const [r, g, b] = COLORS[s.color];
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fillRect(s.x, s.y, 1, 1);
      }

      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[1] pointer-events-none"
      aria-hidden="true"
    />
  );
}
