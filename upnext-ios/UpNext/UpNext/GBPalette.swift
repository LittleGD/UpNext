//
//  GBPalette.swift
//  UpNext — Up Hero GB(게임보이) 팔레트 단일 출처 (리뷰 #5 — 중복 제거).
//
//  웹 src/lib/upHeroPalette.ts 의 GB 3색. 캠프·던전·HeroSprite·분위기 텍스트가
//  각자 #cdf564/#87b87a/#2c4a2c 를 복붙하던 것을 한 곳으로 통합.
//

import SwiftUI

/// Up Hero 전용 sage/lime/accent 팔레트 (웹 upHeroPalette.ts GB).
enum GBPalette {
    /// #2c4a2c — 어두운 sage (secondary bg, borders, 그림자).
    static let dark = Color(red: 0.173, green: 0.290, blue: 0.173)
    /// #87b87a — 차분한 라임 (text, inactive).
    static let light = Color(red: 0.529, green: 0.722, blue: 0.478)
    /// #cdf564 — UpNext accent (highlights, active). = Color.accentPrimary.
    static let lightest = Color(red: 0.804, green: 0.961, blue: 0.392)
}
