"use client";

/**
 * Up Hero — Codex (도감).
 *
 * 탐험 중 만난 몬스터를 던전별로 그리드 배치. 아직 만나지 못한 몬스터는
 * silhouette (GB.dark 톤) 으로만 표시 + "???" 이름으로 가림 — collection 본능 자극.
 *
 * 탭 전환 불필요 (일단 몬스터만). 추후 Phase 5+ 에서 equipment / boss 별도 탭.
 */

import { useUpHeroStore } from "@/store/useUpHeroStore";
import { ALL_MONSTER_TEMPLATES } from "@/data/upHeroMonsters";
import { DUNGEONS, DUNGEON_LIST } from "@/data/upHeroDungeons";
import { GB, EASE_OUT, gbClass, GB_ENEMY } from "@/lib/upHeroPalette";
import type { DungeonId } from "@/types/uphero";
import { useSound } from "@/hooks/useSound";
import MonsterSprite from "./MonsterSprite";
import PixelIcon from "@/components/icons/PixelIcon";

interface HeroCodexProps {
  onBack: () => void;
}

export default function HeroCodex({ onBack }: HeroCodexProps) {
  const codex = useUpHeroStore((s) => s.codex);
  const { play } = useSound();

  // 발견 여부 — 신규 name 기반 + 기존 id 기반 둘 다 검사 (하위 호환).
  // 기존 id 는 `{templateId}_f{floor}_{ts}` 포맷이므로 startsWith 로 매칭.
  const discoveredSet = new Set<string>([
    ...codex.monsters,
    ...codex.bosses,
  ]);
  const isDiscovered = (tplId: string, name: string): boolean => {
    if (discoveredSet.has(name)) return true;
    for (const entry of discoveredSet) {
      if (entry.startsWith(`${tplId}_f`)) return true;
    }
    return false;
  };

  // 던전별 몬스터 그룹핑
  const byDungeon = new Map<
    DungeonId,
    { normal: typeof ALL_MONSTER_TEMPLATES; bosses: typeof ALL_MONSTER_TEMPLATES }
  >();
  for (const d of DUNGEON_LIST) {
    byDungeon.set(d.id, { normal: [], bosses: [] });
  }
  for (const t of ALL_MONSTER_TEMPLATES) {
    if (!t.dungeonId) continue;
    const bucket = byDungeon.get(t.dungeonId);
    if (!bucket) continue;
    if (t.isBoss) bucket.bosses.push(t);
    else bucket.normal.push(t);
  }

  const totalCount = ALL_MONSTER_TEMPLATES.length;
  const discoveredCount = ALL_MONSTER_TEMPLATES.filter((t) =>
    isDiscovered(t.id, t.name),
  ).length;
  const pct = totalCount > 0 ? Math.round((discoveredCount / totalCount) * 100) : 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* === SubHeader === */}
      <header
        className="px-3 py-2.5 flex items-center gap-3 shrink-0"
        style={{ borderBottom: `1px solid ${GB.dark}` }}
      >
        <button
          type="button"
          onClick={() => {
            play("cancel");
            onBack();
          }}
          className="uphero-codex-back typo-caption inline-flex items-center gap-1"
          style={{
            minHeight: 40,
            padding: "8px 12px",
            background: `${GB.dark}cc`,
            border: `1px solid ${GB.light}`,
            color: GB.light,
            borderRadius: 6,
          }}
        >
          <PixelIcon name="ChevronLeft" size={14} color={GB.light} />
          뒤로
        </button>
        <div className="flex flex-col leading-tight flex-1">
          <div className="typo-caption" style={{ color: GB.lightest }}>
            도감 — 몬스터
          </div>
          <div className={`typo-caption ${gbClass.textDim} tabular-nums`}>
            {discoveredCount} / {totalCount} ({pct}%)
          </div>
        </div>
        <style jsx>{`
          .uphero-codex-back {
            transition: transform 120ms ${EASE_OUT};
          }
          .uphero-codex-back:active {
            transform: scale(0.97);
          }
        `}</style>
      </header>

      {/* === Body === */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {DUNGEON_LIST.map((dungeon) => {
          const bucket = byDungeon.get(dungeon.id);
          if (!bucket) return null;
          const all = [...bucket.normal, ...bucket.bosses];
          const discoveredHere = all.filter((t) => isDiscovered(t.id, t.name)).length;

          return (
            <section key={dungeon.id} className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="rounded-full"
                  style={{
                    width: 8,
                    height: 8,
                    background: dungeon.themeColor,
                  }}
                />
                <div className="typo-caption" style={{ color: GB.lightest }}>
                  {DUNGEONS[dungeon.id].name}
                </div>
                <div className={`typo-caption tabular-nums ${gbClass.textDim}`}>
                  {discoveredHere}/{all.length}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {all.map((t) => {
                  const found = isDiscovered(t.id, t.name);
                  return (
                    <div
                      key={t.id}
                      className="flex flex-col items-center gap-1 rounded p-2"
                      style={{
                        background: found ? `${GB.dark}88` : `${GB.dark}40`,
                        border: `1px solid ${
                          found
                            ? t.isBoss
                              ? GB_ENEMY
                              : GB.light
                            : GB.dark
                        }`,
                        minHeight: 76,
                      }}
                      aria-label={
                        found ? `${t.name}${t.isBoss ? " (보스)" : ""}` : "미발견"
                      }
                    >
                      <MonsterSprite
                        kind={t.kind}
                        size={28}
                        color={
                          found
                            ? t.isBoss
                              ? GB_ENEMY
                              : GB.lightest
                            : GB.dark
                        }
                      />
                      <div
                        className="typo-micro text-center leading-tight"
                        style={{
                          color: found ? GB.light : `${GB.light}55`,
                          minHeight: 22,
                        }}
                      >
                        {found ? t.name : "???"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
