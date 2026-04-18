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
 * 학습된 스킬이 없으면 bar 자체 숨김 (T1 자동 해금이라 전직 후부터 최소 1 개).
 *
 * a11y: 각 버튼 aria-label 에 스킬명/비용/쿨다운/상태 포함.
 */

import { useUpHeroStore } from "@/store/useUpHeroStore";
import type { CombatSession } from "@/types/uphero";
import { CLASS_RESOURCE } from "@/types/uphero";
import {
  CLASS_SKILL_TREES,
  canFireSkill,
  type ClassSkill,
} from "@/lib/classSkills";
import { GB, EASE_OUT } from "@/lib/upHeroPalette";
import { useSound } from "@/hooks/useSound";

export default function SkillBar({ session }: { session: CombatSession }) {
  const fireSkillManual = useUpHeroStore((s) => s.fireSkillManual);
  const { play } = useSound();
  const cls = session.hero.classType;
  if (!cls) return null;

  const learnedIds = session.hero.learnedSkills ?? [];
  const tree = CLASS_SKILL_TREES[cls];
  const learnedSkills = tree.filter((s) => learnedIds.includes(s.id));
  if (learnedSkills.length === 0) return null;

  const resource = CLASS_RESOURCE[cls];

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
      aria-label="스킬"
    >
      {learnedSkills.map((skill) => {
        const check = canFireSkill(session, skill.id);
        const cd = (session.skillCooldowns ?? {})[skill.id] ?? 0;
        const maxCd = skill.cooldown;
        const cdPct = maxCd > 0 ? (cd / maxCd) * 100 : 0;
        const resourceCur = session.classResource ?? 0;
        const hasResource = resourceCur >= skill.resourceCost;
        const ready = check.ok;

        let srLabel = `${skill.name} · 자원 ${skill.resourceCost} · CD ${skill.cooldown}`;
        if (!ready) {
          if (check.reason === "cooldown") srLabel += ` · 쿨다운 ${cd} round`;
          else if (check.reason === "resource")
            srLabel += ` · ${resource.name} 부족`;
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
              {skill.name}
            </span>
            {/* 자원 비용 */}
            <span
              className="typo-micro tabular-nums"
              style={{
                color: hasResource ? resource.color : "#e88b7a",
                fontSize: 9,
              }}
            >
              {skill.resourceCost}
            </span>
            {/* tier 작은 뱃지 */}
            <span
              className="absolute top-0.5 left-1 typo-micro tabular-nums"
              style={{
                color: GB.light,
                opacity: 0.6,
                fontSize: 8,
              }}
              aria-hidden="true"
            >
              T{skill.tier}
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
          transform: scale(0.94);
        }
      `}</style>
    </div>
  );
}
