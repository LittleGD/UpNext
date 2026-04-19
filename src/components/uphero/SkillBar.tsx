"use client";

/**
 * Phase 12d-3 — 전투 중 수동 스킬 발동 bar.
 *
 * DungeonView 의 HP/TIME/자원 bar 아래. 학습된 스킬 (최대 4개) 아이콘 버튼.
 *   - 자원 충족 + 쿨다운 0 시 tappable
 *   - 탭 시 `fireSkillManual(id)` → 즉시 apply, 자원 차감, CD 세팅
 *   - disabled 상태: cooldown 남아있거나 자원 부족
 *   - 현재 CD 는 반원형 pie overlay 로 표시
 *
 * 학습된 스킬이 없으면 bar 자체 숨김 (Phase 14 — Lv5/Lv15 novice 자동 지급 이후
 * 전직 전에도 최소 1 개, 전직 후 T1 자동 해금 포함).
 *
 * a11y: 각 버튼 aria-label 에 스킬명/비용/쿨다운/상태 포함.
 */

import { useUpHeroStore } from "@/store/useUpHeroStore";
import type { CombatSession } from "@/types/uphero";
import { CLASS_RESOURCE } from "@/types/uphero";
import {
  CLASS_SKILL_TREES,
  NOVICE_SKILLS,
  canFireSkill,
  type ClassSkill,
} from "@/lib/classSkills";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import { skillName, resourceName } from "@/lib/upHeroI18n";

// Phase 14 — novice skill 전용 중립 자원 팔레트 (클래스 분화 전이라 자원이 없음).
//   resourceCost 0 이므로 "자원 부족" 조건은 발생하지 않고, 쿨다운만이 유일한 gate.
const NOVICE_RESOURCE = { color: GB.light, name: "FOCUS", short: "FOC" } as const;

export default function SkillBar({ session }: { session: CombatSession }) {
  const fireSkillManual = useUpHeroStore((s) => s.fireSkillManual);
  const { play } = useSound();
  const { t, language } = useTranslation();
  const cls = session.hero.classType;

  // Phase 14 — novice + 클래스 트리 통합. 전직 전에는 NOVICE_SKILLS 만, 전직 후엔 둘 다.
  //   이전엔 cls null 이면 early return 이라 전직 전 스킬이 전투 UI 에 전혀 노출 안 됨.
  const learnedIds = session.hero.learnedSkills ?? [];
  const tree = cls ? CLASS_SKILL_TREES[cls] : [];
  const learnedSkills = [...NOVICE_SKILLS, ...tree].filter((s) =>
    learnedIds.includes(s.id),
  );
  if (learnedSkills.length === 0) return null;

  const classResource = cls ? CLASS_RESOURCE[cls] : null;
  const resourceOf = (skill: ClassSkill) =>
    skill.class === "novice" || !classResource ? NOVICE_RESOURCE : classResource;

  const onFire = (skill: ClassSkill) => {
    const result = fireSkillManual(skill.id);
    if (result === "ok") {
      play("select");
    } else {
      play("cancel");
    }
  };

  return (
    <div
      className="flex items-center justify-center gap-1.5 px-4 py-2 shrink-0"
      style={{ borderTop: `1px solid ${GB.dark}` }}
      role="toolbar"
      aria-label={t("uphero.skillBar.aria")}
    >
      {learnedSkills.map((skill) => {
        const resource = resourceOf(skill);
        const check = canFireSkill(session, skill.id);
        const cd = (session.skillCooldowns ?? {})[skill.id] ?? 0;
        const maxCd = skill.cooldown;
        const cdPct = maxCd > 0 ? (cd / maxCd) * 100 : 0;
        const resourceCur = session.classResource ?? 0;
        const hasResource = resourceCur >= skill.resourceCost;
        const ready = check.ok;

        const localName = skillName(skill.id, skill.name, language);
        let srLabel = t("uphero.skill.srLabel", {
          name: localName,
          resource: skill.resourceCost,
          cd: skill.cooldown,
        });
        if (!ready) {
          if (check.reason === "cooldown") srLabel += ` · ${t("uphero.skill.cdSuffix", { cd })}`;
          else if (check.reason === "resource")
            srLabel += ` · ${(cls && resourceName(cls, language)) || resource.name}`;
        }

        return (
          <button
            key={skill.id}
            type="button"
            onClick={() => onFire(skill)}
            disabled={!ready}
            aria-label={srLabel}
            className="uphero-skill-btn relative rounded flex flex-col items-center justify-center"
            style={{
              width: 60,
              height: 56,
              background: ready ? `${resource.color}22` : `${GB.dark}55`,
              border: `1px solid ${
                ready ? resource.color : !hasResource ? GB.dark : GB.light
              }`,
              color: ready ? GB.lightest : GB.light,
              opacity: ready ? 1 : 0.55,
              cursor: ready ? "pointer" : "default",
              padding: 2,
            }}
          >
            {/* 스킬명 (짧게) */}
            <span
              className="typo-micro truncate w-full text-center"
              style={{
                color: ready ? GB.lightest : GB.light,
                fontWeight: ready ? 600 : 500,
                fontSize: 9,
                lineHeight: 1.2,
              }}
            >
              {localName}
            </span>
            {/* 자원 비용 — novice (cost=0) 는 CD 값으로 대체해 "무료" 표기 */}
            <span
              className="typo-micro tabular-nums"
              style={{
                color:
                  skill.resourceCost === 0
                    ? GB.light
                    : hasResource
                      ? resource.color
                      : "#e88b7a",
                fontSize: 9,
              }}
            >
              {skill.resourceCost === 0
                ? t("uphero.stat.cdPrefix", { cd: skill.cooldown })
                : skill.resourceCost}
            </span>
            {/* tier 작은 뱃지 — novice (tier 0) 는 "N" 으로 표기 */}
            <span
              className="absolute top-0.5 left-1 typo-micro tabular-nums"
              style={{
                color: GB.light,
                opacity: 0.6,
                fontSize: 8,
              }}
              aria-hidden="true"
            >
              {skill.tier === 0 ? "N" : `T${skill.tier}`}
            </span>
            {/* 쿨다운 overlay */}
            {cd > 0 && (
              <div
                className="absolute inset-0 rounded pointer-events-none flex items-center justify-center"
                aria-hidden="true"
                style={{
                  background: `${GB.darkest}aa`,
                }}
              >
                <span
                  className="typo-body tabular-nums"
                  style={{ color: GB.lightest }}
                >
                  {cd}
                </span>
                {/* CD 진행 bar */}
                <div
                  className="absolute bottom-0 left-0 h-0.5"
                  style={{
                    width: `${cdPct}%`,
                    background: resource.color,
                    transition: `width 240ms ${EASE_OUT}`,
                  }}
                />
              </div>
            )}
          </button>
        );
      })}
      <style jsx>{`
        .uphero-skill-btn {
          transition: transform 120ms ${EASE_OUT}, background 160ms ${EASE_OUT};
        }
        .uphero-skill-btn:not(:disabled):active {
          /* Emil 원칙 — press feedback scale 0.97 통일. 0.94 는 "짓누름" 감 */
          transform: scale(0.97);
        }
      `}</style>
    </div>
  );
}
