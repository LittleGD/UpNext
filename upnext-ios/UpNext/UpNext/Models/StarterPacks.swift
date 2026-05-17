//
//  StarterPacks.swift
//  UpNext 모델 — 온보딩 스타터 팩 (Phase 4 슬라이스 5).
//
//  웹 src/data/starterPacks.ts 1:1 포팅. 신규 유저가 온보딩에서 1개를 골라
//  해당 6장 + 트렌딩 스타터 카드를 해금한다.
//

import Foundation

struct StarterPack: Identifiable {
    let id: String
    let name: String
    let nameEn: String
    let nameJa: String
    let nameZh: String
    let description: String
    let descriptionEn: String
    let descriptionJa: String
    let descriptionZh: String
    let cardIds: [String]
    let icon: String

    func localizedName(_ lang: Language) -> String {
        switch lang {
        case .ko: return name
        case .en: return nameEn
        case .ja: return nameJa
        case .zh: return nameZh
        }
    }

    func localizedDescription(_ lang: Language) -> String {
        switch lang {
        case .ko: return description
        case .en: return descriptionEn
        case .ja: return descriptionJa
        case .zh: return descriptionZh
        }
    }
}

enum StarterPacks {
    static let all: [StarterPack] = [
        StarterPack(
            id: "body-mind",
            name: "바디 & 마인드", nameEn: "Body & Mind",
            nameJa: "ボディ&マインド", nameZh: "身心平衡",
            description: "운동과 마음챙김으로 시작하는 건강한 루틴",
            descriptionEn: "A healthy routine of fitness and mindfulness",
            descriptionJa: "フィットネスとマインドフルネスで始める健康ルーティン",
            descriptionZh: "从运动和正念开始的健康日常",
            cardIds: ["fitness-001", "fitness-002", "fitness-003",
                      "mindfulness-001", "mindfulness-002", "wellness-001"],
            icon: "Heart"),
        StarterPack(
            id: "smart-life",
            name: "스마트 라이프", nameEn: "Smart Life",
            nameJa: "スマートライフ", nameZh: "高效生活",
            description: "학습과 생산성으로 시작하는 스마트한 루틴",
            descriptionEn: "A smart routine of learning and productivity",
            descriptionJa: "学習と生産性で始めるスマートなルーティン",
            descriptionZh: "从学习和效率提升开始的智慧日常",
            cardIds: ["learning-001", "learning-002", "nutrition-001",
                      "nutrition-002", "productivity-001", "productivity-002"],
            icon: "Lightbulb"),
        StarterPack(
            id: "global-trends",
            name: "글로벌 트렌드", nameEn: "Global Trends",
            nameJa: "グローバルトレンド", nameZh: "全球潮流",
            description: "한·일·중·미 Z세대가 SNS에서 따라하는 갓생 챌린지",
            descriptionEn: "Z-gen daily-life trends from KR · JP · CN · US",
            descriptionJa: "韓・日・中・米のZ世代が実践するトレンド習慣",
            descriptionZh: "韩日中美Z世代的潮流自律挑战",
            cardIds: ["trending-001", "trending-009", "trending-017",
                      "trending-027", "trending-018", "trending-026"],
            icon: "Globe"),
    ]
}
