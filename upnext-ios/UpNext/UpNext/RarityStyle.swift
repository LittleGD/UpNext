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
    /// String(localized:) 가 iOS 16+ 의 카탈로그 lookup. EN/JA/ZH 로 디바이스가 설정되면
    /// Xcode 카탈로그의 해당 번역으로 치환된다 (없으면 ko 소스 그대로).
    var displayName: String {
        switch self {
        case .normal: return String(localized: "노멀")
        case .rare:   return String(localized: "레어")
        case .unique: return String(localized: "유니크")
        case .legend: return String(localized: "레전드")
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
