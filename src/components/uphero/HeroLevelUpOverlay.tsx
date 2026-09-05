"use client";

/**
 * Phase 2-A (Track A) — 영웅 레벨업 오버레이.
 *
 * `useUpHeroStore.pendingHeroLevelUp` ({from,to}) 이 세팅되면 풀스크린 연출:
 *   타이틀 → 스프라이트 (레벨 variant 가 바뀌면 강조) → "영웅 Lv.a → Lv.b" →
 *   스탯 델타 (최대 HP + STR/INT/VIT/DEX/AGI, computeHeroForLevel 차분) →
 *   스킬 포인트 증가 → 전직 안내 (Lv30 첫 도달, 아직 전직 전).
 *   3.2 초 자동 해제 + 탭 즉시 해제 → `acknowledgeHeroLevelUp` (Lv30 을 넘긴
 *   레벨업이면 그 시점에 전직 제안이 뜬다 — 오버레이 → ClassChoiceModal 순서).
 *
 * 표시 게이트: idleReward 토스트가 떠 있거나 세션 결산 모달(status completed)이
 *   열려 있으면 뒤로 미룬다 (결산 CTA 를 누른 뒤 이어서 뜨게).
 *
 * 계정(챌린지) 레벨업은 AccountLevelUpOverlay 가 담당한다 — 여기선 영웅 풀만.
 * 디자인 규칙: 라임(솔로 accent), 카드/버튼 보더 없음, 아이콘 박스 없음.
 */

import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import {
  computeHeroForLevel,
  getHeroAppearanceVariant,
  skillPointsTotalForLevel,
  CLASS_THEME_COLOR,
  type Hero,
} from "@/types/uphero";
import { affixStatLabel } from "@/lib/upHeroI18n";
import { useTranslation } from "@/hooks/useTranslation";
import { useSound } from "@/hooks/useSound";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useAnnounce } from "@/hooks/useAnnounce";
import HeroSprite from "./HeroSprite";

const PARTICLE_COUNT = 20;
const AUTO_DISMISS_MS = 3200;
const DELTA_STATS = ["str", "int", "vit", "dex", "agi"] as const;

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  color: string;
}

function generateParticles(): Particle[] {
  // 솔로 = 라임. 보조로 레전드 골드만 살짝 섞는다 (시안은 듀오/소셜 색이라 제외).
  const colors = ["var(--accent-primary)", "var(--accent-primary)", "var(--rarity-legend)"];
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (360 / PARTICLE_COUNT) * i + (Math.random() - 0.5) * 18;
    const rad = (angle * Math.PI) / 180;
    const distance = 80 + Math.random() * 100;
    return {
      id: i,
      x: Math.cos(rad) * distance,
      y: Math.sin(rad) * distance,
      size: 2 + Math.random() * 2.5,
      delay: Math.random() * 0.18,
      color: colors[Math.floor(Math.random() * colors.length)],
    };
  });
}

// 파티클별 장식용 지속시간 지터 — 렌더 스코프 밖 헬퍼 (react-hooks/purity 준수)
function particleDuration(): number {
  return 0.8 + Math.random() * 0.3;
}

/** 레벨 from → to 사이 스탯 변화. 0 인 항목은 표시하지 않는다. */
export function heroLevelStatDeltas(
  hero: Hero,
  from: number,
  to: number,
): Array<{ stat: "maxHp" | (typeof DELTA_STATS)[number]; n: number }> {
  const a = computeHeroForLevel(hero, from);
  const b = computeHeroForLevel(hero, to);
  const out: Array<{ stat: "maxHp" | (typeof DELTA_STATS)[number]; n: number }> = [];
  const hp = b.maxHp - a.maxHp;
  if (hp > 0) out.push({ stat: "maxHp", n: hp });
  for (const k of DELTA_STATS) {
    const n = b.baseStats[k] - a.baseStats[k];
    if (n > 0) out.push({ stat: k, n });
  }
  return out;
}

export default function HeroLevelUpOverlay() {
  const pending = useUpHeroStore((s) => s.pendingHeroLevelUp);
  const idleReward = useUpHeroStore((s) => s.idleReward);
  const sessionStatus = useUpHeroStore((s) => s.currentSession?.status);
  const hero = useUpHeroStore((s) => s.hero);
  const acknowledge = useUpHeroStore((s) => s.acknowledgeHeroLevelUp);
  const { t, language } = useTranslation();
  const { play } = useSound();
  const reducedMotion = useReducedMotion();
  const { announce } = useAnnounce();

  // 결산 모달 / 방치 토스트가 닫힌 뒤에만.
  const visible = !!pending && !idleReward && sessionStatus !== "completed";

  // 파티클은 pending 객체 identity 마다 한 벌 — 렌더마다 재생성하지 않는다.
  const particles = useMemo(
    () => (pending && !reducedMotion ? generateParticles() : []),
    [pending, reducedMotion],
  );

  const deltas = useMemo(
    () => (pending ? heroLevelStatDeltas(hero, pending.from, pending.to) : []),
    [hero, pending],
  );
  const spGain = pending
    ? skillPointsTotalForLevel(pending.to) - skillPointsTotalForLevel(pending.from)
    : 0;
  const classReady =
    !!pending && pending.from < 30 && pending.to >= 30 && hero.classType === null;
  const variantFrom = pending ? getHeroAppearanceVariant(pending.from) : 0;
  const variantTo = pending ? getHeroAppearanceVariant(pending.to) : 0;
  const variantChanged = !hero.classType && variantFrom !== variantTo;

  // 사운드/SR 공지 — 표시될 때 1회 (pending identity 로 중복 방지)
  const playedRef = useRef<typeof pending>(null);
  useEffect(() => {
    if (!pending || !visible) return;
    if (playedRef.current === pending) return;
    playedRef.current = pending;
    play("levelUp");
    announce(t("uphero.heroLevelup.announce", { to: pending.to }), "assertive");
  }, [pending, visible, play, announce, t]);

  useEffect(() => {
    if (!pending || !visible) return;
    const timer = window.setTimeout(acknowledge, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [pending, visible, acknowledge]);

  if (typeof window === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {pending && visible && (
        <motion.div
          key={`${pending.from}-${pending.to}`}
          role="status"
          aria-live="off"
          data-testid="hero-levelup-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          onClick={acknowledge}
          className="fixed inset-0 z-[65] flex items-center justify-center px-6 cursor-pointer"
          style={{ background: "rgba(10, 10, 12, 0.72)" }}
        >
          <div className="flex flex-col items-center gap-3 relative pointer-events-none">
            {/* 타이틀 */}
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={
                reducedMotion
                  ? { opacity: 1, y: 0 }
                  : { opacity: 1, y: 0, rotate: [0, -2, 2, -1.5, 1.5, 0] }
              }
              transition={{
                opacity: { duration: 0.3, ease: "easeOut" },
                y: { duration: 0.4, ease: "easeOut" },
                rotate: { duration: 0.6, ease: "easeInOut", delay: 0.1 },
              }}
              className="typo-heading text-accent"
              style={{ letterSpacing: "0.2em" }}
            >
              {t("uphero.heroLevelup.title")}
            </motion.div>

            {/* 스프라이트 + 파티클 */}
            <motion.div
              initial={{ scale: reducedMotion ? 1 : 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={
                reducedMotion
                  ? { duration: 0.3 }
                  : {
                      scale: { type: "spring", stiffness: 260, damping: 18, delay: 0.15 },
                      opacity: { duration: 0.25, delay: 0.15 },
                    }
              }
              className="relative flex items-center justify-center"
              style={{
                // 라임 글로우로 위계 — 박스/보더 없음. variant 가 바뀌면 더 강하게.
                filter: variantChanged
                  ? "drop-shadow(0 0 18px var(--accent-primary))"
                  : "drop-shadow(0 0 10px color-mix(in srgb, var(--accent-primary) 60%, transparent))",
              }}
            >
              <HeroSprite
                variant={variantTo as 0 | 1 | 2}
                classType={hero.classType}
                size={96}
                color={hero.classType ? CLASS_THEME_COLOR[hero.classType] : "var(--accent-primary)"}
              />
              {!reducedMotion && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  {particles.map((p) => (
                    <motion.span
                      key={p.id}
                      initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                      animate={{ x: p.x, y: p.y, scale: 0, opacity: 0 }}
                      transition={{
                        duration: particleDuration(),
                        delay: p.delay + 0.2,
                        ease: "easeOut",
                      }}
                      className="absolute rounded-full"
                      style={{ width: p.size, height: p.size, backgroundColor: p.color }}
                    />
                  ))}
                </div>
              )}
            </motion.div>

            {/* Lv.a → Lv.b */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.35, ease: "easeOut" }}
              className="font-display text-accent tabular-nums"
              style={{ fontSize: 28, lineHeight: 1.1, letterSpacing: "0.04em" }}
            >
              {t("uphero.heroLevelup.range", { from: pending.from, to: pending.to })}
            </motion.div>

            {/* 스탯 델타 */}
            {deltas.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.5, ease: "easeOut" }}
                className="flex flex-wrap justify-center gap-x-3 gap-y-1 typo-caption text-text-secondary tabular-nums"
              >
                {deltas.map((d) => (
                  <span key={d.stat}>
                    {t("uphero.heroLevelup.statDelta", {
                      stat:
                        d.stat === "maxHp"
                          ? t("uphero.heroLevelup.stat.maxHp")
                          : affixStatLabel(d.stat, language),
                      n: d.n,
                    })}
                  </span>
                ))}
              </motion.div>
            )}

            {/* 스킬 포인트 */}
            {spGain > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.6, ease: "easeOut" }}
                className="typo-body text-accent tabular-nums"
              >
                {t("uphero.heroLevelup.sp", { n: spGain })}
              </motion.div>
            )}

            {/* 전직 안내 */}
            {classReady && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.7, ease: "easeOut" }}
                className="typo-caption text-text-tertiary"
              >
                {t("uphero.heroLevelup.classReady")}
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
