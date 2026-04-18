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
import {
  ALL_MONSTER_TEMPLATES,
  type MonsterTemplate,
} from "@/data/upHeroMonsters";
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
import { useTranslation } from "@/hooks/useTranslation";
import { monsterNameById } from "@/lib/upHeroI18n";
import MonsterSprite from "./MonsterSprite";
import PixelIcon from "@/components/icons/PixelIcon";
import MonsterCodexDetailModal from "./MonsterCodexDetailModal";

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
  const { t } = useTranslation();
  const codex = useUpHeroStore((s) => s.codex);
  const { play } = useSound();
  const [tab, setTab] = useState<Tab>("monsters");

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* === SubHeader === Phase 11b-fix: 뒤로 ghost, 제목 typo-body. */}
      <header
        className="px-3 py-2 flex items-center gap-1 shrink-0"
        style={{ borderBottom: `1px solid ${GB.dark}` }}
      >
        <button
          type="button"
          onClick={() => {
            play("cancel");
            onBack();
          }}
          className="uphero-codex-back typo-caption inline-flex items-center gap-0.5 rounded"
          style={{
            minHeight: 40,
            padding: "6px 8px",
            background: "transparent",
            border: "none",
            color: GB.light,
          }}
          aria-label={t("uphero.codex.back.aria")}
        >
          <PixelIcon name="ChevronLeft" size={14} color={GB.light} />
          {t("uphero.codex.back")}
        </button>
        <div
          className="typo-body ml-1"
          style={{ color: GB.lightest, fontWeight: 500 }}
        >
          {t("uphero.codex.title")}
        </div>
        <style jsx>{`
          .uphero-codex-back {
            transition: transform 120ms ${EASE_OUT},
              background 160ms ${EASE_OUT};
          }
          .uphero-codex-back:active {
            transform: scale(0.96);
            background: ${GB.dark}66;
          }
        `}</style>
      </header>

      {/* === Tab switcher ===
            Phase 9c — EquipmentInventory / Collection / Playground 와 동일
            sliding underline 패턴으로 통일. 두 객체 (A↓/B↑) 가 아닌 하나의
            밑줄이 옮겨가는 common-fate 지각. */}
      <nav
        className="relative flex items-stretch shrink-0"
        style={{ borderBottom: `1px solid ${GB.dark}` }}
      >
        <TabButton
          active={tab === "monsters"}
          onClick={() => {
            play("select");
            setTab("monsters");
          }}
          label={t("uphero.codex.tab.monsters")}
        />
        <TabButton
          active={tab === "equipment"}
          onClick={() => {
            play("select");
            setTab("equipment");
          }}
          label={t("uphero.codex.tab.equipment")}
        />
        <div
          aria-hidden="true"
          className="absolute bottom-[-1px] h-[2px]"
          style={{
            width: "50%",
            left: 0,
            background: GB.lightest,
            transform: `translateX(${tab === "monsters" ? "0%" : "100%"})`,
            transition: `transform 240ms ${EASE_OUT}`,
            boxShadow: `0 0 4px ${GB.lightest}66`,
          }}
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

// Phase 9c — underline 은 부모의 sliding indicator 로 옮겨감. flex-1 + press.
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
      className="hero-codex-tab-btn typo-caption flex-1"
      style={{
        padding: "10px 8px",
        color: active ? GB.lightest : GB.light,
        background: "transparent",
      }}
      aria-current={active ? "page" : undefined}
    >
      {label}
      <style jsx>{`
        .hero-codex-tab-btn {
          transition: color 180ms ${EASE_OUT}, transform 120ms ${EASE_OUT};
        }
        .hero-codex-tab-btn:active {
          transform: scale(0.97);
        }
      `}</style>
    </button>
  );
}

/* ────────────────────────────────────────────── */

function MonsterCodex({
  codex,
}: {
  codex: { monsters: string[]; bosses: string[] };
}) {
  // Phase 12 — 발견된 몬스터 탭 시 디테일 모달. 미발견은 클릭 불가
  //   (spoiler 방지). sound cue 는 기존 codex 의 "select" 재사용.
  const { play } = useSound();
  const { language } = useTranslation();
  const [detailTemplate, setDetailTemplate] =
    useState<MonsterTemplate | null>(null);

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
                // Phase 12 — 발견됐으면 button, 미발견은 div (클릭 불가).
                const Tag = found ? "button" : "div";
                return (
                  <Tag
                    key={t.id}
                    type={found ? "button" : undefined}
                    onClick={
                      found
                        ? () => {
                            play("select");
                            setDetailTemplate(t);
                          }
                        : undefined
                    }
                    className="monster-codex-card flex flex-col items-center gap-1 rounded p-2"
                    style={{
                      background: found ? `${GB.dark}88` : `${GB.dark}40`,
                      border: `1px solid ${
                        found ? (t.isBoss ? GB_ENEMY : GB.light) : GB.dark
                      }`,
                      minHeight: 76,
                      color: GB.light,
                      cursor: found ? "pointer" : "default",
                    }}
                    aria-label={
                      found
                        ? `${monsterNameById(t.id, t.name, language)}${t.isBoss ? " (BOSS)" : ""}`
                        : "???"
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
                      {found ? monsterNameById(t.id, t.name, language) : "???"}
                    </div>
                  </Tag>
                );
              })}
            </div>
          </section>
        );
      })}
      {detailTemplate && (
        <MonsterCodexDetailModal
          template={detailTemplate}
          onClose={() => setDetailTemplate(null)}
        />
      )}
      <style jsx>{`
        /* Emil 원칙: pressable 버튼은 120-160ms ease-out scale(0.97) 로 터치 피드백. */
        .monster-codex-card {
          transition: transform 140ms ${EASE_OUT}, background 160ms ${EASE_OUT};
        }
        button.monster-codex-card:active {
          transform: scale(0.97);
        }
        button.monster-codex-card:hover {
          background: ${GB.dark};
        }
      `}</style>
    </>
  );
}

/* ────────────────────────────────────────────── */

function EquipmentCodex({ codex }: { codex: { equipment: string[] } }) {
  const { t: tr } = useTranslation();
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
                    aria-label={found ? t.baseName : tr("uphero.codex.equipmentUnknownAria")}
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
                          ? tr("uphero.codex.slotWeapon")
                          : t.type === "armor"
                            ? tr("uphero.codex.slotArmor")
                            : t.type === "accessory"
                              ? tr("uphero.codex.slotAccessory")
                              : tr("uphero.codex.slotTalisman")}
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
