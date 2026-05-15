import { calculateIdleReward, detectClockRewind } from "../src/lib/idleAccrual.ts";
const cases = [[4*60000,1],[10*60000,1],[60*60000,10],[600*60000,50],[5*60000,1],[480*60000,30]];
for (const [ms,lv] of cases) {
  const r = calculateIdleReward(ms, lv);
  console.log(`reward(${ms},${lv}): ${r ? `xp=${r.xp} coins=${r.coins} el=${r.elapsedMin} raw=${r.rawElapsedMin}` : "nil"}`);
}
const rw = [[1000,100000,500],[1000,undefined,100000],[100000,100030,100000],[1000,1030,900]];
for (const [now,seen,idle] of rw) {
  console.log(`rewind(${now},${seen},${idle}): ${detectClockRewind(now, seen, idle)}`);
}
