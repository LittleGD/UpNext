"use client";

/**
 * Up Hero — HeroStatPanel.
 *
 * 캠프에서 영웅 sprite 탭 시 overlay 형태로 전체 화면 stat 상세 표시.
 * 구성:
 *  - 상단: 영웅 sprite (크게) + 이름 + Lv
 *  - 중단: 6 stat bar (str/int/vit/dex/agi/crit) — base + 장비 기여분 구분
 *  - 하단: 장착 장비 4개 요약 (슬롯별)
 *  - footer: 닫기 버튼
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useGameStore } from "@/store/useGameStore";
import {
  computeEffectiveStats,
  computeHeroForLevel,
  getHeroAppearanceVariant,
  CLASS_META,
  CLASS_THEME_COLOR,
} from "@/types/uphero";
import type { EquipSlot, HeroBaseStats } from "@/types/uphero";
import { GB, EASE_OUT, gbClass } from "@/lib/upHeroPalette";
import HeroSprite from "./HeroSprite";
import PixelIcon from "@/components/icons/PixelIcon";

interface HeroStatPanelProps {
  onClose: () => void;
}

const STAT_ROWS: Array<{ key: keyof HeroBaseStats; label: string; isCrit?: boolean }> = [
  { key: "str", label: "STR" },
  { key: "int", label: "INT" },
  { key: "vit", label: "VIT" },
  { key: "dex", label: "DEX" },
  { key: "agi", label: "AGI" },
  { key: "crit", label: "CRIT", isCrit: true },
];

const SLOT_LABEL: Record<EquipSlot, string> = {
  weapon: "무기",
  armor: "갑옷",
  accessory: "액세서리",
  talisman: "부적",
};

export default function HeroStatPanel({ onClose }: HeroStatPanelProps) {
  const hero = useUpHeroStore((s) => s.hero);
  const level = useGameStore((s) => s.progress.level);
  const variant = getHeroAppearanceVariant(level) as 0 | 1 | 2;

  // Phase 5a.1 — level 기반 base stat 자동 성장을 display 에 반영.
  // hero 를 그대로 쓰면 Lv1 기본 (str=10 등) 만 보이고 성장 감각이 없다.
  const leveledHero = computeHeroForLevel(hero, level);
  const effective = computeEffectiveStats(leveledHero);
  const base = leveledHero.baseStats;

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (typeof window === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        background: GB.darkest,
        color: GB.light,
        opacity: mounted ? 1 : 0,
        transition: `opacity 200ms ${EASE_OUT}`,
        paddingTop: "calc(env(safe-area-inset-top) + 10px)",
        paddingBottom: "calc(max(env(safe-area-inset-bottom), 24px) + 10px)",
      }}
    >
      {/* === Header === */}
      <header
        className="px-4 py-2.5 flex items-center justify-between shrink-0"
        style={{ borderBottom: `1px solid ${GB.dark}` }}
      >
        <div className="typo-caption" style={{ color: GB.lightest }}>
          영웅 상세
        </div>
        <button
          type="button"
          onClick={onClose}
          className="uphero-stat-close typo-caption rounded inline-flex items-center gap-1"
          style={{
            minHeight: 40,
            padding: "8px 12px",
            background: `${GB.dark}cc`,
            color: GB.light,
            border: `1px solid ${GB.light}`,
          }}
        >
          <span style={{ fontWeight: 700 }}>✕</span>
          닫기
          <style jsx>{`
            .uphero-stat-close {
              transition: transform 120ms ${EASE_OUT};
            }
            .uphero-stat-close:active {
              transform: scale(0.97);
            }
          `}</style>
        </button>
      </header>

      {/* === Body === */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* 영웅 sprite + 이름 */}
        <section className="py-6 flex flex-col items-center">
          <div
            className="typo-caption mb-3 px-2.5 py-1 rounded-sm"
            style={{
              background: GB.lightest,
              color: GB.darkest,
              letterSpacing: "0.05em",
            }}
          >
            {hero.name}
          </div>
          <HeroSprite
            variant={variant}
            classType={hero.classType}
            size={96}
            color={
              hero.classType
                ? CLASS_THEME_COLOR[hero.classType]
                : GB.lightest
            }
          />
          <div
            className="typo-caption mt-3 tabular-nums"
            style={{ color: GB.light }}
          >
            Lv.{level} · HP {leveledHero.hp}/{leveledHero.maxHp}
          </div>
          {/* Phase 5a.1 — 다음 레벨에 영웅이 얻는 성장 안내 */}
          <div
            className={`typo-caption mt-1 ${gbClass.textDim} tabular-nums`}
          >
            다음 Lv.{level + 1} — 모든 스탯 +1, HP +10
          </div>
        </section>

        {/* Phase 5c.3 → 5d → 6b: class 분화된 영웅이면 별도 섹션.
             block 카드 (icon + name + passive) + Phase 6b 토글 (자동 스킬). */}
        {hero.classType && <ClassSection hero={hero} />}

        {/* 스탯 bar */}
        <section
          className="px-5 pb-5"
          style={{ borderTop: `1px solid ${GB.dark}` }}
        >
          <div className={`typo-caption pt-4 pb-3 ${gbClass.textDim}`}>
            스탯
          </div>
          <div className="flex flex-col gap-3">
            {STAT_ROWS.map(({ key, label, isCrit }) => {
              const baseVal = base[key];
              const effVal = effective[key];
              const bonus = effVal - baseVal;
              const suffix = isCrit ? "%" : "";
              // bar width — crit 은 50 max, 나머지는 40 max 정도
              const maxRef = isCrit ? 50 : 40;
              const pct = Math.min(100, (effVal / maxRef) * 100);
              return (
                <div key={key}>
                  <div className="flex items-center justify-between typo-caption mb-1 tabular-nums">
                    <span style={{ color: GB.light }}>{label}</span>
                    <span>
                      <span style={{ color: GB.lightest }}>
                        {effVal}
                        {suffix}
                      </span>
                      {bonus !== 0 && (
                        <span
                          className="ml-2"
                          style={{ color: bonus > 0 ? GB.lightest : "#e88b7a" }}
                        >
                          ({bonus > 0 ? "+" : ""}
                          {bonus})
                        </span>
                      )}
                    </span>
                  </div>
                  {/* bar */}
                  <div
                    className="w-full h-2 rounded-sm overflow-hidden"
                    style={{ background: GB.dark }}
                  >
                    <div
                      className="h-full rounded-sm"
                      style={{
                        width: `${pct}%`,
                        background: GB.lightest,
                        transition: `width 240ms ${EASE_OUT}`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 장착 장비 4개 */}
        <section
          className="px-5 pb-6"
          style={{ borderTop: `1px solid ${GB.dark}` }}
        >
          <div className={`typo-caption pt-4 pb-3 ${gbClass.textDim}`}>
            장착 장비
          </div>
          <div className="flex flex-col gap-2">
            {(Object.keys(SLOT_LABEL) as EquipSlot[]).map((slot) => {
              const eq = hero.equipped[slot];
              return (
                <div
                  key={slot}
                  className="flex items-center gap-3 px-3 py-2 rounded"
                  style={{
                    background: eq ? `${GB.dark}80` : "transparent",
                    border: `1px solid ${eq ? GB.light : GB.dark}`,
                  }}
                >
                  <div
                    className="typo-caption"
                    style={{ color: GB.light, minWidth: 60 }}
                  >
                    {SLOT_LABEL[slot]}
                  </div>
                  {eq ? (
                    <>
                      <PixelIcon
                        name={eq.iconName}
                        size={16}
                        color={GB.lightest}
                      />
                      <div
                        className="typo-caption flex-1 truncate"
                        style={{ color: GB.lightest }}
                      >
                        {eq.name}
                      </div>
                    </>
                  ) : (
                    <div className={`typo-caption flex-1 ${gbClass.textDim}`}>
                      — 비어있음 —
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}

/* ────────────────────────────────────────────
 * Phase 6b — ClassSection (분화된 영웅의 class 정보 + 스킬 + 자동 토글)
 * ──────────────────────────────────────────── */

import { CLASS_SKILLS } from "@/lib/classSkills";
import type { Hero } from "@/types/uphero";

function ClassSection({ hero }: { hero: Hero }) {
  const toggleAutoSkill = useUpHeroStore((s) => s.toggleAutoSkill);
  // Phase 6 polish — 전투 중이면 실시간 cooldown 표시.
  const currentSession = useUpHeroStore((s) => s.currentSession);
  if (!hero.classType) return null;
  const meta = CLASS_META[hero.classType];
  const skill = CLASS_SKILLS[hero.classType];
  const autoEnabled = hero.autoSkillEnabled ?? true;

  // 활성 세션이 있으면 skillCooldown 참조. 없으면 "준비됨" 정적 표시.
  const sessionActive =
    currentSession != null &&
    currentSession.status !== "completed" &&
    currentSession.hero.classType === hero.classType;
  const currentCooldown = sessionActive
    ? (currentSession.skillCooldown ?? 0)
    : 0;
  const ready = currentCooldown === 0;
  const cooldownPct = sessionActive
    ? ((skill.cooldown - currentCooldown) / skill.cooldown) * 100
    : 100;

  return (
    <section
      className="px-5 pb-5"
      style={{ borderTop: `1px solid ${GB.dark}` }}
    >
      <div className={`typo-caption pt-4 pb-3 ${gbClass.textDim}`}>
        클래스
      </div>

      {/* Class meta 카드 (name + passive) */}
      <div
        className="flex items-center gap-3 rounded px-3 py-2.5"
        style={{
          background: `${GB.dark}80`,
          border: `1px solid ${GB.light}`,
        }}
      >
        <PixelIcon name={meta.icon} size={20} color={GB.lightest} />
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <div className="typo-caption" style={{ color: GB.lightest }}>
            {meta.name}
          </div>
          <div className={`typo-caption ${gbClass.textDim} leading-tight`}>
            {meta.passive}
          </div>
        </div>
      </div>

      {/* Phase 6b → polish — 액티브 스킬 카드 + 자동 토글 + 실시간 cooldown */}
      <div
        className="mt-2.5 flex items-center gap-3 rounded px-3 py-2.5"
        style={{
          background: `${GB.dark}60`,
          border: `1px dashed ${GB.light}80`,
        }}
      >
        <PixelIcon name="Zap" size={18} color={GB.lightest} />
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 typo-caption">
            <span style={{ color: GB.lightest }}>
              액티브 — {skill.name}
            </span>
            {sessionActive && (
              <span
                className={`typo-micro tabular-nums ${
                  ready ? "" : gbClass.textDim
                }`}
                style={{
                  color: ready ? GB.lightest : undefined,
                  letterSpacing: "0.05em",
                }}
              >
                {ready ? "READY" : `cd ${currentCooldown}`}
              </span>
            )}
          </div>
          <div className={`typo-caption ${gbClass.textDim} leading-tight`}>
            {sessionActive
              ? "조건 만족 시 자동 발동"
              : `쿨다운 ${skill.cooldown} round · 조건 만족 시 자동 발동`}
          </div>
          {/* 실시간 cooldown bar — 세션 active 일 때만 */}
          {sessionActive && (
            <div
              className="mt-1.5 h-[2px] rounded-full w-full overflow-hidden"
              style={{ background: GB.dark }}
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${cooldownPct}%`,
                  background: ready ? GB.lightest : GB.light,
                  transition: `width 280ms ${EASE_OUT}, background 200ms ${EASE_OUT}`,
                }}
              />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={toggleAutoSkill}
          className="typo-micro tabular-nums rounded px-2 py-1"
          style={{
            minHeight: 28,
            background: autoEnabled ? GB.lightest : `${GB.dark}cc`,
            color: autoEnabled ? GB.darkest : GB.light,
            border: `1px solid ${autoEnabled ? GB.lightest : GB.light}`,
            letterSpacing: "0.05em",
          }}
          aria-label={`자동 스킬 ${autoEnabled ? "켜짐" : "꺼짐"}`}
        >
          {autoEnabled ? "자동 ON" : "자동 OFF"}
        </button>
      </div>
    </section>
  );
}
