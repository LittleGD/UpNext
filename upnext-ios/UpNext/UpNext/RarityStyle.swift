//
//  RarityStyle.swift
//  UpNext — 카드 등급(Rarity) 표시 스타일 (Phase 4 슬라이스 8).
//
//  웹 rarityConfig.ts 의 등급 색/라벨. 여러 화면(Collection/Onboarding/DailyHome)이
//  공유하던 중복 헬퍼를 Rarity extension 으로 통합 — 단일 진실의 원천.
//

import SwiftUI

extension Rarity {
    /// 등급 한국어 라벨.
    var displayName: String {
        switch self {
        case .normal: return "노멀"
        case .rare:   return "레어"
        case .unique: return "유니크"
        case .legend: return "레전드"
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
