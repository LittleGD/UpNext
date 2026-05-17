// flavor-check.mjs — Phase 2.4 flavor 디코더 구조 동치성 검증 (웹 측).
//
// flavor pick 함수는 Math.random (검증 불가) 이므로, 여기선 DATA 무결성을 검증한다:
// 웹 TS 데이터를 순회한 구조적 사실(이벤트/옵션/effect 수, kind 히스토그램, 깊은
// 샘플)을 찍고, Swift 가 Flavor.json 을 custom Decodable 로 디코드해 같은 사실을
// 찍으면 — JSON 추출 + Swift 디코더가 TS 데이터를 정확히 재현한 것.
//
// 실행: cd /Users/jmlee/Documents/UpNext && npx tsx scripts/flavor-check.mjs

import {
  EVENT_POOL,
  UNIVERSAL_EVENTS,
  NARRATIVE_POOL,
  NARRATIVE_POOL_IDS,
  TREASURE_DESCRIPTIONS,
  TREASURE_IDS,
  REST_DESCRIPTIONS,
  REST_IDS,
  CAMP_AMBIENCE_KEYS,
} from "../src/data/upHeroFlavor.ts";
import { MYSTERY_EVENTS } from "../src/data/flavor/mystery.ts";

const lines = [];
const kinds = {};
let totEvents = 0, totOptions = 0, totOutcomes = 0;

const bump = (k) => { kinds[k] = (kinds[k] ?? 0) + 1; };
function countEffect(e) {
  bump(e.kind);
  if (e.kind === "startMinigame") {
    for (const s of e.successEffects) bump(s.kind);
    for (const s of e.failEffects) bump(s.kind);
  }
}
function walk(events) {
  for (const ev of events) {
    totEvents++;
    for (const opt of ev.options) {
      totOptions++;
      if (opt.effect) countEffect(opt.effect);
      for (const o of opt.outcomes ?? []) {
        totOutcomes++;
        for (const e of o.effects) countEffect(e);
      }
    }
  }
}
function fmtFx(e) {
  switch (e.kind) {
    case "reward": return `reward(${e.coins ?? "-"},${e.xp ?? "-"})`;
    case "damage": return `damage(${e.amount})`;
    case "heal": return `heal(${e.amount})`;
    case "time": return `time(${e.delta})`;
    case "skipFloors": return `skipFloors(${e.count})`;
    case "flee": return `flee(${e.successChance})`;
    case "startMinigame":
      return `startMinigame(${e.minigame},${e.difficulty},s${e.successEffects.length},f${e.failEffects.length})`;
    default: return e.kind;
  }
}

const DG = ["fitness", "learning", "mindfulness", "nutrition", "social", "productivity", "wellness", "trending"];
for (const d of DG) {
  lines.push(`eventPool:${d} = ${EVENT_POOL[d].length}`);
  walk(EVENT_POOL[d]);
}
lines.push(`universal = ${UNIVERSAL_EVENTS.length}`);
walk(UNIVERSAL_EVENTS);
lines.push(`mystery = ${MYSTERY_EVENTS.length}`);
walk(MYSTERY_EVENTS);
for (const d of DG) {
  lines.push(`narrative:${d} = ${NARRATIVE_POOL[d].length}/${NARRATIVE_POOL_IDS[d].length}`);
}
lines.push(`treasure = ${TREASURE_DESCRIPTIONS.length}/${TREASURE_IDS.length}`);
lines.push(`rest = ${REST_DESCRIPTIONS.length}/${REST_IDS.length}`);
lines.push(`ambience = ${CAMP_AMBIENCE_KEYS.length}`);
lines.push(`totals = ev${totEvents} opt${totOptions} out${totOutcomes}`);
lines.push(`effectKinds = ${Object.keys(kinds).sort().map((k) => `${k}:${kinds[k]}`).join(" ")}`);

// 깊은 샘플 — union 디코딩 정확성 확인
lines.push(`mst0.prompt = ${MYSTERY_EVENTS[0].prompt}`);
lines.push(`mst0.promptKey = ${MYSTERY_EVENTS[0].promptKey}`);
lines.push(`mst0.opt0.label = ${MYSTERY_EVENTS[0].options[0].label}`);
lines.push(`mst0.opt0.out0.w = ${MYSTERY_EVENTS[0].options[0].outcomes[0].weight}`);
lines.push(
  `mst0.opt0.out0.fx = ${MYSTERY_EVENTS[0].options[0].outcomes[0].effects.map(fmtFx).join("|")}`,
);
lines.push(`fit1.opt0.effect = ${fmtFx(EVENT_POOL.fitness[1].options[0].effect)}`);
lines.push(`univ0.prompt = ${UNIVERSAL_EVENTS[0].prompt}`);

console.log(lines.join("\n"));
