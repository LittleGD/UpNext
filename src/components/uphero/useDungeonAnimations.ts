"use client";

/**
 * Phase 14 code-review High #6 — DungeonView 가 1,492 라인으로 너무 커져 effect
 *   순서·timer·dedupe set 이 한 파일에 섞여있음. 전투 visual tell 관련 13 개
 *   useEffect 를 이 hook 으로 모두 이관. render 컴포넌트는 결과만 소비.
 *
 * 기능: 치명타 shake, hero/enemy sprite state, attack flash, HP regen float,
 *       class-별 float tell (mage XP / bard coin / monk dodge / illusionist crit
 *       / druid heal / priest start / chronomancer time save), 피격 데미지 float,
 *       time bar pulse.
 *
 * semantic 은 기존 DungeonView 구현을 bit-level 보존 — 단순 이관.
 */

import { useEffect, useRef, useState } from "react";
import type { CombatSession } from "@/types/uphero";
import { CLASS_THEME_COLOR } from "@/types/uphero";
import { GB, GB_ENEMY } from "@/lib/upHeroPalette";
import { useSound } from "@/hooks/useSound";
import type { HeroSpriteState } from "./HeroSprite";

export type GenericFloat = {
  id: number;
  kind:
    | "xp"
    | "coin"
    | "heal"
    | "priestStart"
    | "timeSave"
    | "heroDamage"
    | "enemyDamage";
  amount: number;
};

export type AttackFlash = {
  side: "left" | "right";
  color: string;
  key: number;
};

interface Result {
  critShake: boolean;
  heroState: HeroSpriteState;
  enemyHurt: boolean;
  attackFlash: AttackFlash | null;
  hpRegenFloats: number[];
  genericFloats: GenericFloat[];
  pulseOverlay: "dodge" | "crit" | null;
  timeFlashing: boolean;
}

export function useDungeonAnimations(session: CombatSession | null): Result {
  const { play } = useSound();

  const [critShake, setCritShake] = useState(false);
  const [heroState, setHeroState] = useState<HeroSpriteState>("idle");
  const [enemyHurt, setEnemyHurt] = useState(false);
  const [attackFlash, setAttackFlash] = useState<AttackFlash | null>(null);
  const [hpRegenFloats, setHpRegenFloats] = useState<number[]>([]);
  const [genericFloats, setGenericFloats] = useState<GenericFloat[]>([]);
  const [pulseOverlay, setPulseOverlay] = useState<"dodge" | "crit" | null>(null);
  const [timeFlashing, setTimeFlashing] = useState(false);

  // dedupe sets — 동일 log idx 를 두 번 처리하지 않도록.
  const seenCritIdxRef = useRef<Set<number>>(new Set());
  const seenCombatIdxRef = useRef<Set<number>>(new Set());
  const seenRegenIdxRef = useRef<Set<number>>(new Set());
  const seenGenericRef = useRef<Set<string>>(new Set());
  const seenPulseIdxRef = useRef<Set<number>>(new Set());
  const seenDamageIdxRef = useRef<Set<number>>(new Set());

  // animation timer refs — 중첩 방지 + unmount cleanup.
  const shakeTimerRef = useRef<number | null>(null);
  const heroStateTimerRef = useRef<number | null>(null);
  const enemyHurtTimerRef = useRef<number | null>(null);
  const pulseTimerRef = useRef<number | null>(null);
  const floatTimersRef = useRef<Set<number>>(new Set());
  const priestStartShownRef = useRef(false);
  const prevHpRef = useRef<number | null>(null);
  const prevTimeRef = useRef(session?.time ?? 0);

  const scheduleFloatCleanup = (callback: () => void, delayMs: number) => {
    const id = window.setTimeout(() => {
      floatTimersRef.current.delete(id);
      callback();
    }, delayMs);
    floatTimersRef.current.add(id);
    return id;
  };

  // unmount 시 모든 pending timer 정리.
  useEffect(() => {
    // Set 인스턴스는 재할당되지 않으므로 effect 시점 캡처와 동일 (exhaustive-deps 경고 해소)
    const timers = floatTimersRef.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };
  }, []);

  // 치명타 shake + sound — log 의 새 combat 엔트리 중 outcome==="crit" 감지.
  useEffect(() => {
    if (!session) return;
    session.log.forEach((entry, idx) => {
      if (entry.type !== "combat") return;
      if (entry.outcome !== "crit") return;
      if (seenCritIdxRef.current.has(idx)) return;
      seenCritIdxRef.current.add(idx);
      play("impactShake");
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

  // HeroSprite state (idle/attack/hurt) + attack flash.
  //   deps 를 [logLen] 로 축소 — session 은 매 tick 새 ref 지만 log.length 는
  //   새 entry push 될 때만 변경. seenCombatIdxRef 가 idempotent 보장.
  useEffect(() => {
    if (!session) return;
    session.log.forEach((entry, idx) => {
      if (entry.type !== "combat") return;
      if (seenCombatIdxRef.current.has(idx)) return;
      seenCombatIdxRef.current.add(idx);
      if (entry.damage === 0) return;
      if (entry.attacker === "hero") {
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
        setAttackFlash({
          side: "left",
          color: session.hero.classType
            ? CLASS_THEME_COLOR[session.hero.classType]
            : GB.lightest,
          key: idx,
        });
      } else {
        if (heroStateTimerRef.current) window.clearTimeout(heroStateTimerRef.current);
        setHeroState("hurt");
        heroStateTimerRef.current = window.setTimeout(() => {
          setHeroState("idle");
          heroStateTimerRef.current = null;
        }, 260);
        setAttackFlash({
          side: "right",
          color: GB_ENEMY,
          key: idx,
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.log.length]);

  // 세션 바뀌면 combat seen 초기화
  useEffect(() => {
    if (!session) {
      seenCombatIdxRef.current.clear();
    }
  }, [session?.startedAt, session]);

  // Warrior HP regen visual tell — class === "warrior" + enemy 공격 entry 마다 +2 표시.
  useEffect(() => {
    if (!session) return;
    if (session.hero.classType !== "warrior") return;
    session.log.forEach((entry, idx) => {
      if (entry.type !== "combat" || entry.attacker !== "enemy") return;
      if (seenRegenIdxRef.current.has(idx)) return;
      seenRegenIdxRef.current.add(idx);
      setHpRegenFloats((prev) => [...prev, idx]);
      scheduleFloatCleanup(() => {
        setHpRegenFloats((prev) => prev.filter((i) => i !== idx));
      }, 820);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.log.length]);
  useEffect(() => {
    if (!session) {
      seenRegenIdxRef.current.clear();
      setHpRegenFloats([]);
    }
  }, [session?.startedAt, session]);

  // 세션 교체 시 generic/pulse 리셋.
  useEffect(() => {
    if (!session) {
      setGenericFloats([]);
      setPulseOverlay(null);
      seenGenericRef.current.clear();
      seenPulseIdxRef.current.clear();
    }
  }, [session?.startedAt, session]);

  // Mage XP / Bard coin float — victory entry 감지
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
      const kind: GenericFloat["kind"] = cls === "mage" ? "xp" : "coin";
      const amount = cls === "mage" ? entry.xp : entry.coins;
      setGenericFloats((prev) => [...prev, { id, kind, amount }]);
      scheduleFloatCleanup(() => {
        setGenericFloats((prev) => prev.filter((f) => f.id !== id));
      }, 1100);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.log.length]);

  // Monk dodge + Illusionist crit — pulseOverlay.
  useEffect(() => {
    if (!session) return;
    const cls = session.hero.classType;
    if (cls !== "monk" && cls !== "illusionist") return;
    session.log.forEach((entry, idx) => {
      if (entry.type !== "combat") return;
      if (seenPulseIdxRef.current.has(idx)) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.log.length]);

  // 피격 데미지 float — combat entry damage>0 이면 hero/enemy 측 "-N" 띄움.
  useEffect(() => {
    if (!session) {
      seenDamageIdxRef.current.clear();
      return;
    }
    session.log.forEach((entry, idx) => {
      if (entry.type !== "combat") return;
      if (seenDamageIdxRef.current.has(idx)) return;
      if (entry.damage <= 0) return;
      seenDamageIdxRef.current.add(idx);
      const kind: GenericFloat["kind"] =
        entry.attacker === "enemy" ? "heroDamage" : "enemyDamage";
      const id = Date.now() + idx;
      setGenericFloats((prev) => [
        ...prev,
        { id, kind, amount: entry.damage },
      ]);
      scheduleFloatCleanup(() => {
        setGenericFloats((prev) => prev.filter((f) => f.id !== id));
      }, 850);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.log.length]);

  // Priest start HP float — 세션 첫 tick 에 한 번. maxHp 의 1/6 ≈ +20% delta.
  useEffect(() => {
    if (!session) {
      priestStartShownRef.current = false;
      return;
    }
    if (session.hero.classType !== "priest") return;
    if (priestStartShownRef.current) return;
    if (session.log.length > 5) return;
    priestStartShownRef.current = true;
    const id = Date.now();
    const priestDelta = Math.round(session.hero.maxHp * (1 - 1 / 1.2));
    setGenericFloats((prev) => [
      ...prev,
      { id, kind: "priestStart", amount: priestDelta },
    ]);
    scheduleFloatCleanup(() => {
      setGenericFloats((prev) => prev.filter((f) => f.id !== id));
    }, 1200);
  }, [session]);

  // Druid heal float — hero.hp 증가량을 관찰 (narrative 에는 수치 없음).
  useEffect(() => {
    if (!session) {
      prevHpRef.current = null;
      return;
    }
    if (session.hero.classType !== "druid") return;
    const curHp = session.hero.hp;
    const prev = prevHpRef.current;
    prevHpRef.current = curHp;
    if (prev === null) return;
    const delta = curHp - prev;
    if (delta < 5) return;
    const id = Date.now();
    setGenericFloats((f) => [...f, { id, kind: "heal", amount: delta }]);
    scheduleFloatCleanup(() => {
      setGenericFloats((f) => f.filter((x) => x.id !== id));
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.hero.hp]);

  // Chronomancer time save micro tag — 매 floor 진입 시 −25% 표시.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.log.length]);

  // Time bar pulse — ≥5 한 번에 빠지면 bar 가 한 번 번쩍.
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

  return {
    critShake,
    heroState,
    enemyHurt,
    attackFlash,
    hpRegenFloats,
    genericFloats,
    pulseOverlay,
    timeFlashing,
  };
}
