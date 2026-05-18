//
//  CardPackOpenerView.swift
//  UpNext — 카드팩 개봉 화면 (Phase 4 슬라이스 10 · Phase 4.3 시작).
//
//  웹 components/cards/CardPackOpener.tsx 포팅. 레벨업·챌린지 보상으로 쌓인
//  pendingPacks / pendingBonusCards 를 열어 새 카드를 해금한다.
//
//  pendingPacks 가 0 이상이면 MainTabView 가 이 화면을 fullScreenCover 로 띄운다.
//  웹의 팩 개봉 3D 연출은 Phase 4.3 후속 — 여기선 기능적 reveal(등급별 카드 그리드).
//

import SwiftUI

struct CardPackOpenerView: View {
    @EnvironmentObject private var store: GameStore
    let onComplete: () -> Void

    @State private var revealed: Reveal?

    private struct Reveal {
        let cards: [ChallengeCard]
        let tier: Rarity
    }

    /// 아직 열지 않은 팩 수 (레벨업 팩 + 보너스 카드).
    private var pendingCount: Int {
        (store.progress?.pendingPacks ?? 0) + (store.progress?.pendingBonusCards ?? 0)
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            if let revealed {
                revealView(revealed)
            } else {
                prompt
            }
            Spacer()
            bottomButton
        }
        .padding(.horizontal, 32)
        .padding(.bottom, 40)
        .padding(.top, 32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
    }

    // MARK: - 개봉 전

    private var prompt: some View {
        VStack(spacing: 12) {
            Image(systemName: "gift.fill")
                .font(.system(size: 48))
                .foregroundStyle(Color.accentPrimary)
            Text("카드팩 \(pendingCount)개")
                .typography(.title)
                .foregroundStyle(Color.textPrimary)
            Text("레벨업·챌린지 보상으로 받은 카드팩이에요.\n열어서 새 카드를 덱에 추가하세요.")
                .typography(.caption)
                .foregroundStyle(Color.textTertiary)
                .multilineTextAlignment(.center)
        }
    }

    // MARK: - 개봉 후 reveal

    private func revealView(_ r: Reveal) -> some View {
        VStack(spacing: 16) {
            Text("\(r.tier.displayName) 팩")
                .typography(.heading)
                .foregroundStyle(r.tier.color)
            if r.cards.isEmpty {
                Text("새로 해금할 카드가 없어요")
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
            } else {
                Text("새 카드 \(r.cards.count)장 해금!")
                    .typography(.caption)
                    .foregroundStyle(Color.textSecondary)
                LazyVGrid(
                    columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3),
                    spacing: 10
                ) {
                    ForEach(r.cards) { card in
                        revealCard(card)
                    }
                }
            }
        }
    }

    private func revealCard(_ card: ChallengeCard) -> some View {
        VStack(spacing: 6) {
            Text(card.rarity.displayName)
                .typography(.micro)
                .foregroundStyle(Color.bgPrimary)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(card.rarity.color, in: Capsule())
            Text(card.title)
                .typography(.micro)
                .foregroundStyle(Color.textPrimary)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, minHeight: 72)
        .padding(.vertical, 10)
        .padding(.horizontal, 6)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - 하단 버튼

    @ViewBuilder private var bottomButton: some View {
        if revealed == nil {
            button("팩 열기") { open() }
        } else if pendingCount > 0 {
            button("다음 팩 열기 (\(pendingCount))") { open() }
        } else {
            button("완료", action: onComplete)
        }
    }

    private func open() {
        if let result = store.openCardPack() {
            revealed = Reveal(cards: result.cards, tier: result.tier)
        } else {
            // 열 팩 없음 / 컬렉션 100% — 닫는다.
            onComplete()
        }
    }

    private func button(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .typography(.body)
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .foregroundStyle(Color.bgPrimary)
                .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 12))
        }
    }
}
