//
//  MinigameView.swift
//  UpNext — 미니게임: 3-round 로그라이크 메모리 매치 (R8 격상).
//
//  웹 src/components/minigame/* 의 phase machine 격상:
//   1. categoryFlash (카드 카테고리 미리보기 1.5s)
//   2. peek (2s 전체 뒤집힘 보기)
//   3. playing (라운드 진행)
//   4. roundResult (라운드 결과)
//   5. runResult (전체 결과)
//
//  미이식(계획): 웹 R8 의 rewardDraft 메타레이어(라운드 사이 3택1 버프 드래프트 +
//  REWARD_POOL 10종 round/run scope 적용)는 아직 포팅 전 — roundResult 에서 다음
//  라운드/결과로 직진한다. 코어(라운드·하트·매칭·XP·카드언락)는 완결 동작.
//
//  타일 종류:
//   - challenge : 같은 카테고리 두 장 짝 → XP
//   - skill     : 두 장 짝 → 보너스 시간 / 하트 회복
//   - curse     : 두 장 짝 → 페널티 (-시간 / -하트)
//
//  3 라운드: 4×4 (16) → 4×5 (20) → 6×4 (24).
//  하트 3개 — 미스매치 -1, skill +1 (최대 3). 0 되면 게임오버.
//

import SwiftUI
import Combine

struct MinigameView: View {
    @EnvironmentObject private var store: GameStore
    @Environment(\.dismiss) private var dismiss

    @State private var phase: Phase = .categoryFlash
    @State private var roundIdx: Int = 0
    @State private var hearts: Int = 3
    @State private var totalXp: Int = 0
    @State private var board: [MGTile] = []
    @State private var flipped: [Int] = []
    @State private var matched: Set<Int> = []
    @State private var locked: Bool = false
    @State private var roundXp: Int = 0
    @State private var lastResult: RoundResult = .pending
    @State private var toastMessage: String?
    /// 이번 미니게임 런에서 매치된 카드 ID. 결과 수령 시 GameStore 로 전달해 웹
    /// grantMinigameRewards 처럼 카드 언락/중복 XP 를 반영한다.
    @State private var matchedCardIds: Set<String> = []

    private enum Phase { case categoryFlash, peek, playing, roundResult, runResult }
    private enum RoundResult { case pending, success, failed }

    private static let rounds: [(rows: Int, cols: Int, skills: Int, curses: Int)] = [
        (rows: 4, cols: 4, skills: 1, curses: 0),
        (rows: 5, cols: 4, skills: 2, curses: 1),
        (rows: 4, cols: 6, skills: 2, curses: 2),
    ]

    var body: some View {
        ZStack {
            Color.bgPrimary.ignoresSafeArea()
            switch phase {
            case .categoryFlash: categoryFlashView
            case .peek:          peekView
            case .playing:       playingView
            case .roundResult:   roundResultView
            case .runResult:     runResultView
            }

            // 토스트
            if let msg = toastMessage {
                VStack {
                    Text(msg)
                        .typography(.body)
                        .foregroundStyle(Color.bgPrimary)
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(Color.accentPrimary, in: Capsule())
                        .padding(.top, 80)
                    Spacer()
                }
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .onAppear { startRound() }
    }

    // MARK: - HUD

    private var hud: some View {
        HStack {
            // hearts
            HStack(spacing: 3) {
                ForEach(0..<3, id: \.self) { i in
                    PixelIcon(.heart, size: 14,
                              color: i < hearts ? Color.accentFushia : Color.textTertiary.opacity(0.3))
                }
            }
            Spacer()
            // round
            Text("라운드 \(roundIdx + 1) / 3")
                .typography(.caption).foregroundStyle(Color.textSecondary)
            Spacer()
            // XP
            HStack(spacing: 4) {
                PixelIcon(.sparkle, size: 12, color: Color.accentPrimary)
                Text("\(totalXp + roundXp)")
                    .typography(.caption).monospacedDigit().foregroundStyle(Color.accentPrimary)
            }
        }
        .padding(.horizontal, 20).padding(.vertical, 8)
    }

    // MARK: - 1. CategoryFlash

    private var categoryFlashView: some View {
        VStack(spacing: 16) {
            hud
            Spacer()
            Text("카드 카테고리")
                .typography(.heading).foregroundStyle(Color.textPrimary)
            categoryGrid
            Spacer()
            Text("매칭할 카드를 기억하세요...").typography(.caption).foregroundStyle(Color.textTertiary)
        }
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                phase = .peek
            }
        }
    }

    private var categoryGrid: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 4), spacing: 10) {
            ForEach(Category.allCases, id: \.self) { cat in
                VStack(spacing: 4) {
                    PixelIcon(cat.pixelIcon, size: 24, color: Color.accentPrimary)
                    Text(cat.label).typography(.micro).foregroundStyle(Color.textSecondary)
                }
                .frame(maxWidth: .infinity).padding(8)
                .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 8))
            }
        }
        .padding(.horizontal, 32)
    }

    // MARK: - 2. Peek (2s 전체 뒤집힘)

    private var peekView: some View {
        VStack(spacing: 16) {
            hud
            Text("외우세요!").typography(.heading).foregroundStyle(Color.accentPrimary)
            boardGrid(allFaceUp: true)
            Spacer()
        }
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                phase = .playing
            }
        }
    }

    // MARK: - 3. Playing

    private var playingView: some View {
        VStack(spacing: 16) {
            hud
            boardGrid(allFaceUp: false)
            Spacer()
        }
    }

    private func boardGrid(allFaceUp: Bool) -> some View {
        let cols = Self.rounds[roundIdx].cols
        return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: cols), spacing: 6) {
            ForEach(Array(board.enumerated()), id: \.offset) { idx, tile in
                tileCell(idx: idx, tile: tile, forceFaceUp: allFaceUp)
            }
        }
        .padding(.horizontal, 16)
    }

    private func tileCell(idx: Int, tile: MGTile, forceFaceUp: Bool) -> some View {
        let faceUp = forceFaceUp || flipped.contains(idx) || matched.contains(idx)
        return Button { tap(idx) } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(tileBackground(tile, faceUp: faceUp, matched: matched.contains(idx)))
                if faceUp {
                    VStack(spacing: 2) {
                        PixelIcon(tile.icon, size: 18, color: tileForeground(tile))
                        if tile.kind != .challenge {
                            Text(tile.kindLabel)
                                .font(.system(size: 7, weight: .bold))
                                .foregroundStyle(tileForeground(tile))
                        }
                    }
                }
            }
            .aspectRatio(1, contentMode: .fit)
            .modifier(CurseBreath(active: tile.kind == .curse && faceUp))
        }
        .buttonStyle(.plain)
        .disabled(faceUp || locked || phase != .playing)
    }

    private func tileBackground(_ tile: MGTile, faceUp: Bool, matched: Bool) -> Color {
        if matched {
            switch tile.kind {
            case .challenge: return Color.accentPrimary.opacity(0.3)
            case .skill:     return Color.colorSkill.opacity(0.3)
            case .curse:     return Color.colorCurse.opacity(0.3)
            }
        }
        return faceUp ? Color.bgElevated : Color.bgSurface
    }

    private func tileForeground(_ tile: MGTile) -> Color {
        switch tile.kind {
        case .challenge: return Color.accentPrimary
        case .skill:     return Color.colorSkill
        case .curse:     return Color.colorCurse
        }
    }

    private func tap(_ idx: Int) {
        guard !locked, !flipped.contains(idx), !matched.contains(idx) else { return }
        flipped.append(idx)
        Haptics.play(.selection)
        SoundPlayer.shared.play(.cardFlip)
        guard flipped.count == 2 else { return }
        locked = true
        let (a, b) = (flipped[0], flipped[1])
        if board[a].symbol == board[b].symbol && board[a].kind == board[b].kind {
            matched.insert(a)
            matched.insert(b)
            handleMatch(board[a])
            flipped = []
            locked = false
            checkRoundComplete()
        } else {
            // 미스매치 — 하트 -1
            hearts -= 1
            Haptics.play(.warning)
            if hearts <= 0 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                    lastResult = .failed
                    phase = .roundResult
                    locked = false
                }
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
                    flipped = []
                    locked = false
                }
            }
        }
    }

    private func handleMatch(_ tile: MGTile) {
        switch tile.kind {
        case .challenge:
            roundXp += 30
            // 실제 컬렉션 카드라면 결과 수령 시 카드 언락/중복 XP 보상으로 연결한다.
            if let cardId = tile.cardId {
                matchedCardIds.insert(cardId)
            }
            showToast("+30 XP")
            SoundPlayer.shared.play(.matchPair)
        case .skill:
            hearts = min(3, hearts + 1)
            showToast(AppConfig.loc("스킬! 하트 +1"))
            SoundPlayer.shared.play(.complete)
        case .curse:
            hearts = max(0, hearts - 1)
            showToast(AppConfig.loc("저주! 하트 -1"))
            SoundPlayer.shared.play(.curseTrigger)
            Haptics.play(.warning)
        }
    }

    private func showToast(_ msg: String) {
        withAnimation { toastMessage = msg }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            withAnimation { toastMessage = nil }
        }
    }

    private func checkRoundComplete() {
        if matched.count == board.count {
            lastResult = .success
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                phase = .roundResult
            }
        }
    }

    // MARK: - 4. Round Result

    private var roundResultView: some View {
        VStack(spacing: 16) {
            Spacer()
            PixelIcon(lastResult == .success ? .trophy : .warningDiamond,
                      size: 48, color: lastResult == .success ? Color.accentPrimary : Color.colorError)
            Text(lastResult == .success ? AppConfig.loc("라운드 \(roundIdx + 1) 클리어!") : AppConfig.loc("라운드 실패"))
                .typography(.title).foregroundStyle(Color.textPrimary)
            Text("XP +\(roundXp) · 하트 \(hearts)")
                .typography(.caption).foregroundStyle(Color.textSecondary)
            Spacer()
            Button {
                totalXp += roundXp
                roundXp = 0
                if lastResult == .success && roundIdx < 2 {
                    roundIdx += 1
                    startRound()
                } else {
                    phase = .runResult
                }
            } label: {
                Text(lastResult == .success && roundIdx < 2 ? AppConfig.loc("다음 라운드") : AppConfig.loc("결과 보기"))
                    .typography(.body).foregroundStyle(Color.bgPrimary)
                    .frame(maxWidth: .infinity).frame(height: 52)
                    .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 32)
            .padding(.bottom, 24)
        }
    }

    // MARK: - 5. Run Result

    private var runResultView: some View {
        VStack(spacing: 20) {
            Spacer()
            PixelIcon(roundIdx >= 2 && lastResult == .success ? .trophy : .star,
                      size: 56, color: Color.accentPrimary)
            Text(roundIdx >= 2 && lastResult == .success ? AppConfig.loc("전체 클리어!") : AppConfig.loc("수고하셨어요"))
                .typography(.title).foregroundStyle(Color.textPrimary)
            VStack(spacing: 6) {
                Text("도달: 라운드 \(roundIdx + 1) / 3")
                    .typography(.body).foregroundStyle(Color.textSecondary)
                Text("총 XP: \(totalXp)")
                    .typography(.heading).foregroundStyle(Color.accentPrimary).monospacedDigit()
            }
            // 이번 런에 매치된 컬렉션 카드 보상을 카드 한 장당 작은 아이콘 + 제목으로 표시.
            matchedCardsSection
            Spacer()
            Button {
                if totalXp > 0 || !matchedCardIds.isEmpty {
                    store.awardMinigameWin(matchedCardIds: matchedCardIds, totalXp: totalXp)
                }
                dismiss()
            } label: {
                Text("받기")
                    .typography(.body).foregroundStyle(Color.bgPrimary)
                    .frame(maxWidth: .infinity).frame(height: 52)
                    .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 32).padding(.bottom, 24)
        }
        .onAppear {
            Haptics.play(.celebration)
            SoundPlayer.shared.play(.fullClear)
        }
    }

    /// 이번 런에 매치된 콜렉션 카드 리스트 (P0-3 결과 화면 보강 섹션).
    @ViewBuilder
    private var matchedCardsSection: some View {
        if matchedCardIds.isEmpty {
            EmptyView()
        } else {
            let lang = store.progress?.language ?? .ko
            let matched = CardCatalog.allCards.filter { matchedCardIds.contains($0.id) }
            VStack(spacing: 6) {
                Text("이번 런에 보강된 카드 \(matched.count)장")
                    .typography(.caption).foregroundStyle(Color.textTertiary)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                    ForEach(matched, id: \.id) { card in
                        HStack(spacing: 4) {
                            PixelIcon(PixelIconName.resolve(card.icon), size: 14,
                                      color: Color.accentPrimary)
                            Text(card.localizedTitle(lang))
                                .typography(.micro)
                                .foregroundStyle(Color.textPrimary)
                                .lineLimit(1)
                        }
                        .padding(.horizontal, 6).padding(.vertical, 4)
                    }
                }
                .padding(.horizontal, 24)
            }
        }
    }

    // MARK: - Round 시작 — board 생성

    private func startRound() {
        let r = Self.rounds[roundIdx]
        let totalCells = r.rows * r.cols
        let curseTiles = r.curses * 2
        let skillTiles = r.skills * 2
        let challengeTiles = totalCells - curseTiles - skillTiles
        var tiles: [MGTile] = []
        let pairCount = challengeTiles / 2     // 한 쌍 = 두 장
        for card in drawChallengePairs(count: pairCount) {
            tiles.append(MGTile(kind: .challenge, symbol: card.id, icon: PixelIconName.resolve(card.icon), cardId: card.id))
            tiles.append(MGTile(kind: .challenge, symbol: card.id, icon: PixelIconName.resolve(card.icon), cardId: card.id))
        }
        // 스킬 — heart + reload
        for j in 0..<r.skills {
            let icon: PixelIconName = j == 0 ? .heart : .sparkle
            tiles.append(MGTile(kind: .skill, symbol: "s\(j)", icon: icon, cardId: nil))
            tiles.append(MGTile(kind: .skill, symbol: "s\(j)", icon: icon, cardId: nil))
        }
        // 저주 — warningDiamond
        for j in 0..<r.curses {
            tiles.append(MGTile(kind: .curse, symbol: "c\(j)", icon: .warningDiamond, cardId: nil))
            tiles.append(MGTile(kind: .curse, symbol: "c\(j)", icon: .warningDiamond, cardId: nil))
        }
        board = Array(tiles.prefix(totalCells)).shuffled()
        flipped = []
        matched = []
        phase = .categoryFlash
        lastResult = .pending
    }

    private func drawChallengePairs(count: Int) -> [ChallengeCard] {
        let unlockedIds = Set(store.progress?.unlockedCardIds ?? [])
        let unlocked = CardCatalog.allCards.filter { unlockedIds.contains($0.id) }
        let locked = CardCatalog.allCards.filter { !unlockedIds.contains($0.id) }
        if unlocked.count >= count {
            return weightedSample(unlocked, count: count)
        }
        return unlocked.shuffled() + weightedSample(locked, count: count - unlocked.count)
    }

    private func weightedSample(_ pool: [ChallengeCard], count: Int) -> [ChallengeCard] {
        var available = pool
        var picked: [ChallengeCard] = []
        let target = min(count, available.count)
        for _ in 0..<target {
            let weights = available.map { rarityWeight($0.rarity) }
            let total = weights.reduce(0, +)
            var roll = Int.random(in: 0..<max(total, 1))
            var index = 0
            for i in available.indices {
                roll -= weights[i]
                if roll < 0 {
                    index = i
                    break
                }
            }
            picked.append(available.remove(at: index))
        }
        return picked
    }

    private func rarityWeight(_ rarity: Rarity) -> Int {
        switch rarity {
        case .normal: return 18
        case .rare: return 5
        case .unique: return 2
        case .legend: return 1
        }
    }
}

// MARK: - Tile

struct MGTile: Identifiable {
    let id = UUID()
    let kind: Kind
    let symbol: String
    let icon: PixelIconName
    /// P0-3 — challenge 타일이 가리키는 실제 콜렉션 카드 ID. 사용자 콜렉션과
    /// 미니게임이 묶이도록 unlockedCardIds 풀에서 페어를 생성한다. skill/curse
    /// 는 카드와 무관 → nil.
    let cardId: String?

    enum Kind { case challenge, skill, curse }

    var kindLabel: String {
        switch kind {
        case .challenge: return "?"
        case .skill:     return "S"
        case .curse:     return "C"
        }
    }
}

// MARK: - 저주 호흡 모디파이어

private struct CurseBreath: ViewModifier {
    let active: Bool
    @State private var phase: Double = 0

    func body(content: Content) -> some View {
        content
            .opacity(active ? 0.85 + 0.15 * sin(phase * .pi * 2) : 1)
            .onReceive(Timer.publish(every: 1.0/30, on: .main, in: .common).autoconnect()) { _ in
                if active { phase = (phase + 1.0/30 / 2.4).truncatingRemainder(dividingBy: 1.0) }
            }
    }
}
