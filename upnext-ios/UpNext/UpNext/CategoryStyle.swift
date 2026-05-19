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

import Foundation

extension Category {

    /// 카테고리 한국어 라벨 — 메인 게임용. 웹 i18n `category.*`.
    var label: String {
        switch self {
        case .fitness:      return "운동"
        case .nutrition:    return "식단"
        case .mindfulness:  return "마음챙김"
        case .learning:     return "학습"
        case .social:       return "소통"
        case .productivity: return "생산성"
        case .wellness:     return "건강"
        case .trending:     return "트렌드"
        }
    }

    /// 카테고리 SF Symbol 아이콘.
    var icon: String {
        switch self {
        case .fitness:      return "figure.run"
        case .nutrition:    return "fork.knife"
        case .mindfulness:  return "leaf.fill"
        case .learning:     return "book.fill"
        case .social:       return "person.2.fill"
        case .productivity: return "checklist"
        case .wellness:     return "heart.fill"
        case .trending:     return "flame.fill"
        }
    }
}

extension StatKey {

    /// 스탯 표시 라벨 (STR/INT/… · slotBonus 는 한국어 "슬롯").
    var label: String {
        switch self {
        case .str:       return "STR"
        case .int:       return "INT"
        case .vit:       return "VIT"
        case .dex:       return "DEX"
        case .agi:       return "AGI"
        case .crit:      return "CRIT"
        case .slotBonus: return "슬롯"
        }
    }
}
