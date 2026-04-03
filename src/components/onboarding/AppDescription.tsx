"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PixelIcon from "@/components/icons/PixelIcon";
import { springBouncy } from "@/lib/motion";
import { useTranslation } from "@/hooks/useTranslation";
import LanguageToggle from "@/components/ui/LanguageToggle";
import { useSound } from "@/hooks/useSound";

interface AppDescriptionProps {
  onNext: () => void;
}

/* ── 카드 팬 데이터 ── */
const FAN_CARDS = [
  { icon: "Human", color: "var(--rarity-normal)", rotate: -18, x: -52, delay: 0.1 },
  { icon: "Waves", color: "var(--rarity-rare)", rotate: -8, x: -24, delay: 0.18 },
  { icon: "Sparkle", color: "var(--rarity-unique)", rotate: 2, x: 0, delay: 0.25 },
  { icon: "BookOpen", color: "var(--rarity-rare)", rotate: 12, x: 24, delay: 0.32 },
  { icon: "Trophy", color: "var(--rarity-legend)", rotate: 22, x: 48, delay: 0.38 },
];

/* ── 파티클 생성 ── */
function generateSparkles(count: number, singleColor?: string) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: (Math.random() - 0.5) * 200,
    y: (Math.random() - 0.5) * 200,
    size: 1 + Math.random() * 1.5,
    delay: Math.random() * 2,
    duration: 2 + Math.random() * 2,
    color: singleColor || ["var(--accent-primary)", "var(--accent-cyan)", "var(--rarity-unique)", "var(--text-tertiary)"][
      Math.floor(Math.random() * 4)
    ],
  }));
}

const SPARKLES_1 = generateSparkles(12);
const SPARKLES_2 = generateSparkles(10, "#E8FFE8");


export default function AppDescription({ onNext }: AppDescriptionProps) {
  const [page, setPage] = useState(0);
  const { t } = useTranslation();
  const { play } = useSound();

  // 초기 마운트 시 진입 애니메이션 비활성 → LCP = FCP (SSR 콘텐츠 그대로 유지)
  const isInitialMount = useRef(true);
  useEffect(() => { isInitialMount.current = false; }, []);

  // Play sound effect when page changes
  useEffect(() => {
    const timer = setTimeout(() => {
      play(page === 0 ? "ambientFloat" : "pulseWave");
    }, 300);
    return () => clearTimeout(timer);
  }, [page, play]);

  const pages = [
    {
      title: (
        <>
          {t("onboarding.desc1.title1")}
          <br />
          <span className="text-accent">{t("onboarding.desc1.accent")}</span>
        </>
      ),
      description: t("onboarding.desc1.description"),
    },
    {
      title: (
        <>
          {t("onboarding.desc2.title1")}
          <br />
          <span className="text-accent">{t("onboarding.desc2.accent")}</span>
        </>
      ),
      description: t("onboarding.desc2.description"),
    },
  ];

  const isLast = page === pages.length - 1;
  const current = pages[page];

  const handleNext = () => {
    if (isLast) {
      onNext();
    } else {
      setPage((p) => p + 1);
    }
  };

  return (
    <div className="flex flex-col min-h-[100dvh] px-6 relative z-[1] max-w-md mx-auto w-full">

      {/* 페이지 인디케이터 */}
      <div className="flex justify-center gap-2 pt-6 pb-4">
        {pages.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === page ? "w-6 bg-accent" : "w-1.5 bg-bg-elevated"
            }`}
          />
        ))}
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={isInitialMount.current ? false : { opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -80 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="flex flex-col items-center gap-8 w-full"
          >
            {/* 모션 그래픽 영역 */}
            <div className="relative w-full h-[200px] flex items-center justify-center">
              {page === 0 ? <CardFanGraphic /> : <EnergyPulseGraphic />}
            </div>

            {/* 텍스트 */}
            <div className="text-center">
              <h1 className="typo-title text-text-primary leading-tight">
                {current.title}
              </h1>
              <p className="typo-body text-text-secondary mt-4">
                {current.description}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 언어 토글 + 버튼 */}
      <div className="pb-[calc(env(safe-area-inset-bottom)+24px)] w-full space-y-3">
        <LanguageToggle />
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => { play("select"); handleNext(); }}
          className="w-full py-4 bg-accent text-bg-primary rounded-md typo-body"
        >
          {isLast ? t("common.start") : t("common.next")}
        </motion.button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   Page 1: 카드 팬 그래픽
   ══════════════════════════════════════ */
function CardFanGraphic() {
  return (
    <div className="relative flex items-center justify-center w-full h-full">
      {/* 배경 글로우 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 0.1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.1 }}
        className="absolute"
        style={{
          width: 240,
          height: 160,
          background: "radial-gradient(ellipse at center, rgba(255,255,255,0.6) 0%, var(--accent-primary) 40%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      {/* 카드 팬 */}
      {FAN_CARDS.map((card, i) => (
        <motion.div
          key={i}
          initial={{ y: 80, opacity: 0, rotate: 0, scale: 0.5 }}
          animate={{
            y: 0,
            opacity: 1,
            rotate: card.rotate,
            scale: 1,
          }}
          transition={{ ...springBouncy, delay: card.delay }}
          className="absolute"
          style={{
            transformOrigin: "bottom center",
            x: card.x,
          }}
        >
          {/* idle 모션 */}
          <motion.div
            animate={{
              y: [0, -4, 0],
              rotate: [0, card.rotate > 0 ? 1 : -1, 0],
            }}
            transition={{
              duration: 3 + i * 0.3,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.2,
            }}
          >
            <div
              className="w-[56px] h-[78px] rounded-lg flex flex-col items-center justify-center gap-1 relative"
              style={{
                backgroundColor: "var(--bg-elevated)",
                boxShadow: `0 4px 20px ${card.color}15, 0 0 1px ${card.color}30`,
              }}
            >
              {/* 등급 컬러 탑라인 */}
              <div
                className="absolute top-0 left-0 right-0 h-[2px] rounded-t-lg"
                style={{ backgroundColor: card.color }}
              />
              <PixelIcon name={card.icon} size={22} color={card.color} />
              {/* 미니 텍스트 라인 (카드 느낌) */}
              <div className="flex flex-col gap-0.5 items-center">
                <div className="w-6 h-[2px] rounded-full" style={{ backgroundColor: `${card.color}40` }} />
                <div className="w-4 h-[2px] rounded-full" style={{ backgroundColor: `${card.color}20` }} />
              </div>
            </div>
          </motion.div>
        </motion.div>
      ))}

      {/* 스파클 파티클 */}
      {SPARKLES_1.map((s) => (
        <motion.div
          key={s.id}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 0.8, 0],
            scale: [0, 1, 0],
          }}
          transition={{
            duration: s.duration,
            delay: s.delay + 0.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute rounded-full"
          style={{
            width: s.size,
            height: s.size,
            backgroundColor: s.color,
            left: `calc(50% + ${s.x}px)`,
            top: `calc(50% + ${s.y}px)`,
            boxShadow: `0 0 ${s.size * 2}px ${s.color}`,
          }}
        />
      ))}
    </div>
  );
}

/* ══════════════════════════════════════
   Page 2: 에너지 펄스 그래픽
   ══════════════════════════════════════ */
function EnergyPulseGraphic() {
  return (
    <div className="relative flex items-center justify-center w-full h-full">
      {/* 외곽 글로우 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.3 }}
        animate={{ opacity: 0.1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="absolute"
        style={{
          width: 200,
          height: 200,
          background: "radial-gradient(ellipse at center, rgba(255,255,255,0.6) 0%, var(--accent-cyan) 40%, transparent 60%)",
          filter: "blur(50px)",
        }}
      />

      {/* 펄스 링 */}
      {[0, 0.8, 1.6].map((delay, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{
            opacity: [0, 0.3, 0],
            scale: [0.3, 1.2, 1.5],
          }}
          transition={{
            duration: 2.4,
            delay: delay + 0.2,
            repeat: Infinity,
            ease: "easeOut",
          }}
          className="absolute rounded-full"
          style={{
            width: 120,
            height: 120,
            border: "1px solid var(--accent-cyan)",
            boxShadow: "0 0 12px var(--accent-cyan)30",
          }}
        />
      ))}

      {/* 중앙 Zap 아이콘 */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...springBouncy, delay: 0.2 }}
        className="relative z-10"
      >
        <motion.div
          animate={{
            scale: [1, 1.08, 1],
            filter: [
              "drop-shadow(0 0 8px var(--accent-cyan))",
              "drop-shadow(0 0 20px var(--accent-cyan))",
              "drop-shadow(0 0 8px var(--accent-cyan))",
            ],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <PixelIcon name="Zap" size={56} color="var(--accent-cyan)" />
        </motion.div>
      </motion.div>

      {/* 하단 XP 바 모션 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="absolute bottom-4 w-[160px]"
      >
        <div className="h-[4px] bg-bg-elevated rounded-full overflow-hidden">
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: "75%" }}
            transition={{ duration: 1.5, delay: 0.8, ease: "easeOut" }}
            className="h-full rounded-full"
            style={{
              background: "linear-gradient(90deg, var(--accent-cyan), var(--accent-primary))",
              boxShadow: "0 0 8px var(--accent-cyan)60",
            }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            transition={{ delay: 1 }}
            className="typo-micro text-text-tertiary"
          >
            Lv.1
          </motion.span>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            transition={{ delay: 1.2 }}
            className="typo-micro text-accent-cyan"
          >
            Lv.2
          </motion.span>
        </div>
      </motion.div>

      {/* 떠오르는 파티클 */}
      {SPARKLES_2.map((s) => (
        <motion.div
          key={s.id}
          initial={{ opacity: 0, y: 40 }}
          animate={{
            opacity: [0, 0.7, 0],
            y: [40, -60],
            x: [0, s.x * 0.3],
          }}
          transition={{
            duration: s.duration + 1,
            delay: s.delay + 0.5,
            repeat: Infinity,
            ease: "easeOut",
          }}
          className="absolute rounded-full"
          style={{
            width: s.size,
            height: s.size,
            backgroundColor: s.color,
            left: `calc(50% + ${s.x * 0.4}px)`,
            bottom: "20%",
            boxShadow: `0 0 ${s.size * 2}px ${s.color}`,
          }}
        />
      ))}
    </div>
  );
}
