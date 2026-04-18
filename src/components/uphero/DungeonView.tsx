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
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useGameStore } from "@/store/useGameStore";
import { DUNGEONS } from "@/data/upHeroDungeons";
import {
  computeEffectiveStats,
  getHeroAppearanceVariant,
  getEffectiveHeroLevel,
  CLASS_THEME_COLOR,
} from "@/types/uphero";
import type { Monster } from "@/types/uphero";
import { GB, EASE_OUT, gbClass, GB_ENEMY, GB_WARN, GB_LEGEND } from "@/lib/upHeroPalette";
import { useSound } from "@/hooks/useSound";
import { useAnnounce } from "@/hooks/useAnnounce";
import CombatLog from "./CombatLog";
import ChoicePanel from "./ChoicePanel";
import BossBanner from "./BossBanner";
import HeroSprite, { type HeroSpriteState } from "./HeroSprite";
import MonsterSprite from "./MonsterSprite";
import GbConfirm from "./GbConfirm";
import NumberRoll from "./NumberRoll";
import DungeonAtmosphere from "./DungeonAtmosphere";
import ChoiceResultModal from "./ChoiceResultModal";
import ClassResourceBar from "./ClassResourceBar";
import SkillBar from "./SkillBar";
import MinigameModal from "./MinigameModal";
import DungeonHelpModal from "./DungeonHelpModal";
import PixelIcon from "@/components/icons/PixelIcon";

const TICK_INTERVAL: Record<1 | 2 | 4, number> = {
  1: 1200,
  2: 600,
  4: 300,
};

export default function DungeonView() {
  const session = useUpHeroStore((s) => s.currentSession);
  const tickSession = useUpHeroStore((s) => s.tickSession);
  const resumeSession = useUpHeroStore((s) => s.resumeSession);
  // Phase 12e — 미니게임 결과 해소 action.
  const resolveMinigame = useUpHeroStore((s) => s.resolveMinigame);
  const abandonSession = useUpHeroStore((s) => s.abandonSession);
  // Phase 9d — 영웅 전용 레벨 사용. variant 결정 등.
  const gameLevel = useGameStore((s) => s.progress.level);
  const heroStartLevel = useUpHeroStore((s) => s.heroStartLevel);
  const heroLevel = getEffectiveHeroLevel(gameLevel, heroStartLevel);

  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [paused, setPaused] = useState(false);
  /** 치명타 발생 시 root shake 트리거 — 260ms 후 자동 해제 */
  const [critShake, setCritShake] = useState(false);
  /** Phase 9a — 포기 confirm 다이얼로그 state (native confirm 대체) */
  const [abandonOpen, setAbandonOpen] = useState(false);
  /** Phase 12f — 인터랙션 도움말 overlay. */
  const [helpOpen, setHelpOpen] = useState(false);
  /** Phase 10 — 방금 resolve 된 event choice 의 결과 narrative.
   *   null 이 아니면 결과 모달 표시 + tick pause. 유저 "계속" 또는 2.6s 후 null.
   *   Phase 11c R4 — text + effectSummary 2 필드로 수치 별도 표시. */
  const [choiceResultData, setChoiceResultData] = useState<{
    text: string;
    summary: string | null;
  } | null>(null);
  const choiceResultText = choiceResultData?.text ?? null;
  const { play } = useSound();
  // Phase 11c R4 — screen reader 공지. 시각 float 이 aria-hidden 이므로 여기서 backup.
  const { announce } = useAnnounce();

  const tickRef = useRef(tickSession);
  tickRef.current = tickSession;

  // 치명타 (crit) 발생 감지 — log 의 새 combat 엔트리 중 outcome==="crit" 탐지
  // 같은 엔트리에 대해 중복 발동 방지 위해 처리 완료된 log index 저장.
  const seenCritIdxRef = useRef<Set<number>>(new Set());
  const shakeTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!session) return;
    session.log.forEach((entry, idx) => {
      if (entry.type !== "combat") return;
      if (entry.outcome !== "crit") return;
      if (seenCritIdxRef.current.has(idx)) return;
      seenCritIdxRef.current.add(idx);
      // 사운드 + 진동 (impactShake = 충격 효과 사운드/haptic)
      play("impactShake");
      // 화면 흔들기 — setTimeout 중첩 방지
      if (shakeTimerRef.current) window.clearTimeout(shakeTimerRef.current);
      setCritShake(true);
      shakeTimerRef.current = window.setTimeout(() => {
        setCritShake(false);
        shakeTimerRef.current = null;
      }, 260);
    });
  }, [session, play]);

  // 세션 바뀌면 seen set 초기화 (다른 던전 / 재시작)
  useEffect(() => {
    if (!session) {
      seenCritIdxRef.current.clear();
    }
  }, [session?.startedAt, session]);

  // Phase 10 — 이벤트 choice 결과 narrative 감지.
  //   resolveChoice 가 push 하는 "> {label} → {result}" narrative 를 잡아 모달 표시.
  //   encounter choice (싸운다/도망) 의 narrative 는 "> " 로 시작하지 않으므로 자동 제외.
  const seenChoiceResultRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!session) return;
    // 모달 이미 떠있으면 새로 trigger 안 함 (겹침 방지)
    if (choiceResultText !== null) return;
    for (let idx = session.log.length - 1; idx >= 0; idx -= 1) {
      const entry = session.log[idx];
      // 최근 encounter/combat/보스 등장 이후만 — 그보다 오래된 건 이미 지나간 것
      if (entry.type === "combat" || entry.type === "encounter" || entry.type === "boss")
        break;
      // Phase 11c R1 — explicit choiceResult variant (기존: narrative prefix 매칭).
      if (entry.type !== "choiceResult") continue;
      if (seenChoiceResultRef.current.has(idx)) continue;
      seenChoiceResultRef.current.add(idx);
      setChoiceResultData({
        text: entry.text,
        summary: entry.effectSummary ?? null,
      });
      break;
    }
  }, [session, choiceResultText]);

  // 세션 바뀌면 choice result seen 초기화
  useEffect(() => {
    if (!session) {
      seenChoiceResultRef.current.clear();
      setChoiceResultData(null);
    }
  }, [session?.startedAt, session]);

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

  // Phase 4c-polish: HeroSprite state (idle/attack/hurt).
  // 새 combat 엔트리 감지 → attacker 별로 sprite 상태 세팅.
  //   attacker = "hero", damage > 0  → attack
  //   attacker = "enemy", damage > 0 → hurt
  //   miss/dodge (damage 0)          → sprite 반응 없음
  const [heroState, setHeroState] = useState<HeroSpriteState>("idle");
  const [enemyHurt, setEnemyHurt] = useState(false);
  // Phase 12 — 전투 방향 flash. 공격 이벤트 발생 시 화면 edge 에서 한 번 번쩍.
  //   side = "left"  : 영웅 공격 (영웅 클래스 색)
  //   side = "right" : 적 공격 (GB_ENEMY 붉은색)
  //   key 는 log entry idx — 같은 entry 를 두 번 처리하지 않도록 seenCombatIdxRef
  //   로 dedupe 된 후 한 번만 set. React remount 기반 replay 는 key 변경으로 발동.
  const [attackFlash, setAttackFlash] = useState<{
    side: "left" | "right";
    color: string;
    key: number;
  } | null>(null);
  const seenCombatIdxRef = useRef<Set<number>>(new Set());
  const heroStateTimerRef = useRef<number | null>(null);
  const enemyHurtTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!session) return;
    session.log.forEach((entry, idx) => {
      if (entry.type !== "combat") return;
      if (seenCombatIdxRef.current.has(idx)) return;
      seenCombatIdxRef.current.add(idx);
      if (entry.damage === 0) return; // miss/dodge 는 정적
      if (entry.attacker === "hero") {
        // 영웅 공격 → hero sprite attack + enemy sprite hurt (0.4× brightness)
        if (heroStateTimerRef.current) window.clearTimeout(heroStateTimerRef.current);
        setHeroState("attack");
        heroStateTimerRef.current = window.setTimeout(() => {
          setHeroState("idle");
          heroStateTimerRef.current = null;
        }, 240);
        if (enemyHurtTimerRef.current) window.clearTimeout(enemyHurtTimerRef.current);
        setEnemyHurt(true);
        enemyHurtTimerRef.current = window.setTimeout(() => {
          setEnemyHurt(false);
          enemyHurtTimerRef.current = null;
        }, 260);
        // Phase 12 — 왼쪽 flash (영웅 클래스 색 / class 없으면 GB.lightest)
        setAttackFlash({
          side: "left",
          color: session.hero.classType
            ? CLASS_THEME_COLOR[session.hero.classType]
            : GB.lightest,
          key: idx,
        });
      } else {
        // 적 공격 → hero sprite hurt
        if (heroStateTimerRef.current) window.clearTimeout(heroStateTimerRef.current);
        setHeroState("hurt");
        heroStateTimerRef.current = window.setTimeout(() => {
          setHeroState("idle");
          heroStateTimerRef.current = null;
        }, 260);
        // Phase 12 — 오른쪽 flash (GB_ENEMY 붉은색)
        setAttackFlash({
          side: "right",
          color: GB_ENEMY,
          key: idx,
        });
      }
    });
  }, [session]);

  // 세션 바뀌면 combat seen 초기화
  useEffect(() => {
    if (!session) {
      seenCombatIdxRef.current.clear();
    }
  }, [session?.startedAt, session]);

  // Phase 5d — Warrior HP regen visual tell.
  // 매 combat round 끝 (enemy 공격 entry) + classType === "warrior" →
  // HP bar 위에 "+2" 가 800ms 떠올랐다 사라짐. 이제 패시브가 체감됨.
  // 세션 바뀌면 seen 초기화.
  const [hpRegenFloats, setHpRegenFloats] = useState<number[]>([]);
  const seenRegenIdxRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!session) return;
    if (session.hero.classType !== "warrior") return;
    session.log.forEach((entry, idx) => {
      if (entry.type !== "combat" || entry.attacker !== "enemy") return;
      if (seenRegenIdxRef.current.has(idx)) return;
      seenRegenIdxRef.current.add(idx);
      // 새 float push — id 는 idx (unique per entry)
      setHpRegenFloats((prev) => [...prev, idx]);
      // 820ms 후 cleanup (Phase 11c R3 — unmount-safe)
      scheduleFloatCleanup(() => {
        setHpRegenFloats((prev) => prev.filter((i) => i !== idx));
      }, 820);
    });
  }, [session]);
  useEffect(() => {
    if (!session) {
      seenRegenIdxRef.current.clear();
      setHpRegenFloats([]);
    }
  }, [session?.startedAt, session]);

  // Phase 6c — 다른 class 의 visual tell.
  //
  // 각 class 별 float array 를 개별 관리. 공통 패턴:
  // 1. useEffect 로 session.log 순회 + seen set 으로 중복 방지
  // 2. 조건 만족하는 entry 감지 시 float array 에 push (id = log idx)
  // 3. 애니메이션 끝나면 setTimeout 으로 제거
  // 4. 세션 바뀌면 seen set + float array 초기화
  //
  // Tell 종류 (warrior 외):
  //  mage         — victory 시 XP float 금색 (버프 or class 배율 적용됐을 때)
  //  monk         — dodge 성공 시 sprite ✦ pulse
  //  druid        — heal 효과 발동 시 HP bar "+amount" 초록 float (heal combat 판정 없어서 choice 관찰)
  //  bard         — coin 획득 시 "+amount" 금색 float (victory/treasure)
  //  chronomancer — consumeTime 에서 mult 적용 시 "-25%" micro tag (log 감지 어려움 → Phase 6b skill fire 로 대체)
  //  priest       — 세션 첫 tick 시 "+50" 초록 (applyClassStartEffects 에서 적용된 HP 를 보여줌)
  //  illusionist  — crit 발동 시 sprite ◇ pulse (기존 shake 와 보완)

  // Mage XP / Bard coin / Druid heal / Priest start float — 공통 float array 로 통합
  type GenericFloat = { id: number; kind: "xp" | "coin" | "heal" | "priestStart" | "timeSave"; amount: number };
  const [genericFloats, setGenericFloats] = useState<GenericFloat[]>([]);
  const seenGenericRef = useRef<Set<string>>(new Set());
  // Phase 11c R3 — float cleanup timer 들 추적. unmount 시 일괄 clear 해 React
  //   "setState on unmounted component" 경고 방지 + 메모리 누수 제거.
  const floatTimersRef = useRef<Set<number>>(new Set());
  const scheduleFloatCleanup = (callback: () => void, delayMs: number) => {
    const id = window.setTimeout(() => {
      floatTimersRef.current.delete(id);
      callback();
    }, delayMs);
    floatTimersRef.current.add(id);
    return id;
  };
  useEffect(() => {
    return () => {
      floatTimersRef.current.forEach((id) => window.clearTimeout(id));
      floatTimersRef.current.clear();
    };
  }, []);

  // Monk dodge + Illusionist crit — HeroSprite pulseOverlay 를 통해 표시
  const [pulseOverlay, setPulseOverlay] = useState<"dodge" | "crit" | null>(null);
  const pulseTimerRef = useRef<number | null>(null);
  const seenPulseIdxRef = useRef<Set<number>>(new Set());

  // session 변경 시 초기화
  useEffect(() => {
    if (!session) {
      setGenericFloats([]);
      setPulseOverlay(null);
      seenGenericRef.current.clear();
      seenPulseIdxRef.current.clear();
      // Phase 11c R4 R3 — announce seen idx 도 새 세션에서 -1 로 reset.
      //   기존엔 session === null 분기에만 reset 되어, 세션 교체 시 stale idx 로
      //   새 session.log[0..N] 공지 누락 가능.
      seenLogIdxRef.current = -1;
    }
  }, [session?.startedAt, session]);

  // Phase 11c R4 — 주요 이벤트 SR 공지. 시각 float/banner 는 aria-hidden 이라
  //   키보드/SR 유저에게 전투 진행이 "조용". 여기서 보스 등장 · 처치 · 스킬 발동 ·
  //   세션 종료를 announce() 호출로 상황 중계.
  //
  // Phase 11c R4 R2 — effect deps 를 `session` 전체 → `logLen` 으로 축소. tick 마다
  //   새 session 객체가 와도 log length 변화 없으면 effect skip. 내부에서도 처리한
  //   최대 idx (seenLogIdxRef) 이후만 순회해 O(N) → O(delta).
  const seenLogIdxRef = useRef(-1);
  const logLen = session?.log.length ?? 0;
  useEffect(() => {
    if (!session) {
      seenLogIdxRef.current = -1;
      return;
    }
    const startIdx = seenLogIdxRef.current + 1;
    for (let idx = startIdx; idx < session.log.length; idx++) {
      const entry = session.log[idx];
      if (entry.type === "boss") {
        announce(`${entry.monster.name} 등장. HP ${entry.monster.hp}`, "assertive");
      } else if (entry.type === "victory" && entry.monster.isBoss) {
        announce(`${entry.monster.name} 처치. 경험치 +${entry.xp}, 코인 +${entry.coins}`, "polite");
      } else if (entry.type === "skill") {
        announce(`스킬 ${entry.skillName} 발동`, "polite");
      } else if (entry.type === "drop") {
        const rarityLabel = { normal: "일반", rare: "레어", unique: "유니크", legend: "전설" }[entry.equipment.rarity];
        announce(`${rarityLabel} ${entry.equipment.name} 획득`, "polite");
      } else if (entry.type === "sessionEnd") {
        const reasonMsg =
          entry.reason === "bossDefeated" ? "보스 처치 승리" :
          entry.reason === "heroDied" ? "영웅이 쓰러졌습니다" :
          entry.reason === "timeExpired" ? "시간이 다했습니다" :
          "탐험 종료";
        announce(reasonMsg, "assertive");
      }
    }
    seenLogIdxRef.current = session.log.length - 1;
    // session 자체가 아니라 logLen 에만 의존 — tick 마다 동일 참조여도 효과 skip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logLen, announce]);

  // Mage XP float + Bard coin float — victory entry 감지
  useEffect(() => {
    if (!session) return;
    const cls = session.hero.classType;
    if (cls !== "mage" && cls !== "bard") return;
    session.log.forEach((entry, idx) => {
      if (entry.type !== "victory") return;
      const key = `${cls}-victory-${idx}`;
      if (seenGenericRef.current.has(key)) return;
      seenGenericRef.current.add(key);
      const id = Date.now() + idx;
      const kind = cls === "mage" ? "xp" : "coin";
      const amount = cls === "mage" ? entry.xp : entry.coins;
      setGenericFloats((prev) => [...prev, { id, kind, amount }]);
      scheduleFloatCleanup(() => {
        setGenericFloats((prev) => prev.filter((f) => f.id !== id));
      }, 1100);
    });
  }, [session]);

  // Monk dodge + Illusionist crit — combat entry 감지 → pulseOverlay 설정
  useEffect(() => {
    if (!session) return;
    const cls = session.hero.classType;
    if (cls !== "monk" && cls !== "illusionist") return;
    session.log.forEach((entry, idx) => {
      if (entry.type !== "combat") return;
      if (seenPulseIdxRef.current.has(idx)) return;
      // monk: 적 공격에서 dodge outcome 만
      // illusionist: 영웅 공격에서 crit outcome 만
      const match =
        (cls === "monk" && entry.attacker === "enemy" && entry.outcome === "dodge") ||
        (cls === "illusionist" && entry.attacker === "hero" && entry.outcome === "crit");
      if (!match) return;
      seenPulseIdxRef.current.add(idx);
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
      setPulseOverlay(cls === "monk" ? "dodge" : "crit");
      pulseTimerRef.current = window.setTimeout(() => {
        setPulseOverlay(null);
        pulseTimerRef.current = null;
      }, cls === "monk" ? 460 : 510);
    });
  }, [session]);

  // Priest start HP float — 세션 첫 tick 에 한 번. Phase 11c R4 R2: flat +50 →
  //   20% percentage 로 변경되어 실제 delta 를 maxHp 로부터 역산 (현재 maxHp 의 1/6).
  const priestStartShownRef = useRef(false);
  useEffect(() => {
    if (!session) {
      priestStartShownRef.current = false;
      return;
    }
    if (session.hero.classType !== "priest") return;
    if (priestStartShownRef.current) return;
    // 세션 시작 직후 (log 3개 이하) 에 한 번만
    if (session.log.length > 5) return;
    priestStartShownRef.current = true;
    const id = Date.now();
    // +20% 의 실제 HP delta 계산: maxHp_after - maxHp_before = maxHp × (1 - 1/1.2).
    const priestDelta = Math.round(session.hero.maxHp * (1 - 1 / 1.2));
    setGenericFloats((prev) => [...prev, { id, kind: "priestStart", amount: priestDelta }]);
    scheduleFloatCleanup(() => {
      setGenericFloats((prev) => prev.filter((f) => f.id !== id));
    }, 1200);
  }, [session]);

  // Druid heal float — hero.hp 가 증가한 구간을 감지해 실제 delta 수치 표시.
  // narrative text 에는 수치가 들어있지 않아 log 파싱으론 불가. hp 변화
  // 관찰이 가장 정확. warrior regen (+2) 은 druid 가 아닐 때만 발동하므로
  // 충돌 없음. 5 미만 증가는 무시 (미세 변동 방지).
  const prevHpRef = useRef<number | null>(null);
  useEffect(() => {
    if (!session) {
      prevHpRef.current = null;
      return;
    }
    if (session.hero.classType !== "druid") return;
    const curHp = session.hero.hp;
    const prev = prevHpRef.current;
    prevHpRef.current = curHp;
    if (prev === null) return; // 첫 샘플
    const delta = curHp - prev;
    if (delta < 5) return; // 노이즈 컷
    const id = Date.now();
    setGenericFloats((f) => [...f, { id, kind: "heal", amount: delta }]);
    scheduleFloatCleanup(() => {
      setGenericFloats((f) => f.filter((x) => x.id !== id));
    }, 1000);
  }, [session?.hero.hp, session]);

  // Chronomancer time save tag — consumeTime 에서 mult 적용 시 combat log 에는
  // 흔적이 없다. 차선책: TIME bar 옆에 "절약" micro tag 를 매 floor 진입
  // (가장 자주 time 소모되는 지점) 시 1회 표시. Phase 6c MVP.
  useEffect(() => {
    if (!session) return;
    if (session.hero.classType !== "chronomancer") return;
    session.log.forEach((entry, idx) => {
      if (entry.type !== "floor") return;
      const key = `chrono-floor-${idx}`;
      if (seenGenericRef.current.has(key)) return;
      seenGenericRef.current.add(key);
      const id = Date.now() + idx;
      setGenericFloats((prev) => [...prev, { id, kind: "timeSave", amount: 25 }]);
      scheduleFloatCleanup(() => {
        setGenericFloats((prev) => prev.filter((f) => f.id !== id));
      }, 720);
    });
  }, [session]);

  // Time bar pulse — 시간이 ≥5 한 번에 빠지면 bar 가 한 번 번쩍.
  // 이벤트 outcome (대피 -15, 보스 -8, 악몽 -10 등) 처럼 "큰 비용" 순간을
  // 시각적으로 강조. rAF restart 패턴으로 keyframe 다시 재생.
  const prevTimeRef = useRef(session?.time ?? 0);
  const [timeFlashing, setTimeFlashing] = useState(false);
  useEffect(() => {
    const current = session?.time ?? 0;
    const diff = prevTimeRef.current - current;
    prevTimeRef.current = current;
    if (diff >= 5) {
      setTimeFlashing(false);
      const raf = requestAnimationFrame(() => setTimeFlashing(true));
      const t = window.setTimeout(() => setTimeFlashing(false), 340);
      return () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(t);
      };
    }
  }, [session?.time]);

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

  // Phase 4c-polish: 현재 진행 중인 encounter 의 몬스터 — sprite 표시용.
  // 마지막 encounter 이후 victory/drop 이 나왔으면 전투 종료라 null.
  const currentEnemy = findActiveEnemy(session.log);
  // Phase 12 bugfix — 적 HP 를 log 누적으로 계산해 bar 표시 (수치는 숨김).
  //   몬스터는 static hp 에서 hero-attacker combat entry 의 damage 만 누적 감산.
  // Phase 12 R3 — useMemo 래핑: log 길이 / currentEnemy 변화 시에만 재계산.
  //   speed toggle / paused / other state 변경에 의한 무상관 recompute 제거.
  const enemyHpPct = useMemo(() => {
    if (!currentEnemy) return 100;
    let hp = currentEnemy.hp;
    let startIdx = -1;
    for (let i = session.log.length - 1; i >= 0; i--) {
      if (session.log[i].type === "encounter") {
        startIdx = i;
        break;
      }
    }
    if (startIdx < 0) return 100;
    for (let i = startIdx + 1; i < session.log.length; i++) {
      const e = session.log[i];
      if (e.type !== "combat" || e.attacker !== "hero") continue;
      if (e.damage > 0) hp -= e.damage;
    }
    return Math.max(0, Math.min(100, (hp / currentEnemy.hp) * 100));
  }, [currentEnemy, session.log]);
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
                {dungeon.name}
              </span>
              <span className={`typo-caption ${gbClass.textDim}`}>
                Floor {session.currentFloor}
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
              aria-label="인터랙션 도움말"
            >
              ?
            </button>
          </div>

          <div className="flex items-center gap-2">
            {currentEnemy && (
              <div
                className="flex flex-col items-end leading-tight gap-0.5"
                style={{ opacity: enemyHurt ? 0.55 : 1, transition: `opacity 140ms ${EASE_OUT}` }}
              >
                <span
                  className="typo-caption tabular-nums"
                  style={{ color: currentEnemy.isBoss ? GB_ENEMY : GB.lightest }}
                >
                  {currentEnemy.name}
                </span>
                <span className={`typo-caption ${gbClass.textDim} tabular-nums`}>
                  Lv {currentEnemy.level}
                </span>
                {/* Phase 12 — 적 HP bar (수치 없이). 유저 피드백: "적 수치는 안 보여주더라도
                     체력 bar 는 보여주는 게 더 재밌을 것". progressbar role 지원.
                     Phase 12 R2 — 두께 h-1 → h-1.5 (영웅 bar 와 일관). 보스 full HP 는
                     GB_LEGEND (금) 으로 "위세" 표현, 저하 시 붉게 변해 긴장감 ↑. */}
                <div
                  className="w-16 h-1.5 rounded-sm overflow-hidden"
                  role="progressbar"
                  aria-label={`${currentEnemy.name} 체력`}
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
                STR {stats.str} · AGI {stats.agi}
              </div>
            )}
          </div>
        </div>

        {/* Phase 4c-polish: Floor progress bar.
             startFloor → 30F (최종 보스) 까지의 여정을 "이번 세션 기준" 으로
             상대화. 이전에는 currentFloor / 30 이라 F29 시작 세션이 입장
             즉시 97% 찬 모양새로 긴장감이 없었다.
             startFloor 가 30 이상이면 range=1 로 clamp (최종 보스 이후 진입). */}
        {(() => {
          const start = session.startFloor;
          const target = 30;
          const range = Math.max(1, target - start);
          const pct = Math.max(
            0,
            Math.min(100, ((session.currentFloor - start) / range) * 100),
          );
          // 보스 마커: startFloor 이후 ~ 30F 사이에 남은 것만
          const relevantBosses = [10, 20, 30].filter(
            (f) => f > start && f <= target,
          );
          return (
            <div className="mt-2 relative h-1.5" aria-hidden="true">
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
              {relevantBosses.map((f) => {
                const markerPct = ((f - start) / range) * 100;
                const reached = session.currentFloor >= f;
                return (
                  <div
                    key={f}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full"
                    style={{
                      left: `${markerPct}%`,
                      width: 6,
                      height: 6,
                      background: reached ? GB.lightest : GB.darkest,
                      border: `1px solid ${reached ? GB.lightest : GB.light}`,
                    }}
                  />
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
              />
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
            aria-label="영웅 체력"
            aria-valuenow={hp}
            aria-valuemin={0}
            aria-valuemax={maxHp}
            aria-valuetext={`${hp} / ${maxHp}${
              hpPct < 20 ? " · 위험" : hpPct < 50 ? " · 경고" : ""
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
            aria-label="탐험 시간"
            aria-valuenow={Math.round(time)}
            aria-valuemin={0}
            aria-valuemax={maxTime}
            aria-valuetext={`${Math.round(time)} / ${maxTime}${
              timePct < 20 ? " · 시간 위험" : timePct < 50 ? " · 시간 경고" : ""
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
              +{f.amount} {f.kind === "xp" ? "XP" : "C"}
            </span>
          ))}
      </header>

      {/* === Log === */}
      <div className="flex-1 min-h-0 relative z-[1]">
        <CombatLog log={session.log} />
        {/* === Choice overlay — footer 위쪽에 sheet 로 올라옴, footer 는 항상 보임 === */}
        {awaitingChoice && !bossReveal && <ChoicePanel />}
      </div>

      {/* Phase 12d — 수동 스킬 발동 bar. 학습된 스킬 있는 경우만 노출. */}
      {session.hero.classType && (session.hero.learnedSkills?.length ?? 0) > 0 && (
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
              포기
            </span>
          </DangerButton>
        </div>
      </footer>

      {/* Phase 10 — 이벤트 선택 결과 모달.
            "> {label} → {result}" narrative 가 새로 push 되는 순간 감지돼 2.6s 표시.
            열려있는 동안 tick 은 pause (useEffect dep). 유저는 "계속" 로 즉시 진행 가능.
            Phase 11c R4 — effectSummary 로 구체 수치 노출 (XP/코인/시간/HP 변화). */}
      {choiceResultData && (
        <ChoiceResultModal
          text={choiceResultData.text}
          summary={choiceResultData.summary}
          onDismiss={() => setChoiceResultData(null)}
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
        title="탐험을 포기하고 캠프로 돌아갈까요?"
        body={
          <>
            지금까지 획득한 보상 (XP · 코인 · 장비) 은 모두 유지됩니다.
            {nextBossFloor && (
              <>
                <br />
                단, 다음 보스 (F{nextBossFloor}) 에 도전할 기회를 놓칩니다.
              </>
            )}
          </>
        }
        confirmLabel="포기"
        cancelLabel="계속"
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
