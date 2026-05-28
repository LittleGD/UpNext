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
    /// 카드 도감 / 칭호 / 인증 사진 앨범 탭.
    @State private var tab: CollectionTab = .cards

    enum CollectionTab { case cards, titles, album }

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
        VStack(spacing: 0) {
            tabSwitcher
            if tab == .cards {
                cardCollection
            } else if tab == .titles {
                titleCollection
            } else {
                AlbumView()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
        .sheet(item: $selectedCard) { card in
            CardDetailModal(card: card)
        }
    }

    /// 카드 도감 / 앨범 탭 전환.
    private var tabSwitcher: some View {
        HStack(spacing: 8) {
            ForEach([CollectionTab.cards, .titles, .album], id: \.self) { t in
                Button { tab = t } label: {
                    Text(tabLabel(t))
                        .typography(.caption)
                        .foregroundStyle(tab == t ? Color.bgPrimary : Color.textTertiary)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 7)
                        .background(tab == t ? Color.textPrimary : Color.bgSurface,
                                    in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier(tabAccessibilityId(t))
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 4)
    }

    private func tabLabel(_ tab: CollectionTab) -> String {
        switch tab {
        case .cards: return "카드"
        case .titles: return "칭호"
        case .album: return "앨범"
        }
    }

    private func tabAccessibilityId(_ tab: CollectionTab) -> String {
        switch tab {
        case .cards: return "cardsTabButton"
        case .titles: return "titlesTabButton"
        case .album: return "albumTabButton"
        }
    }

    /// 카드 도감 (기존 컬렉션 그리드).
    private var cardCollection: some View {
        let unlocked = Set(store.progress?.unlockedCardIds ?? [])
        return ScrollView {
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

    // MARK: - 칭호

    private struct NativeTitle: Identifiable {
        var id: String
        var name: String
        var description: String
        var earned: Bool
        var progress: String
    }

    private var titleCollection: some View {
        let progress = store.progress
        let titles = nativeTitles(progress)
        let earnedIds = titles.filter(\.earned).map(\.id)
        return ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline) {
                    Text("칭호")
                        .typography(.title)
                        .foregroundStyle(Color.textPrimary)
                    Spacer()
                    Text("\(earnedIds.count) / \(titles.count)")
                        .typography(.body)
                        .foregroundStyle(Color.accentPrimary)
                }
                if let equipped = progress?.equippedTitleId,
                   let title = titles.first(where: { $0.id == equipped }) {
                    equippedTitle(title)
                }
                VStack(spacing: 10) {
                    ForEach(titles) { title in
                        titleRow(title, equipped: progress?.equippedTitleId == title.id)
                    }
                }
            }
            .padding(16)
            .padding(.bottom, 88)
        }
        .onAppear { store.markTitlesSeen(earnedIds) }
    }

    private func equippedTitle(_ title: NativeTitle) -> some View {
        HStack(spacing: 10) {
            PixelIcon(.star, size: 16, color: Color.bgPrimary)
            Text(title.name)
                .typography(.body)
                .foregroundStyle(Color.bgPrimary)
            Spacer()
            Text("장착 중")
                .typography(.micro)
                .foregroundStyle(Color.bgPrimary.opacity(0.72))
        }
        .padding(14)
        .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 10))
    }

    private func titleRow(_ title: NativeTitle, equipped: Bool) -> some View {
        Button {
            guard title.earned else { return }
            store.equipTitle(equipped ? nil : title.id)
        } label: {
            HStack(spacing: 12) {
                PixelIcon(title.earned ? .trophy : .lock,
                          size: 18,
                          color: title.earned ? Color.accentPrimary : Color.textTertiary)
                    .frame(width: 24)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title.name)
                        .typography(.body)
                        .foregroundStyle(title.earned ? Color.textPrimary : Color.textTertiary)
                    Text(title.description)
                        .typography(.micro)
                        .foregroundStyle(Color.textTertiary)
                    Text(title.progress)
                        .typography(.micro)
                        .foregroundStyle(title.earned ? Color.accentPrimary : Color.textTertiary)
                }
                Spacer(minLength: 0)
                if equipped {
                    PixelIcon(.check, size: 14, color: Color.accentPrimary)
                }
            }
            .padding(14)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
        .disabled(!title.earned)
    }

    private func nativeTitles(_ progress: UserProgress?) -> [NativeTitle] {
        guard let p = progress else { return [] }
        var titles: [NativeTitle] = [
            NativeTitle(
                id: "level-\(p.level)",
                name: GameRules.titleForLevel(p.level, lang: p.language),
                description: "현재 레벨 칭호",
                earned: p.level >= 1,
                progress: "Lv \(p.level)"
            ),
            NativeTitle(
                id: "collection-complete",
                name: "컬렉션 마스터",
                description: "모든 카드를 수집",
                earned: p.unlockedCardIds.count >= CardCatalog.allCards.count,
                progress: "\(p.unlockedCardIds.count)/\(CardCatalog.allCards.count)"
            ),
        ]

        for days in [3, 7, 14, 30] {
            titles.append(NativeTitle(
                id: "streak-\(days)",
                name: "\(days)일 연속 실천가",
                description: "최장 스트릭 \(days)일 달성",
                earned: p.longestStreak >= days,
                progress: "\(min(p.longestStreak, days))/\(days)"
            ))
        }
        for category in Category.allCases {
            let count = p.categoryCompletions[category.rawValue, default: 0]
            titles.append(NativeTitle(
                id: "category-\(category.rawValue)-5",
                name: "\(category.label) 루키",
                description: "\(category.label) 카드 5회 완료",
                earned: count >= 5,
                progress: "\(min(count, 5))/5"
            ))
        }
        titles.append(NativeTitle(
            id: "extra-1",
            name: "추가 도전자",
            description: "추가 챌린지 완료",
            earned: p.extraChallengesCompleted >= 1,
            progress: "\(min(p.extraChallengesCompleted, 1))/1"
        ))
        titles.append(NativeTitle(
            id: "super-1",
            name: "슈퍼 루틴러",
            description: "슈퍼 챌린지 완료",
            earned: p.superChallengesCompleted >= 1,
            progress: "\(min(p.superChallengesCompleted, 1))/1"
        ))
        return titles
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
                    Text(category.label)
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
                Text(card.category.label)
                    .typography(.micro)
                    .foregroundStyle(Color.textTertiary)
            } else {
                PixelIcon(.lock, size: 16, color: Color.textTertiary)
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
}
