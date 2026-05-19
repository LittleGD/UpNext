//
//  MinigameView.swift
//  UpNext — 미니게임: 카드 맞추기 (Phase 4 슬라이스 30 · Phase 4.6).
//
//  웹 src/components/minigame/ (카드매치 게임)의 condensed 포팅. 티켓 1장으로
//  플레이 — 같은 그림 두 장을 찾는 메모리 매치. 모두 맞추면 XP 보상.
//
//  웹의 라운드·HUD·이펙트·리워드 드래프트는 condensed — 한 판 메모리 매치 + 단순
//  보상. Up Hero 전투 중 미니게임(awaitingMinigame)은 별개로 자동 처리(슬라이스 22).
//

import SwiftUI

struct MinigameView: View {
    @EnvironmentObject private var store: GameStore
    @Environment(\.dismiss) private var dismiss

    @State private var cards: [MGCard] = MinigameView.makeCards()
    /// 현재 뒤집힌(미매치) 카드 인덱스 — 최대 2.
    @State private var flipped: [Int] = []
    /// 짝을 맞춘 카드 인덱스.
    @State private var matched: Set<Int> = []
    /// 불일치 카드가 다시 뒤집히길 기다리는 동안 입력 차단.
    @State private var busy = false
    @State private var won = false

    struct MGCard: Identifiable {
        let id = UUID()
        let symbol: String
    }

    /// 8쌍(16장) — SF Symbol 8종을 두 장씩 섞는다.
    static func makeCards() -> [MGCard] {
        let symbols = ["star.fill", "heart.fill", "bolt.fill", "leaf.fill",
                       "flame.fill", "drop.fill", "moon.fill", "sun.max.fill"]
        return (symbols + symbols).shuffled().map { MGCard(symbol: $0) }
    }

    var body: some View {
        ZStack {
            Color.bgPrimary.ignoresSafeArea()
            if won { winView } else { gameView }
        }
    }

    // MARK: - 게임

    private var gameView: some View {
        VStack(spacing: 16) {
            VStack(spacing: 4) {
                Text("카드 맞추기")
                    .typography(.title)
                    .foregroundStyle(Color.textPrimary)
                Text("같은 그림 두 장을 찾으세요")
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
            }
            .padding(.top, 16)
            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 4),
                spacing: 10
            ) {
                ForEach(Array(cards.enumerated()), id: \.offset) { idx, card in
                    cardCell(idx, card)
                }
            }
            .padding(.horizontal, 20)
            Spacer()
            Button("닫기") { dismiss() }
                .typography(.body)
                .foregroundStyle(Color.accentPrimary)
                .padding(.bottom, 16)
        }
    }

    private func cardCell(_ idx: Int, _ card: MGCard) -> some View {
        let faceUp = flipped.contains(idx) || matched.contains(idx)
        return Button { tap(idx) } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(faceUp ? Color.bgElevated : Color.bgSurface)
                if faceUp {
                    Image(systemName: card.symbol)
                        .font(.system(size: 26))
                        .foregroundStyle(matched.contains(idx)
                                         ? Color.accentPrimary : Color.textPrimary)
                }
            }
            .aspectRatio(1, contentMode: .fit)
        }
        .buttonStyle(.plain)
        .disabled(faceUp || busy)
    }

    /// 카드 탭 — 뒤집고, 두 장이면 일치 판정.
    private func tap(_ idx: Int) {
        guard !busy, !flipped.contains(idx), !matched.contains(idx) else { return }
        flipped.append(idx)
        Haptics.play(.selection)        // 카드 뒤집기 — 매 인터랙션 촉각 반응
        SoundPlayer.shared.play(.cardFlip)
        guard flipped.count == 2 else { return }
        let (a, b) = (flipped[0], flipped[1])
        if cards[a].symbol == cards[b].symbol {
            matched.insert(a)
            matched.insert(b)
            flipped = []
            if matched.count == cards.count {
                win()                   // win → awardMinigameWin 이 .celebration + .levelUp
            } else {
                Haptics.play(.medium)    // 짝 맞춤 — 만족스러운 임팩트
                SoundPlayer.shared.play(.complete)
            }
        } else {
            // 불일치 — 0.7초 뒤 두 장을 다시 뒤집는다.
            busy = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
                flipped = []
                busy = false
            }
        }
    }

    private func win() {
        won = true
        store.awardMinigameWin()
    }

    // MARK: - 성공 화면

    private var winView: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "trophy.fill")
                .font(.system(size: 44))
                .foregroundStyle(Color.accentPrimary)
            Text("성공!")
                .typography(.title)
                .foregroundStyle(Color.textPrimary)
            Text("경험치 +30")
                .typography(.caption)
                .foregroundStyle(Color.textSecondary)
            Spacer()
            Button { dismiss() } label: {
                Text("받기")
                    .typography(.body)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .foregroundStyle(Color.bgPrimary)
                    .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 32)
            .padding(.bottom, 24)
        }
    }
}
