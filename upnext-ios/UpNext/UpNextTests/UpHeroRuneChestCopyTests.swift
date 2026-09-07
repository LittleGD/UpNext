//
//  UpHeroRuneChestCopyTests.swift
//  UpNextTests — 룬 상자 문구에 도박 어휘가 다시 스며드는 것을 막는다 (애플 2.3.6).
//
//  2026-09, 개인 개발자 계정은 simulated gambling 을 담은 앱을 낼 수 없다는 이유로
//  1.3.0 이 거절됐다. 원인은 룬 드럼(슬롯머신) 이벤트였다. 웹 정본의
//  `src/lib/upHeroRuneChestCopy.test.ts` 와 같은 계약을 iOS 카탈로그에 건다.
//
//  검사 대상은 **유저 눈에 닿는 문자열**이다: 앱이 실제로 참조하는 `uphero.slot.*`
//  키의 네 언어 값 전부와, 카탈로그가 없을 때 화면에 나가는 한국어 fallback
//  (이벤트 prompt·선택지 라벨·결과 문구). 키 이름의 slot 은 와이어 호환 잔재라
//  검사하지 않는다 — 값만 본다.
//
//  은퇴한 키(uphero.slot.odds.* / nearMiss / big / lever.aria / aria.skip / skip)는
//  카탈로그에서 **지우지 않는다** (xcstrings 삭제 금지 규칙). 대신 아래 목록에서
//  빠져 있고 코드가 참조하지 않으므로 화면에 나갈 경로가 없다.
//

import XCTest
@testable import UpNext

final class UpHeroRuneChestCopyTests: XCTestCase {

    /// 앱이 실제로 참조하는 룬 상자 문구 키. 새 문구를 붙이면 여기에도 추가한다.
    private static let liveKeys = [
        "uphero.slot.title", "uphero.slot.stake", "uphero.slot.aria.dismiss",
        "uphero.slot.event.prompt", "uphero.slot.option.spin", "uphero.slot.option.skip",
        "uphero.slot.pityHint", "uphero.slot.again", "uphero.slot.spinsLeft",
        "uphero.slot.log.action",
        "uphero.slot.result.skip", "uphero.slot.result.unavailable",
        "uphero.slot.result.blank", "uphero.slot.result.coinSmall",
        "uphero.slot.result.coinMid", "uphero.slot.result.coinJackpot",
        "uphero.slot.result.rankProtect", "uphero.slot.result.destroyProtect",
        "uphero.slot.result.itemBox", "uphero.slot.result.battleBuff",
        "uphero.slot.reward.coins", "uphero.slot.reward.destroyGuard",
        "uphero.slot.reward.downGuard", "uphero.slot.reward.buff",
        "uphero.slot.reward.itemBox",
        "uphero.slot.drop.destroyGuard", "uphero.slot.drop.destroyGuardChest",
        "uphero.slot.lock.title", "uphero.slot.lock.instruction", "uphero.slot.lock.aria",
        "uphero.slot.lock.stop", "uphero.slot.lock.plain", "uphero.slot.lock.good",
        "uphero.slot.lock.perfect", "uphero.slot.lock.bonus",
    ]

    /// 자물쇠 조작 문구 — 네 언어에 다 있어야 하는 신규 키.
    private static let lockKeys = [
        "uphero.slot.lock.title", "uphero.slot.lock.instruction", "uphero.slot.lock.aria",
        "uphero.slot.lock.stop", "uphero.slot.lock.plain", "uphero.slot.lock.good",
        "uphero.slot.lock.perfect", "uphero.slot.lock.bonus",
    ]

    /// 언어별 금지 어휘. 화면에 나가면 그대로 심사 리스크가 된다.
    /// (웹 `upHeroRuneChestCopy.test.ts` 의 BANNED 와 같은 목록.)
    private static let banned: [String: [String]] = [
        "ko": ["굴림", "드럼", "레버", "손잡이", "슬롯", "잭팟", "대박", "스핀", "도박", "베팅", "아깝다"],
        "en": ["slot", "spin", "reel", "drum", "lever", "jackpot", "gambl", "wager", "odds"],
        "ja": ["スロット", "ドラム", "レバー", "リール", "ジャックポット", "大当たり", "回転", "賭"],
        "zh-Hans": ["老虎机", "转盘", "转轮", "拉杆", "把手", "大奖", "赌", "转动"],
    ]

    private func bundle(_ lang: String) -> Bundle {
        let app = Bundle(for: UpHeroStore.self)
        guard let path = app.path(forResource: lang, ofType: "lproj"),
              let b = Bundle(path: path) else {
            XCTFail("앱 번들에 \(lang).lproj 가 없다"); return app
        }
        return b
    }

    private func value(_ key: String, _ lang: String) -> String {
        // 미등록 키는 키 문자열이 그대로 돌아온다 — 아래에서 그걸 실패로 잡는다.
        bundle(lang).localizedString(forKey: key, value: key, table: nil)
    }

    /// 네 언어의 살아 있는 문구에 도박 어휘가 없다.
    func testLiveCopyHasNoGamblingVocabulary() {
        for (lang, words) in Self.banned {
            for key in Self.liveKeys {
                let v = value(key, lang)
                XCTAssertNotEqual(v, key, "\(lang) 에 \(key) 번역이 없다")
                for w in words {
                    XCTAssertFalse(
                        v.lowercased().contains(w.lowercased()),
                        "\(lang) \(key) = \"\(v)\" 에 \"\(w)\" 가 있다")
                }
            }
        }
    }

    /// 자물쇠 조작 문구가 네 언어에 다 있다. 보너스 칩은 퍼센트를 문자열에 박지 않고
    /// 상수(`runeLockBonusPercent`)에서 받는다.
    func testLockCopyExistsInAllLanguages() {
        for lang in Self.banned.keys {
            for key in Self.lockKeys {
                let v = value(key, lang)
                XCTAssertNotEqual(v, key, "\(lang) \(key)")
                XCTAssertFalse(v.isEmpty, "\(lang) \(key)")
            }
            XCTAssertTrue(value("uphero.slot.lock.bonus", lang).contains("{pct}"),
                          "\(lang) lock.bonus 에 {pct} 자리표시자가 없다")
        }
    }

    /// 카탈로그가 없을 때 나가는 한국어 fallback 도 상자 어휘다.
    func testKoreanFallbacksAreChestVocabulary() {
        let ev = UpHeroSlotEvent.event
        var fallbacks = [UpHeroSlotEvent.prompt]
        fallbacks += ev.options.map(\.label)
        fallbacks += ev.options.compactMap(\.resultText)
        for text in fallbacks {
            for w in Self.banned["ko"] ?? [] {
                XCTAssertFalse(text.contains(w), "\"\(text)\" 에 \"\(w)\" 가 있다")
            }
        }
        XCTAssertTrue(UpHeroSlotEvent.prompt.contains("상자"))
        XCTAssertTrue(ev.options[0].label.contains("자물쇠"))
    }

    /// 등급 한 줄은 키를 **문자열 보간으로 조립**해 찾는다. `AppConfig.loc` 에 보간을
    /// 넘기면 `String.LocalizationValue` 가 "uphero.slot.lock.%@" 라는 포맷 키를 만들어
    /// 조회에 실패하고, 조립된 키가 그대로 화면에 뜬다 (실제로 그렇게 샜다). 모달과 같은
    /// `resolveLog(_: String, ...)` 경로가 세 등급 모두를 실제로 푸는지 확인한다.
    func testComposedLockTierKeysResolveNotLeakAsKeys() {
        for tier in RuneLockTier.allCases {
            let key = "uphero.slot.lock.\(tier.rawValue)"
            let line = UpHeroNarrative.resolveLog(key, nil, fallback: "")
            XCTAssertFalse(line.isEmpty, "\(key) 가 안 풀린다")
            XCTAssertNotEqual(line, key, "\(key) 가 키 그대로 샌다")
        }
    }

    /// 결과 문구가 여덟 가지 결과 전부에 네 언어로 있다.
    func testEveryOutcomeHasCopy() {
        for lang in Self.banned.keys {
            for o in UpHeroSlot.outcomes {
                let key = "uphero.slot.result.\(o.id.rawValue)"
                XCTAssertNotEqual(value(key, lang), key, "\(lang) \(key)")
            }
        }
    }
}
