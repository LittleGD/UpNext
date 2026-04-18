"use client";

/**
 * Phase 12d — 스킬트리 UI.
 *
 * HeroStatPanel 의 새 섹션. 각 tier (1-4) 를 row 로, 해당 클래스의 스킬 카드 표시.
 *   - T1: 전직 시 자동 해금
 *   - T2/T3: 1 포인트 / T4: 2 포인트
 *   - 해금 조건: hero level ≥ requiredLevel && skillPoints ≥ pointCost
 *   - "배우기" 버튼 → learnSkill(id) action
 *   - 해금된 스킬은 체크 표시, 잠긴 스킬은 disabled
 */

import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useGameStore } from "@/store/useGameStore";
import {
  getEffectiveHeroLevel,
  CLASS_RESOURCE,
  type ClassType,
} from "@/types/uphero";
import { CLASS_SKILL_TREES, type ClassSkill } from "@/lib/classSkills";
import { GB, EASE_OUT, gbClass } from "@/lib/upHeroPalette";
import PixelIcon from "@/components/icons/PixelIcon";

export default function SkillTreePanel({ classType }: { classType: ClassType }) {
  const hero = useUpHeroStore((s) => s.hero);
  const learnSkill = useUpHeroStore((s) => s.learnSkill);
  const gameLevel = useGameStore((s) => s.progress.level);
  const heroStartLevel = useUpHeroStore((s) => s.heroStartLevel);
  const level = getEffectiveHeroLevel(gameLevel, heroStartLevel);
  const learned = hero.learnedSkills ?? [];
  const points = hero.skillPoints ?? 0;
  const tree = CLASS_SKILL_TREES[classType];
  const resourceSpec = CLASS_RESOURCE[classType];

  const byTier = [1, 2, 3, 4].map((t) => tree.filter((s) => s.tier === t));

  const canLearn = (skill: ClassSkill): "ok" | "learned" | "level" | "points" => {
    if (learned.includes(skill.id)) return "learned";
    if (level < skill.requiredLevel) return "level";
    if (points < skill.pointCost) return "points";
    return "ok";
  };

  return (
    <section
      className="px-5 pb-5"
      style={{ borderTop: `1px solid ${GB.dark}` }}
    >
      <div className="flex items-center justify-between pt-4 pb-2">
        <div className={`typo-caption ${gbClass.textDim}`}>스킬트리</div>
        <div className="typo-caption tabular-nums flex items-center gap-1.5">
          <PixelIcon name="Star" size={12} color={GB.lightest} />
          <span style={{ color: GB.lightest }}>{points}</span>
          <span className={gbClass.textDim}>SP</span>
        </div>
      </div>
      <div className={`typo-micro mb-3 ${gbClass.textDim}`}>
        자원: <span style={{ color: resourceSpec.color }}>{resourceSpec.name}</span> ·
        레벨업마다 SP +1
      </div>
      <div className="flex flex-col gap-3">
        {byTier.map((skills, tierIdx) => {
          const tier = tierIdx + 1;
          return (
            <div key={tier}>
              <div
                className={`typo-micro mb-1.5 ${gbClass.textDim}`}
                style={{ letterSpacing: "0.08em" }}
              >
                TIER {tier}
                {tier > 1 && ` · Lv ${skills[0]?.requiredLevel ?? "?"} · ${skills[0]?.pointCost ?? 1} SP`}
              </div>
              <div className="flex flex-col gap-1.5">
                {skills.map((skill) => {
                  const status = canLearn(skill);
                  const isLearned = status === "learned";
                  const borderColor = isLearned
                    ? GB.lightest
                    : status === "ok"
                      ? resourceSpec.color
                      : GB.dark;
                  return (
                    <div
                      key={skill.id}
                      className="flex items-start gap-2 rounded p-2.5"
                      style={{
                        background: `${GB.dark}55`,
                        border: `1px solid ${borderColor}`,
                        opacity: status === "ok" || isLearned ? 1 : 0.55,
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span
                            className="typo-caption"
                            style={{ color: GB.lightest }}
                          >
                            {skill.name}
                          </span>
                          {isLearned && (
                            <span
                              className="typo-micro tabular-nums px-1.5 rounded-sm"
                              style={{
                                background: GB.lightest,
                                color: GB.darkest,
                              }}
                            >
                              ✓
                            </span>
                          )}
                        </div>
                        <div className={`typo-micro mb-1 ${gbClass.textDim}`}>
                          {skill.description}
                        </div>
                        <div className="flex items-center gap-2 typo-micro tabular-nums">
                          <span style={{ color: resourceSpec.color }}>
                            {skill.resourceCost} {resourceSpec.short}
                          </span>
                          <span className={gbClass.textDim}>·</span>
                          <span className={gbClass.textDim}>
                            CD {skill.cooldown}
                          </span>
                        </div>
                      </div>
                      {!isLearned && (
                        <button
                          type="button"
                          disabled={status !== "ok"}
                          onClick={() => learnSkill(skill.id)}
                          className="skill-learn-btn typo-micro rounded px-2 py-1"
                          style={{
                            minHeight: 32,
                            background:
                              status === "ok" ? GB.lightest : `${GB.dark}aa`,
                            color: status === "ok" ? GB.darkest : GB.light,
                            border: `1px solid ${
                              status === "ok" ? GB.lightest : GB.dark
                            }`,
                            opacity: status === "ok" ? 1 : 0.55,
                            cursor: status === "ok" ? "pointer" : "default",
                            fontWeight: 600,
                          }}
                          aria-label={
                            status === "level"
                              ? `${skill.name} — Lv ${skill.requiredLevel} 필요`
                              : status === "points"
                                ? `${skill.name} — SP ${skill.pointCost} 필요`
                                : `${skill.name} 해금`
                          }
                        >
                          {status === "level"
                            ? `Lv ${skill.requiredLevel}`
                            : status === "points"
                              ? `SP ${skill.pointCost}`
                              : "해금"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <style jsx>{`
        .skill-learn-btn {
          transition: transform 120ms ${EASE_OUT};
        }
        .skill-learn-btn:not(:disabled):active {
          transform: scale(0.96);
        }
      `}</style>
    </section>
  );
}
