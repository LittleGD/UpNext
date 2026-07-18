//
//  MinigameView.swift
//  UpNext — 미니게임: 3-round 로그라이크 메모리 매치 (08-cardmatch-hero 웹 파리티 복원).
//
//  웹 src/components/minigame/* 의 phase machine:
//   1. categoryFlash (카드 카테고리 힌트 2.5s — CATEGORY_FLASH_MS)
//   2. peek          (모든 카드 공개 1.5s — ROUND1_PEEK_MS, wideEye 시 3s)
//   3. playing       (라운드 진행)
//   4. roundResult   (라운드 결과 — count-up)
//   5. rewardDraft   (라운드 사이 3택1 보상 드래프트 — REWARD_POOL tier 가중)
//   6. runResult     (전체 결과 + 매치 카드 보상)
//
//  웹 ROUND_CONFIGS(src/types/minigame.ts:78-82) 1:1:
//   R1 4×4 skill1 curse0 / R2 4×5 skill1 curse1 / R3 6×4 skill2 curse1.
//  전 라운드 chances=4 (하트 4). 미스매치 -1, chancesPlus2 스킬 +2, 0 되면 게임오버.
//
//  타일 종류:
//   - challenge : 같은 카드(카드ID) 두 장 짝 → XP + 컬렉션 카드 언락
//   - skill     : 두 장 짝 → 스킬 효과(chancesPlus2/peek2/mulligan/compass)
//   - curse     : 두 장 짝 → 하트 -1 (warded 보상 시 1회 무효)
//

import SwiftUI
import Combine

struct MinigameView: View {
    @EnvironmentObject private var store: GameStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var phase: Phase = .categoryFlash
    @State private var roundIdx: Int = 0
    /// 남은 기회(하트). 웹 chancesLeft. 전 라운드 4 시작 (ROUND_CONFIGS.chances).
    @State private var hearts: Int = 4
    @State private var totalXp: Int = 0
    @State private var roundXp: Int = 0
    @State private var board: [MGTile] = []
    @State private var flipped: [Int] = []
    @State private var matched: Set<Int> = []
    @State private var locked: Bool = false
    @State private var lastResult: RoundResult = .pending
    @State private var toastMessage: String?
    /// 이번 미니게임 런에서 매치된 카드 ID. 결과 수령 시 GameStore 로 전달해 웹
    /// grantMinigameRewards 처럼 카드 언락/중복 XP 를 반영한다.
    @State private var matchedCardIds: Set<String> = []

    // ── 메타 (rewardDraft / 버프 / 스킬) — 웹 useMinigameStore 상태 ─────────
    /// 수집한 보상 버프. run 스코프는 전 라운드 지속, round 스코프는 픽한 다음 라운드만.
    @State private var buffs: [MGBuff] = []
    /// rewardDraft 3택1 제안.
    @State private var rewardOffer: [MGReward] = []
    /// 스킬 mulligan — 다음 미스매치 1회 하트 무소모.
    @State private var mulliganActive: Bool = false
    /// peek2/compass 로 잠시 전체 공개.
    @State private var revealAll: Bool = false
    /// compass — 뒷면 카테고리 힌트 표시.
    @State private var compassHintActive: Bool = false
    /// chainAwaken — 라운드 연속 매치 카운트 + 소비 여부.
    @State private var comboStreak: Int = 0
    @State private var chainAwakenConsumed: Bool = false
    /// firstHarvest — 라운드 첫 매치 peek2 자동 발동 여부.
    @State private var firstHarvestDone: Bool = false
    /// warded — 다음 저주 1회 무효 (라운드 스코프).
    @State private var wardedReady: Bool = false

    private enum Phase { case categoryFlash, peek, playing, roundResult, rewardDraft, runResult }
    private enum RoundResult { case pending, success, failed }

    /// 웹 ROUND_CONFIGS(minigame.ts:78-82). rows/cols 웹값 그대로 (이전 iOS 는 R2/R3 뒤바뀜).
    private static let rounds: [MGRoundConfig] = [
        MGRoundConfig(rows: 4, cols: 4, skillPairs: 1, cursePairs: 0),  // 웹 R1
        MGRoundConfig(rows: 4, cols: 5, skillPairs: 1, cursePairs: 1),  // 웹 R2
        MGRoundConfig(rows: 6, cols: 4, skillPairs: 2, cursePairs: 1),  // 웹 R3
    ]

    private var round: MGRoundConfig { Self.rounds[roundIdx] }

    // MARK: - Body

    var body: some View {
        ZStack {
            Color.bgPrimary.ignoresSafeArea()
            switch phase {
            case .categoryFlash: categoryFlashView
            case .peek:          peekView
            case .playing:       playingView
            case .roundResult:   roundResultView
            case .rewardDraft:   rewardDraftView
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
                .allowsHitTesting(false)
            }
        }
        .onAppear { if board.isEmpty { startRound() } }
    }

    // MARK: - HUD

    /// 웹 MinigameHUD — 라운드 / 하트(최소4·strike empty) / 버프칩 / 나가기.
    private var hud: some View {
        VStack(spacing: 6) {
            HStack(spacing: 10) {
                // 라운드
                Text(AppConfig.loc("라운드 \(roundIdx + 1) / 3"))
                    .typography(.caption).foregroundStyle(Color.textTertiary)
                Spacer(minLength: 0)
                // 하트 — 웹은 max(4, chancesLeft) 개 그리고 empty 는 opacity0.4 + 사선(색약 대응).
                HStack(spacing: 3) {
                    ForEach(0..<max(4, hearts), id: \.self) { i in
                        heartPip(active: i < hearts)
                    }
                }
                Spacer(minLength: 0)
                // 나가기 44×44 (아이콘 박스 금지 — 원형 배경 없는 X)
                Button {
                    Haptics.play(.selection)
                    finishRun()
                } label: {
                    PixelIcon(.cancel, size: 16, color: Color.textSecondary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text(AppConfig.loc("나가기")))
            }
            // 활성 버프 칩 (아이콘 + 라벨 — 색 단독 의미 금지)
            if !visibleBuffs.isEmpty {
                HStack(spacing: 6) {
                    ForEach(visibleBuffs) { buff in
                        HStack(spacing: 4) {
                            PixelIcon(.sparkle, size: 10, color: Color.accentSecondary)
                            Text(buff.reward.name)
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(Color.accentSecondary)
                        }
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Color.bgSurface, in: Capsule())
                    }
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 4)
    }

    /// 하트 pip — empty 는 opacity0.4 + scale0.88 + 사선 strike (웹 minigame-heart-empty).
    private func heartPip(active: Bool) -> some View {
        ZStack {
            PixelIcon(.heart, size: 16,
                      color: active ? Color.colorHeartActive : Color.colorHeartEmpty)
            if !active {
                // 색약 대응 사선 — 비어있음을 모양으로도 전달.
                Rectangle()
                    .fill(Color.textSecondary)
                    .frame(width: 18, height: 1.5)
                    .rotationEffect(.degrees(-45))
            }
        }
        .frame(width: 16, height: 16)
        .opacity(active ? 1 : 0.4)
        .scaleEffect(active ? 1 : 0.88)
    }

    /// HUD 에 노출할 버프 — run 스코프는 상시, round 스코프는 활성 라운드에만.
    private var visibleBuffs: [MGBuff] {
        buffs.filter { $0.reward.scope == .run || $0.appliesToRound == roundIdx }
    }

    // MARK: - 1. CategoryFlash (2.5s) — 뒷면에 카테고리 힌트 페이드

    private var categoryFlashView: some View {
        VStack(spacing: 14) {
            hud
            Text(AppConfig.loc("카드 카테고리를 기억하세요"))
                .typography(.caption).foregroundStyle(Color.textTertiary)
            boardGrid(revealFace: false, categoryHint: true)
            Spacer(minLength: 0)
        }
        .onAppear {
            after(2.5) { withFlip { phase = .peek } }   // CATEGORY_FLASH_MS
        }
    }

    // MARK: - 2. Peek (1.5s, wideEye 시 3.0s) — 전체 공개

    private var peekView: some View {
        VStack(spacing: 14) {
            hud
            Text(AppConfig.loc("외우세요!")).typography(.heading).foregroundStyle(Color.accentPrimary)
            boardGrid(revealFace: true, categoryHint: false)
            Spacer(minLength: 0)
        }
        .onAppear {
            let peekMs = roundActive(.wideEye) ? 3.0 : 1.5   // ROUND1_PEEK_MS / ROUND_PEEK_MS_EXTENDED
            after(peekMs) { withFlip { phase = .playing } }
        }
    }

    // MARK: - 3. Playing

    private var playingView: some View {
        VStack(spacing: 14) {
            hud
            boardGrid(revealFace: false, categoryHint: compassHintActive)
            Spacer(minLength: 0)
        }
    }

    // MARK: - Board grid

    private func boardGrid(revealFace: Bool, categoryHint: Bool) -> some View {
        let cols = round.cols
        let spacing: CGFloat = 6
        let ts = tileSize(cols: cols, spacing: spacing)
        return LazyVGrid(columns: Array(repeating: GridItem(.fixed(ts), spacing: spacing), count: cols),
                         spacing: spacing) {
            ForEach(Array(board.enumerated()), id: \.element.id) { idx, tile in
                tileCell(idx: idx, tile: tile,
                         forceFaceUp: revealFace || revealAll,
                         categoryHint: categoryHint, size: ts)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 16)
    }

    /// 그리드 폭에서 타일 한 변 크기 — 아이콘/라벨 스케일 기준(웹 sizePx).
    private func tileSize(cols: Int, spacing: CGFloat) -> CGFloat {
        let w = UIScreen.main.bounds.width - 32   // 좌우 16 패딩
        return (w - spacing * CGFloat(cols - 1)) / CGFloat(cols)
    }

    // MARK: - Tile (3D 플립)

    private func tileCell(idx: Int, tile: MGTile, forceFaceUp: Bool,
                          categoryHint: Bool, size: CGFloat) -> some View {
        let faceUp = forceFaceUp || flipped.contains(idx) || matched.contains(idx)
        let isMatched = matched.contains(idx)
        return Button { tap(idx) } label: {
            ZStack {
                // 뒷면 — faceUp 이면 backface 컬링 대체로 opacity 0.
                cardBack(tile, categoryHint: categoryHint, size: size)
                    .opacity(faceUp ? 0 : 1)
                // 앞면 — 미리 180° 뒤집어 둬 컨테이너 회전 후 정방향으로 보이게.
                tileFront(tile, size: size)
                    .opacity(faceUp ? 1 : 0)
                    .rotation3DEffect(.degrees(180), axis: (x: 0, y: 1, z: 0))
            }
            .frame(width: size, height: size)
            // 웹 rotateY 0→180 + perspective 1000 + cubic-bezier(0.23,1,0.32,1) 0.26s.
            .rotation3DEffect(.degrees(faceUp ? 180 : 0), axis: (x: 0, y: 1, z: 0), perspective: 0.5)
            .animation(reduceMotion ? nil : .timingCurve(0.23, 1, 0.32, 1, duration: 0.26), value: faceUp)
            .opacity(isMatched ? 0.55 : 1)   // 웹 matched opacity 0.55
        }
        .buttonStyle(TilePressStyle())        // 웹 whileTap scale 0.97
        .disabled(faceUp || locked || phase != .playing)
    }

    // MARK: - 앞면 (웹 MinigameTile TileFront)

    @ViewBuilder
    private func tileFront(_ tile: MGTile, size: CGFloat) -> some View {
        switch tile.kind {
        case .challenge: challengeFront(tile, size: size)
        case .skill:     skillFront(tile, size: size)
        case .curse:     curseFront(tile, size: size)
        }
    }

    /// 챌린지 앞면 — bgSurface + 2px 레어도 border + 레어도 glow + RarityTexture + 카드명.
    private func challengeFront(_ tile: MGTile, size: CGFloat) -> some View {
        let color = tile.rarity.color
        let labelPx = size * 0.11
        let showLabel = labelPx >= 10   // 웹 10px 하한 — 작으면 아이콘만.
        return ZStack {
            RoundedRectangle(cornerRadius: 12).fill(Color.bgSurface)
            RarityTexture(rarity: tile.rarity, cornerRadius: 12)
            VStack(spacing: 2) {
                PixelIcon(tile.icon, size: max(18, size * 0.38), color: color)
                if showLabel {
                    Text(tile.title)
                        .font(.system(size: max(10, labelPx)))
                        .foregroundStyle(Color.textPrimary)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                        .minimumScaleFactor(0.7)
                }
            }
            .padding(4)
        }
        .clipShape(RoundedRectangle(cornerRadius: 12))
        // 레어도 border 는 정보(등급)를 담는 게임 아트 — 일반 chrome 보더와 다름.
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(color, lineWidth: 2))
        .shadow(color: color.opacity(rarityGlowOpacity(tile.rarity)),
                radius: rarityGlowRadius(tile.rarity))
    }

    /// 스킬 앞면 — color-skill 그라디언트 + 스킬 아이콘.
    private func skillFront(_ tile: MGTile, size: CGFloat) -> some View {
        ZStack {
            LinearGradient(colors: [Color.colorSkill, Color.colorSkillStrong],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            PixelIcon(tile.skillId?.icon ?? .sparkle, size: max(20, size * 0.42), color: Color.bgPrimary)
        }
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.colorSkill, lineWidth: 2))
        .shadow(color: Color.rarityRare.opacity(0.28), radius: 7)
    }

    /// 저주 앞면 — color-curse 그라디언트 + 경고 + breath.
    private func curseFront(_ tile: MGTile, size: CGFloat) -> some View {
        ZStack {
            LinearGradient(colors: [Color.colorCurse, Color.colorCurseStrong],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            PixelIcon(.warningDiamond, size: max(20, size * 0.42), color: Color.textPrimary)
        }
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.colorCurse, lineWidth: 2))
        .shadow(color: Color.rarityUnique.opacity(0.32), radius: 9)
        .modifier(CurseBreath(active: true))   // 웹 minigame-curse-breath 2.4s
    }

    // MARK: - 뒷면 (웹 CardBack)

    private func cardBack(_ tile: MGTile, categoryHint: Bool, size: CGFloat) -> some View {
        // appraisal 보상 활성 시 challenge 뒷면에 레어도 border (구 compass 보상).
        let showRarityBorder = roundActive(.appraisal) && tile.kind == .challenge
        let borderColor = showRarityBorder ? tile.rarity.color : Color.white.opacity(0.08)
        let showHint = categoryHint && tile.kind == .challenge && tile.category != nil
        return ZStack {
            RoundedRectangle(cornerRadius: 12).fill(Color.bgElevated)
            // 45° 반복 픽셀 stripe 패턴.
            CardBackStripe().clipShape(RoundedRectangle(cornerRadius: 12))
            // 중앙 Card 마크 — 힌트/peek 아닐 때만.
            if !showHint && !revealAll {
                PixelIcon(.card, size: max(16, size * 0.4), color: Color.textPrimary)
                    .opacity(0.3)
            }
            // 카테고리 힌트 페이드 (categoryFlash / compass).
            if showHint, let cat = tile.category {
                PixelIcon(cat.pixelIcon, size: max(20, size * 0.5), color: Color.colorSkill)
                    .opacity(0.85)
                    .transition(.opacity)
            }
            // peek(전체 공개) 시 흰 overlay.
            if revealAll {
                RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.3))
            }
        }
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(borderColor, lineWidth: 2))
    }

    // MARK: - Tap / match

    private func tap(_ idx: Int) {
        guard !locked, !flipped.contains(idx), !matched.contains(idx) else { return }
        flipped.append(idx)
        Haptics.play(.selection)
        SoundPlayer.shared.play(.cardFlip)
        guard flipped.count == 2 else { return }
        locked = true
        let (a, b) = (flipped[0], flipped[1])
        if board[a].pairKey == board[b].pairKey && board[a].kind == board[b].kind {
            matched.insert(a); matched.insert(b)
            handleMatch(board[a])
            flipped = []
            locked = false
            checkRoundComplete()
        } else {
            comboStreak = 0
            resolveMismatch()
        }
    }

    private func resolveMismatch() {
        if mulliganActive {
            // 스킬 mulligan — 이번 미스매치 하트 무소모 1회.
            mulliganActive = false
            showToast(AppConfig.loc("멀리건! 기회 보존"))
            after(0.8) { flipped = []; locked = false }   // MISMATCH_REVEAL_MS
            return
        }
        hearts -= 1
        Haptics.play(.warning)
        if hearts <= 0 {
            after(0.6) {
                lastResult = .failed
                withFlip { phase = .roundResult }
                locked = false
            }
        } else {
            after(0.8) { flipped = []; locked = false }   // MISMATCH_REVEAL_MS
        }
    }

    private func handleMatch(_ tile: MGTile) {
        switch tile.kind {
        case .challenge:
            comboStreak += 1
            let base = 30
            let bonus = roundActive(.xpBloom) ? Int(Double(base) * 0.5) : 0   // xpBloom +50%
            roundXp += base + bonus
            if let cardId = tile.cardId { matchedCardIds.insert(cardId) }
            showToast("+\(base + bonus) XP")
            SoundPlayer.shared.play(.matchPair)
            Haptics.play(.medium)   // 웹 matchPair intent = medium.
            triggerFirstHarvest()
            triggerChainAwaken()
        case .skill:
            comboStreak += 1
            if let sk = tile.skillId { applySkill(sk) }
            SoundPlayer.shared.play(.complete)
            Haptics.play(.success)  // 웹 complete intent = success.
            triggerFirstHarvest()
            triggerChainAwaken()
        case .curse:
            comboStreak = 0
            if wardedReady {
                wardedReady = false
                showToast(AppConfig.loc("가호! 저주 무효"))
                SoundPlayer.shared.play(.complete)
            } else {
                hearts = max(0, hearts - 1)
                showToast(AppConfig.loc("저주! 기회 -1"))
                SoundPlayer.shared.play(.curseTrigger)
                Haptics.play(.warning)
            }
        }
    }

    /// 스킬 매치 효과 (웹 SKILL_DEFINITIONS applySkill).
    private func applySkill(_ skill: MGSkillId) {
        switch skill {
        case .chancesPlus2:
            hearts += 2
            showToast(AppConfig.loc("기회 +2"))
        case .peek2:
            revealPeek(2.0)   // PEEK2_MS
            showToast(AppConfig.loc("투시! 전체 공개"))
        case .mulligan:
            mulliganActive = true
            showToast(AppConfig.loc("멀리건 준비"))
        case .compass:
            compassHint(2.5)  // COMPASS_HINT_MS
            showToast(AppConfig.loc("나침반! 카테고리 힌트"))
        }
    }

    /// firstHarvest 보상 — 라운드 첫 매치 시 peek2 자동 발동.
    private func triggerFirstHarvest() {
        guard roundActive(.firstHarvest), !firstHarvestDone else { return }
        firstHarvestDone = true
        revealPeek(2.0)
    }

    /// chainAwaken 보상 — 3연속 매치 시 라운드 1회 +1 기회.
    private func triggerChainAwaken() {
        guard roundActive(.chainAwaken), !chainAwakenConsumed, comboStreak >= 3 else { return }
        chainAwakenConsumed = true
        hearts += 1
        showToast(AppConfig.loc("각성! 기회 +1"))
    }

    private func revealPeek(_ seconds: Double) {
        withAnimation { revealAll = true }
        after(seconds) { withAnimation { revealAll = false } }
    }

    private func compassHint(_ seconds: Double) {
        withAnimation { compassHintActive = true }
        after(seconds) { withAnimation { compassHintActive = false } }
    }

    private func checkRoundComplete() {
        if matched.count == board.count {
            lastResult = .success
            after(0.4) { withFlip { phase = .roundResult } }
        }
    }

    private func showToast(_ msg: String) {
        withAnimation { toastMessage = msg }
        after(1.2) { withAnimation { toastMessage = nil } }
    }

    // MARK: - 4. Round Result (count-up)

    private var roundResultView: some View {
        let matchedPairs = matched.count / 2
        let hasNextRound = lastResult == .success && roundIdx < 2
        return VStack(spacing: 18) {
            Spacer()
            Text(lastResult == .success ? AppConfig.loc("라운드 \(roundIdx + 1) 클리어!") : AppConfig.loc("라운드 실패"))
                .typography(.title).foregroundStyle(Color.textPrimary)
            // 웹 useCountUp — 매치 수 700ms, 남은 기회 500ms 롤링.
            HStack(spacing: 12) {
                statTile(AppConfig.loc("맞춘 짝"), CountUpNumber(target: matchedPairs, durationMs: 700))
                statTile(AppConfig.loc("남은 기회"), CountUpNumber(target: hearts, durationMs: 500))
            }
            .padding(.horizontal, 40)
            Spacer()
            Button {
                totalXp += roundXp
                roundXp = 0
                if hasNextRound {
                    prepareRewardDraft()
                } else {
                    withFlip { phase = .runResult }
                }
            } label: {
                Text(hasNextRound ? AppConfig.loc("계속") : AppConfig.loc("결과 보기"))
                    .typography(.body).foregroundStyle(Color.bgPrimary)
                    .frame(maxWidth: .infinity).frame(height: 52)
                    .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(TilePressStyle())
            .padding(.horizontal, 32)
            .padding(.bottom, 24)
        }
    }

    private func statTile<V: View>(_ label: String, _ value: V) -> some View {
        VStack(spacing: 6) {
            Text(label).typography(.caption).foregroundStyle(Color.textTertiary)
            value.typography(.heading).foregroundStyle(Color.textPrimary).monospacedDigit()
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - 5. Reward Draft (라운드 사이 3택1)

    private func prepareRewardDraft() {
        rewardOffer = MGReward.drawOffer(count: 3)
        withFlip { phase = .rewardDraft }
    }

    private var rewardDraftView: some View {
        VStack(spacing: 18) {
            Spacer()
            Text(AppConfig.loc("보상 선택")).typography(.title).foregroundStyle(Color.textPrimary)
            Text(AppConfig.loc("다음 라운드에 적용할 보상을 하나 고르세요"))
                .typography(.caption).foregroundStyle(Color.textTertiary)
                .multilineTextAlignment(.center)
            VStack(spacing: 12) {
                ForEach(rewardOffer) { reward in
                    rewardCard(reward)
                }
            }
            .padding(.horizontal, 24)
            Spacer()
        }
    }

    private func rewardCard(_ reward: MGReward) -> some View {
        let color = reward.tier.color
        return Button {
            pickReward(reward)
        } label: {
            HStack(spacing: 12) {
                ZStack {
                    RarityTexture(rarity: reward.tier, cornerRadius: 10)
                    PixelIcon(.sparkle, size: 22, color: color)
                }
                .frame(width: 44, height: 44)
                .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(reward.name).typography(.body).foregroundStyle(Color.textPrimary)
                        Text(reward.tier.displayName)
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(color)
                    }
                    Text(reward.desc)
                        .typography(.caption).foregroundStyle(Color.textTertiary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .frame(maxWidth: .infinity)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
            // tier border/glow — 등급 정보 아트 (웹 MinigameRewardDraft 2px + glow).
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(color, lineWidth: 2))
            .shadow(color: color.opacity(rarityGlowOpacity(reward.tier)),
                    radius: rarityGlowRadius(reward.tier))
        }
        .buttonStyle(TilePressStyle())
    }

    private func pickReward(_ reward: MGReward) {
        Haptics.play(.success)
        SoundPlayer.shared.play(.rewardChoose)
        // round 스코프는 바로 다음 라운드(roundIdx+1)에 적용, run 스코프는 전 라운드.
        buffs.append(MGBuff(reward: reward, appliesToRound: roundIdx + 1))
        roundIdx += 1
        startRound()
    }

    // MARK: - 6. Run Result

    private var runResultView: some View {
        VStack(spacing: 20) {
            Spacer()
            PixelIcon(roundIdx >= 2 && lastResult == .success ? .trophy : .star,
                      size: 56, color: Color.accentPrimary)
            Text(roundIdx >= 2 && lastResult == .success ? AppConfig.loc("전체 클리어!") : AppConfig.loc("수고하셨어요"))
                .typography(.title).foregroundStyle(Color.textPrimary)
            VStack(spacing: 6) {
                Text(AppConfig.loc("도달: 라운드 \(roundIdx + 1) / 3"))
                    .typography(.body).foregroundStyle(Color.textSecondary)
                Text(AppConfig.loc("총 XP: \(finalXp)"))
                    .typography(.heading).foregroundStyle(Color.accentPrimary).monospacedDigit()
            }
            matchedCardsSection
            Spacer()
            Button {
                if finalXp > 0 || !matchedCardIds.isEmpty {
                    store.awardMinigameWin(matchedCardIds: matchedCardIds, totalXp: finalXp)
                }
                dismiss()
            } label: {
                Text(AppConfig.loc("받기"))
                    .typography(.body).foregroundStyle(Color.bgPrimary)
                    .frame(maxWidth: .infinity).frame(height: 52)
                    .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(TilePressStyle())
            .padding(.horizontal, 32).padding(.bottom, 24)
        }
        .onAppear {
            Haptics.play(.celebration)
            SoundPlayer.shared.play(.fullClear)
        }
    }

    /// 런 종료 XP — doubleLoot(×2)/duplicateStash(+25%) 보상 반영 (웹 pickRunReward).
    private var finalXp: Int {
        var xp = Double(totalXp)
        if buffs.contains(where: { $0.reward.id == .doubleLoot }) { xp *= 2 }
        if buffs.contains(where: { $0.reward.id == .duplicateStash }) { xp *= 1.25 }
        return Int(xp)
    }

    @ViewBuilder
    private var matchedCardsSection: some View {
        if matchedCardIds.isEmpty {
            EmptyView()
        } else {
            let lang = store.progress?.language ?? .ko
            let cards = CardCatalog.allCards.filter { matchedCardIds.contains($0.id) }
            VStack(spacing: 6) {
                Text(AppConfig.loc("이번 런에 보강된 카드 \(cards.count)장"))
                    .typography(.caption).foregroundStyle(Color.textTertiary)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                    ForEach(cards, id: \.id) { card in
                        HStack(spacing: 4) {
                            PixelIcon(PixelIconName.resolve(card.icon), size: 14, color: Color.accentPrimary)
                            Text(card.localizedTitle(lang))
                                .typography(.micro).foregroundStyle(Color.textPrimary).lineLimit(1)
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
        let r = round
        // 라운드 스코프 상태 리셋.
        mulliganActive = false
        revealAll = false
        compassHintActive = false
        comboStreak = 0
        chainAwakenConsumed = false
        firstHarvestDone = false
        wardedReady = roundActive(.warded)
        // steelNerves 보상 — 이번 라운드 시작 시 +1 기회.
        if roundActive(.steelNerves) { hearts += 1 }

        let totalCells = r.rows * r.cols
        let curseTiles = r.cursePairs * 2
        let skillTiles = r.skillPairs * 2
        let challengeTiles = totalCells - curseTiles - skillTiles
        let pairCount = challengeTiles / 2

        var tiles: [MGTile] = []
        for card in drawChallengePairs(count: pairCount) {
            let icon = PixelIconName.resolve(card.icon)
            let title = card.localizedTitle(store.progress?.language ?? .ko)
            for _ in 0..<2 {
                tiles.append(MGTile(kind: .challenge, pairKey: card.id, rarity: card.rarity,
                                    category: card.category, icon: icon, cardId: card.id, title: title))
            }
        }
        // 스킬 — 라운드 skillPairs 개, 각 페어에 랜덤 스킬 배정 (웹 drawSkillIds).
        let skillIds = MGSkillId.drawIds(count: r.skillPairs)
        for (j, sk) in skillIds.enumerated() {
            for _ in 0..<2 {
                tiles.append(MGTile(kind: .skill, pairKey: "s\(j)", skillId: sk))
            }
        }
        // 저주.
        for j in 0..<r.cursePairs {
            for _ in 0..<2 {
                tiles.append(MGTile(kind: .curse, pairKey: "c\(j)"))
            }
        }
        board = Array(tiles.prefix(totalCells)).shuffled()
        flipped = []
        matched = []
        lastResult = .pending
        withFlip { phase = .categoryFlash }
    }

    private func finishRun() {
        // 나가기 — 지금까지 얻은 보상은 지급 후 종료 (웹 requestExit → 부분 정산).
        if totalXp > 0 || !matchedCardIds.isEmpty {
            store.awardMinigameWin(matchedCardIds: matchedCardIds, totalXp: finalXp)
        }
        dismiss()
    }

    // MARK: - Draw helpers

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
        // rareSurge 보상 — 이번 라운드 레어+ 가중치 상향.
        let surge = roundActive(.rareSurge)
        for _ in 0..<target {
            let weights = available.map { rarityWeight($0.rarity, surge: surge) }
            let total = weights.reduce(0, +)
            var roll = Int.random(in: 0..<max(total, 1))
            var index = 0
            for i in available.indices {
                roll -= weights[i]
                if roll < 0 { index = i; break }
            }
            picked.append(available.remove(at: index))
        }
        return picked
    }

    private func rarityWeight(_ rarity: Rarity, surge: Bool) -> Int {
        switch rarity {
        case .normal: return surge ? 9 : 18
        case .rare:   return surge ? 10 : 5
        case .unique: return surge ? 5 : 2
        case .legend: return surge ? 2 : 1
        }
    }

    // MARK: - Rarity glow (웹 --glow-rarity-*)

    private func rarityGlowRadius(_ r: Rarity) -> CGFloat {
        switch r {
        case .normal: return 0
        case .rare:   return 7    // 웹 14px blur / 2
        case .unique: return 9    // 18px
        case .legend: return 11   // 22px
        }
    }

    private func rarityGlowOpacity(_ r: Rarity) -> Double {
        switch r {
        case .normal: return 0
        case .rare:   return 0.28
        case .unique: return 0.32
        case .legend: return 0.38
        }
    }

    // MARK: - Buff query

    /// 이번 라운드에 해당 보상이 활성인지 — run 스코프는 상시, round 스코프는 픽 라운드.
    private func roundActive(_ id: MGReward.EffectId) -> Bool {
        buffs.contains { $0.reward.id == id &&
            ($0.reward.scope == .run || $0.appliesToRound == roundIdx) }
    }

    // MARK: - 유틸

    private func after(_ seconds: Double, _ work: @escaping () -> Void) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
    }

    /// phase 전환 시 크로스페이드 (플립 연출과 충돌 없게 짧게).
    private func withFlip(_ change: () -> Void) {
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { change() }
    }
}

// MARK: - 라운드 설정 (웹 RoundConfig)

private struct MGRoundConfig {
    let rows: Int
    let cols: Int
    let skillPairs: Int
    let cursePairs: Int
}

// MARK: - Tile

struct MGTile: Identifiable {
    let id = UUID()
    let kind: Kind
    /// 같은 값을 공유하는 두 장이 페어. challenge=card.id, skill/curse=effect key.
    let pairKey: String
    var rarity: Rarity = .normal
    var category: Category? = nil
    var icon: PixelIconName = .card
    var cardId: String? = nil
    var title: String = ""
    var skillId: MGSkillId? = nil

    enum Kind { case challenge, skill, curse }
}

// MARK: - 스킬 (웹 SKILL_DEFINITIONS)

enum MGSkillId: CaseIterable {
    case chancesPlus2, peek2, mulligan, compass

    /// 웹 iconName 1:1 (R6 — Eye/MapPin 픽셀셋 추가로 근접 대체 아이콘 해소).
    var icon: PixelIconName {
        switch self {
        case .chancesPlus2: return .clock    // 웹 Clock
        case .peek2:        return .eye      // 웹 Eye
        case .mulligan:     return .reload   // 웹 Reload
        case .compass:      return .mapPin   // 웹 MapPin
        }
    }

    /// 웹 drawSkillIds — 중복 없이 N개.
    static func drawIds(count: Int) -> [MGSkillId] {
        Array(allCases.shuffled().prefix(count))
    }
}

// MARK: - 보상 (웹 REWARD_POOL / RewardDefinition)

struct MGReward: Identifiable {
    enum EffectId {
        case steelNerves, rareSurge, wideEye, firstHarvest
        case duplicateStash, warded, appraisal, chainAwaken, xpBloom
        case doubleLoot
    }
    enum Scope { case round, run }

    let id: EffectId
    let tier: Rarity        // 웹 tier(rare/unique/legend) — 앱 rarity 재사용.
    let scope: Scope
    let name: String
    let desc: String

    var identifier: EffectId { id }

    /// 웹 REWARD_POOL(data/minigame.ts:79-150) — rare4 / unique5 / legend1.
    /// computed — AppConfig.loc 을 접근 시점 인앱 언어로 재평가 (static let 캐싱 회피).
    static var pool: [MGReward] {
        [
        MGReward(id: .steelNerves, tier: .rare, scope: .round,
                 name: AppConfig.loc("강철 심장"), desc: AppConfig.loc("다음 라운드 기회 +1")),
        MGReward(id: .rareSurge, tier: .rare, scope: .round,
                 name: AppConfig.loc("희귀 서지"), desc: AppConfig.loc("다음 라운드 희귀 카드 등장 확률 상승")),
        MGReward(id: .wideEye, tier: .rare, scope: .round,
                 name: AppConfig.loc("크게 뜬 눈"), desc: AppConfig.loc("다음 라운드 공개 시간 3초로 연장")),
        MGReward(id: .firstHarvest, tier: .rare, scope: .round,
                 name: AppConfig.loc("첫 수확"), desc: AppConfig.loc("라운드 첫 매치 시 투시 자동 발동")),
        MGReward(id: .duplicateStash, tier: .unique, scope: .run,
                 name: AppConfig.loc("복제 창고"), desc: AppConfig.loc("런 종료 보상 +25%")),
        MGReward(id: .warded, tier: .unique, scope: .round,
                 name: AppConfig.loc("가호"), desc: AppConfig.loc("다음 라운드 저주 1회 무효")),
        MGReward(id: .appraisal, tier: .unique, scope: .run,
                 name: AppConfig.loc("감정"), desc: AppConfig.loc("런 내내 뒷면에 희귀도 테두리 표시")),
        MGReward(id: .chainAwaken, tier: .unique, scope: .round,
                 name: AppConfig.loc("연쇄 각성"), desc: AppConfig.loc("3연속 매치 시 기회 +1 (라운드 1회)")),
        MGReward(id: .xpBloom, tier: .unique, scope: .round,
                 name: AppConfig.loc("경험 개화"), desc: AppConfig.loc("다음 라운드 모든 매치 XP +50%")),
        MGReward(id: .doubleLoot, tier: .legend, scope: .run,
                 name: AppConfig.loc("두 배 전리품"), desc: AppConfig.loc("런 종료 보상 2배")),
        ]
    }

    /// tier 가중(rare×3/unique×2/legend×1)으로 중복 없이 N개 (웹 drawRewardOffer).
    static func drawOffer(count: Int) -> [MGReward] {
        var available = pool
        var picked: [MGReward] = []
        for _ in 0..<min(count, available.count) {
            let weights = available.map { tierWeight($0.tier) }
            let total = weights.reduce(0, +)
            var roll = Int.random(in: 0..<max(total, 1))
            var index = 0
            for i in available.indices {
                roll -= weights[i]
                if roll < 0 { index = i; break }
            }
            picked.append(available.remove(at: index))
        }
        return picked
    }

    private static func tierWeight(_ tier: Rarity) -> Int {
        switch tier {
        case .rare: return 3
        case .unique: return 2
        case .legend: return 1
        case .normal: return 0
        }
    }
}

// MARK: - 활성 버프

struct MGBuff: Identifiable {
    let id = UUID()
    let reward: MGReward
    /// round 스코프 보상이 적용될 라운드 인덱스 (run 스코프는 무시).
    let appliesToRound: Int
}

// MARK: - 뒷면 45° 픽셀 stripe (웹 repeating-linear-gradient 45deg)

private struct CardBackStripe: View {
    var body: some View {
        Canvas { ctx, size in
            let step: CGFloat = 6   // 웹 2px on / 4px gap
            let lineW: CGFloat = 2
            var x: CGFloat = -size.height
            while x < size.width + size.height {
                var p = Path()
                p.move(to: CGPoint(x: x, y: 0))
                p.addLine(to: CGPoint(x: x + size.height, y: size.height))
                ctx.stroke(p, with: .color(Color.white.opacity(0.02)), lineWidth: lineW)
                x += step
            }
        }
        .allowsHitTesting(false)
    }
}

// MARK: - 저주 호흡 (웹 minigame-curse-breath 2.4s opacity)

private struct CurseBreath: ViewModifier {
    let active: Bool
    func body(content: Content) -> some View {
        if active {
            content.modifier(_CurseBreathAnim())
        } else {
            content
        }
    }
}

private struct _CurseBreathAnim: ViewModifier {
    @State private var phase: Double = 0
    func body(content: Content) -> some View {
        content
            .opacity(0.85 + 0.15 * sin(phase * .pi * 2))
            .onReceive(Timer.publish(every: 1.0 / 30, on: .main, in: .common).autoconnect()) { _ in
                phase = (phase + (1.0 / 30) / 2.4).truncatingRemainder(dividingBy: 1.0)
            }
    }
}

// MARK: - 타일 press (웹 whileTap scale 0.97)

private struct TilePressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

// MARK: - Count-up 숫자 (웹 useCountUp 0→target)

private struct CountUpNumber: View {
    let target: Int
    let durationMs: Int
    @State private var value = 0

    var body: some View {
        Text("\(value)")
            .onAppear { run() }
    }

    private func run() {
        guard target > 0 else { value = 0; return }
        let steps = target
        let interval = Double(durationMs) / 1000.0 / Double(steps)
        for i in 1...steps {
            DispatchQueue.main.asyncAfter(deadline: .now() + interval * Double(i)) {
                value = i
            }
        }
    }
}
