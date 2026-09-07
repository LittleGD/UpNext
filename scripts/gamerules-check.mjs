import { totalXPForLevel, xpToNextLevel, getLevelFromXP, getXPProgress, getTitleForLevel,
  MINIGAME_XP_PER_RARITY, MINIGAME_RUN_XP_CAP } from "../src/types/game.ts";
import { XP_PER_MIN } from "../src/lib/idleAccrual.ts";
for (const lv of [0,1,2,5,10,20]) console.log(`totalXP(${lv})=${totalXPForLevel(lv)} toNext(${lv})=${xpToNextLevel(lv)}`);
for (const xp of [0,99,100,500,3000,99999]) console.log(`levelFromXP(${xp})=${getLevelFromXP(xp)}`);
for (const [xp,lv] of [[0,0],[150,1],[3000,8]]) { const p=getXPProgress(xp,lv); console.log(`xpProgress(${xp},${lv})=cur${p.current}/need${p.needed}`); }
for (const lv of [0,1,3,5,8,12,13,99]) console.log(`title(${lv})=${getTitleForLevel(lv,"en")}`);
// 카드매치 XP 상수 — 웹/iOS 가 어긋나면 같은 런이 플랫폼마다 다른 계정 XP 를 남긴다.
for (const r of ["normal","rare","unique","legend"]) console.log(`minigameXp(${r})=${MINIGAME_XP_PER_RARITY[r]}`);
console.log(`minigameRunXpCap=${MINIGAME_RUN_XP_CAP}`);
console.log(`idleXpPerMin=${XP_PER_MIN}`);
