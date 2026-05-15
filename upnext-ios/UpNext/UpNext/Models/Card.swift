//
//  Card.swift
//  UpNext 모델 — 챌린지 카드.
//
//  웹 src/types/card.ts를 1:1 포팅.
//  Codable 필드명은 웹 TypeScript interface와 동일하게 유지 (Firestore JSON 호환).
//
//  Phase 2.1 (타입 시스템 Swift 포팅) 산출물.
//

import Foundation

/// 카드 등급. 웹 `Rarity` union.
enum Rarity: String, Codable, CaseIterable, Hashable {
    case normal
    case rare
    case unique
    case legend
}

/// 챌린지 카테고리. 웹 `Category` union (8종).
enum Category: String, Codable, CaseIterable, Hashable {
    case fitness       // 운동/걷기
    case nutrition     // 식단/영양
    case mindfulness   // 명상/마음챙김
    case learning      // 학습/독서
    case social        // 소통/관계
    case productivity  // 생산성/정리
    case wellness      // 건강/휴식
    case trending      // 트렌드 챌린지
}

/// 인증 방식. 웹 `VerifyType` union.
enum VerifyType: String, Codable, Hashable {
    case `self` = "self"   // 자기 인증 (체크만)
    case count             // 횟수 카운트
}

/// 챌린지 카드 — 앱의 핵심 단위. 웹 `ChallengeCard` interface.
struct ChallengeCard: Codable, Identifiable, Hashable {
    /// 해금 조건 — 특정 카테고리 N회 완료 시 해금.
    struct UnlockCondition: Codable, Hashable {
        let category: Category
        let completions: Int
    }

    let id: String                 // 고유 ID (예: "fitness-001")
    let title: String              // 카드 이름 (한국어 기본)
    let description: String        // 챌린지 설명 (한국어 기본)
    let category: Category
    let rarity: Rarity
    let icon: String               // PixelIcon 이름

    // 다국어 — 선택적 (없으면 한국어 기본값 사용)
    var titleEn: String?
    var descriptionEn: String?
    var titleJa: String?
    var descriptionJa: String?
    var titleZh: String?
    var descriptionZh: String?

    let verifyType: VerifyType
    var target: Int?               // count 타입일 때 목표 수치
    var hardcoreTarget: Int?       // 초갓생모드 상향 목표
    var unlockCondition: UnlockCondition?

    /// 현재 언어에 맞는 제목. 다국어 필드가 없으면 한국어 기본.
    func localizedTitle(_ lang: Language) -> String {
        switch lang {
        case .ko: return title
        case .en: return titleEn ?? title
        case .ja: return titleJa ?? title
        case .zh: return titleZh ?? title
        }
    }

    /// 현재 언어에 맞는 설명.
    func localizedDescription(_ lang: Language) -> String {
        switch lang {
        case .ko: return description
        case .en: return descriptionEn ?? description
        case .ja: return descriptionJa ?? description
        case .zh: return descriptionZh ?? description
        }
    }
}
