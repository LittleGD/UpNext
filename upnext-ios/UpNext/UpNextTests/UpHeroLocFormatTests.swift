//
//  UpHeroLocFormatTests.swift
//  UpNextTests — 방지권·굴림틀·상점 신규 코드의 **보간 loc** 이 en 카탈로그로 실제 해석되는지.
//
//  `AppConfig.loc(_ key: String.LocalizationValue)` 에 보간 문자열을 넘기면 카탈로그 키는
//  조립된 한국어 문장이 아니라 **포맷 키**("%@ 구매 · 보유 %lld")다 — String.LocalizationValue
//  가 보간 자리를 %@/%lld 로, 리터럴 `%` 를 `%%` 로 바꿔 키를 만든다. 그래서 카탈로그에
//  포맷 키가 있으면 en/ja/zh 에서 바깥 한국어가 새지 않는다. 이 테스트는 그 전제를
//  런타임으로 증명한다: 앱 번들의 en.lproj 로 해석한 결과에 한글이 0자여야 한다.
//
//  정적 검증(포맷 키 ⊆ 카탈로그)은 스크립트가 하고, 여기는 실제 포맷터 경로를 탄다.
//

import XCTest
@testable import UpNext

final class UpHeroLocFormatTests: XCTestCase {

    private var en: Bundle {
        let app = Bundle(for: UpHeroStore.self)
        guard let path = app.path(forResource: "en", ofType: "lproj"),
              let b = Bundle(path: path) else {
            XCTFail("앱 번들에 en.lproj 가 없다"); return app
        }
        return b
    }

    private func hasHangul(_ s: String) -> Bool {
        s.unicodeScalars.contains { (0xAC00...0xD7A3).contains($0.value) || (0x1100...0x11FF).contains($0.value) }
    }

    private func loc(_ key: String.LocalizationValue) -> String {
        String(localized: key, bundle: en, locale: Locale(identifier: "en"))
    }

    /// ShopView.buyDownGuard — 안쪽 정본 이름을 인자로 받는 포맷 키.
    func testNestedNameInterpolationResolvesInEnglish() {
        let name = loc("하락방지권")
        XCTAssertEqual(name, "Downgrade Ward")
        let s = loc("\(name) 구매 · 보유 \(3)")
        XCTAssertFalse(hasHangul(s), "en 에서 한국어가 샌다: \(s)")
        XCTAssertTrue(s.contains("Downgrade Ward") && s.contains("3"), s)
    }

    /// EquipmentInventoryView — 방지권 미보유 힌트 2종.
    func testGuardNoneHintsResolveInEnglish() {
        let destroy = loc("\(loc("소실방지권")) 없음 · 보스와 탐험 상자에서 나와요")
        let down = loc("\(loc("하락방지권")) 없음 · 상점에서 살 수 있어요")
        for s in [destroy, down] {
            XCTAssertFalse(hasHangul(s), "en 에서 한국어가 샌다: \(s)")
        }
        XCTAssertTrue(destroy.contains("Loss Ward"), destroy)
        XCTAssertTrue(down.contains("Downgrade Ward"), down)
    }

    /// EquipmentInventoryView / ShopView — 숫자 보간 + 리터럴 % 이스케이프.
    func testNumericInterpolationsResolveInEnglish() {
        let samples: [String] = [
            loc("강화 (−\(120) 코인)"),
            loc("성공률 \(70)%"),
            loc("실패 시 \(12)% 확률로 아이템 소실"),
            loc("실패 시 \(30)% 확률로 한 단계 하락"),
            loc("비용 \(120) 코인 (보유 \(999))"),
            loc("\(loc("하락방지권")) 쓰기 (보유 \(2))"),
            loc("코인 부족 (\(120) 필요)"),
            loc("이미 최대 강화(+\(10))예요"),
            loc("강화 실패로 단계가 내려갈 뻔한 순간에만 1장 소모 · 보유 \(4)"),
            loc("보유 한도에 닿았어요 (\(99)장)"),
        ]
        for s in samples {
            XCTAssertFalse(hasHangul(s), "en 에서 한국어가 샌다: \(s)")
            XCTAssertFalse(s.contains("%lld") || s.contains("%@"), "자리표시자가 치환되지 않았다: \(s)")
        }
        XCTAssertTrue(loc("성공률 \(70)%").contains("70%"))
    }

    /// 굴림틀 확률 패널의 새 키 7종 — en 값이 있고 자리표시자가 웹과 같다.
    func testSlotOddsKeysExistInEnglish() {
        let keys = ["uphero.slot.odds.open", "uphero.slot.odds.close", "uphero.slot.odds.title",
                    "uphero.slot.odds.blank", "uphero.slot.odds.rtp", "uphero.slot.odds.pityNote",
                    "uphero.slot.odds.dailyCap"]
        for k in keys {
            let v = en.localizedString(forKey: k, value: k, table: nil)
            XCTAssertNotEqual(v, k, "en 카탈로그에 \(k) 가 없다")
            XCTAssertFalse(hasHangul(v), "\(k) en 값에 한글: \(v)")
        }
        XCTAssertTrue(en.localizedString(forKey: "uphero.slot.odds.rtp", value: "", table: nil).contains("{pct}"))
        XCTAssertTrue(en.localizedString(forKey: "uphero.slot.odds.pityNote", value: "", table: nil).contains("{n}"))
        XCTAssertTrue(en.localizedString(forKey: "uphero.slot.odds.dailyCap", value: "", table: nil).contains("{n}"))
    }
}
