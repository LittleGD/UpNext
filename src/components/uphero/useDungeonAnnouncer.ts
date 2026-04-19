"use client";

/**
 * Phase 14 code-review High #6 — DungeonView 에서 SR 공지 블록(~60 라인) 을
 *   독립 hook 으로 분리. 시각 float/banner 는 aria-hidden 이라 키보드/SR 유저에게
 *   전투 진행이 "조용함" → 보스 등장·처치·스킬·드롭·세션 종료 순간을 announce().
 *
 * effect deps 를 logLen 으로 축소 + seenLogIdxRef 로 처리한 최대 idx 이후만
 *   순회해 O(N) → O(delta).
 */

import { useEffect, useRef } from "react";
import type { CombatSession } from "@/types/uphero";
import { useAnnounce } from "@/hooks/useAnnounce";
import { useTranslation } from "@/hooks/useTranslation";
import { monsterName, skillName } from "@/lib/upHeroI18n";

export function useDungeonAnnouncer(session: CombatSession | null) {
  const { announce } = useAnnounce();
  const { t, language } = useTranslation();

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
        announce(
          t("uphero.announce.bossAppear", {
            name: monsterName(entry.monster, language),
            hp: entry.monster.hp,
          }),
          "assertive",
        );
      } else if (entry.type === "victory" && entry.monster.isBoss) {
        announce(
          t("uphero.announce.bossVictory", {
            name: monsterName(entry.monster, language),
            xp: entry.xp,
            coins: entry.coins,
          }),
          "polite",
        );
      } else if (entry.type === "skill") {
        const localName = entry.skillId
          ? skillName(entry.skillId, entry.skillName, language)
          : entry.skillName;
        announce(
          t("uphero.announce.skillFired", { name: localName }),
          "polite",
        );
      } else if (entry.type === "drop") {
        const rarityKey = `uphero.rarity.${entry.equipment.rarity}` as const;
        announce(
          t("uphero.announce.drop", {
            rarity: t(rarityKey),
            name: entry.equipment.name,
          }),
          "polite",
        );
      } else if (entry.type === "sessionEnd") {
        const reasonKey =
          entry.reason === "bossDefeated"
            ? "uphero.announce.bossDefeated"
            : entry.reason === "heroDied"
              ? "uphero.announce.heroDied"
              : entry.reason === "timeExpired"
                ? "uphero.announce.timeExpired"
                : "uphero.announce.ended";
        announce(t(reasonKey), "assertive");
      }
    }
    seenLogIdxRef.current = session.log.length - 1;
    // session 전체가 아니라 logLen 에만 의존 — tick 마다 동일 참조여도 skip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logLen, announce]);

  // 세션 바뀌면 seen idx 리셋 (기존엔 session === null 분기에만 리셋되어 세션
  //   교체 시 stale idx 로 새 session.log[0..N] 공지 누락 가능했음).
  useEffect(() => {
    seenLogIdxRef.current = -1;
  }, [session?.startedAt]);
}
