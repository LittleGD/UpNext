// extract-flavor.mjs — Up Hero flavor 데이터 → Flavor.json (Swift Bundle resource).
//
// 이벤트 데이터(~3,400줄)는 손 포팅하지 않고 JSON 으로 추출 — cards.ts 와 동일 패턴.
// DungeonEvent / ChoiceOption / ChoiceEffect (discriminated union) 는 Swift 의
// custom Decodable (FlavorPool.swift) 가 디코드한다.
//
// 실행: cd /Users/jmlee/Documents/UpNext && npx tsx scripts/extract-flavor.mjs

import { writeFileSync } from "node:fs";
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

const out = {
  eventPool: EVENT_POOL,
  universalEvents: UNIVERSAL_EVENTS,
  mysteryEvents: MYSTERY_EVENTS,
  narrativePool: NARRATIVE_POOL,
  narrativePoolIds: NARRATIVE_POOL_IDS,
  treasureDescriptions: TREASURE_DESCRIPTIONS,
  treasureIds: TREASURE_IDS,
  restDescriptions: REST_DESCRIPTIONS,
  restIds: REST_IDS,
  campAmbienceKeys: CAMP_AMBIENCE_KEYS,
};

const path = "upnext-ios/UpNext/UpNext/Flavor.json";
writeFileSync(path, JSON.stringify(out));

// 추출 요약
const evCounts = Object.entries(EVENT_POOL)
  .map(([k, v]) => `${k}:${v.length}`)
  .join(" ");
console.log(`Flavor.json 작성 완료 → ${path}`);
console.log(`  eventPool: ${evCounts}`);
console.log(`  universal: ${UNIVERSAL_EVENTS.length}, mystery: ${MYSTERY_EVENTS.length}`);
