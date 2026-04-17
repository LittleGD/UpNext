"use client";

/**
 * Up Hero — Codex (도감).
 *
 * Phase 5b.2 — 2개 탭 (몬스터 / 장비) 구조로 확장.
 * 발견한 템플릿은 선명하게, 미발견은 silhouette + "???" 로 가림.
 *
 * 데이터 계약:
 * - codex.monsters / codex.bosses: template.name 기반 (legacy instance id 는
 *   store initialize 에서 migration 됨)
 * - codex.equipment: template.baseName 기반 (Phase 5b.2 migration)
 */

import { useState } from "react";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { ALL_MONSTER_TEMPLATES } from "@/data/upHeroMonsters";
import { ALL_EQUIPMENT_TEMPLATES } from "@/data/upHeroEquipment";
import { DUNGEONS, DUNGEON_LIST } from "@/data/upHeroDungeons";
import {
  GB,
  EASE_OUT,
  gbClass,
  GB_ENEMY,
  GB_LEGEND,
  GB_UNIQUE,
  GB_RARE,
} from "@/lib/upHeroPalette";
import type { DungeonId } from "@/types/uphero";
import type { Rarity } from "@/types/card";
import { useSound } from "@/hooks/useSound";
import MonsterSprite from "./MonsterSprite";
import PixelIcon from "@/components/icons/PixelIcon";

interface HeroCodexProps {
  onBack: () => void;
}

type Tab = "monsters" | "equipment";

// 장비 탭에서 표시할 대표 rarity (legend > unique > rare > normal 순 중 최상위 하나).
// 발견한 장비가 여러 rarity 로 드롭됐어도 가장 높은 등급만 하이라이트.
const RARITY_COLOR: Record<Rarity, string> = {
  normal: GB.light,
  rare: GB_RARE,
  unique: GB_UNIQUE,
  legend: GB_LEGEND,
};

export default function HeroCodex({ onBack }: HeroCodexProps) {
  const codex = useUpHeroStore((s) => s.codex);
  const { play } = useSound();
  const [tab, setTab] = useState<Tab>("monsters");

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
            도감
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

      {/* === Tab switcher === */}
      <nav
        className="flex items-center gap-0 px-3 shrink-0"
        style={{ borderBottom: `1px solid ${GB.dark}` }}
      >
        <TabButton
          active={tab === "monsters"}
          onClick={() => {
            play("select");
            setTab("monsters");
          }}
          label="몬스터"
        />
        <TabButton
          active={tab === "equipment"}
          onClick={() => {
            play("select");
            setTab("equipment");
          }}
          label="장비"
        />
      </nav>

      {/* === Body === */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {tab === "monsters" ? (
          <MonsterCodex codex={codex} />
        ) : (
          <EquipmentCodex codex={codex} />
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────── */

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="typo-caption"
      style={{
        padding: "10px 16px",
        color: active ? GB.lightest : GB.light,
        background: "transparent",
        borderBottom: `2px solid ${active ? GB.lightest : "transparent"}`,
        marginBottom: -1,
        transition: `color 180ms ${EASE_OUT}, border-color 180ms ${EASE_OUT}`,
      }}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </button>
  );
}

/* ────────────────────────────────────────────── */

function MonsterCodex({
  codex,
}: {
  codex: { monsters: string[]; bosses: string[] };
}) {
  // 발견 여부 — 신규 name 기반 + 기존 legacy id 기반 모두 (하위 호환).
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
    <>
      <div
        className={`typo-caption tabular-nums mb-3 ${gbClass.textDim}`}
      >
        {discoveredCount} / {totalCount} ({pct}%)
      </div>
      {DUNGEON_LIST.map((dungeon) => {
        const bucket = byDungeon.get(dungeon.id);
        if (!bucket) return null;
        const all = [...bucket.normal, ...bucket.bosses];
        const discoveredHere = all.filter((t) => isDiscovered(t.id, t.name))
          .length;

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
              <div
                className={`typo-caption tabular-nums ${gbClass.textDim}`}
              >
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
                        found ? (t.isBoss ? GB_ENEMY : GB.light) : GB.dark
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
    </>
  );
}

/* ────────────────────────────────────────────── */

function EquipmentCodex({ codex }: { codex: { equipment: string[] } }) {
  // 발견 여부 — baseName 기반 (Phase 5b.2 migration 이후).
  // Legacy instance ID (eq_ 로 시작) 가 남아있다면 startsWith 로 매칭 fallback.
  const discoveredSet = new Set<string>(codex.equipment);
  const isDiscovered = (baseName: string): boolean => {
    if (discoveredSet.has(baseName)) return true;
    // legacy fallback: "eq_{baseName stripped}..."
    const stripped = baseName.replace(/\s/g, "");
    for (const entry of discoveredSet) {
      if (entry.startsWith(`eq_${stripped}_`)) return true;
    }
    return false;
  };

  // 던전별 그룹핑
  const byDungeon = new Map<DungeonId, typeof ALL_EQUIPMENT_TEMPLATES>();
  for (const d of DUNGEON_LIST) byDungeon.set(d.id, []);
  for (const t of ALL_EQUIPMENT_TEMPLATES) {
    byDungeon.get(t.category)?.push(t);
  }

  const total = ALL_EQUIPMENT_TEMPLATES.length;
  const discovered = ALL_EQUIPMENT_TEMPLATES.filter((t) =>
    isDiscovered(t.baseName),
  ).length;
  const pct = total > 0 ? Math.round((discovered / total) * 100) : 0;

  return (
    <>
      <div
        className={`typo-caption tabular-nums mb-3 ${gbClass.textDim}`}
      >
        {discovered} / {total} ({pct}%)
      </div>
      {DUNGEON_LIST.map((dungeon) => {
        const templates = byDungeon.get(dungeon.id) ?? [];
        if (templates.length === 0) return null;
        const hereFound = templates.filter((t) => isDiscovered(t.baseName))
          .length;

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
              <div
                className={`typo-caption tabular-nums ${gbClass.textDim}`}
              >
                {hereFound}/{templates.length}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {templates.map((t) => {
                const found = isDiscovered(t.baseName);
                return (
                  <div
                    key={t.baseName}
                    className="flex flex-col items-center gap-1 rounded p-2"
                    style={{
                      background: found ? `${GB.dark}88` : `${GB.dark}40`,
                      border: `1px solid ${
                        found ? dungeon.themeColor : GB.dark
                      }`,
                      minHeight: 84,
                    }}
                    aria-label={found ? t.baseName : "미발견 장비"}
                  >
                    <PixelIcon
                      name={t.iconName}
                      size={26}
                      color={
                        found ? RARITY_COLOR[getHighestRarity()] : GB.dark
                      }
                    />
                    <div
                      className="typo-micro text-center leading-tight"
                      style={{
                        color: found ? GB.light : `${GB.light}55`,
                        minHeight: 22,
                      }}
                    >
                      {found ? t.baseName : "???"}
                    </div>
                    {found && (
                      <div
                        className="typo-micro"
                        style={{ color: `${GB.light}88` }}
                      >
                        {t.type === "weapon"
                          ? "무기"
                          : t.type === "armor"
                            ? "갑옷"
                            : t.type === "accessory"
                              ? "액세서리"
                              : "부적"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}

// 장비 codex 는 baseName 단위라 drop 한 rarity 정보가 사라짐.
// 일단 발견한 장비는 normal 색상으로 통일 — 등급별 분류는 Phase 6+ 로 미룸.
function getHighestRarity(): Rarity {
  return "normal";
}
