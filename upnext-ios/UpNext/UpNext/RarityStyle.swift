//
//  RarityStyle.swift
//  UpNext — 카드 등급(Rarity) 표시 스타일 (Phase 4 슬라이스 8).
//
//  웹 rarityConfig.ts 의 등급 색/라벨. 여러 화면(Collection/Onboarding/DailyHome)이
//  공유하던 중복 헬퍼를 Rarity extension 으로 통합 — 단일 진실의 원천.
//

import SwiftUI

extension Rarity {
    /// 등급 라벨 — Localizable.xcstrings 경유로 다국어 자동 대응.
    /// AppConfig.loc 으로 *인앱 언어*(설정에서 고른 값)에 맞춰 해석한다. 기기 로케일을
    /// 쓰는 String(localized:) 는 인앱 언어 전환을 무시하므로 사용 금지.
    var displayName: String {
        switch self {
        case .normal: return AppConfig.loc("노멀")
        case .rare:   return AppConfig.loc("레어")
        case .unique: return AppConfig.loc("유니크")
        case .legend: return AppConfig.loc("레전드")
        }
    }

    /// 등급 색 — 디자인 토큰.
    var color: Color {
        switch self {
        case .normal: return .rarityNormal
        case .rare:   return .rarityRare
        case .unique: return .rarityUnique
        case .legend: return .rarityLegend
        }
    }
}
