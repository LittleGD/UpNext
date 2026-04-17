"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PolaroidFrame from "@/components/growth/PolaroidFrame";
import PolaroidTilt from "@/components/growth/PolaroidTilt";

function makeDummyImage(): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 400, 400);
  grad.addColorStop(0, "#3b82f6");
  grad.addColorStop(0.5, "#8b5cf6");
  grad.addColorStop(1, "#ec4899");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 400, 400);
  ctx.beginPath();
  ctx.arc(200, 200, 80, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fill();
  return canvas.toDataURL("image/jpeg", 0.85);
}

/* ── 애니메이션 상수 ─────────────────────────────── */
const DURATION = 2.5;
const TIMES: [number, number, number] = [0, 0.5, 1];

// 카메라 — 위로 빠르게 퇴장, 페이드 없음
const CAM_Y = [0, 0, -700];

// 폴라로이드 — 직선 출력 → 확대·중앙 정렬 (틸트 없음)
const POLAR_Y = ["-100%", "15%", "-45%"];
const POLAR_SCALE = [1, 1, 1.3];

export default function EjectingCheckPage() {
  const [key, setKey] = useState(0);
  const [variant, setVariant] = useState<number | undefined>(undefined);
  const [dummyImg] = useState(() => makeDummyImage());
  const timestamp = 1713200000000;

  const replay = useCallback(() => setKey((k) => k + 1), []);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center">
      <div className="w-full max-w-[430px] flex items-center gap-3 px-4 pt-6 pb-3">
        <button
          onClick={replay}
          className="px-4 py-2 rounded-lg bg-white text-black text-sm font-bold active:scale-95 transition-transform"
        >
          REPLAY
        </button>
        <div className="flex gap-1.5">
          {[undefined, 0, 1, 2, 3, 4].map((v, i) => (
            <button
              key={i}
              onClick={() => setVariant(v)}
              className={`px-2.5 py-1.5 rounded text-xs font-mono transition-colors ${
                variant === v
                  ? "bg-white text-black"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              {v === undefined ? "auto" : `F${v + 1}`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-start pt-8 w-full px-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="relative w-full max-w-[340px] flex flex-col items-center"
          >
            <div
              className="relative w-full"
              style={{ aspectRatio: "1525 / 1426" }}
            >
              <motion.img
                src="/polaroid-bottom.png"
                alt=""
                aria-hidden
                draggable={false}
                className="absolute inset-x-0 bottom-0 w-full select-none pointer-events-none"
                style={{ height: `${(188 / 1426) * 100}%`, zIndex: 1 }}
                initial={{ y: 0 }}
                animate={{ y: CAM_Y }}
                transition={{ duration: DURATION, times: TIMES, ease: ["linear", [0.33, 1, 0.68, 1]] }}
              />

              <motion.div
                className="absolute"
                style={{
                  top: `${(1238 / 1426) * 100}%`,
                  left: "50%",
                  width: "62%",
                  zIndex: 2,
                  transformOrigin: "center top",
                }}
                initial={{ x: "-50%", y: "-100%", scale: 1 }}
                animate={{
                  x: "-50%",
                  y: POLAR_Y,
                  scale: POLAR_SCALE,
                }}
                transition={{ duration: DURATION, times: TIMES, ease: [[0.23, 1, 0.32, 1], [0.77, 0, 0.175, 1]] }}
              >
                <motion.div
                  initial={{ filter: "sepia(0.8) brightness(0.85) contrast(0.9)" }}
                  animate={{ filter: "sepia(0) brightness(1) contrast(1)" }}
                  transition={{ duration: 1.8, delay: 0.6, ease: [0.23, 1, 0.32, 1] }}
                >
                  <PolaroidFrame
                    imageSrc={dummyImg}
                    timestamp={timestamp}
                    variant={variant}
                  />
                </motion.div>
              </motion.div>

              <motion.img
                src="/polaroid-top.png"
                alt=""
                aria-hidden
                draggable={false}
                className="absolute inset-x-0 top-0 w-full select-none pointer-events-none"
                style={{ height: `${(1238 / 1426) * 100}%`, zIndex: 3 }}
                initial={{ y: 0 }}
                animate={{ y: CAM_Y }}
                transition={{ duration: DURATION, times: TIMES, ease: ["linear", [0.33, 1, 0.68, 1]] }}
              />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="w-full max-w-[430px] px-4 pb-6 pt-3">
        <div className="bg-white/5 rounded-lg p-3 text-xs font-mono text-white/40 space-y-1">
          <p>duration: {DURATION}s | no tilt | scale {POLAR_SCALE[2]}</p>
          <p>camera max-w: 340px | polar: 62% ×{POLAR_SCALE[2]} = {Math.round(340 * 0.62 * POLAR_SCALE[2])}px</p>
        </div>
      </div>

      {/* ── TILT TEST ── */}
      <div className="w-full max-w-[430px] px-4 pb-8">
        <p className="text-white/50 text-xs font-mono mb-3">TILT TEST — hover / drag to rotate</p>
        <div className="flex justify-center">
          <div className="w-[300px]">
            <PolaroidTilt>
              <PolaroidFrame imageSrc={dummyImg} timestamp={timestamp} variant={variant} />
            </PolaroidTilt>
          </div>
        </div>
      </div>
    </div>
  );
}
