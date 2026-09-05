"use client";

/**
 * Phase 12d — 스킬트리 UI.
 *
 * HeroStatPanel 의 새 섹션. 각 tier (1-4) 를 row 로, 해당 클래스의 스킬 카드 표시.
 *   - T1: 전직 시 자동 해금
 *   - T2/T3: 1 포인트 / T4: 2 포인트
 *   - "배우기" 버튼 → learnSkill(id) action
 *   - 해금된 스킬은 체크 표시, 잠긴 스킬은 disabled
 *
 * Phase 3-F (피드백 34b) — 분기 트리.
 *   - tier 2/3 은 a/b 두 카드를 2열 그리드로. 하나를 배우면 형제는 dim
 *     (배경 단계 `${GB.dark}22` + opacity .45, 라벨 "선택 완료").
 *   - 판정은 getSkillLearnStatus 한 곳 (스토어와 같은 규칙). "requires" 는
 *     "이전 단계 필요" 라벨.
 *   - 카드/버튼 보더 없음. 배운 카드는 자원색 글로우 (선택 상태 예외).
 *   - 리스펙: T2+ 를 하나라도 배웠으면 헤더 우측에 버튼. GbConfirm 확인 뒤
 *     respecSkills(). 코인 부족은 인라인 문구.
 */

import { useState } from "react";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useHeroLevel } from "./useHeroLevel";
import { useSound } from "@/hooks/useSound";
import {
  CLASS_RESOURCE,
  SHOP_PRICES,
  type ClassType,
} from "@/types/uphero";
import {
  CLASS_SKILL_TREES,
  SKILL_TREE_TIERS,
  getSkillLearnStatus,
  type ClassSkill,
  type SkillLearnStatus,
} from "@/lib/classSkills";
import { GB, EASE_OUT, gbClass } from "@/lib/upHeroPalette";
import { useTranslation } from "@/hooks/useTranslation";
import { skillName, skillDesc, resourceName } from "@/lib/upHeroI18n";
import PixelIcon from "@/components/icons/PixelIcon";
import GbConfirm from "./GbConfirm";

export default function SkillTreePanel({ classType }: { classType: ClassType }) {
  const { t, language } = useTranslation();
  const hero = useUpHeroStore((s) => s.hero);
  const learnSkill = useUpHeroStore((s) => s.learnSkill);
  const respecSkills = useUpHeroStore((s) => s.respecSkills);
  const { play } = useSound();
  // Phase 2-A — 영웅 레벨은 heroXp 풀 기준. SP 는 레벨 파생 캐시(hero.skillPoints).
  const level = useHeroLevel();
  const learned = hero.learnedSkills ?? [];
  const points = hero.skillPoints ?? 0;
  const tree = CLASS_SKILL_TREES[classType];
  const resourceSpec = CLASS_RESOURCE[classType];

  const [respecOpen, setRespecOpen] = useState(false);
  const [respecNoCoins, setRespecNoCoins] = useState(false);

  // 리스펙으로 되돌려받을 SP = 이 class 의 T2+ 학습 스킬 pointCost 합.
  const spentSkills = tree.filter((s) => s.tier >= 2 && learned.includes(s.id));
  const spentSp = spentSkills.reduce((sum, s) => sum + s.pointCost, 0);
  const canRespec = spentSkills.length > 0;
  const respecCost = SHOP_PRICES.skillRespec;
  const anyT3Learned = tree.some((s) => s.tier === 3 && learned.includes(s.id));

  const statusOf = (skill: ClassSkill): SkillLearnStatus =>
    getSkillLearnStatus(skill, {
      classType,
      heroLevel: level,
      learned,
      points,
    });

  const onLearn = (skill: ClassSkill) => {
    const result = learnSkill(skill.id);
    play(result === "ok" ? "select" : "cancel");
  };

  const onRespecConfirm = () => {
    setRespecOpen(false);
    const result = respecSkills();
    if (result === "ok") {
      setRespecNoCoins(false);
      play("select");
    } else {
      setRespecNoCoins(result === "no-coins");
      play("cancel");
    }
  };

  const nameOf = (skill: ClassSkill) => skillName(skill.id, skill.name, language);

  const buttonLabel = (skill: ClassSkill, status: SkillLearnStatus) => {
    switch (status) {
      case "level":
        return t("uphero.skillTree.btnNeedLevel", { level: skill.requiredLevel });
      case "points":
        return t("uphero.skillTree.btnNeedSP", { sp: skill.pointCost });
      case "requires":
        return t("uphero.skillTree.btnNeedPrev");
      case "branch":
        return t("uphero.skillTree.btnBranchTaken");
      default:
        return t("uphero.skillTree.unlock");
    }
  };

  const buttonAria = (skill: ClassSkill, status: SkillLearnStatus) => {
    const name = nameOf(skill);
    switch (status) {
      case "level":
        return t("uphero.skill.needLevel", { name, level: skill.requiredLevel });
      case "points":
        return t("uphero.skill.needSP", { name, cost: skill.pointCost });
      case "requires":
        return t("uphero.skill.needPrev", { name });
      case "branch":
        return t("uphero.skill.branchTaken", { name });
      default:
        return t("uphero.skill.unlockCost", { name });
    }
  };

  return (
    <section
      className="px-5 pb-5"
      style={{ borderTop: `1px solid ${GB.dark}` }}
    >
      <div className="flex items-center justify-between pt-4 pb-2">
        <div className={`typo-caption ${gbClass.textDim}`}>{t("uphero.skillTree.title")}</div>
        <div className="flex items-center gap-2">
          {canRespec && (
            <button
              type="button"
              onClick={() => setRespecOpen(true)}
              className="skill-learn-btn typo-micro tabular-nums rounded px-2 py-1"
              style={{
                minHeight: 32,
                background: `${GB.dark}aa`,
                color: GB.light,
                cursor: "pointer",
              }}
              aria-label={`${t("uphero.skillTree.respec")} · ${t("uphero.skillTree.respecCost", { cost: respecCost })}`}
            >
              {t("uphero.skillTree.respec")}
              <span className={gbClass.textDim}>
                {" · "}
                {t("uphero.skillTree.respecCost", { cost: respecCost })}
              </span>
            </button>
          )}
          <div className="typo-caption tabular-nums flex items-center gap-1.5">
            <PixelIcon name="Star" size={12} color={GB.lightest} />
            <span style={{ color: GB.lightest }}>{points}</span>
            <span className={gbClass.textDim}>SP</span>
          </div>
        </div>
      </div>
      {respecNoCoins && (
        <div className="typo-micro mb-2" style={{ color: "#e88b7a" }} role="status">
          {t("uphero.skillTree.respecNoCoins")}
        </div>
      )}
      <div className={`typo-micro mb-3 ${gbClass.textDim}`}>
        {t("uphero.skillTree.resourceLabel")}:{" "}
        <span style={{ color: resourceSpec.color }}>
          {resourceName(classType, language) || resourceSpec.name}
        </span> ·{" "}
        {t("uphero.skillTree.spGainHint")}
      </div>
      <div className="flex flex-col gap-3">
        {SKILL_TREE_TIERS.map((tier) => {
          const skills = tree.filter((s) => s.tier === tier);
          const branched = tier === 2 || tier === 3;
          return (
            <div key={tier}>
              <div
                className={`typo-micro mb-1.5 ${gbClass.textDim}`}
                style={{ letterSpacing: "0.08em" }}
              >
                {t("uphero.skillTree.tierLabel", { tier })}
                {tier > 1 &&
                  t("uphero.skillTree.tierMeta", {
                    level: skills[0]?.requiredLevel ?? "?",
                    sp: skills[0]?.pointCost ?? 1,
                  })}
              </div>
              {tier === 2 && (
                <div className={`typo-micro mb-1.5 ${gbClass.textDim}`}>
                  {t("uphero.skillTree.branchHint")}
                </div>
              )}
              {tier === 4 && !anyT3Learned && (
                <div className={`typo-micro mb-1.5 ${gbClass.textDim}`}>
                  {t("uphero.skillTree.capstoneHint")}
                </div>
              )}
              <div
                className={
                  branched ? "grid grid-cols-2 gap-1.5" : "flex flex-col gap-1.5"
                }
              >
                {skills.map((skill) => {
                  const status = statusOf(skill);
                  const isLearned = status === "learned";
                  const isDimmed = status === "branch";
                  return (
                    <div
                      key={skill.id}
                      className={`rounded p-2.5 ${
                        branched
                          ? "flex flex-col gap-2"
                          : "flex items-start gap-2"
                      }`}
                      style={{
                        background: isDimmed ? `${GB.dark}22` : `${GB.dark}55`,
                        opacity: isDimmed
                          ? 0.45
                          : status === "ok" || isLearned
                            ? 1
                            : 0.7,
                        boxShadow: isLearned
                          ? `0 0 0 1px ${resourceSpec.color}66, 0 0 12px ${resourceSpec.color}33`
                          : undefined,
                        transition: `opacity 180ms ${EASE_OUT}, box-shadow 180ms ${EASE_OUT}`,
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span
                            className="typo-caption"
                            style={{ color: GB.lightest }}
                          >
                            {nameOf(skill)}
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
                          {skillDesc(skill.id, skill.description, language)}
                        </div>
                        <div className="flex items-center gap-2 typo-micro tabular-nums">
                          <span style={{ color: resourceSpec.color }}>
                            {skill.resourceCost} {resourceSpec.short}
                          </span>
                          <span className={gbClass.textDim}>·</span>
                          <span className={gbClass.textDim}>
                            {t("uphero.stat.cdPrefix", { cd: skill.cooldown })}
                          </span>
                        </div>
                      </div>
                      {!isLearned && (
                        <button
                          type="button"
                          disabled={status !== "ok"}
                          onClick={() => onLearn(skill)}
                          className={`skill-learn-btn typo-micro rounded px-2 py-1 ${
                            branched ? "w-full" : ""
                          }`}
                          style={{
                            minHeight: 32,
                            background:
                              status === "ok" ? GB.lightest : `${GB.dark}aa`,
                            color: status === "ok" ? GB.darkest : GB.light,
                            opacity: status === "ok" ? 1 : 0.55,
                            cursor: status === "ok" ? "pointer" : "default",
                            fontWeight: 600,
                          }}
                          aria-label={buttonAria(skill, status)}
                        >
                          {buttonLabel(skill, status)}
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
      <GbConfirm
        open={respecOpen}
        title={t("uphero.skillTree.respec")}
        body={t("uphero.skillTree.respecConfirm", { sp: spentSp, cost: respecCost })}
        confirmLabel={t("uphero.skillTree.respec")}
        onConfirm={onRespecConfirm}
        onCancel={() => setRespecOpen(false)}
      />
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
