"use client";

import { useEffect, useRef } from "react";

interface Meteor {
  x: number;
  y: number;
  angle: number;    // radians
  speed: number;
  life: number;     // 0 to maxLife
  maxLife: number;
  color: number;    // index into COLORS
}

const COLORS = [
  [205, 245, 100],  // accent-primary #CDF564
  [155, 240, 225],  // accent-cyan #9BF0E1
  [255, 70, 50],    // accent-secondary #FF4632
  [240, 240, 240],  // white
];

const TRAIL_LENGTH = 4;

export default function MeteorShower({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meteorsRef = useRef<Meteor[]>([]);
  const rafRef = useRef<number>(0);
  const lastSpawnRef = useRef<number>(0);
  const nextColorRef = useRef<number>(0);

  useEffect(() => {
    if (!active) {
      meteorsRef.current = [];
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
      canvas!.style.width = window.innerWidth + "px";
      canvas!.style.height = window.innerHeight + "px";
    }

    resize();
    window.addEventListener("resize", resize);
    meteorsRef.current = [];
    lastSpawnRef.current = 0;

    function spawnMeteor(time: number) {
      // Angle: 135-160 degrees in radians (top-right to bottom-left)
      const angleDeg = 135 + Math.random() * 25;
      const angle = (angleDeg * Math.PI) / 180;
      const speed = 2 + Math.random() * 2;
      const maxLife = 60 + Math.floor(Math.random() * 60); // 1-2 seconds at 60fps

      meteorsRef.current.push({
        x: canvas!.width * (0.3 + Math.random() * 0.8),
        y: -10 - Math.random() * 40,
        angle,
        speed,
        life: 0,
        maxLife,
        color: nextColorRef.current++ % COLORS.length,
      });

      lastSpawnRef.current = time;
    }

    function animate(time: number) {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Spawn new meteors (12-16 on screen, every 300-500ms)
      const spawnInterval = 300 + Math.random() * 200;
      if (
        meteorsRef.current.length < 16 &&
        time - lastSpawnRef.current > spawnInterval
      ) {
        spawnMeteor(time);
      }

      const meteors = meteorsRef.current;
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.life++;

        // Move
        m.x += Math.cos(m.angle) * m.speed;
        m.y += Math.sin(m.angle) * m.speed;

        // Fade based on life
        const lifeRatio = m.life / m.maxLife;
        const fadeIn = Math.min(m.life / 8, 1);
        const fadeOut = lifeRatio > 0.7 ? 1 - (lifeRatio - 0.7) / 0.3 : 1;
        const alpha = fadeIn * fadeOut;

        // Remove dead meteors
        if (m.life >= m.maxLife || m.x < -20 || m.y > canvas.height + 20) {
          meteors.splice(i, 1);
          continue;
        }

        const [r, g, b] = COLORS[m.color];

        // Draw trail
        for (let t = TRAIL_LENGTH; t >= 1; t--) {
          const trailX = m.x - Math.cos(m.angle) * m.speed * t;
          const trailY = m.y - Math.sin(m.angle) * m.speed * t;
          const trailAlpha = alpha * (1 - t / (TRAIL_LENGTH + 1)) * 0.6;
          ctx.fillStyle = `rgba(${r},${g},${b},${trailAlpha})`;
          ctx.fillRect(Math.floor(trailX), Math.floor(trailY), 1, 1);
        }

        // Draw head (2x2 bright pixel)
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fillRect(Math.floor(m.x), Math.floor(m.y), 2, 2);
      }

      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2,
        pointerEvents: "none",
      }}
      aria-hidden="true"
    />
  );
}
