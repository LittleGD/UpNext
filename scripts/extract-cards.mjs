import { ALL_CARDS, STARTER_CARD_IDS } from "../src/data/cards.ts";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = { cards: ALL_CARDS, starterCardIds: STARTER_CARD_IDS };
writeFileSync(join(root, "upnext-ios/UpNext/UpNext/Cards.json"), JSON.stringify(out, null, 2));
console.log(`cards: ${ALL_CARDS.length}, starter: ${STARTER_CARD_IDS.length}`);
