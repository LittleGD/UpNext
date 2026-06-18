//
//  CategoryStyle.swift
//  UpNext 디자인 — Category·StatKey 표시 라벨 (Phase 4 코드리뷰 — 중복 통합).
//
//  카테고리/스탯 → 한국어·아이콘 매핑이 여러 화면에 복사돼 있던 것을 한 곳으로.
//  RarityStyle.swift(Rarity 확장)와 같은 패턴.
//
//  Category.label 은 웹 i18n `category.*` 기준 — 포팅 중 CollectionView/
//  CardDetailModal 이 nutrition 을 "영양", wellness 를 "웰니스" 로 잘못 적었던 것을
//  바로잡음(웹 정답: 식단·건강). Up Hero 쪽(CardBuffs)은 웹 `uphero.category.*`
//  변형(명상·트렌딩)을 써 의도적으로 다른 라벨 셋이므로 통합 대상이 아니다.
//

import SwiftUI

extension Category {

    /// 카테고리 라벨 — 메인 게임용. 웹 i18n `category.*` 대응.
    /// AppConfig.loc 으로 *인앱 언어*에 맞춰 카탈로그 해석(기기 로케일 무시 버그 차단).
    var label: String {
        switch self {
        case .fitness:      return AppConfig.loc("운동")
        case .nutrition:    return AppConfig.loc("식단")
        case .mindfulness:  return AppConfig.loc("마음챙김")
        case .learning:     return AppConfig.loc("학습")
        case .social:       return AppConfig.loc("소통")
        case .productivity: return AppConfig.loc("생산성")
        case .wellness:     return AppConfig.loc("건강")
        case .trending:     return AppConfig.loc("트렌드")
        }
    }

    /// 카테고리 PixelIcon — 웹 `CATEGORY_ICONS` (components/icons/index.ts) 1:1.
    /// R3 마감 — SF Symbol(figure.run/fork.knife/…) 폐기, pixelarticons 표준화.
    var pixelIcon: PixelIconName {
        switch self {
        case .fitness:      return .human
        case .nutrition:    return .leaf
        case .mindfulness:  return .wind
        case .learning:     return .bookOpen
        case .social:       return .messageText
        case .productivity: return .clipboard
        case .wellness:     return .heart
        case .trending:     return .globe
        }
    }
}

extension StatKey {

    /// 스탯 표시 라벨 (STR/INT/… 는 약어 그대로, slotBonus 는 카탈로그 경유).
    var label: String {
        switch self {
        case .str:       return "STR"
        case .int:       return "INT"
        case .vit:       return "VIT"
        case .dex:       return "DEX"
        case .agi:       return "AGI"
        case .crit:      return "CRIT"
        case .slotBonus: return AppConfig.loc("슬롯")
        }
    }
}
