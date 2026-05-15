import { totalXPForLevel, xpToNextLevel, getLevelFromXP, getXPProgress, getTitleForLevel } from "../src/types/game.ts";
for (const lv of [0,1,2,5,10,20]) console.log(`totalXP(${lv})=${totalXPForLevel(lv)} toNext(${lv})=${xpToNextLevel(lv)}`);
for (const xp of [0,99,100,500,3000,99999]) console.log(`levelFromXP(${xp})=${getLevelFromXP(xp)}`);
for (const [xp,lv] of [[0,0],[150,1],[3000,8]]) { const p=getXPProgress(xp,lv); console.log(`xpProgress(${xp},${lv})=cur${p.current}/need${p.needed}`); }
for (const lv of [0,1,3,5,8,12,13,99]) console.log(`title(${lv})=${getTitleForLevel(lv,"en")}`);
