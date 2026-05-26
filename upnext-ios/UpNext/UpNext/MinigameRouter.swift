//
//  MinigameRouter.swift
//  UpNext — Up Hero 미니게임 라우터 + 3개 핵심 반사 미니게임.
//
//  웹 src/components/uphero/minigames/* 의 11개 게임 전 11종 (PairMatch /
//  ReactionTap / TapBurst 는 본 파일, 나머지 8종은 MinigameGames.swift).
//
//  사용:
//    .overlay {
//      if let pending = session.pendingMinigame {
//        MinigameRouter(pending: pending) { success in
//          upHero.resolveMinigameResult(success: success)
//        }
//      }
//    }
//
//  P0-1 (App Store) — onCancel 콜백 + 우상단 X 버튼 의무. 미니게임 갇히면
//  종료 못하던 거부 리스크 해소. 호출자는 cancel 시 fail 과 동일하게 처리
//  (`resolveMinigameResult(success: false)`) — 라운드 진입 자체가 챌린지
//  요구라 그냥 fail 로 합류.
//

import SwiftUI
import Combine

struct MinigameRouter: View {
    let pending: PendingMinigame
    let onComplete: (Bool) -> Void
    /// P0-1 — 사용자가 우상단 X 또는 GiveUp 으로 직접 포기. 호출자는 보통
    /// `onComplete(false)` 와 동일 처리하면 됨 (separate hook 이 필요하면 분기).
    let onCancel: () -> Void

    init(pending: PendingMinigame,
         onComplete: @escaping (Bool) -> Void,
         onCancel: (() -> Void)? = nil) {
        self.pending = pending
        self.onComplete = onComplete
        // 호출자가 onCancel 을 명시하지 않으면 fail 합류로 폴백.
        self.onCancel = onCancel ?? { onComplete(false) }
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.85).ignoresSafeArea()
            VStack(spacing: 0) {
                gameView
            }
            .padding(16)
            .frame(maxWidth: 400)
        }
        // P0-1 — 우상단 종료 버튼. 디자인 룰 "아이콘 박스 금지" 준수 위해
        // 원형 배경 없는 PixelIcon(.cancel) 사용 (pixelarticons cancel.svg = X).
        // SF Symbol `xmark.circle.fill` 같은 박스형 아이콘 금지.
        .overlay(alignment: .topTrailing) {
            Button {
                Haptics.play(.selection)
                onCancel()
            } label: {
                PixelIcon(.cancel, size: 22, color: Color.white.opacity(0.7))
                    .frame(width: 44, height: 44)         // 최소 44×44 탭 타깃
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.top, 12)
            .padding(.trailing, 12)
            .accessibilityLabel(Text("미니게임 종료"))
        }
    }

    @ViewBuilder
    private var gameView: some View {
        switch pending.minigame {
        case .pairMatch:
            PairMatchGame(difficulty: pending.difficulty, onComplete: onComplete)
        case .reactionTap:
            ReactionTapGame(difficulty: pending.difficulty, onComplete: onComplete)
        case .tapBurst:
            TapBurstGame(difficulty: pending.difficulty, onComplete: onComplete)
        case .pipeConnect:
            PipeConnectGame(difficulty: pending.difficulty, onComplete: onComplete)
        case .sequenceMemo:
            SequenceMemoGame(difficulty: pending.difficulty, onComplete: onComplete)
        case .dodgeDrops:
            DodgeDropsGame(difficulty: pending.difficulty, onComplete: onComplete)
        case .sortItems:
            SortItemsGame(difficulty: pending.difficulty, onComplete: onComplete)
        case .quickSum:
            QuickSumGame(difficulty: pending.difficulty, onComplete: onComplete)
        case .spotDiff:
            SpotDiffGame(difficulty: pending.difficulty, onComplete: onComplete)
        case .breathHold:
            BreathHoldGame(difficulty: pending.difficulty, onComplete: onComplete)
        case .tracePath:
            TracePathGame(difficulty: pending.difficulty, onComplete: onComplete)
        }
    }
}

// MARK: - 공용 셸 (제목 + 결과 처리)

private struct MinigameShell<Content: View>: View {
    let title: String
    let difficulty: Int
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(spacing: 16) {
            HStack {
                Text(title)
                    .typography(.title)
                    .foregroundStyle(Color.accentPrimary)
                Spacer()
                Text("난이도 \(difficulty)")
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
            }
            content()
        }
        .padding(20)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 16))
    }
}

// MARK: - 1. PairMatch (16 카드 메모리 매치)

private struct PairMatchGame: View {
    let difficulty: Int
    let onComplete: (Bool) -> Void

    @State private var cards: [PMCard] = []
    @State private var flipped: [Int] = []
    @State private var matchedIds: Set<Int> = []
    @State private var lockInput: Bool = false
    @State private var timeRemaining: Int

    /// 난이도별 시간 — 30/22/15s.
    init(difficulty: Int, onComplete: @escaping (Bool) -> Void) {
        self.difficulty = difficulty
        self.onComplete = onComplete
        _timeRemaining = State(initialValue: difficulty == 1 ? 30 : difficulty == 2 ? 22 : 15)
    }

    private struct PMCard: Identifiable {
        let id: Int
        let icon: PixelIconName
    }

    var body: some View {
        MinigameShell(title: "짝 맞추기", difficulty: difficulty) {
            VStack(spacing: 12) {
                Text("\(timeRemaining)s 남음")
                    .typography(.caption)
                    .foregroundStyle(Color.textSecondary)
                    .monospacedDigit()

                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                    ForEach(cards) { card in
                        cardView(card)
                    }
                }
            }
        }
        .onAppear { initBoard() }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { _ in
            guard timeRemaining > 0 else { return }
            timeRemaining -= 1
            if timeRemaining <= 0 { onComplete(false) }
        }
    }

    private func cardView(_ card: PMCard) -> some View {
        let isFlipped = flipped.contains(card.id) || matchedIds.contains(card.id)
        let isMatched = matchedIds.contains(card.id)
        return Button {
            handleTap(card)
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(isMatched ? Color.accentPrimary.opacity(0.25) :
                          isFlipped ? Color.bgElevated : Color.accentPrimary.opacity(0.15))
                if isFlipped {
                    PixelIcon(card.icon, size: 28, color: Color.accentPrimary)
                }
            }
            .frame(height: 60)
        }
        .buttonStyle(.plain)
        .disabled(isMatched || lockInput)
    }

    private func initBoard() {
        let icons: [PixelIconName] = [.star, .heart, .flame, .gift, .leaf, .moon, .zap, .sparkle]
        let pairs = (icons + icons).shuffled()
        cards = pairs.enumerated().map { PMCard(id: $0.offset, icon: $0.element) }
    }

    private func handleTap(_ card: PMCard) {
        guard !flipped.contains(card.id) && !matchedIds.contains(card.id) && !lockInput else { return }
        Haptics.play(.selection)
        SoundPlayer.shared.play(.cardFlip)
        flipped.append(card.id)
        if flipped.count == 2 {
            lockInput = true
            let aId = flipped[0], bId = flipped[1]
            let a = cards.first { $0.id == aId }!
            let b = cards.first { $0.id == bId }!
            if a.icon == b.icon {
                matchedIds.insert(aId)
                matchedIds.insert(bId)
                flipped = []
                lockInput = false
                SoundPlayer.shared.play(.matchPair)
                if matchedIds.count == cards.count {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { onComplete(true) }
                }
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
                    flipped = []
                    lockInput = false
                }
            }
        }
    }
}

// MARK: - 2. ReactionTap (신호등 — 녹색에서만 탭)

private struct ReactionTapGame: View {
    let difficulty: Int
    let onComplete: (Bool) -> Void

    @State private var phase: TLPhase = .waiting
    @State private var waitDuration: Double = 0
    @State private var startedGreen: Date?
    @State private var reactionMs: Int?

    private enum TLPhase { case waiting, ready, go, success, fail }

    /// 난이도별 목표 반응속도 ms — 600/450/300ms 이내.
    private var targetMs: Int {
        difficulty == 1 ? 600 : difficulty == 2 ? 450 : 300
    }

    var body: some View {
        MinigameShell(title: "반응 속도", difficulty: difficulty) {
            VStack(spacing: 16) {
                statusText
                signalLight
                if phase == .success, let ms = reactionMs {
                    Text("\(ms)ms — 성공!")
                        .typography(.body)
                        .foregroundStyle(Color.accentPrimary)
                } else if phase == .fail {
                    Text("실패").typography(.body).foregroundStyle(Color.accentSecondary)
                }
            }
            .frame(height: 280)
        }
        .onAppear { startSequence() }
        .contentShape(Rectangle())
        .onTapGesture { handleTap() }
    }

    private var statusText: some View {
        Text(phase == .waiting ? "준비..." :
             phase == .ready  ? "기다려..." :
             phase == .go     ? "지금 탭!" :
             phase == .success ? "성공" : "실패")
            .typography(.heading)
            .foregroundStyle(Color.textPrimary)
    }

    private var signalLight: some View {
        let color: Color
        switch phase {
        case .waiting, .ready: color = Color.signalReady
        case .go:              color = Color.signalGo
        case .success:         color = Color.accentPrimary
        case .fail:            color = Color.signalStopStrong
        }
        return Circle()
            .fill(color)
            .frame(width: 180, height: 180)
            .shadow(color: color.opacity(0.6), radius: phase == .go ? 24 : 0)
    }

    private func startSequence() {
        // 1-3s 대기 후 녹색 ON
        waitDuration = Double.random(in: 1.5...3.0)
        phase = .ready
        DispatchQueue.main.asyncAfter(deadline: .now() + waitDuration) {
            phase = .go
            startedGreen = Date()
            SoundPlayer.shared.play(.chargeUp)
        }
    }

    private func handleTap() {
        switch phase {
        case .ready:
            // 너무 빨리 탭 — 실패
            phase = .fail
            Haptics.play(.warning)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { onComplete(false) }
        case .go:
            let ms = Int(Date().timeIntervalSince(startedGreen ?? Date()) * 1000)
            reactionMs = ms
            if ms <= targetMs {
                phase = .success
                Haptics.play(.success)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { onComplete(true) }
            } else {
                phase = .fail
                Haptics.play(.warning)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { onComplete(false) }
            }
        default:
            break
        }
    }
}

// MARK: - 3. TapBurst (제한 시간 내 N회 탭)

private struct TapBurstGame: View {
    let difficulty: Int
    let onComplete: (Bool) -> Void

    @State private var count: Int = 0
    @State private var timeRemaining: Double = 5.0
    @State private var startedAt: Date?

    /// 난이도별 목표 — 5s 내 25/40/55회.
    private var target: Int {
        difficulty == 1 ? 25 : difficulty == 2 ? 40 : 55
    }

    var body: some View {
        MinigameShell(title: "연타!", difficulty: difficulty) {
            VStack(spacing: 16) {
                Text("\(count) / \(target)")
                    .typography(.display)
                    .foregroundStyle(count >= target ? Color.accentPrimary : Color.textPrimary)
                    .monospacedDigit()
                Text(String(format: "%.1fs", max(0, timeRemaining)))
                    .typography(.caption)
                    .foregroundStyle(Color.textSecondary)
                    .monospacedDigit()
                tapButton
            }
            .frame(maxWidth: .infinity)
        }
        .onAppear { startedAt = Date() }
        .onReceive(Timer.publish(every: 1.0/30, on: .main, in: .common).autoconnect()) { _ in
            guard let s = startedAt else { return }
            let elapsed = Date().timeIntervalSince(s)
            timeRemaining = max(0, 5.0 - elapsed)
            if timeRemaining <= 0 {
                onComplete(count >= target)
                startedAt = nil
            }
        }
    }

    private var tapButton: some View {
        Button {
            guard timeRemaining > 0 else { return }
            count += 1
            Haptics.play(.light)
        } label: {
            ZStack {
                Circle()
                    .fill(Color.accentPrimary)
                    .frame(width: 180, height: 180)
                Text("TAP")
                    .typography(.heading)
                    .foregroundStyle(Color.bgPrimary)
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - MinigameId 친화적 이름

private extension MinigameId {
    var displayName: String {
        switch self {
        case .pipeConnect:  return "파이프 연결"
        case .pairMatch:    return "짝 맞추기"
        case .sequenceMemo: return "순서 기억"
        case .tapBurst:     return "연타"
        case .dodgeDrops:   return "낙하 회피"
        case .sortItems:    return "분류"
        case .quickSum:     return "암산"
        case .spotDiff:     return "틀린 그림 찾기"
        case .breathHold:   return "호흡 멈춤"
        case .tracePath:    return "경로 따라가기"
        case .reactionTap:  return "반응 속도"
        }
    }
}
