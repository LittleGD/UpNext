//
//  ClassChoiceView.swift
//  UpNext — Up Hero 전직 (Phase 4 슬라이스 26).
//
//  웹 components/uphero/ClassChoiceModal.tsx 포팅. 영웅이 Lv.30 에 도달하면 전문
//  클래스로 분화한다 — 가장 많이 완료한 카테고리 기반으로 추천을 띄우되 자유 선택.
//
//  웹의 전직 연출(ClassAwakenModal)은 condensed — 선택 즉시 확정 후 아지트 복귀.
//  클래스 스킬트리(learnedSkills)도 condensed — assignClass 는 classType 만 설정.
//

import SwiftUI

struct ClassChoiceView: View {
    @EnvironmentObject private var upHero: UpHeroStore
    @EnvironmentObject private var store: GameStore
    /// 아지트 홈으로 복귀.
    let onBack: () -> Void

    /// 카테고리 → 클래스. 웹 CLASS_BY_DUNGEON.
    private static let classByCategory: [Category: ClassType] = [
        .fitness: .warrior, .learning: .mage, .mindfulness: .monk,
        .nutrition: .druid, .social: .bard, .productivity: .chronomancer,
        .wellness: .priest, .trending: .illusionist,
    ]

    /// 추천 클래스 — 가장 많이 완료한 카테고리 기반. 동률은 Category.allCases 순서.
    private var recommended: ClassType? {
        let completions = store.progress?.categoryCompletions ?? [:]
        var best: Category?
        var bestCount = 0
        for c in Category.allCases where (completions[c.rawValue] ?? 0) > bestCount {
            best = c
            bestCount = completions[c.rawValue] ?? 0
        }
        guard let best, bestCount > 0 else { return nil }
        return Self.classByCategory[best]
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    Text("영웅이 Lv.30에 도달했어요.\n걸어온 길에 맞는 전문 클래스를 고르세요.")
                        .typography(.caption)
                        .foregroundStyle(Color.textTertiary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, 4)
                    ForEach(ClassType.allCases, id: \.self) { cls in
                        classCard(cls)
                    }
                }
                .padding(16)
                .padding(.bottom, 88)  // 하단 플로팅 네비 여유
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
    }

    private var header: some View {
        HStack(spacing: 8) {
            Button(action: onBack) {
                PixelIcon(.chevronLeft, size: 16, color: Color.textSecondary)
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)
            Text("전직")
                .typography(.title)
                .foregroundStyle(Color.textPrimary)
            Spacer()
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
    }

    private func classCard(_ cls: ClassType) -> some View {
        let isRec = cls == recommended
        return Button {
            upHero.assignClass(cls)
            onBack()
        } label: {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(UpHeroRules.classMeta[cls]?.name ?? "")
                            .typography(.body)
                            .foregroundStyle(Color.textPrimary)
                        if isRec {
                            Text("추천")
                                .typography(.micro)
                                .foregroundStyle(Color.bgPrimary)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.accentPrimary, in: Capsule())
                        }
                    }
                    Text("\(categoryName(cls)) 특화")
                        .typography(.micro)
                        .foregroundStyle(Color.textTertiary)
                }
                Spacer(minLength: 0)
                PixelIcon(.chevronRight, size: 13, color: Color.textTertiary)
            }
            .padding(14)
            .frame(maxWidth: .infinity)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    /// 클래스의 출신 카테고리 한국어 라벨.
    private func categoryName(_ cls: ClassType) -> String {
        switch cls {
        case .warrior:      return AppConfig.loc("운동")
        case .mage:         return AppConfig.loc("학습")
        case .monk:         return AppConfig.loc("명상")
        case .druid:        return AppConfig.loc("식단")
        case .bard:         return AppConfig.loc("소통")
        case .chronomancer: return AppConfig.loc("생산성")
        case .priest:       return AppConfig.loc("건강")
        case .illusionist:  return AppConfig.loc("트렌드")
        }
    }
}
