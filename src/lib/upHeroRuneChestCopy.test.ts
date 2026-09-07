import { describe, it, expect } from "vitest";
import ko from "@/i18n/ko";
import en from "@/i18n/en";
import ja from "@/i18n/ja";
import zh from "@/i18n/zh";
import { SLOT_EVENT, SLOT_EVENT_PROMPT } from "@/data/flavor/slot";
import { SLOT_OUTCOMES } from "./upHeroSlot";

/**
 * 2026-09 애플 2.3.6 — 개인 개발자 계정은 simulated gambling 을 담은 앱을 낼 수
 * 없다. 1.3.0 은 룬 드럼(슬롯머신) 이벤트 때문에 거절됐다.
 *
 * 이 테스트는 **유저 눈에 닿는 문자열**에 도박 어휘가 다시 스며드는 것을 막는다.
 * 검사 대상은 네 언어의 `uphero.slot.*` 값 전부와, i18n 이 없을 때 화면에 나가는
 * 한국어 fallback(이벤트 prompt·선택지 라벨·결과 문구)이다. 키 이름의 slot 은
 * 와이어 호환 잔재라 검사하지 않는다 — 값만 본다.
 */

/** 언어별 금지 어휘. 화면에 나가면 그대로 심사 리스크가 된다. */
const BANNED: Record<string, RegExp[]> = {
  ko: [/굴림/, /드럼/, /레버/, /손잡이/, /릴\b/, /슬롯/, /잭팟/, /대박/, /스핀/, /도박/, /베팅/, /아깝다/],
  en: [
    /\bslots?\b/i,
    /\bspins?\b/i,
    /\bspinning\b/i,
    /\breels?\b/i,
    /\bdrums?\b/i,
    /\blevers?\b/i,
    /\bjackpots?\b/i,
    /gambl/i,
    /\bbets?\b/i,
    /\bwager/i,
    /\bodds\b/i,
  ],
  ja: [/スロット/, /ドラム/, /レバー/, /リール/, /ジャックポット/, /大当たり/, /回転/, /賭/],
  zh: [/老虎机/, /转盘/, /转轮/, /拉杆/, /把手/, /大奖/, /赌/, /转动/],
};

const DICTS: Record<string, Record<string, string>> = {
  ko: ko as Record<string, string>,
  en: en as Record<string, string>,
  ja: ja as Record<string, string>,
  zh: zh as Record<string, string>,
};

/**
 * 룬 상자 흐름의 문구 키. `uphero.slot.weapon` 같은 장비 슬롯 이름은 이 이벤트와
 * 무관하므로 뺀다 (같은 접두사를 쓰는 별개 네임스페이스).
 */
const EQUIP_SLOT_KEYS = new Set([
  "uphero.slot.weapon",
  "uphero.slot.armor",
  "uphero.slot.accessory",
  "uphero.slot.talisman",
]);

function chestKeys(dict: Record<string, string>): string[] {
  return Object.keys(dict).filter(
    (k) => k.startsWith("uphero.slot.") && !EQUIP_SLOT_KEYS.has(k),
  );
}

describe("룬 상자 카피 — 도박 어휘 금지 (2.3.6)", () => {
  it("네 언어 모두 uphero.slot.* 값에 도박 어휘가 없다", () => {
    for (const [lang, dict] of Object.entries(DICTS)) {
      const keys = chestKeys(dict);
      expect(keys.length).toBeGreaterThan(20);
      for (const key of keys) {
        for (const rx of BANNED[lang]) {
          expect(
            rx.test(dict[key]),
            `${lang} ${key} = "${dict[key]}" 에 ${rx} 가 있다`,
          ).toBe(false);
        }
      }
    }
  });

  it("확률·환수율 공개 문구 키는 아예 존재하지 않는다", () => {
    for (const [lang, dict] of Object.entries(DICTS)) {
      const leftovers = Object.keys(dict).filter(
        (k) =>
          k.startsWith("uphero.slot.odds.") ||
          k === "uphero.slot.nearMiss" ||
          k === "uphero.slot.big" ||
          k === "uphero.slot.lever.aria",
      );
      expect(leftovers, `${lang} 에 옛 키가 남아 있다`).toEqual([]);
    }
  });

  it("i18n 이 없을 때 나가는 한국어 fallback 도 상자 어휘다", () => {
    const fallbacks = [
      SLOT_EVENT_PROMPT,
      ...SLOT_EVENT.options.map((o) => o.label),
      ...SLOT_EVENT.options.map((o) => o.resultText ?? ""),
    ];
    for (const text of fallbacks) {
      for (const rx of BANNED.ko) {
        expect(rx.test(text), `"${text}" 에 ${rx} 가 있다`).toBe(false);
      }
    }
    expect(SLOT_EVENT_PROMPT).toContain("상자");
    expect(SLOT_EVENT.options[0].label).toContain("자물쇠");
  });

  it("결과 문구가 여덟 가지 결과 전부에 네 언어로 있다", () => {
    for (const [lang, dict] of Object.entries(DICTS)) {
      for (const o of SLOT_OUTCOMES) {
        const key = `uphero.slot.result.${o.id}`;
        expect(dict[key], `${lang} ${key}`).toBeTruthy();
      }
    }
  });

  it("자물쇠 조작 문구가 네 언어에 다 있다 — 세 등급 + 안내 + 보너스", () => {
    const lockKeys = [
      "uphero.slot.lock.title",
      "uphero.slot.lock.instruction",
      "uphero.slot.lock.aria",
      "uphero.slot.lock.stop",
      "uphero.slot.lock.plain",
      "uphero.slot.lock.good",
      "uphero.slot.lock.perfect",
      "uphero.slot.lock.bonus",
    ];
    for (const [lang, dict] of Object.entries(DICTS)) {
      for (const key of lockKeys) expect(dict[key], `${lang} ${key}`).toBeTruthy();
    }
    // 보너스 칩은 퍼센트를 문자열에 박지 않고 상수에서 받는다.
    for (const dict of Object.values(DICTS)) {
      expect(dict["uphero.slot.lock.bonus"]).toContain("{pct}");
    }
  });
});
