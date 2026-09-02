"use client";

/**
 * Up Hero — DungeonView.
 *
 * 전투 세션 진행 메인 view. 구성:
 *  - 상단 헤더: 던전명 / 현재 floor / 영웅 HP 바
 *  - 본문: CombatLog (auto-scroll)
 *  - 하단 컨트롤: 속도 (1× / 2× / 4×) / 일시정지 / 캠프로
 *  - awaitingChoice 이면 ChoicePanel 오버레이
 *
 * tick 자동 진행:
 *  - speed 별 interval: 1× = 1200ms, 2× = 600ms, 4× = 300ms
 *  - session.status 가 "active" 일 때만 tick
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUpHeroStore, slotSpinsLeft } from "@/store/useUpHeroStore";
import { useGameStore } from "@/store/useGameStore";
import { DUNGEONS } from "@/data/upHeroDungeons";
import {
  computeEffectiveStats,
  getHeroAppearanceVariant,
  getEffectiveHeroLevel,
  CLASS_THEME_COLOR,
} from "@/types/uphero";
import type { CombatSession, Monster } from "@/types/uphero";
import { GB, EASE_OUT, gbClass, GB_ENEMY, GB_WARN, GB_LEGEND } from "@/lib/upHeroPalette";
import { useSound } from "@/hooks/useSound";
import { useTranslation } from "@/hooks/useTranslation";
import { dungeonName, monsterName } from "@/lib/upHeroI18n";
import CombatLog from "./CombatLog";
import ChoicePanel from "./ChoicePanel";
import BossBanner from "./BossBanner";
import HeroSprite from "./HeroSprite";
import MonsterSprite from "./MonsterSprite";
import GbConfirm from "./GbConfirm";
import NumberRoll from "./NumberRoll";
import DungeonAtmosphere from "./DungeonAtmosphere";
import ChoiceResultModal from "./ChoiceResultModal";
import SlotMachineModal from "./SlotMachineModal";
import ClassResourceBar from "./ClassResourceBar";
import SkillBar from "./SkillBar";
import MinigameModal from "./MinigameModal";
import DungeonHelpModal from "./DungeonHelpModal";
import PixelIcon from "@/components/icons/PixelIcon";
import { useDungeonAnimations } from "./useDungeonAnimations";
import { useDungeonAnnouncer } from "./useDungeonAnnouncer";

const TICK_INTERVAL: Record<1 | 2 | 4, number> = {
  1: 1200,
  2: 600,
  4: 300,
};

// Phase 10 — "아직 닫지 않은" 최신 choiceResult entry 스캔.
//   encounter choice (싸운다/도망) 의 narrative 는 "> " 로 시작하지 않으므로 자동 제외.
//   최근 encounter/combat/보스 등장 이후만 — 그보다 오래된 건 이미 지나간 것.
//   Phase 11c R1 — explicit choiceResult variant (기존: narrative prefix 매칭).
function findActiveChoiceResult(session: CombatSession | null, seenUpTo: number) {
  if (!session) return null;
  for (let idx = session.log.length - 1; idx >= 0; idx -= 1) {
    const entry = session.log[idx];
    if (entry.type === "combat" || entry.type === "encounter" || entry.type === "boss")
      break;
    if (entry.type !== "choiceResult") continue;
    if (idx <= seenUpTo) continue;
    return {
      idx,
      text: entry.text,
      summary: entry.effectSummary ?? null,
      summaryData: entry.effectSummaryData ?? null,
      actionLabelKey: entry.actionLabelKey,
      actionLabelFallback: entry.actionLabelFallback,
      resultTextKey: entry.resultTextKey,
      resultTextFallback: entry.resultTextFallback,
      // 굴림틀 결과면 일반 결과 모달 대신 드럼 연출이 받는다.
      slot: entry.slot ?? null,
    };
  }
  return null;
}

export default function DungeonView() {
  const session = useUpHeroStore((s) => s.currentSession);
  const tickSession = useUpHeroStore((s) => s.tickSession);
  const resumeSession = useUpHeroStore((s) => s.resumeSession);
  // Phase 12e — 미니게임 결과 해소 action.
  const resolveMinigame = useUpHeroStore((s) => s.resolveMinigame);
  const abandonSession = useUpHeroStore((s) => s.abandonSession);
  // 굴림틀 — 이 굴림 **뒤**의 영속 스트릭(스토어가 갱신)과 "한 번 더" 액션.
  const slotBlankStreak = useUpHeroStore((s) => s.slotBlankStreak);
  // 오늘 굴림 횟수는 세션이 아니라 shopDaily 에 산다 (하루 상한, 탐험을 넘어 합산).
  const shopDaily = useUpHeroStore((s) => s.shopDaily);
  const spinSlotAgain = useUpHeroStore((s) => s.spinSlotAgain);
  // Phase 9d — 영웅 전용 레벨 사용. variant 결정 등.
  const gameLevel = useGameStore((s) => s.progress.level);
  const heroStartLevel = useUpHeroStore((s) => s.heroStartLevel);
  const heroLevel = getEffectiveHeroLevel(gameLevel, heroStartLevel);

  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [paused, setPaused] = useState(false);
  /** Phase 9a — 포기 confirm 다이얼로그 state (native confirm 대체) */
  const [abandonOpen, setAbandonOpen] = useState(false);
  /** Phase 12f — 인터랙션 도움말 overlay. */
  const [helpOpen, setHelpOpen] = useState(false);
  /** Phase 10 — 방금 resolve 된 event choice 의 결과 narrative.
   *   결과 모달 표시 중 tick pause. 유저 "계속" 또는 2.6s 후 닫힘.
   *   Phase 11c R4 — text + effectSummary 2 필드로 수치 별도 표시.
   *   Phase 15 lint — 표시할 결과는 log 에서 파생(아래 activeChoiceResult useMemo),
   *   상태는 "어디까지 닫았는지(log idx)"만 저장 (set-state-in-effect 제거, 동작 동일). */
  const [choiceSeenUpTo, setChoiceSeenUpTo] = useState(-1);
  // 세션이 바뀌면(종료 포함) seen idx 초기화 — 렌더 단계 prev-비교 setState 패턴
  const sessionKey = session?.startedAt ?? null;
  const [prevSessionKey, setPrevSessionKey] = useState(sessionKey);
  if (sessionKey !== prevSessionKey) {
    setPrevSessionKey(sessionKey);
    setChoiceSeenUpTo(-1);
  }
  const { play } = useSound();
  const { t, language } = useTranslation();

  // Phase 14 code-review High #6 — 전투 visual tell / SR 공지 로직을 hook 으로 분리.
  //   DungeonView 는 render 전용이 되어 가독성 ↑ (1492 → 축소).
  const {
    critShake,
    heroState,
    enemyHurt,
    attackFlash,
    hpRegenFloats,
    genericFloats,
    pulseOverlay,
    timeFlashing,
  } = useDungeonAnimations(session);
  useDungeonAnnouncer(session);

  // render 중 ref 쓰기는 react-hooks/refs 위반 — 읽는 곳이 interval 콜백뿐이라 commit 후 갱신로 충분
  const tickRef = useRef(tickSession);
  useEffect(() => {
    tickRef.current = tickSession;
  });

  // Phase 10 — 이벤트 choice 결과 narrative 감지.
  //   resolveChoice 가 push 하는 choiceResult entry 를 log 에서 파생해 모달 표시.
  //   모달 표시 중에는 tick 이 pause 되어 새 entry 가 쌓이지 않으므로
  //   "아직 닫지 않은 최신 entry" == 기존의 seen-set 스캔과 동일한 결과.
  const activeChoiceResult = useMemo(
    () => findActiveChoiceResult(session, choiceSeenUpTo),
    [session, choiceSeenUpTo],
  );
  const choiceResultText = activeChoiceResult?.text ?? null;

  // 보스 등장 감지 — session.status === "paused" 이고 last log 가 "boss" 엔트리
  // combat.ts 에서 보스 등장 시 자동으로 status = "paused" 로 세팅
  const bossReveal = useMemo(() => {
    if (!session) return null;
    if (session.status !== "paused") return null;
    const last = session.log[session.log.length - 1];
    if (last?.type !== "boss") return null;
    return { monster: last.monster as Monster, floor: last.floor };
  }, [session]);

  // 보스 등장 시 사운드/진동 재생
  const bossSoundPlayedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!bossReveal) return;
    // 같은 보스에 대해 1회만 재생
    const ts = session?.log[session.log.length - 1]?.timestamp ?? 0;
    if (bossSoundPlayedRef.current === ts) return;
    bossSoundPlayedRef.current = ts;
    play("impactShake");
  }, [bossReveal, session, play]);

  // auto-tick loop — session.status === "active" 일 때만.
  // Phase 10 — choice result 모달 열려있으면 tick 도 pause → 유저가 결과 읽을 시간.
  useEffect(() => {
    if (!session) return;
    if (session.status !== "active") return;
    if (paused) return;
    if (choiceResultText !== null) return;
    const id = window.setInterval(() => {
      tickRef.current();
    }, TICK_INTERVAL[speed]);
    return () => window.clearInterval(id);
  }, [session, speed, paused, choiceResultText]);

  // Phase 4c-polish: 현재 진행 중인 encounter 의 몬스터 — sprite 표시용.
  // 마지막 encounter 이후 victory/drop 이 나왔으면 전투 종료라 null.
  // (early return 위로 이동 — hook 은 조건부 호출 불가, react-hooks/rules-of-hooks)
  const currentEnemy = session ? findActiveEnemy(session.log) : null;
  const sessionLog = session?.log;
  // Phase 12 bugfix — 적 HP 를 log 누적으로 계산해 bar 표시 (수치는 숨김).
  //   몬스터는 static hp 에서 hero-attacker combat entry 의 damage 만 누적 감산.
  // Phase 12 R3 — useMemo 래핑: log 길이 / currentEnemy 변화 시에만 재계산.
  //   speed toggle / paused / other state 변경에 의한 무상관 recompute 제거.
  // Phase 15 bugfix — regen trait 몬스터는 engine 의 computeMonsterHp 가 log 의
  //   monsterEffect/regen 을 더해 HP 를 유지하는데 UI 계산이 이를 누락해 "바는
  //   0 인데 몬스터가 안 죽는" 상태 노출. engine 로직과 일치시킴 (regen 가산 +
  //   maxHp cap). 14 종 regen 몬스터 (일반 7 + 보스 7) 모두 영향.
  const enemyHpPct = useMemo(() => {
    if (!currentEnemy || !sessionLog) return 100;
    let hp = currentEnemy.hp;
    const cap = currentEnemy.maxHp ?? currentEnemy.hp;
    let startIdx = -1;
    for (let i = sessionLog.length - 1; i >= 0; i--) {
      if (sessionLog[i].type === "encounter") {
        startIdx = i;
        break;
      }
    }
    if (startIdx < 0) return 100;
    for (let i = startIdx + 1; i < sessionLog.length; i++) {
      const e = sessionLog[i];
      if (e.type === "combat") {
        if (e.damage === 0) continue;
        if (e.attacker === "hero") hp -= e.damage;
        continue;
      }
      if (e.type === "monsterEffect" && e.effect === "regen") {
        hp = Math.min(cap, hp + e.amount);
      }
    }
    return Math.max(0, Math.min(100, (hp / cap) * 100));
  }, [currentEnemy, sessionLog]);

  if (!session) return null;

  const dungeon = DUNGEONS[session.dungeonId];
  const hp = session.hero.hp;
  const maxHp = session.hero.maxHp;
  const hpPct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  // Phase 4c.2 — 탐험 시간 리소스. HP 와 같은 bar 패턴, 30%/15% 에서 경고색.
  const time = session.time;
  const maxTime = session.maxTime;
  const timePct = Math.max(0, Math.min(100, (time / maxTime) * 100));
  const stats = computeEffectiveStats(session.hero);
  const heroVariant = getHeroAppearanceVariant(heroLevel) as 0 | 1 | 2;

  const awaitingChoice = session.status === "awaitingChoice";

  // SSR 안전 장치 — Portal target 은 클라이언트만
  if (typeof window === "undefined") return null;

  // Phase 9a — GbConfirm 으로 교체. body 텍스트는 render 시 계산.
  const onExit = () => setAbandonOpen(true);
  const nextBossFloor = [10, 20, 30].find((f) => f > session.currentFloor);

  return createPortal(
    <div
      className={`fixed inset-0 z-50 overflow-hidden flex flex-col ${critShake ? "uphero-crit-shake" : ""}`}
      style={{
        background: GB.darkest,
        color: GB.light,
        // Portal 로 body 에 렌더 → main(z-[1]) stacking context 밖으로 탈출.
        // 진짜 풀스크린 — 앱 헤더/탭/네비 모두 덮음 (몰입감).
        // Phase 10 — isolation: isolate 로 자체 stacking context 형성 → 내부 atmosphere
        //   z-index 가 Portal 밖 요소와 섞이지 않게 격리.
        isolation: "isolate",
      }}
    >
      {/* Phase 10 — 던전 ambient 레이어.
           absolute inset-0 + pointer-events-none + z-0. header/log/footer 는
           모두 position: relative + z-index ≥ 1 을 부여해 ambient 위에 페인트. */}
      <DungeonAtmosphere dungeonId={session.dungeonId} />

      {/* Phase 12 — 전투 방향 flash overlay.
           key 변경 시 `uphero-attack-flash-enter` 애니가 재생. 양쪽 edge 에서
           35% 폭 gradient 로 안쪽으로 falloff. pointer-events:none + z-[2]
           (ambient 위 / 게임 콘텐츠 위에 overlay 돼야 "타격감" 성립).
           left 공격 = 영웅 클래스 색, right 공격 = GB_ENEMY 붉은색. */}
      {attackFlash && (
        <div
          key={attackFlash.key}
          className="uphero-attack-flash-enter absolute inset-y-0 pointer-events-none z-[2]"
          style={{
            [attackFlash.side]: 0,
            width: "35%",
            background:
              attackFlash.side === "left"
                ? `linear-gradient(to right, ${attackFlash.color}b3 0%, ${attackFlash.color}33 55%, transparent 100%)`
                : `linear-gradient(to left, ${attackFlash.color}b3 0%, ${attackFlash.color}33 55%, transparent 100%)`,
            mixBlendMode: "screen",
          }}
          aria-hidden="true"
        />
      )}

      {/* === Header === */}
      <header
        className="px-3 py-2.5 shrink-0 relative z-[1]"
        style={{
          borderBottom: `1px solid ${GB.dark}`,
          background: `linear-gradient(180deg, ${dungeon.themeColor}18 0%, transparent 100%)`,
          paddingTop: "calc(env(safe-area-inset-top) + 10px)",
        }}
      >
        {/* Phase 4c-polish: 영웅 sprite ↔ 몬스터 sprite 가 마주보는 전투 장면.
             전투가 아닐 때 (narrative/choice) 는 몬스터 자리 비고 영웅만.
             공격/피격 시 짧은 transform 애니메이션으로 "누가 때리고 누가 맞았는지" 시각화. */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <HeroSprite
              variant={heroVariant}
              classType={session.hero.classType}
              size={32}
              color={
                session.hero.classType
                  ? CLASS_THEME_COLOR[session.hero.classType]
                  : GB.lightest
              }
              state={heroState}
              pulseOverlay={pulseOverlay}
              animationMs={1400}
            />
            <div className="flex flex-col leading-tight">
              <span className="typo-caption" style={{ color: GB.lightest }}>
                {dungeonName(dungeon.id, dungeon.name, language)}
              </span>
              <span className={`typo-caption ${gbClass.textDim}`}>
                {t("uphero.combat.floorLabel", { floor: session.currentFloor })}
              </span>
            </div>
            {/* Phase 12f — 인터랙션 안내 버튼 (전투/자원/스킬/미니게임 간단 도움말). */}
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="ml-1 rounded-full typo-micro tabular-nums"
              style={{
                width: 20,
                height: 20,
                background: "transparent",
                color: GB.light,
                border: `1px solid ${GB.light}`,
                lineHeight: 1,
                cursor: "pointer",
              }}
              aria-label={t("uphero.combat.helpAria")}
            >
              ?
            </button>
          </div>

          <div className="flex items-center gap-2 relative">
            {/* Phase 12 R5 — 적에게 가한 피해 float. 적 HP bar 위쪽에서 영웅
                 클래스 색 "-N" 이 800ms 올라가며 사라짐. 적 sprite/HP 가 hurt
                 상태로 dim 되는 동안에도 float 는 dim 에 영향받지 않도록
                 outer (enemyHurt opacity 가 없는) 에 배치. */}
            {genericFloats
              .filter((f) => f.kind === "enemyDamage")
              .map((f) => {
                const floatColor = session.hero.classType
                  ? CLASS_THEME_COLOR[session.hero.classType]
                  : GB.lightest;
                return (
                  <span
                    key={f.id}
                    className="uphero-heal-float typo-micro tabular-nums pointer-events-none absolute"
                    style={{
                      right: 0,
                      top: -16,
                      color: floatColor,
                      textShadow: `0 0 4px ${floatColor}aa`,
                      fontWeight: 700,
                    }}
                    aria-hidden="true"
                  >
                    −{f.amount}
                  </span>
                );
              })}
            {currentEnemy && (
              <div
                className="flex flex-col items-end leading-tight gap-0.5"
                style={{ opacity: enemyHurt ? 0.55 : 1, transition: `opacity 140ms ${EASE_OUT}` }}
              >
                <span
                  className="typo-caption tabular-nums"
                  style={{ color: currentEnemy.isBoss ? GB_ENEMY : GB.lightest }}
                >
                  {monsterName(currentEnemy, language)}
                </span>
                <span className={`typo-caption ${gbClass.textDim} tabular-nums`}>
                  {t("uphero.combat.enemy.level", { level: currentEnemy.level })}
                </span>
                {/* Phase 12 — 적 HP bar (수치 없이). 유저 피드백: "적 수치는 안 보여주더라도
                     체력 bar 는 보여주는 게 더 재밌을 것". progressbar role 지원.
                     Phase 12 R2 — 두께 h-1 → h-1.5 (영웅 bar 와 일관). 보스 full HP 는
                     GB_LEGEND (금) 으로 "위세" 표현, 저하 시 붉게 변해 긴장감 ↑. */}
                <div
                  className="w-16 h-1.5 rounded-sm overflow-hidden"
                  role="progressbar"
                  aria-label={t("uphero.combat.enemyHp.aria", { name: monsterName(currentEnemy, language) })}
                  aria-valuenow={Math.round(enemyHpPct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuetext={`${Math.round(enemyHpPct)}%`}
                  style={{ background: `${GB.dark}cc` }}
                >
                  <div
                    className="h-full rounded-sm"
                    style={{
                      width: `${enemyHpPct}%`,
                      background:
                        enemyHpPct > 50
                          ? currentEnemy.isBoss
                            ? GB_LEGEND
                            : GB.lightest
                          : enemyHpPct > 20
                            ? GB_WARN
                            : GB_ENEMY,
                      transition: `width 240ms ${EASE_OUT}, background 240ms ${EASE_OUT}`,
                    }}
                  />
                </div>
              </div>
            )}
            {currentEnemy ? (
              // Phase 4c-fix: 보스 ↔ 일반 전환 시 size 를 하드 스왑하면 레이아웃이
              // 툭 튀므로 transform scale 로 부드럽게. sprite 자체는 고정 32px
              // 로 렌더, 보스면 1.25× scale 해서 40px 효과.
              // transform-origin center right 로 오른쪽 앵커 유지 (경계 정렬 보존).
              <div
                style={{
                  transformOrigin: "center right",
                  transform: `scale(${currentEnemy.isBoss ? 1.25 : 1}) translateX(${enemyHurt ? 3 : 0}px)`,
                  filter: enemyHurt ? "brightness(0.55)" : "brightness(1)",
                  transition: `transform 180ms ${EASE_OUT}, filter 160ms ${EASE_OUT}`,
                }}
              >
                <MonsterSprite
                  kind={currentEnemy.kind}
                  size={32}
                  color={currentEnemy.isBoss ? GB_ENEMY : GB.lightest}
                />
              </div>
            ) : (
              <div className={`typo-caption ${gbClass.textDim} tabular-nums`}>
                {t("uphero.combat.heroStats", { str: stats.str, agi: stats.agi })}
              </div>
            )}
          </div>
        </div>

        {/* Phase 4c-polish: Floor progress bar.
             startFloor → 30F (최종 보스) 까지의 여정을 "이번 세션 기준" 으로
             상대화. 이전에는 currentFloor / 30 이라 F29 시작 세션이 입장
             즉시 97% 찬 모양새로 긴장감이 없었다.
             startFloor 가 30 이상이면 range=1 로 clamp (최종 보스 이후 진입).

             Phase 12 — 유저 피드백: "HP 위 프로그래스 바가 뭘 의미하는지, 뭐랑
             연동되는지 감이 안 와." 라벨 부재가 원인 → HP/TIME 패턴대로 좌측
             의미 라벨 + 우측 목표 readout 추가. 바 안쪽 보스 마커 위에
             [10/20/30] 숫자 tooltip (title) 으로 "왜 저 점이 있나" 설명.
             role="progressbar" + aria-valuetext 로 스크린리더도 맥락 전달. */}
        {(() => {
          // Phase 12 — cycle 기반 floor bar. F1-F30 (cycle 0) → F31-F60 (cycle 1)
          //   → F61-F90 (cycle 2) ... 각 cycle 의 보스는 +10/+20/+30 offset (즉
          //   cycle 0 의 F10/F20/F30, cycle 1 의 F40/F50/F60). NG+ 에서도 동일
          //   구조를 유지해 "보스 사이 진행" 감각 보존.
          //   유저 요청: "30층이 초과해도 [구조] 유지 / [] 사이 ? 마커 랜덤 배치".
          const CYCLE = 30;
          const cycleIdx = Math.floor((session.currentFloor - 1) / CYCLE);
          const cycleStart = cycleIdx * CYCLE + 1;
          const cycleEnd = cycleStart + CYCLE - 1;
          const range = CYCLE - 1;
          const pct = Math.max(
            0,
            Math.min(
              100,
              ((session.currentFloor - cycleStart) / range) * 100,
            ),
          );
          const cycleBosses = [
            cycleStart + 9, // 예: F10 / F40 / F70 ...
            cycleStart + 19, // F20 / F50 / F80 ...
            cycleStart + 29, // F30 / F60 / F90 ...
          ];
          // mystery "?" — session.mysteryFloors 중 이 cycle 범위에 해당하고
          //   아직 방문 전인 것. 방문 후에는 combat.ts 에서 pop 되므로 여기선
          //   단순 filter.
          const mysteryInCycle = (session.mysteryFloors ?? []).filter(
            (f) => f >= cycleStart && f <= cycleEnd,
          );
          return (
            <div className="mt-2 flex items-center gap-2">
              <span
                className="typo-caption"
                style={{ color: GB.light, opacity: 0.8 }}
                aria-hidden="true"
              >
                {t("uphero.combat.expedition")}
              </span>
              <div
                className="flex-1 relative h-1.5"
                role="progressbar"
                aria-label={t("uphero.combat.expedition.aria", {
                  start: cycleStart,
                  end: cycleEnd,
                })}
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={t("uphero.combat.expedition.valueText", {
                  start: cycleStart,
                  end: cycleEnd,
                  current: session.currentFloor,
                })}
                title={t("uphero.combat.expedition.title", {
                  start: cycleStart,
                  end: cycleEnd,
                  current: session.currentFloor,
                })}
              >
                <div
                  className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2px] rounded-full"
                  style={{ background: GB.dark }}
                />
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: GB.light,
                    transition: `width 320ms ${EASE_OUT}`,
                  }}
                />
                {cycleBosses.map((f) => {
                  const markerPct = ((f - cycleStart) / range) * 100;
                  const reached = session.currentFloor >= f;
                  return (
                    <div
                      key={`boss-${f}`}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full"
                      style={{
                        left: `${markerPct}%`,
                        width: 6,
                        height: 6,
                        background: reached ? GB.lightest : GB.darkest,
                        border: `1px solid ${reached ? GB.lightest : GB.light}`,
                      }}
                      title={
                        t("uphero.combat.boss.marker", { floor: f }) +
                        (reached ? t("uphero.combat.boss.clearedSuffix") : "")
                      }
                      aria-hidden="true"
                    />
                  );
                })}
                {/* Mystery "?" 마커 — 보스 사이 랜덤 floor.
                     형태: 8px 라운드 + "?" 텍스트 중앙 정렬. 보스 마커 (6px
                     내부 채움) 와 구분 위해 약간 더 크고 투명 배경 + 테두리.
                     reduced-motion 영향 없음 (pulse 없이 static). */}
                {mysteryInCycle.map((f) => {
                  const markerPct = ((f - cycleStart) / range) * 100;
                  return (
                    <div
                      key={`myst-${f}`}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center justify-center rounded-full"
                      style={{
                        left: `${markerPct}%`,
                        width: 10,
                        height: 10,
                        background: GB.darkest,
                        border: `1px solid ${GB_WARN}`,
                        color: GB_WARN,
                        fontSize: 8,
                        lineHeight: 1,
                        fontWeight: 700,
                        letterSpacing: 0,
                      }}
                      title={t("uphero.combat.mystery.marker", { floor: f })}
                      aria-hidden="true"
                    >
                      ?
                    </div>
                  );
                })}
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full"
                  style={{
                    left: `${pct}%`,
                    width: 8,
                    height: 8,
                    background: GB.lightest,
                    boxShadow: `0 0 6px ${GB.lightest}`,
                    transition: `left 320ms ${EASE_OUT}`,
                  }}
                  aria-hidden="true"
                />
              </div>
              <span
                className="typo-caption tabular-nums"
                style={{
                  color: GB.light,
                  opacity: 0.8,
                  minWidth: 40,
                  textAlign: "right",
                }}
                aria-hidden="true"
              >
                {t("uphero.combat.expedition.toEnd", { end: cycleEnd })}
              </span>
            </div>
          );
        })()}
        {/* HP bar — relative 로 감싸 warrior regen float 위치 기준 제공 */}
        <div className="mt-2.5 flex items-center gap-2 relative">
          <span className="typo-caption" style={{ color: GB.light }}>
            HP
          </span>
          <div
            className="flex-1 h-1.5 rounded-sm relative overflow-hidden"
            role="progressbar"
            aria-label={t("uphero.combat.hp.aria")}
            aria-valuenow={hp}
            aria-valuemin={0}
            aria-valuemax={maxHp}
            aria-valuetext={`${hp} / ${maxHp}${
              hpPct < 20
                ? ` · ${t("uphero.combat.hp.danger")}`
                : hpPct < 50
                  ? ` · ${t("uphero.combat.hp.warn")}`
                  : ""
            }`}
            style={{ background: GB.dark }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-sm"
              style={{
                width: `${hpPct}%`,
                background:
                  hpPct > 50
                    ? GB.lightest
                    : hpPct > 20
                      ? GB_WARN
                      : GB_ENEMY,
                transition: `width 240ms ${EASE_OUT}, background 240ms ${EASE_OUT}`,
              }}
            />
          </div>
          {/* Phase 9c — HP 숫자 NumberRoll.
               전투 tick 마다 변하는 핵심 지표. hard swap 이면 "언제 몇 깎였는지"
               감각이 약함. lossColor 를 GB_ENEMY 로 → 피격 순간 붉은 tick 피드백. */}
          <span
            className="typo-caption tabular-nums"
            style={{ color: GB.lightest, minWidth: 56, textAlign: "right" }}
          >
            <NumberRoll
              value={hp}
              format={(v) => `${v}/${maxHp}`}
              style={{ color: GB.lightest }}
              lossColor={GB_ENEMY}
              silent
            />
          </span>
          {/* Phase 5d — Warrior HP regen float.
               숫자 오른쪽 위에서 떠오르며 800ms fade. 누적 float 은 각각
               idx 기준 key 로 독립 렌더. tabular-nums 영역 위에 겹침. */}
          {hpRegenFloats.map((id) => (
            <span
              key={id}
              className="uphero-hp-regen-float typo-micro tabular-nums pointer-events-none absolute"
              style={{
                right: 0,
                top: -14,
                color: GB.lightest,
                textShadow: `0 0 4px ${GB.lightest}aa`,
              }}
              aria-hidden="true"
            >
              +2
            </span>
          ))}
          {/* Phase 6c — class 별 float (mage XP, bard coin, druid heal, priest start).
               druid heal 는 실제 delta 수치 표시 (polish iteration). */}
          {genericFloats
            .filter((f) => f.kind === "heal" || f.kind === "priestStart")
            .map((f) => (
              <span
                key={f.id}
                className={`${
                  f.kind === "priestStart"
                    ? "uphero-start-bonus"
                    : "uphero-heal-float"
                } typo-micro tabular-nums pointer-events-none absolute`}
                style={{
                  right: 0,
                  top: -16,
                  color: "#87e5a0",
                  textShadow: "0 0 4px #87e5a0aa",
                  fontWeight: 700,
                }}
                aria-hidden="true"
              >
                +{f.amount}
              </span>
            ))}
          {/* Phase 12 R5 — 피격 데미지 float (-N).
               heal/regen/priestStart 와 동일한 "uphero-heal-float" 애니를
               재사용하지만 색은 GB_ENEMY (위험 톤). 오른쪽 위에서 살짝 내려와
               HP 숫자와 겹치지 않도록 top 오프셋만 다르게. */}
          {genericFloats
            .filter((f) => f.kind === "heroDamage")
            .map((f) => (
              <span
                key={f.id}
                className="uphero-heal-float typo-micro tabular-nums pointer-events-none absolute"
                style={{
                  right: 0,
                  top: -18,
                  color: GB_ENEMY,
                  textShadow: `0 0 4px ${GB_ENEMY}aa`,
                  fontWeight: 700,
                }}
                aria-hidden="true"
              >
                −{f.amount}
              </span>
            ))}
        </div>

        {/* Phase 4c.2 — 탐험 시간 bar.
             이벤트/전투 결과가 시간을 소모/회복하면 여기서 즉시 시각화.
             0 도달 시 timeExpired 로 세션 종료.
             Phase 4c-polish: 시간 ≥5 급감 시 outer 컨테이너에 pulse (box-shadow 기반). */}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="typo-caption" style={{ color: GB.light }}>
            TIME
          </span>
          <div
            className={`flex-1 h-1.5 rounded-sm relative overflow-hidden ${
              timeFlashing ? "uphero-time-flash" : ""
            }`}
            role="progressbar"
            aria-label={t("uphero.combat.time.aria")}
            aria-valuenow={Math.round(time)}
            aria-valuemin={0}
            aria-valuemax={maxTime}
            aria-valuetext={`${Math.round(time)} / ${maxTime}${
              timePct < 20
                ? ` · ${t("uphero.combat.time.danger")}`
                : timePct < 50
                  ? ` · ${t("uphero.combat.time.warn")}`
                  : ""
            }`}
            style={{ background: GB.dark }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-sm"
              style={{
                width: `${timePct}%`,
                background:
                  timePct > 50
                    ? GB.light
                    : timePct > 20
                      ? GB_WARN
                      : GB_ENEMY,
                transition: `width 240ms ${EASE_OUT}, background 240ms ${EASE_OUT}`,
              }}
            />
          </div>
          {/* Phase 9c — TIME 숫자 NumberRoll. 이벤트/전투 후 큰 폭 감소 (−5+) 순간
               rolling 이 bar 의 timeFlashing 과 동조. 20% 미만일 때 붉은 톤 유지. */}
          <span
            className="typo-caption tabular-nums"
            style={{
              color: timePct > 20 ? GB.light : GB_ENEMY,
              minWidth: 56,
              textAlign: "right",
            }}
          >
            <NumberRoll
              value={Math.round(time)}
              format={(v) => `${v}/${maxTime}`}
              style={{ color: timePct > 20 ? GB.light : GB_ENEMY }}
              lossColor={GB_ENEMY}
              silent
            />
          </span>
          {/* Phase 6c — Chronomancer time save micro tag (-25%) 매 floor 진입 시 */}
          {genericFloats
            .filter((f) => f.kind === "timeSave")
            .map((f) => (
              <span
                key={f.id}
                className="uphero-time-tag typo-micro tabular-nums pointer-events-none absolute"
                style={{
                  right: 0,
                  top: -12,
                  color: "#bca88b",
                  textShadow: "0 0 3px #bca88baa",
                  letterSpacing: "0.05em",
                }}
                aria-hidden="true"
              >
                −{f.amount}%
              </span>
            ))}
        </div>

        {/* Phase 12d — 클래스 자원 bar (warrior 분노 / mage 마나 등). 전직 후만 노출. */}
        {session.hero.classType && (
          <div className="mt-1.5">
            <ClassResourceBar
              classType={session.hero.classType}
              value={session.classResource ?? 0}
            />
          </div>
        )}

        {/* Phase 6c — Mage XP / Bard coin float (전투 로그 상단, 오른쪽 정렬).
             victory 순간 잠시 뜸. pointer-events 없어서 UI 방해 X. */}
        {genericFloats
          .filter((f) => f.kind === "xp" || f.kind === "coin")
          .map((f) => (
            <span
              key={f.id}
              className={`${
                f.kind === "xp" ? "uphero-xp-float" : "uphero-coin-float"
              } typo-micro tabular-nums pointer-events-none absolute`}
              style={{
                right: 12,
                top: 64,
                color: f.kind === "xp" ? "#f0d567" : "#e8c76b",
                textShadow: `0 0 4px ${
                  f.kind === "xp" ? "#f0d567" : "#e8c76b"
                }aa`,
                fontWeight: 700,
                zIndex: 5,
              }}
              aria-hidden="true"
            >
              {f.kind === "xp"
                ? t("common.unit.xpGain", { n: f.amount })
                : t("common.unit.coinGain", { n: f.amount })}
            </span>
          ))}
      </header>

      {/* === Log === */}
      <div className="flex-1 min-h-0 relative z-[1]">
        <CombatLog log={session.log} />
        {/* === Choice overlay — footer 위쪽에 sheet 로 올라옴, footer 는 항상 보임 === */}
        {awaitingChoice && !bossReveal && <ChoicePanel />}
      </div>

      {/* Phase 12d — 수동 스킬 발동 bar. 학습된 스킬 있는 경우만 노출.
            Phase 14 — novice 스킬 쓰는 전직 전 영웅도 포함되도록 classType 게이트 제거.
            SkillBar 내부에서도 learned skills 0 개면 return null 하므로 여기선 length 만 체크. */}
      {(session.hero.learnedSkills?.length ?? 0) > 0 && (
        <SkillBar session={session} />
      )}

      {/* === Controls — awaitingChoice 상태에서도 항상 노출.
           speed 는 dim/disabled, 포기 는 항상 활성. === */}
      <footer
        className="px-3 py-2.5 shrink-0 relative z-10"
        style={{
          background: GB.darkest,
          borderTop: `1px solid ${GB.dark}`,
          paddingBottom: "calc(max(env(safe-area-inset-bottom), 24px) + 10px)",
        }}
      >
        <div className="flex items-center gap-2">
          {/* 속도 / 일시정지 — awaitingChoice 시 dim 처리 */}
          <div
            className="flex items-center gap-1 transition-opacity"
            style={{
              opacity: awaitingChoice ? 0.3 : 1,
              pointerEvents: awaitingChoice ? "none" : "auto",
            }}
          >
            {[1, 2, 4].map((s) => (
              <SpeedButton
                key={s}
                active={speed === s && !paused}
                onClick={() => {
                  setSpeed(s as 1 | 2 | 4);
                  setPaused(false);
                }}
              >
                {s}×
              </SpeedButton>
            ))}
            <SpeedButton
              active={paused}
              onClick={() => setPaused((p) => !p)}
              wide
            >
              <span className="inline-flex items-center justify-center">
                {paused ? (
                  <PixelIcon name="Play" size={14} color={GB.darkest} />
                ) : (
                  <PauseIcon color={GB.light} size={14} />
                )}
              </span>
            </SpeedButton>
          </div>
          <div className="flex-1" />
          {/* 포기 CTA — awaitingChoice 상태에서도 항상 탭 가능 */}
          <DangerButton onClick={onExit}>
            <span className="inline-flex items-center gap-1.5">
              <PixelIcon name="Flag" size={14} color={GB_ENEMY} />
              {t("uphero.combat.abandon")}
            </span>
          </DangerButton>
        </div>
      </footer>

      {/* Phase 10 — 이벤트 선택 결과 모달.
            "> {label} → {result}" narrative 가 새로 push 되는 순간 감지돼 2.6s 표시.
            열려있는 동안 tick 은 pause (useEffect dep). 유저는 "계속" 로 즉시 진행 가능.
            Phase 11c R4 — effectSummary 로 구체 수치 노출 (XP/코인/시간/HP 변화). */}
      {/* 굴림틀 결과 — 드럼 연출 모달이 일반 결과 모달을 대신한다.
             결과는 이미 확정·지급된 상태로 로그에 실려 오고, 모달은 그리기만 한다. */}
      {activeChoiceResult?.slot && (
        <SlotMachineModal
          // 로그 idx 를 key 로 — "한 번 더" 로 새 결과가 오면 새 인스턴스(레버·드럼 초기화).
          key={activeChoiceResult.idx}
          result={activeChoiceResult.slot}
          coins={activeChoiceResult.summaryData?.coins}
          // 스트릭 4 면 "다음은 반드시 나와요" = 5번째 보장. 롤과 같은 판정(isSlotPityArmed).
          blankStreak={slotBlankStreak}
          // "한 번 더" 는 오늘 남은 스핀·런 수입이 있을 때만 모달이 CTA 를 그린다.
          spinAgain={{
            spinsLeft: slotSpinsLeft(shopDaily),
            wallet: session.rewards.coins,
            onSpin: () => {
              setChoiceSeenUpTo(activeChoiceResult.idx);
              spinSlotAgain();
            },
          }}
          onDismiss={() => setChoiceSeenUpTo(activeChoiceResult.idx)}
        />
      )}

      {activeChoiceResult && !activeChoiceResult.slot && (
        <ChoiceResultModal
          text={activeChoiceResult.text}
          summary={activeChoiceResult.summary}
          summaryData={activeChoiceResult.summaryData}
          actionLabelKey={activeChoiceResult.actionLabelKey}
          actionLabelFallback={activeChoiceResult.actionLabelFallback}
          resultTextKey={activeChoiceResult.resultTextKey}
          resultTextFallback={activeChoiceResult.resultTextFallback}
          onDismiss={() => setChoiceSeenUpTo(activeChoiceResult.idx)}
        />
      )}

      {/* Phase 12e — 인터랙티브 미니게임 모달. pendingMinigame 감지 시 표시. */}
      {session.pendingMinigame && session.status === "awaitingMinigame" && (
        <MinigameModal
          minigame={session.pendingMinigame.minigame}
          difficulty={session.pendingMinigame.difficulty}
          onComplete={(success) => resolveMinigame(success)}
        />
      )}

      {/* Phase 12f — 인터랙션 도움말 오버레이. */}
      {helpOpen && (
        <DungeonHelpModal onClose={() => setHelpOpen(false)} />
      )}

      {/* === Boss 등장 연출 (2.4s, session.status === "paused" 동안) === */}
      {bossReveal && (
        <BossBanner
          monster={bossReveal.monster}
          floor={bossReveal.floor}
          onDone={resumeSession}
        />
      )}

      {/* Phase 9a — 포기 confirm (native confirm 대체) */}
      <GbConfirm
        open={abandonOpen}
        title={t("uphero.combat.confirm.title")}
        body={
          <>
            {t("uphero.combat.confirm.keepRewards")}
            {nextBossFloor && (
              <>
                <br />
                {t("uphero.combat.confirm.missBoss", { floor: nextBossFloor })}
              </>
            )}
          </>
        }
        confirmLabel={t("uphero.combat.abandon")}
        cancelLabel={t("uphero.combat.continue")}
        danger
        onConfirm={() => {
          setAbandonOpen(false);
          abandonSession();
        }}
        onCancel={() => setAbandonOpen(false)}
      />

      {/* 치명타 shake keyframe 은 globals.css 에 정의됨 (uphero-crit-shake) */}
    </div>,
    document.body,
  );
}

/* ──────────────────────────────────────────────────────── */

/**
 * 현재 진행 중인 encounter 의 몬스터 반환. victory / drop 이후면 null.
 * 로그 역순회로 마지막 encounter 찾고, 그 뒤에 세션 종결성 엔트리가 없는지 확인.
 */
function findActiveEnemy(log: Array<{ type: string; monster?: Monster }>): Monster | null {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.type === "victory" || e.type === "drop" || e.type === "sessionEnd") return null;
    if (e.type === "encounter" && e.monster) return e.monster;
    if (e.type === "boss" && e.monster) return e.monster;
  }
  return null;
}

function SpeedButton({
  children,
  active,
  onClick,
  wide,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="uphero-speed-btn typo-caption rounded"
      style={{
        // 모바일 접근성: 최소 tap target 40px 확보
        minHeight: 40,
        minWidth: wide ? 52 : 40,
        padding: wide ? "8px 12px" : "8px 10px",
        background: active ? GB.lightest : `${GB.dark}cc`,
        color: active ? GB.darkest : GB.light,
        border: `1px solid ${active ? GB.lightest : GB.dark}`,
      }}
    >
      {children}
      <style jsx>{`
        .uphero-speed-btn {
          transition:
            transform 120ms cubic-bezier(0.23, 1, 0.32, 1),
            background 160ms cubic-bezier(0.23, 1, 0.32, 1),
            color 160ms cubic-bezier(0.23, 1, 0.32, 1);
        }
        .uphero-speed-btn:active {
          transform: scale(0.97);
        }
      `}</style>
    </button>
  );
}

/**
 * pixelarticons 에 Pause 아이콘이 없어, 동일 무드 (24×24 grid, 단일 stroke)
 * 로 직접 그린 12×12 viewBox 버전. 두 세로 막대.
 */
function PauseIcon({ color = "currentColor", size = 12 }: { color?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      role="img"
      aria-hidden="true"
    >
      <rect x="3" y="2" width="2" height="8" fill={color} />
      <rect x="7" y="2" width="2" height="8" fill={color} />
    </svg>
  );
}

function DangerButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="uphero-danger-btn typo-caption rounded"
      style={{
        minHeight: 40,
        padding: "8px 14px",
        background: "transparent",
        color: GB_ENEMY,
        border: `1px solid ${GB_ENEMY}`,
      }}
    >
      {children}
      <style jsx>{`
        .uphero-danger-btn {
          transition: transform 120ms cubic-bezier(0.23, 1, 0.32, 1), background 160ms cubic-bezier(0.23, 1, 0.32, 1);
        }
        .uphero-danger-btn:active {
          transform: scale(0.97);
          background: rgba(232, 139, 122, 0.15);
        }
      `}</style>
    </button>
  );
}
