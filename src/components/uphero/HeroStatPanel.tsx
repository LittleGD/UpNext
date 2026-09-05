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

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useHeroLevel } from "./useHeroLevel";
import { useModalA11y } from "@/hooks/useModalA11y";
import KeyboardAccessoryBar from "@/components/common/KeyboardAccessoryBar";
import {
  computeEffectiveStats,
  computeHeroForLevel,
  getHeroAppearanceVariant,
  CLASS_META,
  CLASS_THEME_COLOR,
} from "@/types/uphero";
import type { EquipSlot } from "@/types/uphero";
import { GB, EASE_OUT, gbClass } from "@/lib/upHeroPalette";
import { TALISMAN_SKILLS } from "@/lib/talismanSkills";
import { useTranslation } from "@/hooks/useTranslation";
import type { DictKey } from "@/i18n";
import { skillName, skillDesc, className as classNameI18n, classPassive, equipmentNameById } from "@/lib/upHeroI18n";
import HeroSprite from "./HeroSprite";
import HexStatChart from "./HexStatChart";
import SkillTreePanel from "./SkillTreePanel";
import PixelIcon from "@/components/icons/PixelIcon";

interface HeroStatPanelProps {
  onClose: () => void;
}

// Phase 12b — STAT_ROWS 는 HexStatChart 로 대체 (선형 bar 제거).
//   HeroBaseStats 타입은 아래 effective 객체에서 그대로 사용.

// Phase 12 R-i18n — 슬롯 라벨 키. `t()` 를 여기서 호출하려면 함수 컨텍스트
//   안이어야 하므로 key 만 저장하고 렌더에서 변환.
const SLOT_LABEL_KEY: Record<EquipSlot, DictKey> = {
  weapon: "uphero.slot.weapon",
  armor: "uphero.slot.armor",
  accessory: "uphero.slot.accessory",
  talisman: "uphero.slot.talisman",
};

export default function HeroStatPanel({ onClose }: HeroStatPanelProps) {
  const { t, language } = useTranslation();
  const hero = useUpHeroStore((s) => s.hero);
  // Phase 2-A — 영웅 레벨은 heroXp 풀 기준.
  const level = useHeroLevel();
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

  // Phase 9a — Esc 닫기 + focus trap + body scroll lock.
  const containerRef = useRef<HTMLDivElement>(null);
  useModalA11y(containerRef, onClose);

  if (typeof window === "undefined") return null;

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("uphero.stat.title")}
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        background: GB.darkest,
        color: GB.light,
        opacity: mounted ? 1 : 0,
        transition: `opacity 200ms ${EASE_OUT}`,
        paddingTop: "calc(env(safe-area-inset-top) + 10px)",
        paddingBottom: "calc(max(env(safe-area-inset-bottom), 24px) + 10px)",
        outline: "none",
      }}
    >
      {/* === Header === Phase 11b-fix: 제목 typo-body 승격 + 닫기 ghost. */}
      <header
        className="px-4 py-2 flex items-center justify-between shrink-0"
        style={{ borderBottom: `1px solid ${GB.dark}` }}
      >
        <div
          className="typo-body"
          style={{ color: GB.lightest, fontWeight: 500 }}
        >
          {t("uphero.stat.title")}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="uphero-stat-close typo-caption rounded inline-flex items-center gap-0.5"
          style={{
            minHeight: 40,
            padding: "6px 8px",
            background: "transparent",
            color: GB.light,
            border: "none",
          }}
          aria-label={t("uphero.stat.closeAria")}
        >
          <span style={{ fontWeight: 700 }}>✕</span>
          {t("uphero.stat.close")}
          <style jsx>{`
            .uphero-stat-close {
              transition: transform 120ms ${EASE_OUT},
                background 160ms ${EASE_OUT};
            }
            .uphero-stat-close:active {
              transform: scale(0.96);
              background: ${GB.dark}66;
            }
          `}</style>
        </button>
      </header>

      {/* === Body === */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* 영웅 sprite + 이름 */}
        <section className="py-6 flex flex-col items-center">
          {/* Phase 12a — 이름 편집 가능 chip. 탭 시 inline input 전환. */}
          <HeroNameEditor name={hero.name} />
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
            {t("uphero.stat.nextLevelGrowth", { level: level + 1 })}
          </div>
        </section>

        {/* Phase 5c.3 → 5d → 6b: class 분화된 영웅이면 별도 섹션.
             block 카드 (icon + name + passive) + Phase 6b 토글 (자동 스킬). */}
        {hero.classType && <ClassSection hero={hero} />}
        {/* Phase 12d — 클래스별 스킬트리 (전직 후에만 노출). */}
        {hero.classType && <SkillTreePanel classType={hero.classType} />}
        {/* Phase 14 — 전직 전 영웅용 기본 스킬 섹션 (novice).
             이전엔 class 분화가 돼야만 스킬 UI 가 떴는데, 그러면 Lv1–Lv29 구간에는
             영웅이 "스킬 개념 자체를 모름". level gate 달성 시 자동 지급되는
             튜토리얼 스킬을 여기서 노출해 전투 중 수동 발동 방법을 학습시킨다. */}
        {!hero.classType && <NoviceSkillSection hero={hero} heroLevel={level} />}

        {/* Phase 12b — 스탯 radar chart. 기존 선형 bar (max 40 cap) → 육각형.
             각 축의 max 는 레벨/클래스 기반 동적 계산. 장비 bonus 가 max 초과 시
             꼭짓점이 바깥으로 튀어나와 "강해짐" 시각화. */}
        <section
          className="px-5 pb-5"
          style={{ borderTop: `1px solid ${GB.dark}` }}
        >
          <div className={`typo-caption pt-4 pb-3 ${gbClass.textDim}`}>
            {t("uphero.stat.statsLabel")}
          </div>
          <HexStatChart
            base={base}
            effective={effective}
            level={level}
            classType={hero.classType}
            size={240}
          />
        </section>

        {/* 장착 장비 4개 */}
        <section
          className="px-5 pb-6"
          style={{ borderTop: `1px solid ${GB.dark}` }}
        >
          <div className={`typo-caption pt-4 pb-3 ${gbClass.textDim}`}>
            {t("uphero.stat.equipmentLabel")}
          </div>
          <div className="flex flex-col gap-2">
            {(Object.keys(SLOT_LABEL_KEY) as EquipSlot[]).map((slot) => {
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
                    {t(SLOT_LABEL_KEY[slot])}
                  </div>
                  {eq ? (
                    <>
                      {eq.photoId ? (
                        <StatPanelPhotoThumb photoId={eq.photoId} size={18} />
                      ) : (
                        <PixelIcon
                          name={eq.iconName}
                          size={16}
                          color={GB.lightest}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div
                          className="typo-caption truncate"
                          style={{ color: GB.lightest }}
                        >
                          {equipmentNameById(eq.baseId ?? "", eq.name, language)}
                        </div>
                        {/* Phase 11b — talisman skill chips. 부적 슬롯 외에도
                             미래 확장 시 accessory 등에 skills 가 생기면 자동 표기. */}
                        {eq.talismanSkills && eq.talismanSkills.length > 0 && (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {eq.talismanSkills.map((id) => {
                              const skillDef = TALISMAN_SKILLS[id];
                              const localTitle = skillDesc(
                                id,
                                skillDef?.description ?? "",
                                language,
                              );
                              const localName = skillName(
                                id,
                                skillDef?.name ?? id,
                                language,
                              );
                              return (
                                <span
                                  key={id}
                                  className="typo-micro px-1 py-0.5 rounded-sm"
                                  style={{
                                    fontSize: 9,
                                    background: `${GB.lightest}22`,
                                    color: GB.lightest,
                                    border: `1px solid ${GB.lightest}66`,
                                    letterSpacing: "0.02em",
                                  }}
                                  title={localTitle}
                                >
                                  ✦ {localName}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className={`typo-caption flex-1 ${gbClass.textDim}`}>
                      {t("uphero.stat.emptySlot")}
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
 * Phase 12a — HeroNameEditor (영웅 이름 inline 편집)
 * ──────────────────────────────────────────── */

function HeroNameEditor({ name }: { name: string }) {
  const { t } = useTranslation();
  const renameHero = useUpHeroStore((s) => s.renameHero);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  // 편집 시작(또는 편집 중 name 외부 변경) 시 draft 동기화 — 렌더 단계 prev-비교
  // setState 패턴 (기존 useEffect 내 동기 setState 를 규칙 준수 형태로 대체)
  const [prevEditing, setPrevEditing] = useState(editing);
  const [prevName, setPrevName] = useState(name);
  if (prevEditing !== editing || prevName !== name) {
    setPrevEditing(editing);
    setPrevName(name);
    if (editing) setDraft(name);
  }

  useEffect(() => {
    if (!editing) return;
    // next tick 에 focus + select
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 20);
    return () => clearTimeout(timer);
  }, [editing, name]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) renameHero(trimmed);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(name);
    setEditing(false);
  };

  if (editing) {
    return (
      <>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 16))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
          aria-label={t("uphero.stat.nameEditAria")}
          maxLength={16}
          className="typo-caption mb-3 px-2.5 py-1 rounded-sm text-center"
          style={{
            background: GB.lightest,
            color: GB.darkest,
            letterSpacing: "0.05em",
            border: `2px solid ${GB.light}`,
            outline: "none",
            minWidth: 120,
          }}
        />
        {/* 이름 편집 중 키보드 위에 완료/취소 액세서리 바 — blur 외의 명시적 경로. */}
        <KeyboardAccessoryBar
          visible={editing}
          onDone={commit}
          onCancel={cancel}
        />
      </>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={t("uphero.stat.nameEditAriaTap", { name })}
      className="typo-caption mb-3 px-2.5 py-1 rounded-sm inline-flex items-center gap-1.5"
      style={{
        background: GB.lightest,
        color: GB.darkest,
        letterSpacing: "0.05em",
        border: "none",
        cursor: "pointer",
      }}
    >
      <span>{name}</span>
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          opacity: 0.55,
          flexShrink: 0,
        }}
      >
        <PixelIcon name="PenSquare" size={12} color={GB.darkest} />
      </span>
    </button>
  );
}

/* ────────────────────────────────────────────
 * Phase 6b — ClassSection (분화된 영웅의 class 정보 + 스킬 + 자동 토글)
 * ──────────────────────────────────────────── */

import { CLASS_SKILLS, NOVICE_SKILLS } from "@/lib/classSkills";
import type { Hero } from "@/types/uphero";
import { getThumbnailBlob, blobToUrl } from "@/lib/photoStorage";

function ClassSection({ hero }: { hero: Hero }) {
  const { t, language } = useTranslation();
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
        {t("uphero.stat.classLabel")}
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
            {classNameI18n(hero.classType, language)}
          </div>
          <div className={`typo-caption ${gbClass.textDim} leading-tight`}>
            {classPassive(hero.classType, meta.passive, language)}
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
              {t("uphero.skill.activeLabel", {
                name: skillName(skill.id, skill.name, language),
              })}
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
                {ready ? t("uphero.stat.skillReady") : t("uphero.stat.skillCooldown", { n: currentCooldown })}
              </span>
            )}
          </div>
          <div className={`typo-caption ${gbClass.textDim} leading-tight`}>
            {sessionActive
              ? t("uphero.stat.autoFireHint")
              : `${t("uphero.stat.cdPrefix", { cd: skill.cooldown })} · ${t("uphero.stat.autoFireHint")}`}
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
        {/* Phase 9a — tap target 28 → 44 (Apple HIG). 상태 전환 액션이라
             실수 탭 방지가 특히 중요. 시각적 size 는 그대로 유지되도록
             padding 으로 여유 확보. */}
        <button
          type="button"
          onClick={toggleAutoSkill}
          className="uphero-auto-toggle typo-micro tabular-nums rounded px-3 py-2"
          style={{
            minHeight: 44,
            background: autoEnabled ? GB.lightest : `${GB.dark}cc`,
            color: autoEnabled ? GB.darkest : GB.light,
            border: `1px solid ${autoEnabled ? GB.lightest : GB.light}`,
            letterSpacing: "0.05em",
          }}
          aria-label={t("uphero.stat.autoToggleAria", {
            state: autoEnabled
              ? t("uphero.stat.autoToggleOn")
              : t("uphero.stat.autoToggleOff"),
          })}
          aria-pressed={autoEnabled}
        >
          {autoEnabled
            ? t("uphero.stat.autoSkillOn")
            : t("uphero.stat.autoSkillOff")}
          <style jsx>{`
            .uphero-auto-toggle {
              transition: transform 120ms ${EASE_OUT},
                background 180ms ${EASE_OUT};
            }
            .uphero-auto-toggle:active {
              transform: scale(0.96);
            }
          `}</style>
        </button>
      </div>
    </section>
  );
}

/** Phase 7 — stat panel 장비 섹션의 photo 부적 썸네일 (18px) */
function StatPanelPhotoThumb({
  photoId,
  size,
}: {
  photoId: string;
  size: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    getThumbnailBlob(photoId)
      .then((blob) => {
        if (!active || !blob) return;
        objectUrl = blobToUrl(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId]);

  if (!url) {
    return (
      <div
        className="rounded-sm"
        style={{ width: size, height: size, background: `${GB.dark}` }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      aria-hidden="true"
      className="rounded-sm"
      style={{ width: size, height: size, objectFit: "cover" }}
    />
  );
}

/* ────────────────────────────────────────────
 * Phase 14 — NoviceSkillSection (전직 전 영웅의 기본 스킬 섹션)
 *
 * 분화 전 (classType === null) 영웅에게 novice 스킬 목록을 보여준다.
 * - 이미 learned 인 스킬: 체크 표시 + 설명.
 * - 아직 레벨 미달인 스킬: disabled 표시 + "Lv N 에 해금" 안내.
 * 학습 버튼은 없음 — level gate 달성 시 자동 지급됨 (grantNoviceSkills).
 * ──────────────────────────────────────────── */
function NoviceSkillSection({ hero, heroLevel }: { hero: Hero; heroLevel: number }) {
  const { t, language } = useTranslation();
  const learned = hero.learnedSkills ?? [];

  return (
    <section className="px-5 pb-5" style={{ borderTop: `1px solid ${GB.dark}` }}>
      <div className={`typo-caption pt-4 pb-2 ${gbClass.textDim}`}>
        {t("uphero.novice.heading")}
      </div>
      <div className={`typo-micro mb-3 ${gbClass.textDim}`}>
        {t("uphero.novice.subtitle")}
      </div>
      <div className="flex flex-col gap-1.5">
        {NOVICE_SKILLS.map((skill) => {
          const isLearned = learned.includes(skill.id);
          const levelOk = heroLevel >= skill.requiredLevel;
          const status: "learned" | "locked" = isLearned ? "learned" : "locked";
          const borderColor = isLearned
            ? GB.lightest
            : levelOk
              ? GB.light
              : GB.dark;
          return (
            <div
              key={skill.id}
              className="flex items-start gap-2 rounded p-2.5"
              style={{
                background: `${GB.dark}55`,
                border: `1px solid ${borderColor}`,
                opacity: isLearned ? 1 : 0.7,
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="typo-caption" style={{ color: GB.lightest }}>
                    {skillName(skill.id, skill.name, language)}
                  </span>
                  {isLearned && (
                    <span
                      className="typo-micro tabular-nums px-1.5 rounded-sm"
                      style={{ background: GB.lightest, color: GB.darkest }}
                    >
                      ✓
                    </span>
                  )}
                </div>
                <div className={`typo-micro mb-1 ${gbClass.textDim}`}>
                  {skillDesc(skill.id, skill.description, language)}
                </div>
                <div className="flex items-center gap-2 typo-micro tabular-nums">
                  <span className={gbClass.textDim}>
                    {t("uphero.stat.cdPrefix", { cd: skill.cooldown })}
                  </span>
                  {!isLearned && (
                    <>
                      <span className={gbClass.textDim}>·</span>
                      <span style={{ color: levelOk ? GB.light : GB.dark }}>
                        {t("uphero.novice.unlockAt", { level: skill.requiredLevel })}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <span
                className="typo-micro px-1.5 py-0.5 rounded-sm"
                style={{
                  background: `${GB.dark}80`,
                  color: GB.light,
                  fontSize: 9,
                }}
              >
                {status === "learned"
                  ? t("uphero.novice.badge.learned")
                  : t("uphero.novice.badge.locked")}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
