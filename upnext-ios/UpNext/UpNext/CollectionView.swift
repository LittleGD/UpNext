//
//  CollectionView.swift
//  UpNext — 컬렉션 (카드 도감) — Phase 4 슬라이스 7.
//
//  웹 app/collection/page.tsx 의 카드 탭을 SwiftUI 로 포팅. 164장을 카테고리별
//  섹션으로 묶어 보여주고, 해금/미해금 + 필터(전체/보유/미보유)를 제공한다.
//
//  웹 컬렉션의 칭호 탭(ALL_TITLES 데이터 미포팅) · 앨범 탭(사진 시스템 = Phase 4.5)
//  과 카드 상세 모달 · 카테고리 아코디언 접기는 이후 슬라이스로 분리.
//

import SwiftUI

struct CollectionView: View {
    @EnvironmentObject private var store: GameStore
    @State private var filter: CardFilter = .all
    /// 탭한 해금 카드 — 값이 있으면 상세 모달이 sheet 로 뜬다.
    @State private var selectedCard: ChallengeCard?

    enum CardFilter: CaseIterable {
        case all, owned, unowned
        var label: String {
            switch self {
            case .all:     return "전체"
            case .owned:   return "보유"
            case .unowned: return "미보유"
            }
        }
    }

    var body: some View {
        let unlocked = Set(store.progress?.unlockedCardIds ?? [])
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                statsHeader(unlocked)
                filterRow
                ForEach(Category.allCases, id: \.self) { category in
                    categorySection(category, unlocked: unlocked)
                }
            }
            .padding(16)
            .padding(.bottom, 88)  // 하단 플로팅 네비 여유
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
        .sheet(item: $selectedCard) { card in
            CardDetailModal(card: card)
        }
    }

    // MARK: - 헤더 / 필터

    private func statsHeader(_ unlocked: Set<String>) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text("컬렉션")
                .typography(.title)
                .foregroundStyle(Color.textPrimary)
            Spacer()
            Text("\(unlocked.count) / \(CardCatalog.allCards.count)")
                .typography(.body)
                .foregroundStyle(Color.accentPrimary)
        }
    }

    private var filterRow: some View {
        HStack(spacing: 8) {
            ForEach(CardFilter.allCases, id: \.self) { option in
                Button {
                    filter = option
                } label: {
                    Text(option.label)
                        .typography(.caption)
                        .foregroundStyle(filter == option ? Color.bgPrimary : Color.textTertiary)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .background(filter == option ? Color.textPrimary : Color.bgSurface,
                                    in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - 카테고리 섹션

    @ViewBuilder
    private func categorySection(_ category: Category, unlocked: Set<String>) -> some View {
        let all = CardCatalog.cards(category: category)
        let shown = all.filter { card in
            switch filter {
            case .all:     return true
            case .owned:   return unlocked.contains(card.id)
            case .unowned: return !unlocked.contains(card.id)
            }
        }
        if !shown.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(categoryLabel(category))
                        .typography(.heading)
                        .foregroundStyle(Color.textPrimary)
                    Spacer()
                    Text("\(all.filter { unlocked.contains($0.id) }.count)/\(all.count)")
                        .typography(.caption)
                        .foregroundStyle(Color.textTertiary)
                }
                LazyVGrid(
                    columns: [GridItem(.flexible(), spacing: 10),
                              GridItem(.flexible(), spacing: 10)],
                    spacing: 10
                ) {
                    ForEach(shown) { card in
                        cardCell(card, unlocked: unlocked.contains(card.id))
                    }
                }
            }
        }
    }

    /// 해금 카드는 탭하면 상세 모달을 띄우는 버튼, 미해금은 비활성 셀.
    @ViewBuilder
    private func cardCell(_ card: ChallengeCard, unlocked: Bool) -> some View {
        if unlocked {
            Button {
                selectedCard = card
            } label: {
                cellBody(card, unlocked: true)
            }
            .buttonStyle(.plain)
        } else {
            cellBody(card, unlocked: false)
        }
    }

    private func cellBody(_ card: ChallengeCard, unlocked: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if unlocked {
                Text(card.rarity.displayName)
                    .typography(.micro)
                    .foregroundStyle(Color.bgPrimary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(card.rarity.color, in: Capsule())
                Text(card.title)
                    .typography(.caption)
                    .foregroundStyle(Color.textPrimary)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                Text(categoryLabel(card.category))
                    .typography(.micro)
                    .foregroundStyle(Color.textTertiary)
            } else {
                Image(systemName: "lock.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(Color.textTertiary)
                Text("잠긴 카드")
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 84, alignment: .topLeading)
        .padding(12)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 10))
        .opacity(unlocked ? 1 : 0.5)
    }

    // MARK: - 라벨 헬퍼

    private func categoryLabel(_ c: Category) -> String {
        switch c {
        case .fitness:      return "운동"
        case .nutrition:    return "영양"
        case .mindfulness:  return "마음챙김"
        case .learning:     return "학습"
        case .social:       return "소통"
        case .productivity: return "생산성"
        case .wellness:     return "웰니스"
        case .trending:     return "트렌드"
        }
    }
}
