//
//  CardPackOpenerView.swift
//  UpNext — 카드팩 개봉 화면.
//
//  웹 src/components/cards/CardPackOpener.tsx 시네마틱 전면 회복.
//  기존 "요약 이식"(shake 320ms→flash→3-halo→그리드 페이드)을 폐기하고
//  tier별로 길이·강도가 커지는 2.5초 시네마틱을 복원한다.
//
//  단계(웹 상태머신 L17,L101-173): shaking(fx.shakeMs) → opening(600ms) → revealed → absorbing.
//   - SHAKING : Gift rotate/scale wobble + 뒤 glow 펄스 + 파티클 방출(+legend 배경 펄스)
//   - OPENING : tier색 풀스크린 플래시 + 확장 halo 링(0~3) + Gift 축소 흡입
//   - REVEALED: 카드 아래→위 버스트 스태거(springBouncy 300/15) + 카드 내부 아이콘 pop
//   - ABSORB  : 카드별 개별 비행/스핀 + glow 꼬리 + 파티클 트레일 → 네비 방향 흡수
//
//  tier가 올라갈수록 shakeMs / particleCount / revealStagger / flashIntensity / haloRings 증가
//  (웹 PACK_FX 테이블 L41-58 그대로). reduceMotion 시 REDUCED_FX(L61-64)로 축약.
//
//  파티클/플래시는 뷰 폭발 대신 Canvas+TimelineView(웹 MeteorShower/RarityTexture 패턴 재사용),
//  wobble/absorb 비행은 @State + withAnimation 스텝 체인(앱 타깃 16.2 — KeyframeAnimator는 iOS17)
//  으로 구현해 60fps 유지. LevelUpBurstScreen.runIconShake 관례와 동일.
//

import SwiftUI

struct CardPackOpenerView: View {
    @EnvironmentObject private var store: GameStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let onComplete: () -> Void

    @State private var revealed: Reveal?
    @State private var phase: OpeningPhase = .idle

    // 웹 상태머신과 1:1 (flashing/halo를 opening으로 통합 — 웹은 opening 한 단계에서 flash+halo+box축소).
    private enum OpeningPhase { case idle, shaking, opening, revealed, absorbing }

    private struct Reveal {
        let cards: [ChallengeCard]
        let tier: Rarity
    }

    private var pendingCount: Int {
        (store.progress?.pendingPacks ?? 0) + (store.progress?.pendingBonusCards ?? 0)
    }

    /// 현재 tier + reduceMotion 에 맞는 연출 스펙. 오버레이(플래시/링/펄스)에서 공유.
    private var fx: PackFx {
        guard let tier = revealed?.tier else { return .normal }
        return reduceMotion ? .reduced : PackFx.table(tier)
    }

    var body: some View {
        ZStack {
            Color.bgPrimary.ignoresSafeArea()

            // legend 전용 풀스크린 배경 펄스 — 웹 L384-395 (shaking 동안, reduceMotion 시 생략).
            if phase == .shaking, let tier = revealed?.tier, tier == .legend, !reduceMotion {
                LegendBackgroundPulse(color: tier.color, shakeMs: fx.shakeMs)
                    .allowsHitTesting(false)
            }

            VStack(spacing: 0) {
                Spacer()
                content
                Spacer()
                bottomButton
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 40)
            .padding(.top, 32)
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            // 확장 halo 링 — 웹 L198-216 (opening 동안, tier별 0~3개).
            if phase == .opening, let tier = revealed?.tier, fx.haloRings > 0 {
                ZStack {
                    ForEach(Array(0..<fx.haloRings), id: \.self) { i in
                        HaloRing(index: i, color: tier.color)
                    }
                }
                .allowsHitTesting(false)
            }

            // tier색 풀스크린 플래시 — 웹 L180-195 (opening, flashIntensity>0 즉 rare↑, normal은 스킵).
            if phase == .opening, let tier = revealed?.tier, fx.flashIntensity > 0 {
                PackFlashOverlay(color: tier.color, intensity: fx.flashIntensity)
                    .allowsHitTesting(false)
            }
        }
    }

    // MARK: - 단계별 중앙 콘텐츠

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .idle:
            idlePrompt
        case .shaking:
            if let tier = revealed?.tier { shakingScene(tier: tier) }
        case .opening:
            OpeningGift(color: revealed?.tier.color ?? .accentPrimary)
        case .revealed, .absorbing:
            if let r = revealed { revealView(r) }
        }
    }

    /// 개봉 전 안내(iOS 인트로 — 웹은 자동 시작이지만 iOS는 팩 개수/버튼 진입 유지).
    private var idlePrompt: some View {
        VStack(spacing: 12) {
            PixelIcon(.gift, size: 56, color: .accentPrimary)
            Text("카드팩 \(pendingCount)개")
                .typography(.title)
                .foregroundStyle(Color.textPrimary)
            Text(AppConfig.loc("레벨업·챌린지 보상으로 받은 카드팩이에요.\n열어서 새 카드를 덱에 추가하세요."))
                .typography(.caption)
                .foregroundStyle(Color.textTertiary)
                .multilineTextAlignment(.center)
        }
    }

    /// SHAKING 씬 — wobble Gift + 뒤 glow 펄스 + 방출 파티클.
    private func shakingScene(tier: Rarity) -> some View {
        VStack(spacing: 12) {
            ZStack {
                // 파티클(뒤에서 방출) — 웹 L418-441. 중앙 = Gift 중심.
                if fx.particleCount > 0 {
                    PackBurstParticles(count: fx.particleCount, color: tier.color, big: fx.bigParticles)
                }
                ShakingGift(color: tier.color, fx: fx)
            }
            .frame(width: 200, height: 200)

            Text("카드팩 \(pendingCount)개")
                .typography(.title)
                .foregroundStyle(Color.textPrimary)
            Text(AppConfig.loc("팩이 흔들리는 중…"))
                .typography(.caption)
                .foregroundStyle(Color.textTertiary)
        }
    }

    // MARK: - Reveal 그리드

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
                    ForEach(Array(r.cards.enumerated()), id: \.element.id) { idx, card in
                        RevealCard(
                            card: card,
                            index: idx,
                            staggerSec: fx.revealStagger,
                            absorbing: phase == .absorbing,
                            reduceMotion: reduceMotion
                        )
                    }
                }
                // 흡수 트레일 — 컨테이너 중심에서 방출(웹 L320-350). reduceMotion 시 생략.
                .overlay {
                    if phase == .absorbing && !reduceMotion {
                        AbsorbTrails(cards: r.cards).allowsHitTesting(false)
                    }
                }
            }
        }
    }

    // MARK: - 하단 버튼

    @ViewBuilder private var bottomButton: some View {
        if phase == .revealed || phase == .idle {
            if revealed == nil {
                button(AppConfig.loc("팩 열기")) { startOpen() }
            } else if pendingCount > 0 {
                button(AppConfig.loc("다음 팩 열기 (\(pendingCount))")) { absorbThen { startOpen() } }
            } else {
                button(AppConfig.loc("완료")) { absorbThen(onComplete) }
            }
        } else {
            // 시퀀스 진행 중 — 빈 자리만 유지.
            Color.clear.frame(height: 52)
        }
    }

    // MARK: - 시퀀스

    private func startOpen() {
        // 1) 카드/tier 결정 — shake 전에 굴려야 연출 색/길이가 정해짐(웹 L106-113).
        guard let result = store.openCardPack() else {
            onComplete()
            return
        }
        revealed = Reveal(cards: result.cards, tier: result.tier)
        let f = effectiveFx(result.tier)

        // 2) SHAKING — 웹 shakeMs(normal 1.2s ~ legend 2.5s). 기존 0.32 고정 제거.
        phase = .shaking
        Haptics.play(.medium)   // 흔들림 진입 "킥".
        // tier 스케일 연속 진동을 shakeMs 동안 유지(CoreHaptics). magnitude 3/5/6.3/8.
        let shakeMag = 3.0 + Double(Rarity.allCases.firstIndex(of: result.tier) ?? 0) * (5.0 / 3.0)
        Haptics.packShake(magnitude: shakeMag, duration: f.shakeMs)

        // 3) OPENING — shakeMs 후. 웹은 이 순간 packOpen 사운드 재생(L117).
        DispatchQueue.main.asyncAfter(deadline: .now() + f.shakeMs) {
            guard phase == .shaking else { return }
            phase = .opening
            SoundPlayer.shared.play(.packOpen)
            Haptics.play(.heavy)   // 플래시 "쿵".
            // legend 전용 — 그 직후 sharpness 1.0 "쨍" 클라이맥스(CoreHaptics).
            Haptics.packFlashClimax(rarity: result.tier)
        }

        // 4) REVEALED — opening 600ms 후(웹 L118-124). 카드 등장/사운드는 RevealCard가 자체 처리.
        DispatchQueue.main.asyncAfter(deadline: .now() + f.shakeMs + 0.6) {
            guard phase == .opening else { return }
            phase = .revealed
        }
    }

    private func absorbThen(_ completion: @escaping () -> Void) {
        phase = .absorbing
        Haptics.play(.light)                    // 기존 호출 유지.
        SoundPlayer.shared.play(.xpGain)        // 웹 L135 — 흡수 시작 즉시.
        // 카드가 네비바에 도달하는 순간마다 collect(웹 L138-140: i*80+700ms).
        if let cards = revealed?.cards {
            for i in cards.indices {
                DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.08 + 0.7) {
                    SoundPlayer.shared.play(.collect)
                    // 카드가 네비바에 "톡" 꽂히는 순간 — 80ms 간격 연타라 medium 대신
                    // selection 으로 순화(과잉 자극 방지). 웹 collect=medium 의 네이티브 리파인.
                    Haptics.play(.selection)
                }
            }
        }
        // 웹 L143/L172 — 1200ms 후 다음 팩/완료.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            revealed = nil
            phase = .idle
            completion()
        }
    }

    private func effectiveFx(_ tier: Rarity) -> PackFx {
        reduceMotion ? .reduced : PackFx.table(tier)
    }

    private func button(_ title: String, action: @escaping () -> Void) -> some View {
        // 공용 primary(13-button-system) — 시퀀스 자리(Color.clear height 52)와 높이 일치.
        UNButton(title, action: action)
    }
}

// MARK: - tier별 연출 스펙 (웹 PACK_FX L41-58)

/// tier가 올라갈수록 길이·강도가 커지는 개봉 연출 수치.
///  - shakeMs        : 흔들림 단계 길이(초). 웹 ms → 초.
///  - particleCount  : shake 단계 방출 파티클 수.
///  - revealStagger  : 카드 등장 시간차(초). 웹 revealStaggerMs/1000.
///  - flashIntensity : opening 풀스크린 플래시 강도(0=없음).
///  - haloRings      : opening 확장 링 수(0~3).
///  - rotate/scaleKeyframes : wobble 키프레임(웹 shakeAnimate). tier↑ 진폭↑.
private struct PackFx {
    let shakeMs: Double
    let particleCount: Int
    let revealStagger: Double
    let flashIntensity: Double
    let haloRings: Int
    let rotateKeyframes: [Double]
    let scaleKeyframes: [Double]
    let bigParticles: Bool   // legend — 파티클 5px + 1회 반복.

    static let normal = PackFx(
        shakeMs: 1.2, particleCount: 4, revealStagger: 0.12, flashIntensity: 0, haloRings: 0,
        rotateKeyframes: [0, -8, 8, -8, 8, -5, 5, 0],
        scaleKeyframes:  [1, 1.1, 1.1, 1.1, 1.1, 1.05, 1.05, 1.15],
        bigParticles: false)

    static let rare = PackFx(
        shakeMs: 1.6, particleCount: 7, revealStagger: 0.14, flashIntensity: 0.25, haloRings: 1,
        rotateKeyframes: [0, -10, 10, -9, 9, -6, 6, 0],
        scaleKeyframes:  [1, 1.12, 1.12, 1.12, 1.14, 1.08, 1.08, 1.18],
        bigParticles: false)

    static let unique = PackFx(
        shakeMs: 2.0, particleCount: 11, revealStagger: 0.17, flashIntensity: 0.5, haloRings: 2,
        rotateKeyframes: [0, -11, 11, -10, 10, -7, 7, -5, 5, 0],
        scaleKeyframes:  [1, 1.15, 1.15, 1.15, 1.18, 1.12, 1.12, 1.08, 1.08, 1.2],
        bigParticles: false)

    static let legend = PackFx(
        shakeMs: 2.5, particleCount: 16, revealStagger: 0.21, flashIntensity: 0.85, haloRings: 3,
        rotateKeyframes: [0, -14, 14, -12, 12, -10, 10, -8, 8, -5, 5, 0],
        scaleKeyframes:  [1, 1.18, 1.18, 1.18, 1.2, 1.18, 1.18, 1.15, 1.15, 1.1, 1.1, 1.25],
        bigParticles: true)

    // 웹 REDUCED_FX L61-64 — 흔들림/플래시/링/파티클 최소화.
    static let reduced = PackFx(
        shakeMs: 0.6, particleCount: 0, revealStagger: 0.06, flashIntensity: 0, haloRings: 0,
        rotateKeyframes: [0, 0],
        scaleKeyframes:  [1, 1.05, 1],
        bigParticles: false)

    static func table(_ tier: Rarity) -> PackFx {
        switch tier {
        case .normal: return .normal
        case .rare:   return .rare
        case .unique: return .unique
        case .legend: return .legend
        }
    }
}

// MARK: - SHAKING: wobble Gift + 뒤 glow 펄스

/// 흔들리는 Gift — 회전+부풀림 wobble(웹 shakeAnimate) + 박스 뒤 radial glow 펄스(웹 L405-414).
/// 앱 타깃 16.2라 KeyframeAnimator(iOS17) 대신 withAnimation 스텝 체인(웹 framer easeInOut 균등분할)
/// — LevelUpBurstScreen.runIconShake 관례 재사용.
private struct ShakingGift: View {
    let color: Color
    let fx: PackFx

    @State private var rotation = 0.0
    @State private var scale = 1.0
    @State private var glow = 0.0

    var body: some View {
        ZStack {
            // 박스 뒤 pulse glow — radial(color→clear), blur8, opacity[0,0.4,0,0.6,0.2].
            Circle()
                .fill(RadialGradient(colors: [color, .clear], center: .center, startRadius: 0, endRadius: 48))
                .frame(width: 96, height: 96)
                .blur(radius: 8)
                .opacity(glow)
            PixelIcon(.gift, size: 56, color: color)
                .rotationEffect(.degrees(rotation))
                .scaleEffect(scale)
        }
        .onAppear { runWobble() }
    }

    /// 웹 shakeAnimate rotate/scale 키프레임을 shakeMs 균등분할로 스텝 재생(framer easeInOut).
    private func runWobble() {
        let rot = fx.rotateKeyframes
        let scl = fx.scaleKeyframes
        let segR = fx.shakeMs / Double(max(rot.count - 1, 1))
        for i in 1..<rot.count {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(i - 1) * segR) {
                withAnimation(.easeInOut(duration: segR)) { rotation = rot[i] }
            }
        }
        let segS = fx.shakeMs / Double(max(scl.count - 1, 1))
        for i in 1..<scl.count {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(i - 1) * segS) {
                withAnimation(.easeInOut(duration: segS)) { scale = scl[i] }
            }
        }
        // 뒤 glow 펄스 opacity [0,0.4,0,0.6,0.2] — 4 세그먼트.
        let glows = [0.4, 0.0, 0.6, 0.2]
        let segG = fx.shakeMs / 4
        for (i, gv) in glows.enumerated() {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * segG) {
                withAnimation(.easeInOut(duration: segG)) { glow = gv }
            }
        }
    }
}

// MARK: - SHAKING: 방출 파티클 (Canvas + TimelineView)

/// shake 단계 방출 파티클 — 웹 L418-441. count개가 방사형으로 튀어나갔다 사라짐.
/// 뷰 폭발 방지: 단일 Canvas에 전 파티클 프레임 계산(웹 MeteorShower 패턴).
private struct PackBurstParticles: View {
    let count: Int
    let color: Color
    let big: Bool     // legend — 5px, 1회 반복.
    @State private var start = Date()

    var body: some View {
        TimelineView(.animation) { context in
            let e = context.date.timeIntervalSince(start)
            Canvas { g, size in
                let cx = size.width / 2, cy = size.height / 2
                for i in 0..<count {
                    let angle = Double(i) / Double(count) * 2 * .pi       // 웹 angle
                    let distance = 24.0 + Double(i % 3) * 12.0            // 웹 distance
                    let delay = 0.3 + Double(i % 6) * 0.08               // 웹 delay
                    let dur = 0.8
                    let cycles = big ? 2.0 : 1.0                          // legend repeat:1 → 2 사이클.
                    let local = e - delay
                    if local < 0 || local > dur * cycles { continue }
                    let p = local.truncatingRemainder(dividingBy: dur) / dur
                    let op = tri3(p, 0, 1, 0)                             // opacity [0,1,0]
                    if op <= 0.01 { continue }
                    let sc = tri3(p, 0, 1, 0.4)                           // scale [0,1,0.4]
                    let reach = easeInOut01(p)                            // 위치는 target까지 easeInOut.
                    let px = cx + cos(angle) * distance * reach
                    let py = cy + sin(angle) * distance * reach
                    let base = big ? 5.0 : 4.0
                    let sz = max(base * sc, 0.1)
                    let dot = CGRect(x: px - sz / 2, y: py - sz / 2, width: sz, height: sz)
                    // 웹 shadow 0 0 6px 근사 — 큰 흐린 원 뒤에 깔기.
                    g.fill(Path(ellipseIn: dot.insetBy(dx: -sz, dy: -sz)), with: .color(color.opacity(op * 0.3)))
                    g.fill(Path(ellipseIn: dot), with: .color(color.opacity(op)))
                }
            }
        }
        .onAppear { start = Date() }
        .allowsHitTesting(false)
    }
}

// MARK: - SHAKING: legend 배경 펄스

/// legend 전용 풀스크린 배경 펄스 — 웹 L384-395. opacity[0,0.25,0,0.18,0] over shakeMs, screen 블렌드.
private struct LegendBackgroundPulse: View {
    let color: Color
    let shakeMs: Double
    @State private var opacity = 0.0

    var body: some View {
        RadialGradient(colors: [color, .clear], center: .center, startRadius: 0, endRadius: 500)
            .blendMode(.screen)
            .opacity(opacity)
            .ignoresSafeArea()
            .onAppear {
                let steps = [0.25, 0.0, 0.18, 0.0]
                let seg = shakeMs / 4
                for (i, v) in steps.enumerated() {
                    DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * seg) {
                        withAnimation(.easeInOut(duration: seg)) { opacity = v }
                    }
                }
            }
    }
}

// MARK: - OPENING: tier색 플래시

/// opening 풀스크린 플래시 — 웹 L180-195. tier색 radial, opacity[0,intensity,0] over 0.5, screen 블렌드.
private struct PackFlashOverlay: View {
    let color: Color
    let intensity: Double
    @State private var opacity = 0.0

    var body: some View {
        RadialGradient(colors: [color, .clear], center: .center, startRadius: 0, endRadius: 460)
            .blendMode(.screen)
            .opacity(opacity)
            .ignoresSafeArea()
            .onAppear {
                // 빠르게 올랐다 천천히 사라짐(웹 easeOut over 0.5).
                withAnimation(.easeOut(duration: 0.15)) { opacity = intensity }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                    withAnimation(.easeOut(duration: 0.35)) { opacity = 0 }
                }
            }
    }
}

// MARK: - OPENING: 확장 halo 링

/// 확장 halo 링 하나 — 웹 L198-216. scale 0.3→(3+i*0.8), opacity 0.7→0, dur 0.9+i*0.15, delay i*0.1.
private struct HaloRing: View {
    let index: Int
    let color: Color
    @State private var scale = 0.3
    @State private var opacity = 0.7

    var body: some View {
        Circle()
            .stroke(color, lineWidth: 2)
            .frame(width: 120, height: 120)
            .shadow(color: color, radius: 24)   // 웹 boxShadow 0 0 24px.
            .scaleEffect(scale)
            .opacity(opacity)
            .onAppear {
                withAnimation(.easeOut(duration: 0.9 + Double(index) * 0.15).delay(Double(index) * 0.1)) {
                    scale = 3 + Double(index) * 0.8
                    opacity = 0
                }
            }
    }
}

// MARK: - OPENING: Gift 흡입 축소

/// opening 시 Gift 축소 흡입 — 웹 L219-226. scale 1→0.6, y-40, opacity→0.3, dur0.5 easeOut.
/// (기존 iOS의 1.4 확대는 웹과 반대방향이라 제거.)
private struct OpeningGift: View {
    let color: Color
    @State private var scale = 1.0
    @State private var yOff: CGFloat = 0
    @State private var opacity = 1.0

    var body: some View {
        PixelIcon(.gift, size: 56, color: color)
            .scaleEffect(scale)
            .offset(y: yOff)
            .opacity(opacity)
            .onAppear {
                withAnimation(.easeOut(duration: 0.5)) {
                    scale = 0.6
                    yOff = -40
                    opacity = 0.3
                }
            }
    }
}

// MARK: - REVEAL 카드 (버스트 등장 + 개별 흡수 비행)

private struct RevealCard: View {
    let card: ChallengeCard
    let index: Int
    let staggerSec: Double
    let absorbing: Bool
    let reduceMotion: Bool

    @State private var shown = false
    @State private var iconShown = false

    // 개별 흡수 비행 상태 — 웹 L252-260. (등장 transform과 곱/합산으로 합성.)
    @State private var ax = 0.0
    @State private var ay = 0.0
    @State private var aScale = 1.0
    @State private var aRot = 0.0
    @State private var aOpacity = 1.0
    @State private var glowOp = 0.0

    /// 웹 springBouncy(lib/motion.ts L6): stiffness300 damping15.
    private var entranceSpring: Animation { .interpolatingSpring(stiffness: 300, damping: 15) }

    var body: some View {
        cardBody
            // 등장 transform(웹 initial → rest). rest 시 identity.
            .offset(y: shown ? 0 : 120)
            .scaleEffect(shown ? 1 : 0.3)
            .rotationEffect(.degrees(shown ? 0 : Double(index - 1) * 15))
            .opacity(shown ? 1 : 0)
            // 흡수 비행 transform — 등장 위에 합성. 초기값 identity.
            .offset(x: ax, y: ay)
            .scaleEffect(aScale)
            .rotationEffect(.degrees(aRot))
            .opacity(aOpacity)
            .onAppear {
                // 웹 L250-266: initial y120/scale0.3/opacity0/rotate(i-1)*15 → rest.
                withAnimation(entranceSpring.delay(0.1 + Double(index) * staggerSec)) { shown = true }
                // 웹 L296-303: 카드 내부 아이콘 scale0→1, delay 0.4+i*stagger.
                withAnimation(entranceSpring.delay(0.4 + Double(index) * staggerSec)) { iconShown = true }
                // cardFlip 사운드 — 웹 per-card i*stagger(L120-122).
                DispatchQueue.main.asyncAfter(deadline: .now() + Double(index) * staggerSec) {
                    SoundPlayer.shared.play(.cardFlip)
                    // 카드 등장마다 레어도 스케일 transient(CoreHaptics). 시퀀스 레벨
                    // heavy/medium 과 겹치지 않게 카드별 강도 차등 — normal 약, legend 강.
                    Haptics.packReveal(rarity: card.rarity)
                }
            }
            .onChange(of: absorbing) { isAbsorbing in
                if isAbsorbing { runAbsorb() }
            }
    }

    /// 흡수 비행 — 웹 L252-260. delay i*0.08, 2세그(총 1.0s), cubic(0.4,0,0.2,1).
    private func runAbsorb() {
        let d = Double(index) * 0.08
        let fan = Double(index - 1)
        let curve = Animation.timingCurve(0.4, 0, 0.2, 1, duration: 0.5)
        // 1세그: rest → mid.
        DispatchQueue.main.asyncAfter(deadline: .now() + d) {
            withAnimation(curve) {
                ay = -120; ax = fan * -40; aScale = 0.7; aRot = fan * -60; aOpacity = 0.9
            }
        }
        // 2세그: mid → 네비 방향 낙하/소멸.
        DispatchQueue.main.asyncAfter(deadline: .now() + d + 0.5) {
            withAnimation(curve) {
                ay = 300; ax = 0; aScale = 0.2; aRot = fan * -180; aOpacity = 0
            }
        }
        // glow 꼬리 — 웹 L274-285. opacity[0,0.8,0.6,0], delay i*0.08+0.2.
        guard !reduceMotion else { return }
        let hold = d + 0.2
        DispatchQueue.main.asyncAfter(deadline: .now() + hold) {
            withAnimation(.easeInOut(duration: 0.27)) { glowOp = 0.8 }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + hold + 0.27) {
            withAnimation(.easeInOut(duration: 0.27)) { glowOp = 0.6 }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + hold + 0.54) {
            withAnimation(.easeInOut(duration: 0.26)) { glowOp = 0 }
        }
    }

    private var cardBody: some View {
        VStack(spacing: 6) {
            Text(card.rarity.displayName)
                .typography(.micro)
                .foregroundStyle(Color.bgPrimary)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(card.rarity.color, in: Capsule())
            // 웹 L302 — 카드 내부 PixelIcon(기존 iOS 누락 항목). 등장 시 pop.
            PixelIcon(PixelIconName.resolve(card.icon), size: 36, color: card.rarity.color)
                .scaleEffect(iconShown ? 1 : 0)
            Text(card.localizedTitle(.current))
                .typography(.micro)
                .foregroundStyle(Color.textPrimary)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, minHeight: 84)
        .padding(.vertical, 10)
        .padding(.horizontal, 6)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 10))
        // 웹 L270-271 패리티 — 등급 표면 텍스처. (보더는 디자인 룰 위반이라 텍스처로 대체.)
        .overlay(
            RarityTexture(rarity: card.rarity, cornerRadius: 10)
                .allowsHitTesting(false)
        )
        // 웹 rarityGlow — normal은 글로우 없음.
        .shadow(color: card.rarity.color.opacity(Self.glowOpacity(card.rarity)),
                radius: Self.glowRadius(card.rarity))
        // 웹 L274-285 — 흡수 시 형광 glow 꼬리(glowOp로 페이드). reduceMotion 시 항상 0.
        .overlay { absorbGlowTail }
    }

    /// 흡수 시 카드 위 형광 꼬리 — 웹 L274-285. glowOp를 runAbsorb가 [0.8,0.6,0]로 스텝.
    private var absorbGlowTail: some View {
        RoundedRectangle(cornerRadius: 10)
            .fill(LinearGradient(colors: [.clear, card.rarity.color.opacity(0.19)],
                                 startPoint: .top, endPoint: .bottom))
            .shadow(color: card.rarity.color, radius: 20)
            .opacity(glowOp)
            .allowsHitTesting(false)
    }

    /// 등급별 글로우 — 웹 rarityGlow 대응. normal은 글로우 없음.
    static func glowOpacity(_ r: Rarity) -> Double {
        switch r {
        case .normal: return 0
        case .rare:   return 0.25
        case .unique: return 0.4
        case .legend: return 0.55
        }
    }
    static func glowRadius(_ r: Rarity) -> CGFloat {
        switch r {
        case .normal: return 0
        case .rare:   return 6
        case .unique: return 10
        case .legend: return 14
        }
    }
}

// MARK: - ABSORB: 파티클 트레일 (Canvas)

/// 흡수 시 네비 방향으로 떨어지는 파티클 트레일 — 웹 L320-350. 카드당 6개, 컨테이너 중심에서 방출.
private struct AbsorbTrails: View {
    let cards: [ChallengeCard]
    @State private var start = Date()

    var body: some View {
        TimelineView(.animation) { context in
            let e = context.date.timeIntervalSince(start)
            Canvas { g, size in
                let cx = size.width / 2, cy = size.height / 2
                for (i, card) in cards.enumerated() {
                    let color = card.rarity.color
                    let fan = Double(i - 1)
                    for j in 0..<6 {
                        let delay = Double(i) * 0.08 + Double(j) * 0.06
                        let dur = 0.9
                        let local = e - delay
                        if local < 0 || local > dur { continue }
                        let p = local / dur
                        let op = tri3(p, 0, 0.9, 0)                        // opacity [0,0.9,0]
                        if op <= 0.01 { continue }
                        let y = tri3(p, 0, -80 + Double(j) * 10, 250 + Double(j) * 20)   // 웹 y
                        let x = tri3(p, fan * 30, fan * -20, 0)            // 웹 x fan
                        let sc = tri3(p, 0.5, 0.8, 0)                      // scale [0.5,0.8,0]
                        // 웹 4+rand*4 근사 — 결정적(프레임 간 안정).
                        let baseSize = 4.0 + Double((i * 7 + j * 13) % 5)
                        let sz = max(baseSize * sc, 0.1)
                        let dot = CGRect(x: cx + x - sz / 2, y: cy + y - sz / 2, width: sz, height: sz)
                        g.fill(Path(ellipseIn: dot.insetBy(dx: -sz, dy: -sz)), with: .color(color.opacity(op * 0.3)))
                        g.fill(Path(ellipseIn: dot), with: .color(color.opacity(op)))
                    }
                }
            }
        }
        .onAppear { start = Date() }
        .allowsHitTesting(false)
    }
}

// MARK: - 보간 헬퍼 (Canvas 파티클 공용)

private func lerpD(_ a: Double, _ b: Double, _ t: Double) -> Double { a + (b - a) * t }

private func easeInOut01(_ t: Double) -> Double {
    let x = min(max(t, 0), 1)
    return x < 0.5 ? 2 * x * x : 1 - pow(-2 * x + 2, 2) / 2
}

/// 3-키프레임 [a,b,c]을 t(0~1)에서 easeInOut 보간. framer 다중 키프레임 근사.
private func tri3(_ t: Double, _ a: Double, _ b: Double, _ c: Double) -> Double {
    let x = min(max(t, 0), 1)
    return x < 0.5
        ? lerpD(a, b, easeInOut01(x / 0.5))
        : lerpD(b, c, easeInOut01((x - 0.5) / 0.5))
}
