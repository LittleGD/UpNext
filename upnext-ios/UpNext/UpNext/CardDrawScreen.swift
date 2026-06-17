//
//  CardDrawScreen.swift
//  UpNext — 카드 드로우/선택 화면 (R4 — CardDrawScreen 모션·러리티 충실 회복).
//
//  웹 src/components/daily/CardDrawScreen.tsx (1193줄) 충실 포팅.
//  Phase 4 의 "2열 그리드 + 탭 토글" condensed 포팅을 폐기하고 웹의 정체성 인터랙션 복원:
//
//   1. 덱 홀드 (DeckHoldDraw)  — 덱 5층 스택을 0.8s 길게 눌러 뽑기.
//        chargeUp 사운드 + 진행도 따라 흔들림/리프트, 완료 시 6×cardFlip 80ms 스태거.
//        웹 startHold/cancelHold (L:152-199) + 덱 스택 (L:451-561) 동치.
//   2. 부채꼴 선택 (CardSelectScreen) — 겹쳐진 가로 핸드. 탭→3D 프리뷰, 스와이프업→선택.
//        HandCard 등장: spring(response:0.36, dampingFraction:0.43)[=springBouncy] delay i*0.08
//        (웹 L:1060-1067). 스와이프 임계 translation.height < -100 또는 빠른 위로 (웹 L:1052).
//        프리뷰 오버레이: bg-black/0.7 + blur + RarityBackdrop + Card3DView, exit up/down (웹 L:856-913).
//   3. 리뷰 캐러셀 (ReviewCarousel) — 선택 full 시 가로 스냅 캐러셀 + 확정 (웹 L:635-752).
//        카드 등장: opacity+y30+scale0.96 stagger 0.09 (웹 L:668-680).
//
//  ⚠️ 리텐션/듀오/주간리포트는 iOS 전용 (웹 미존재) — 이 화면에 포함하지 않고
//  DailyHomeView 가 덱 상태/보드 상태에서만 보존. 선택·리뷰는 웹처럼 풀블리드 포커스.
//

import SwiftUI
import Combine

// MARK: - 등급 외곽 글로우 (웹 RarityTexture.tsx rarityGlow)

extension View {
    /// 웹 rarityGlow(): legend `0 0 24px {c}12 + 0 0 2px {c}18`, unique `0 0 16px {c}0c + 0 0 1px {c}14`,
    /// rare `0 0 12px {c}08`. SwiftUI shadow radius ≈ blur_px/2. alpha = hex/255.
    @ViewBuilder func rarityGlow(_ rarity: Rarity) -> some View {
        switch rarity {
        case .legend:
            self.shadow(color: rarity.color.opacity(0.094), radius: 12)
                .shadow(color: rarity.color.opacity(0.071), radius: 1)
        case .unique:
            self.shadow(color: rarity.color.opacity(0.078), radius: 8)
                .shadow(color: rarity.color.opacity(0.047), radius: 0.5)
        case .rare:
            self.shadow(color: rarity.color.opacity(0.031), radius: 6)
        case .normal:
            self
        }
    }
}

private extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}

// ════════════════════════════════════════════════════════════════════════════
// MARK: - 1. 덱 홀드 드로우 (웹 state 1, L:219-624)
// ════════════════════════════════════════════════════════════════════════════

/// 덱을 0.8초 길게 눌러 카드를 뽑는다. DailyHomeView 드로우 상태에서 리텐션 스택 아래에 배치.
struct DeckHoldDraw: View {
    @EnvironmentObject private var store: GameStore
    let heading: String

    @State private var isHolding = false
    @State private var holdProgress: Double = 0
    @State private var holdStart = Date()
    @State private var didDraw = false
    @State private var shakeX: CGFloat = 0

    private let holdDuration: Double = 0.8   // 웹 HOLD_DURATION 800ms
    // 리뷰 #3 — 홀드 중에만 도는 on-demand 타이머 (이전: 60fps 상시 발화 + idle no-op).
    @State private var holdTimer: AnyCancellable?

    var body: some View {
        VStack(spacing: 36) {
            // 안내 텍스트 (웹 L:225-244)
            VStack(spacing: 8) {
                Text(isHolding ? "뽑는 중…" : heading)
                    .typography(.title)
                    .foregroundStyle(Color.textPrimary)
                    .scaleEffect(isHolding ? 1.03 : 1)
                    .animation(.spring(response: 0.4, dampingFraction: 0.7), value: isHolding)
                Text(isHolding ? "그대로 유지하세요" : "덱을 길게 눌러\n카드 6장을 펼쳐요")
                    .typography(.caption)
                    .foregroundStyle(Color.textSecondary)
                    .multilineTextAlignment(.center)
            }

            // 덱 영역 — 빛줄기 atmosphere + 부유 모트 + ambient glow + 덱 스택
            ZStack {
                DeckAtmosphere()
                DeckMotes()
                ambientGlow
                DeckStack(isHolding: isHolding, holdProgress: holdProgress)
                    .offset(x: shakeX)
            }
            .frame(width: 280, height: 320)
            .contentShape(Rectangle())
            .onLongPressGesture(minimumDuration: 10, maximumDistance: 60) {
                // perform — 10s 라 일반 홀드 내 발화 안 함 (타이머가 권위).
            } onPressingChanged: { pressing in
                if pressing { startHold() } else { cancelHold() }
            }

            // 진행 도트 5개 (웹 L:603-621)
            HStack(spacing: 6) {
                ForEach(Array([0.2, 0.4, 0.6, 0.8, 1.0].enumerated()), id: \.offset) { _, threshold in
                    Circle()
                        .fill(holdProgress >= threshold ? Color.accentPrimary : Color.white.opacity(0.1))
                        .frame(width: 6, height: 6)
                        .scaleEffect(holdProgress >= threshold ? 1.3 : 1)
                        .animation(.easeOut(duration: 0.15), value: holdProgress)
                }
            }
            .opacity(isHolding ? 1 : 0)
            .animation(.easeOut(duration: 0.2), value: isHolding)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .onDisappear {
            holdTimer?.cancel(); holdTimer = nil
            isHolding = false; holdProgress = 0; didDraw = false; shakeX = 0
        }
    }

    // 덱 뒤 ambient radial glow — 홀드 중 성장 (웹 L:378-395)
    private var ambientGlow: some View {
        Circle()
            .fill(
                RadialGradient(
                    colors: [Color.accentPrimary.opacity(0.15), .clear],
                    center: .center, startRadius: 0, endRadius: 140)
            )
            .frame(width: 280, height: 280)
            .scaleEffect(isHolding ? 0.8 + holdProgress * 1.2 : 1)
            .opacity(isHolding ? holdProgress * 0.6 : 0.12)
            .blur(radius: 30)
            .animation(.easeOut(duration: 0.15), value: holdProgress)
            .allowsHitTesting(false)
    }

    // MARK: 홀드 로직 (웹 startHold/cancelHold/advance, L:152-199)

    private func startHold() {
        guard !isHolding, !didDraw else { return }
        didDraw = false
        isHolding = true
        holdStart = Date()
        holdProgress = 0
        SoundPlayer.shared.play(.chargeUp)
        holdTimer = Timer.publish(every: 0.016, on: .main, in: .common).autoconnect()
            .sink { _ in advanceHold() }
    }

    private func cancelHold() {
        guard !didDraw else { return }
        holdTimer?.cancel(); holdTimer = nil
        isHolding = false
        holdProgress = 0
        shakeX = 0
    }

    private func advanceHold() {
        guard isHolding, !didDraw else { return }
        let elapsed = Date().timeIntervalSince(holdStart)
        holdProgress = min(elapsed / holdDuration, 1)
        // 흔들림 — 진폭이 진행도 따라 성장 (웹 shakeAmp = holdProgress*5, L:220).
        let amp = holdProgress * 5
        shakeX = CGFloat(sin(elapsed * 38) * amp)
        if holdProgress >= 1 {
            didDraw = true
            isHolding = false
            shakeX = 0
            holdTimer?.cancel(); holdTimer = nil
            store.drawPhaseCards()
            // 6장 cardFlip 80ms 스태거 (웹 L:179-181).
            for i in 0..<6 {
                DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.08) {
                    SoundPlayer.shared.play(.cardFlip)
                }
            }
        }
    }
}

/// 덱 카드 5층 스택 (웹 L:451-561). 비홀드 = 부채 호흡, 홀드 = 리프트+벌어짐+회전+스케일.
private struct DeckStack: View {
    let isHolding: Bool
    let holdProgress: Double

    var body: some View {
        ZStack {
            ForEach([4, 3, 2, 1, 0], id: \.self) { layer in
                cardBack(layer: layer)
                    .frame(width: 150, height: 210)
                    .offset(
                        x: isHolding
                            ? CGFloat(layer - 2) * CGFloat(holdProgress) * 0.5
                            : CGFloat(layer - 2) * 1.5,
                        y: isHolding
                            ? CGFloat(-layer) * 7 - CGFloat(holdProgress) * 10
                            : CGFloat(-layer) * 5)
                    .rotationEffect(.degrees(
                        isHolding ? Double(layer - 2) * holdProgress * 4 : Double(layer - 2) * 1.5))
                    .scaleEffect(isHolding ? 1 + holdProgress * 0.04 : 1)
                    .zIndex(Double(layer))
                    .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isHolding)
            }
        }
    }

    // 카드 뒷면 — 다이아 격자/모서리 악센트/중앙 엠블럼 (웹 L:479-558 핵심 요소).
    private func cardBack(layer: Int) -> some View {
        let topLayer = layer == 0
        let base = (11.0 + Double(layer) * 1.2) / 100.0   // hsl(0,0%,L%)
        return ZStack {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(white: base))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(Color.white.opacity(topLayer ? (isHolding ? 0.06 + holdProgress * 0.08 : 0.06) : 0.03),
                                      lineWidth: 1))
            // 안쪽 보더 인셋 (웹 L:500-506)
            RoundedRectangle(cornerRadius: 6)
                .strokeBorder(Color.accentPrimary.opacity(topLayer ? 0.08 : 0.03), lineWidth: 1)
                .padding(topLayer ? 5 : 4)
            // 중앙 엠블럼 (웹 L:533-557)
            if topLayer {
                VStack(spacing: 4) {
                    PixelIcon(.card, size: 36, color: Color.accentPrimary)
                        .scaleEffect(isHolding ? 1 + holdProgress * 0.1 : 1)
                        .brightness(isHolding ? holdProgress * 0.4 : 0)
                    Rectangle()
                        .fill(LinearGradient(
                            colors: [.clear, Color.accentPrimary.opacity(0.2), .clear],
                            startPoint: .leading, endPoint: .trailing))
                        .frame(width: 20, height: 1)
                }
            } else {
                PixelIcon(.card, size: 28, color: Color.accentPrimary)
                    .opacity(0.06)
            }
        }
        .shadow(color: isHolding ? Color.accentPrimary.opacity(holdProgress * 0.3) : .black.opacity(0.25),
                radius: isHolding ? 6 + holdProgress * 12 : CGFloat(3 + layer * 2),
                y: CGFloat(2 + layer))
    }
}

/// 성스러운 빛줄기 — 덱 뒤로 바닥에서 솟는 6줄 + 바닥 수렴 글로우 (웹 L:246-362).
/// 웹은 viewport fixed inset-0 — iOS 는 리텐션 스택 보존 위해 덱 zone(280×320)에 스코프.
private struct DeckAtmosphere: View {
    // 웹 색: accent rgba(205,245,100), beige rgba(255,245,220), white, cyan rgba(155,240,225),
    //        beige2 rgba(245,230,190). 각 줄의 base alpha·blur·rotate·opacity 펄스·duration·delay 동치.
    private let beige  = Color(red: 1.0, green: 0.96, blue: 0.86)
    private let white  = Color.white
    private let cyan   = Color(red: 0.61, green: 0.94, blue: 0.88)
    private let beige2 = Color(red: 0.96, green: 0.90, blue: 0.74)
    // 리뷰 #6 — reduce-motion 시 빛줄기(연속 펄스) 숨김. 웹도 reducedMotion 시 display:none.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack(alignment: .bottom) {
            // 바닥 수렴 글로우 (웹 L:351-362) — 정적, 항상 표시.
            Ellipse()
                .fill(RadialGradient(
                    colors: [beige.opacity(0.15), Color.accentPrimary.opacity(0.08), .clear],
                    center: .center, startRadius: 0, endRadius: 175))
                .frame(width: 350, height: 100)
                .blur(radius: 20)
                .offset(y: 20)
            // 6줄 (웹 L:248-349) — reduce-motion 아닐 때만.
            if !reduceMotion {
                LightBeam(dx: -60, width: 80, height: 190, color: Color.accentPrimary.opacity(0.22), blur: 12, rotate: -4, pulse: 0.5...0.8, dur: 5,   delay: 0)
                LightBeam(dx: -30, width: 70, height: 184, color: beige.opacity(0.20),               blur: 14, rotate: 1,  pulse: 0.4...0.7, dur: 6,   delay: 0.8)
                LightBeam(dx: 10,  width: 60, height: 174, color: white.opacity(0.18),               blur: 14, rotate: 5,  pulse: 0.35...0.65, dur: 6.5, delay: 1.5)
                LightBeam(dx: 55,  width: 45, height: 152, color: cyan.opacity(0.15),                blur: 10, rotate: 8,  pulse: 0.3...0.5, dur: 7.5, delay: 2.5)
                LightBeam(dx: -110, width: 55, height: 142, color: beige2.opacity(0.18),             blur: 10, rotate: -8, pulse: 0.25...0.5, dur: 7,   delay: 3.5)
                LightBeam(dx: 95,  width: 30, height: 127, color: Color.accentPrimary.opacity(0.12), blur: 8,  rotate: 11, pulse: 0.2...0.4, dur: 8,   delay: 4.5)
            }
        }
        .frame(width: 280, height: 320, alignment: .bottom)
        .allowsHitTesting(false)
    }
}

/// 부유 모트 — 덱 주위를 도는 작은 입자 8개 (웹 L:398-439 idle 궤도).
/// 웹은 hold 시 중앙 수렴 — iOS 는 idle 궤도만 (대부분의 시간 상태). accent/cyan/white.
private struct DeckMotes: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let cyan = Color(red: 0.61, green: 0.94, blue: 0.88)
    var body: some View {
        if reduceMotion {
            EmptyView()   // 웹도 reducedMotion 시 모트 숨김
        } else {
            motes
        }
    }
    private var motes: some View {
        TimelineView(.animation) { tl in
            let t = tl.date.timeIntervalSinceReferenceDate
            ZStack {
                ForEach(0..<8, id: \.self) { i in
                    let base = Double(i) / 8 * 2 * .pi
                    let r = 50 + Double(i % 3) * 20
                    let speed = 0.3 + Double(i % 3) * 0.1
                    let angle = base + t * speed
                    let color: Color = i % 3 == 0 ? Color.accentPrimary : i % 3 == 1 ? cyan : .white
                    Circle()
                        .fill(color)
                        .frame(width: 3, height: 3)
                        .blur(radius: 0.5)
                        .opacity(0.18 + sin(t * 1.5 + base) * 0.1)
                        .offset(x: cos(angle) * r, y: sin(angle) * r * 0.8)
                }
            }
        }
        .allowsHitTesting(false)
    }
}

/// 빛줄기 1줄 — 바닥 기준 위로 솟는 블러 그라디언트, opacity 펄스 (autoreverses repeatForever).
private struct LightBeam: View {
    let dx: CGFloat
    let width: CGFloat
    let height: CGFloat
    let color: Color
    let blur: CGFloat
    let rotate: Double
    let pulse: ClosedRange<Double>
    let dur: Double
    let delay: Double
    @State private var on = false

    var body: some View {
        Rectangle()
            .fill(LinearGradient(colors: [color, color.opacity(0)], startPoint: .bottom, endPoint: .top))
            .frame(width: width, height: height)
            .blur(radius: blur)
            .rotationEffect(.degrees(rotate), anchor: .bottom)
            .offset(x: dx)
            .opacity(on ? pulse.upperBound : pulse.lowerBound)
            .onAppear {
                withAnimation(.easeInOut(duration: dur).repeatForever(autoreverses: true).delay(delay)) {
                    on = true
                }
            }
    }
}

// ════════════════════════════════════════════════════════════════════════════
// MARK: - 2 & 3. 부채꼴 선택 + 리뷰 (웹 state 3 & 2, L:635-1018)
// ════════════════════════════════════════════════════════════════════════════

/// 드로우 완료 후 카드 선택. 풀블리드 (웹 fixed inset-0). 선택 full 시 리뷰 캐러셀로 전환.
struct CardSelectScreen: View {
    @EnvironmentObject private var store: GameStore
    let phase: ChallengePhase
    let drawn: [ChallengeCard]
    let selected: [ChallengeCard]
    let maxCards: Int
    let penaltyCardId: String?
    let hasPenalty: Bool
    let rerollUsed: Bool

    @State private var previewId: String?
    @State private var previewExitDir: ExitDir?
    @State private var previewExiting = false
    @State private var showRerollConfirm = false
    // 리뷰 #7 — 확정 320ms 타이머 무효화 토큰. 리롤/취소가 증가시켜 in-flight 확정을 폐기.
    @State private var actionToken = 0

    enum ExitDir { case up, down }
    private let previewExitMs: Double = 0.32   // 웹 PREVIEW_EXIT_MS 320ms

    private var selectedCount: Int { selected.count }
    private var isSelectionFull: Bool { selectedCount >= maxCards }
    private var unselected: [ChallengeCard] {
        let ids = Set(selected.map(\.id))
        return drawn.filter { !ids.contains($0.id) }
    }
    private var previewCard: ChallengeCard? {
        guard let id = previewId else { return nil }
        return unselected.first { $0.id == id }
    }

    var body: some View {
        ZStack {
            Color.bgPrimary.ignoresSafeArea()

            if isSelectionFull {
                ReviewCarousel(
                    selected: selected,
                    penaltyCardId: penaltyCardId,
                    onDeselect: { id in
                        SoundPlayer.shared.play(.cancel)
                        store.deselectPhaseCard(id)
                    },
                    onConfirm: {
                        SoundPlayer.shared.play(.confirm)
                        store.confirmPhaseSelection()
                    })
            } else {
                selectingBody
            }

            if let pc = previewCard {
                CardPreviewOverlay(
                    card: pc,
                    exitDir: previewExitDir,
                    onDismiss: dismissPreview,
                    onConfirm: { handleConfirmCard(pc) })
                .transition(.opacity)
            }

            if showRerollConfirm {
                OverlayContainer(onBackdropTap: {
                    withAnimation(Anim.cardOverlayExit) { showRerollConfirm = false }
                }) {
                    rerollConfirmCard
                }
                .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.22), value: previewId)
        .animation(.easeOut(duration: 0.2), value: showRerollConfirm)
    }

    // MARK: 선택 중 본문 (웹 L:756-1015)

    private var selectingBody: some View {
        VStack(spacing: 0) {
            // 상단 — 선택 카운트 + 미니카드 슬롯 (웹 L:759-781)
            VStack(spacing: 10) {
                Text("\(selectedCount) / \(maxCards) 선택")
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
                HStack(spacing: 12) {
                    ForEach(0..<maxCards, id: \.self) { i in
                        if i < selected.count {
                            let card = selected[i]
                            SelectedMiniCard(
                                card: card,
                                locked: penaltyCardId == card.id,
                                onDeselect: { id in
                                    SoundPlayer.shared.play(.cancel)
                                    store.deselectPhaseCard(id)
                                })
                        } else {
                            PlaceholderSlot()
                        }
                    }
                }
            }
            .padding(.top, 12)

            Spacer(minLength: 0)

            // 중앙 안내 + 리롤 (웹 L:784-851) — 프리뷰 없을 때만
            if previewCard == nil {
                VStack(spacing: 8) {
                    if hasPenalty && phase == .daily {
                        HStack(spacing: 8) {
                            PixelIcon(.lock, size: 14, color: Color(red: 1, green: 0.27, blue: 0.2))
                            Text("패널티 카드는 필수예요")
                                .typography(.caption)
                                .foregroundStyle(Color(red: 1, green: 0.4, blue: 0.36))
                        }
                        .padding(.horizontal, 16).padding(.vertical, 8)
                        .background(Color(red: 1, green: 0.27, blue: 0.2).opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
                    }
                    // 슈퍼 챌린지는 글자별 wiggle (웹 L:805-826), 그 외 정적 heading.
                    if phase == .`super` {
                        WiggleText(text: "실천할 \(maxCards)장을 골라요")
                    } else {
                        Text("실천할 \(maxCards)장을 골라요")
                            .typography(.heading)
                            .foregroundStyle(Color.textPrimary)
                    }
                    Text("카드를 탭하거나 위로 밀어 선택")
                        .typography(.caption)
                        .foregroundStyle(Color.textTertiary)
                    if phase == .daily && !rerollUsed {
                        Button {
                            SoundPlayer.shared.play(.select)
                            showRerollConfirm = true
                        } label: {
                            HStack(spacing: 6) {
                                PixelIcon(.reload, size: 16, color: Color.textTertiary)
                                Text("다시 뽑기").typography(.caption).foregroundStyle(Color.textTertiary)
                            }
                            .padding(.horizontal, 20).padding(.vertical, 10)
                            .background(Color.bgElevated.opacity(0.9), in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 8)
                    }
                }
                .transition(.opacity)
            }

            Spacer(minLength: 0)

            // 하단 — 부채꼴 핸드 (웹 L:977-1015)
            handFan
                .padding(.bottom, 90)
        }
        .padding(.horizontal, 16)
    }

    private var handFan: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(Array(unselected.enumerated()), id: \.element.id) { index, card in
                    HandCard(
                        card: card,
                        index: index,
                        isPreview: previewId == card.id,
                        onTap: { onCardActivate(card) },
                        onSwipeUp: { onCardActivate(card) })
                    .padding(.leading, index == 0 ? 0 : -14)   // 웹 marginLeft 음수 겹침
                    .zIndex(previewId == card.id ? 50 : Double(index))
                }
            }
            .padding(.horizontal, 24)
            .frame(maxWidth: .infinity)
        }
        .frame(height: 250)
    }

    private func onCardActivate(_ card: ChallengeCard) {
        if previewId == card.id {
            handleConfirmCard(card)
        } else {
            handlePreview(card.id)
        }
    }

    // MARK: 프리뷰 흐름 (웹 dismissPreview/handlePreview/handleConfirmCard, L:106-149)

    private func handlePreview(_ cardId: String) {
        guard !isSelectionFull, !previewExiting else { return }
        SoundPlayer.shared.play(.cardPreview)
        previewExitDir = nil
        previewId = cardId
    }

    private func dismissPreview() {
        guard !previewExiting else { return }
        previewExiting = true
        previewExitDir = .down
        DispatchQueue.main.asyncAfter(deadline: .now() + previewExitMs) {
            previewId = nil
            previewExitDir = nil
            previewExiting = false
        }
    }

    private func handleConfirmCard(_ card: ChallengeCard) {
        guard !selected.contains(where: { $0.id == card.id }), !previewExiting else { return }
        previewExiting = true
        SoundPlayer.shared.play(.cardSelect)
        previewExitDir = .up
        let token = actionToken
        DispatchQueue.main.asyncAfter(deadline: .now() + previewExitMs) {
            // 리뷰 #7 — 그 사이 리롤/취소로 무효화됐으면 stale 카드 선택 skip.
            guard token == actionToken else { return }
            store.selectPhaseCard(card)
            previewId = nil
            previewExitDir = nil
            previewExiting = false
        }
    }

    // MARK: 리롤 확인 모달 (웹 L:916-975)

    // 리롤 확인 카드 — backdrop/진입 모션은 OverlayContainer 가 담당 (R6).
    private var rerollConfirmCard: some View {
        VStack(spacing: 16) {
            HStack(spacing: 8) {
                PixelIcon(.reload, size: 24, color: Color.accentPrimary)
                Text("다시 뽑기").typography(.heading).foregroundStyle(Color.textPrimary)
            }
            Text("카드를 다시 뽑으면 현재 6장이 새 카드로 교체돼요.\n다시 뽑기는 하루 한 번만 가능해요.")
                .typography(.body)
                .foregroundStyle(Color.textSecondary)
                .multilineTextAlignment(.center)
            HStack(spacing: 12) {
                Button {
                    SoundPlayer.shared.play(.select)
                    withAnimation(Anim.cardOverlayExit) { showRerollConfirm = false }
                } label: {
                    Text("취소").typography(.body).foregroundStyle(Color.textSecondary)
                        .padding(.horizontal, 24).frame(height: 48)
                        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 10))
                }.buttonStyle(.plain)
                Button {
                    SoundPlayer.shared.play(.packOpen)
                    actionToken += 1   // 리뷰 #7 — in-flight 확정 타이머 무효화
                    previewExiting = false
                    previewExitDir = nil
                    previewId = nil
                    store.rerollCards()
                    withAnimation(Anim.cardOverlayExit) { showRerollConfirm = false }
                    for i in 0..<6 {
                        DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.08) {
                            SoundPlayer.shared.play(.cardFlip)
                        }
                    }
                } label: {
                    Text("다시 뽑기").typography(.body).foregroundStyle(Color.bgPrimary)
                        .padding(.horizontal, 24).frame(height: 48)
                        .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 10))
                }.buttonStyle(.plain)
            }
        }
        .padding(24)
        .frame(maxWidth: 360)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 20))
        .padding(.horizontal, 24)
    }
}

// MARK: - 핸드 카드 (웹 HandCard, L:1022-1102)

/// 겹쳐진 가로 핸드의 카드 한 장. 등장 스태거 + 드래그 스와이프업 + 탭.
private struct HandCard: View {
    let card: ChallengeCard
    let index: Int
    let isPreview: Bool
    let onTap: () -> Void
    let onSwipeUp: () -> Void

    @State private var shown = false
    @State private var dragY: CGFloat = 0

    private let swipeThreshold: CGFloat = -100   // 웹 SWIPE_UP_THRESHOLD

    var body: some View {
        cardFace
            // 등장 (y 200→0, opacity 0→1) + 드래그 + 프리뷰 리프트 합성
            .offset(y: (shown ? 0 : 200) + dragY + (isPreview ? -20 : 0))
            .scaleEffect(isPreview ? 1.05 : 1 + min(max(-dragY, 0), 80) / 80 * 0.02)
            .opacity(isPreview ? 0 : (shown ? 1 : 0))
            .rarityGlow(card.rarity)
            // simultaneousGesture — 가로 ScrollView 스크롤과 공존. 세로 우세 제스처만 카드 추적.
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        // 세로 우세일 때만 카드 추적 (가로는 스크롤에 양보).
                        if abs(value.translation.height) > abs(value.translation.width) {
                            dragY = value.translation.height.clamped(to: -160...20)
                        }
                    }
                    .onEnded { value in
                        let dy = value.translation.height
                        let dx = value.translation.width
                        let predicted = value.predictedEndTranslation.height
                        if abs(dy) < 8 && abs(dx) < 8 {
                            onTap()                    // 탭 (웹 onClick)
                        } else if dy < swipeThreshold || predicted < -300 {
                            onSwipeUp()                // 스와이프업 (웹 L:1052)
                        }
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) { dragY = 0 }
                    })
            .onAppear {
                withAnimation(.spring(response: 0.36, dampingFraction: 0.43).delay(Double(index) * 0.08)) {
                    shown = true
                }
            }
    }

    private var cardFace: some View {
        VStack(spacing: 0) {
            Text(card.rarity.displayName)
                .typography(.micro)
                .foregroundStyle(Color.bgPrimary)
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(card.rarity.color, in: RoundedRectangle(cornerRadius: 4))
                .frame(maxWidth: .infinity, alignment: .leading)
            Spacer(minLength: 0)
            PixelIcon(PixelIconName.resolve(card.icon), size: 30, color: card.rarity.color)
            Spacer(minLength: 0)
            Text(card.title)
                .typography(.caption)
                .foregroundStyle(Color.textTertiary)
                .lineLimit(1)
                .frame(maxWidth: .infinity)
        }
        .padding(10)
        .frame(width: 120, height: 168)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.white.opacity(0.06), lineWidth: 1))
    }
}

// MARK: - 선택된 미니 카드 (웹 SelectedMiniCard, L:1117-1192)

/// 상단 슬롯의 선택 카드. 탭 또는 아래로 스와이프해서 해제. 패널티 카드는 잠금.
private struct SelectedMiniCard: View {
    let card: ChallengeCard
    let locked: Bool
    let onDeselect: (String) -> Void

    @State private var appeared = false
    @State private var dragY: CGFloat = 0

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                RoundedRectangle(cornerRadius: 6).fill(Color.bgElevated)
                if locked {
                    Color(red: 1, green: 0.27, blue: 0.2).opacity(0.06)
                }
                VStack(spacing: 2) {
                    PixelIcon(PixelIconName.resolve(card.icon), size: 20,
                              color: locked ? Color(red: 1, green: 0.27, blue: 0.2) : card.rarity.color)
                    Text(card.title)
                        .typography(.caption)
                        .foregroundStyle(Color.textSecondary)
                        .lineLimit(1)
                        .padding(.horizontal, 2)
                }
            }
            .frame(width: 64, height: 88)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .rarityGlow(locked ? .normal : card.rarity)
            .offset(y: dragY)
            .opacity(locked ? 1 : (1 - min(max(dragY, 0), 60) / 60 * 0.6))
            .scaleEffect(locked ? 1 : (1 - min(max(dragY, 0), 60) / 60 * 0.1))
            // 잠금 카드는 핸들러에서 guard (조건부 .gesture 는 타입 불가).
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { v in
                        guard !locked else { return }
                        dragY = v.translation.height.clamped(to: 0...80)
                    }
                    .onEnded { v in
                        guard !locked else { return }
                        if v.translation.height < 8 {
                            onDeselect(card.id)                 // 탭 해제
                        } else if dragY > 50 || v.predictedEndTranslation.height > 300 {
                            onDeselect(card.id)                 // 아래로 스와이프 해제 (웹 L:1135)
                        }
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) { dragY = 0 }
                    })
            // 해제 버튼 (웹 L:1179-1189) / 잠금 표시
            if locked {
                PixelIcon(.lock, size: 12, color: Color(red: 1, green: 0.27, blue: 0.2))
                    .frame(width: 28, height: 28)
                    .background(Color.bgSurface.opacity(0.5), in: RoundedRectangle(cornerRadius: 4))
            } else {
                Button { onDeselect(card.id) } label: {
                    PixelIcon(.cancel, size: 14, color: Color.textSecondary)
                        .frame(width: 28, height: 28)
                        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 4))
                }.buttonStyle(.plain)
            }
        }
        .scaleEffect(appeared ? 1 : 0.85)
        .opacity(appeared ? 1 : 0)
        .onAppear { withAnimation(.spring(response: 0.28, dampingFraction: 0.67)) { appeared = true } }
    }
}

/// 빈 슬롯 (웹 PlaceholderSlot, L:1105-1113).
private struct PlaceholderSlot: View {
    var body: some View {
        VStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 6)
                .strokeBorder(style: StrokeStyle(lineWidth: 2, dash: [4, 3]))
                .foregroundStyle(Color.white.opacity(0.1))
                .frame(width: 64, height: 88)
                .overlay(PixelIcon(.plus, size: 18, color: Color.textTertiary))
            Color.clear.frame(height: 28)
        }
    }
}

// MARK: - 3D 프리뷰 오버레이 (웹 L:856-913)

/// 카드 탭 시 뜨는 풀스크린 3D 프리뷰. exit 방향: up=선택확정(위로 날아감), down=취소.
private struct CardPreviewOverlay: View {
    let card: ChallengeCard
    let exitDir: CardSelectScreen.ExitDir?
    let onDismiss: () -> Void
    let onConfirm: () -> Void

    @State private var entered = false

    var body: some View {
        GeometryReader { geo in
            ZStack {
                // bg-black/0.7 + backdrop-blur-md (뒤 핸드를 흐리고 어둡게)
                Rectangle().fill(.ultraThinMaterial)
                    .overlay(Color.black.opacity(0.5))
                    .ignoresSafeArea()
                    .onTapGesture { onDismiss() }
                // 등급 backdrop — 카드 뒤
                RarityBackdrop(rarity: card.rarity).ignoresSafeArea()

                VStack(spacing: 16) {
                    Card3DView(card: card)
                        .offset(y: offsetY(geo.size.height))
                        .scaleEffect(scale)
                        .opacity(exitDir == nil ? (entered ? 1 : 0) : 0)
                    Button(action: { if exitDir == nil { onConfirm() } }) {
                        HStack(spacing: 8) {
                            PixelIcon(.arrowUp, size: 16, color: Color.bgPrimary)
                            Text("이 카드 선택").typography(.body).foregroundStyle(Color.bgPrimary)
                        }
                        .padding(.horizontal, 32).frame(height: 48)
                        .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                    .opacity(exitDir == nil && entered ? 1 : 0)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .onAppear {
            withAnimation(.spring(response: 0.32, dampingFraction: 0.78)) { entered = true }
        }
        .animation(.timingCurve(0.32, 0.72, 0, 1, duration: 0.32), value: exitDir)
    }

    // 진입: scale 0.95+y40→1. exit up: -70vh scale0.92 / down: +28vh scale0.88 (웹 L:874-884)
    private func offsetY(_ h: CGFloat) -> CGFloat {
        switch exitDir {
        case .up:   return -h * 0.7
        case .down: return h * 0.28
        case nil:   return entered ? 0 : 40
        }
    }
    private var scale: CGFloat {
        switch exitDir {
        case .up:   return 0.92
        case .down: return 0.88
        case nil:   return entered ? 1 : 0.95
        }
    }
}

// MARK: - 슈퍼 챌린지 글자 wiggle (웹 L:807-825)

/// 글자별로 흔들리는 heading — 슈퍼 챌린지의 긴장감. 웹 per-char y/x/rotate 진동 동치.
/// y±1.5 x±0.8 rotate±2°, 0.5s 주기, 글자마다 stagger (delay i*0.04 ≈ 위상차).
private struct WiggleText: View {
    let text: String
    // 리뷰 #6 — reduce-motion 시 정적 heading (글자 진동 중단).
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if reduceMotion {
            Text(text).typography(.heading).foregroundStyle(Color.textPrimary)
        } else {
            TimelineView(.animation) { tl in
                let t = tl.date.timeIntervalSinceReferenceDate
                HStack(spacing: 0) {
                    ForEach(Array(text.enumerated()), id: \.offset) { i, ch in
                        let p = t * 4 + Double(i) * 0.5   // 글자별 위상차 (웹 delay i*0.04)
                        Text(String(ch))
                            .typography(.heading)
                            .foregroundStyle(Color.textPrimary)
                            .offset(x: sin(p * 1.3) * 0.8, y: sin(p) * 1.5)
                            .rotationEffect(.degrees(sin(p * 1.1) * 2))
                    }
                }
            }
        }
    }
}

// MARK: - 리뷰 캐러셀 (웹 state 2, L:635-752)

/// 선택 full 시 가로 스냅 캐러셀 리뷰 + 확정. 카드 등장 stagger 0.09.
private struct ReviewCarousel: View {
    let selected: [ChallengeCard]
    let penaltyCardId: String?
    let onDeselect: (String) -> Void
    let onConfirm: () -> Void

    @State private var headerShown = false
    @State private var confirmShown = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer().frame(height: 60)
            // 헤더 (웹 L:642-654)
            VStack(spacing: 4) {
                Text("\(selected.count)장 선택 완료")
                    .typography(.heading)
                    .foregroundStyle(Color.textPrimary)
                Text("확정하면 오늘의 보드가 시작돼요")
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
            }
            .opacity(headerShown ? 1 : 0)
            .offset(y: headerShown ? 0 : 12)
            .padding(.top, 8).padding(.bottom, 16)

            // 가로 캐러셀 (iOS 16 호환 — 스냅은 iOS 17 scrollTargetBehavior 라 미적용)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 16) {
                    ForEach(Array(selected.enumerated()), id: \.element.id) { i, card in
                        ReviewCard(
                            card: card,
                            index: i,
                            locked: penaltyCardId == card.id,
                            onDeselect: onDeselect)
                    }
                }
                .padding(.horizontal, 24)
            }

            Spacer(minLength: 0)

            // 확정 버튼 — 마지막 카드 등장 이후 지연 (웹 L:733-749)
            Button(action: onConfirm) {
                Text("확정하기")
                    .typography(.body)
                    .frame(maxWidth: .infinity).frame(height: 52)
                    .foregroundStyle(Color.bgPrimary)
                    .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 24)
            .padding(.bottom, 90)
            .opacity(confirmShown ? 1 : 0)
            .offset(y: confirmShown ? 0 : 12)
        }
        .onAppear {
            withAnimation(.timingCurve(0.23, 1, 0.32, 1, duration: 0.35)) { headerShown = true }
            withAnimation(.timingCurve(0.23, 1, 0.32, 1, duration: 0.3)
                .delay(0.18 + Double(selected.count) * 0.09)) { confirmShown = true }
        }
    }
}

/// 리뷰 캐러셀의 큰 카드 한 장.
private struct ReviewCard: View {
    let card: ChallengeCard
    let index: Int
    let locked: Bool
    let onDeselect: (String) -> Void
    @State private var shown = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(card.rarity.displayName)
                    .typography(.micro).foregroundStyle(Color.bgPrimary)
                    .padding(.horizontal, 8).padding(.vertical, 2)
                    .background(card.rarity.color, in: RoundedRectangle(cornerRadius: 4))
                Spacer()
                Text(card.category.label)
                    .typography(.micro).foregroundStyle(Color.textTertiary)
            }
            Spacer(minLength: 0)
            PixelIcon(PixelIconName.resolve(card.icon), size: 60, color: card.rarity.color)
                .frame(maxWidth: .infinity)
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: 4) {
                Text(card.title).typography(.heading).foregroundStyle(Color.textPrimary).lineLimit(2)
                Text(card.description).typography(.body).foregroundStyle(Color.textSecondary).lineLimit(2)
            }
            if locked {
                HStack(spacing: 6) {
                    PixelIcon(.lock, size: 12, color: Color(red: 1, green: 0.27, blue: 0.2))
                    Text("패널티 — 필수").typography(.micro).foregroundStyle(Color(red: 1, green: 0.4, blue: 0.36))
                }
                .frame(maxWidth: .infinity).frame(height: 44)
                .background(Color(red: 1, green: 0.27, blue: 0.2).opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
            } else {
                Button { onDeselect(card.id) } label: {
                    HStack(spacing: 6) {
                        PixelIcon(.cancel, size: 12, color: Color.textSecondary)
                        Text("선택 해제").typography(.micro).foregroundStyle(Color.textSecondary)
                    }
                    .frame(maxWidth: .infinity).frame(height: 44)
                    .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 8))
                }.buttonStyle(.plain)
            }
        }
        .padding(20)
        .frame(width: 280)
        .frame(maxHeight: .infinity)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 16))
        .rarityGlow(card.rarity)
        .padding(.vertical, 24)
        .opacity(shown ? 1 : 0)
        .offset(y: shown ? 0 : 30)
        .scaleEffect(shown ? 1 : 0.96)
        .onAppear {
            withAnimation(.timingCurve(0.23, 1, 0.32, 1, duration: 0.4).delay(Double(index) * 0.09)) {
                shown = true
            }
        }
    }
}
