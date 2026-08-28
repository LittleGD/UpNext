//
//  FortuneDrawView.swift
//  UpNext — 오늘의 기운 뽑기 연출. 폴라로이드가 던져지기 직전 1.48초.
//
//  웹 src/components/flame/FortuneDrawIntro.tsx 1:1 포팅 (RISE/SHAKE/BURST 세 단계,
//  키프레임·색·사운드 동일). 웹 = 안드로이드라 두 플랫폼이 같은 장면을 봐야 한다.
//
//  왜 뽑기를 앞에 붙이나: 광고를 본 직후 결과가 바로 튀어나오면 "보상을 받았다" 는
//  감각이 없다. 어둠에서 카드가 떠올라 흔들리다 빛으로 터지는 장면을 먼저 두면
//  폴라로이드가 그 뽑기의 결론이 되어 같은 결과가 훨씬 값지게 읽힌다.
//
//  연출 어휘는 CardPackOpenerView(팩 개봉)를 따른다 — 흔들림으로 기대를 쌓고,
//  확장 halo 링 + 풀스크린 플래시로 터뜨린다. 다만 팩 개봉은 2.5초까지 끌어도 되는
//  이벤트고 이건 **매일 아침 보는** 장면이라 세 단계 합을 1.5초 아래로 묶었다.
//
//  색은 등급 색이 아니라 오늘의 색(fortune.color.hex)이다. 이어서 나오는 폴라로이드의
//  글로우·아이콘과 같은 빛으로 읽혀야 두 장면이 하나로 이어진다.
//
//  타임라인 (웹 RISE_MS/SHAKE_MS/BURST_MS):
//    0.00  RISE  460ms — 어둠에서 카드가 떠오르고 뒤에 빛이 고인다 + 캡션
//    0.46  SHAKE 520ms — 카드가 흔들리고 빛이 맥동하며 입자가 새어 나온다 (chargeUp)
//    0.98  BURST 500ms — halo 링 2개 + 풀스크린 플래시, 카드는 빛으로 사라진다 (packOpen)
//    1.48  onFinish() → 폴라로이드 던지기 시작
//
//  SwiftUI 함정: 같은 런루프 틱에서 상태를 켰다 끄면 두 쓰기가 병합돼 애니메이션이
//  통째로 사라진다. 키프레임은 그래서 스텝을 틱으로 쪼개 재생한다
//  (CardPackOpenerView.ShakingGift.runWobble 과 같은 관례).
//
//  iOS 16.2 타깃이라 KeyframeAnimator(iOS 17)를 쓸 수 없다. @State + withAnimation
//  스텝 체인 + 입자는 TimelineView/Canvas — 앱의 기존 연출들과 같은 구성.
//

import SwiftUI

// MARK: - 첫 공개 게이트

/// "오늘 처음 여는 공개인가" 를 오버레이에 전달하는 1회성 게이트.
///
/// 광고 보상 시점(FortuneCardView)에는 이미 Fortune.markRevealed 가 호출된 뒤라
/// 오버레이 쪽에서는 첫 공개인지 되물을 방법이 없다. 그래서 보상 직후 여기에 오늘
/// 날짜를 걸어 두고, 오버레이가 뜨면서 한 번만 소비한다. 같은 날 재열람은 게이트가
/// 비어 있어 뽑기 없이 폴라로이드로 바로 간다.
@MainActor
enum FortuneDrawGate {
    private static var armedDate: String?

    /// 광고 보상 직후 호출. 다음에 뜨는 오버레이가 뽑기 연출을 앞에 붙인다.
    static func arm(today: String) { armedDate = today }

    /// 오버레이가 소비. 오늘 걸어 둔 게이트일 때만 true 이고 즉시 해제된다.
    /// (자정을 넘겨 남은 게이트는 무효 — 어제 것으로 오늘 연출이 뜨면 안 된다.)
    static func consume(today: String) -> Bool {
        let hit = armedDate == today
        armedDate = nil
        return hit
    }
}

// MARK: - 뽑기 연출

struct FortuneDrawView: View {
    /// 오늘의 색 — 카드 뒷면 문양·고인 빛·입자·halo·플래시가 모두 이 색을 쓴다.
    let accent: Color
    /// 연출이 끝나 폴라로이드로 넘길 시점.
    let onFinish: () -> Void

    // 웹 RISE_MS / SHAKE_MS / BURST_MS (ms → 초).
    private static let riseSec: Double = 0.46
    private static let shakeSec: Double = 0.52
    private static let burstSec: Double = 0.50
    /// 뽑기 전체 길이(초). 1.2~1.8초 예산 안.
    static let duration: Double = riseSec + shakeSec + burstSec

    private enum Phase { case rise, shake, burst }
    @State private var phase: Phase = .rise

    /// 카드 뒷면 — 떠오름/흔들림/소멸을 한 벌로 움직인다.
    @State private var cardY: CGFloat = 46
    @State private var cardOpacity: Double = 0
    @State private var cardScale: CGFloat = 0.82
    @State private var cardRot: Double = -4
    /// 뒷면 문양 밝기 — 흔들리는 동안 맥동한다.
    @State private var sigil: Double = 0.5
    /// 카드 뒤에 고인 빛
    @State private var poolOpacity: Double = 0
    @State private var poolScale: CGFloat = 0.4
    @State private var captionIn = false

    var body: some View {
        ZStack {
            /* 스크림은 두지 않는다. 웹은 독립 오버레이라 자체 black/60 을 깔지만
               iOS 는 FortuneRevealOverlay 안에 들어가 이미 같은 값이 깔려 있다.
               한 겹 더 얹으면 폴라로이드로 넘어갈 때 배경만 밝아져 눈에 띈다. */

            // 카드 뒤에 고인 빛 — 흔들리는 동안 부풀었다가 터질 때 한계까지 커진다
            RadialGradient(
                colors: [accent.opacity(0.53), accent.opacity(0.2), .clear],
                center: .center, startRadius: 0, endRadius: 104
            )
            .frame(width: 320, height: 320)
            .blur(radius: 24)
            .scaleEffect(poolScale)
            .opacity(poolOpacity)

            // 터질 때 퍼지는 확장 링 — 팩 개봉의 haloRings 와 같은 어휘, 2개로 절제
            if phase == .burst {
                ForEach(0..<2, id: \.self) { i in
                    FortuneDrawRing(index: i, color: accent)
                }
                // 풀스크린 플래시 — 폴라로이드가 던져지기 직전 화면을 한 번 채운다
                FortuneDrawFlash(color: accent)
            }

            cardBack

            // 흔들림 단계에서 새어 나오는 입자. burst 에서도 언마운트하지 않는다
            // (늦게 출발한 입자가 중간에 뚝 끊긴다).
            if phase != .rise {
                FortuneDrawMotes(color: accent)
            }

            // 캡션 — 폴라로이드의 "탭해서 닫기" 와 같은 자리라 두 화면이 이어질 때 튀지 않는다
            VStack {
                Spacer()
                Text(AppConfig.loc("오늘의 카드를 찾는 중…"))
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
                    .opacity(captionIn ? 1 : 0)
                    .padding(.bottom, 40)
            }
        }
        // 연출은 터치를 먹지 않는다. 뽑기 중 오탭을 막는 판단은 부모 오버레이가 한다
        // (여기서 삼키면 연출이 끝난 뒤 닫기 탭까지 씹힐 위험이 있다).
        .allowsHitTesting(false)
        .onAppear(perform: run)
    }

    // MARK: - 카드 뒷면

    /// 아직 무엇인지 모르는 카드 — 오늘의 색 실루엣만 보인다. 보더는 두르지 않는다.
    private var cardBack: some View {
        RoundedRectangle(cornerRadius: 8)
            .fill(Color.bgElevated)
            .frame(width: 132, height: 176)
            .overlay {
                PixelIcon(.sparkle, size: 40, color: accent)
                    .opacity(sigil)
            }
            .overlay {
                // 뒷면을 훑는 빛 — 봉인이 아직 열리지 않았다는 신호(웹 150deg 그라디언트)
                LinearGradient(
                    colors: [accent.opacity(0.12), .clear, accent.opacity(0.08)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            }
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .shadow(color: accent.opacity(0.27), radius: 22)
            .shadow(color: .black.opacity(0.5), radius: 16, y: 12)
            .rotationEffect(.degrees(cardRot))
            .scaleEffect(cardScale)
            .offset(y: cardY)
            .opacity(cardOpacity)
    }

    // MARK: - 연출 구동

    private func run() {
        // RISE — 어둠에서 카드가 떠오르고 뒤에 빛이 고인다.
        withAnimation(.timingCurve(0.16, 1, 0.3, 1, duration: Self.riseSec)) {
            cardY = 0
            cardOpacity = 1
            cardScale = 1
            cardRot = 0
        }
        withAnimation(.easeOut(duration: Self.riseSec)) {
            poolOpacity = 0.35
            poolScale = 0.8
        }
        withAnimation(.easeOut(duration: 0.22).delay(0.14)) { captionIn = true }

        // SHAKE — 기대를 쌓는 구간. 사운드도 웹과 같은 chargeUp.
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.riseSec) {
            phase = .shake
            SoundPlayer.shared.play(.chargeUp)
            Haptics.play(.medium)   // 흔들림 진입 "킥"(팩 개봉 관례).
            runShake()
        }

        // BURST — 빛으로 터진다.
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.riseSec + Self.shakeSec) {
            phase = .burst
            SoundPlayer.shared.play(.packOpen)
            Haptics.play(.heavy)
            runBurst()
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + Self.duration) { onFinish() }
    }

    /// 흔들림 키프레임 — 웹 rotate [0,-7,6,-4,0] / scale [1,1.06,1.05,1.09] /
    /// 문양 opacity [0.5,1,0.7,1] / 고인 빛 [0.35,0.7,0.5,0.85]·[0.8,0.95,0.9,1.05].
    /// 회전만 4세그, 나머지는 3세그라 두 체인으로 나눠 재생한다.
    private func runShake() {
        let rots: [Double] = [-7, 6, -4, 0]
        let segRot = Self.shakeSec / Double(rots.count)
        for (i, r) in rots.enumerated() {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * segRot) {
                withAnimation(.easeInOut(duration: segRot)) { cardRot = r }
            }
        }

        let scales: [CGFloat] = [1.06, 1.05, 1.09]
        let sigils: [Double] = [1, 0.7, 1]
        let poolOps: [Double] = [0.7, 0.5, 0.85]
        let poolScales: [CGFloat] = [0.95, 0.9, 1.05]
        let seg = Self.shakeSec / 3
        for i in 0..<3 {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * seg) {
                withAnimation(.easeInOut(duration: seg)) {
                    cardScale = scales[i]
                    sigil = sigils[i]
                    poolOpacity = poolOps[i]
                    poolScale = poolScales[i]
                }
            }
        }
    }

    /// 소멸 — 카드는 위로 밀리며 확대돼 빛에 먹히고(웹 BURST_MS*0.72), 고인 빛은
    /// 한계까지 부풀었다 꺼진다(opacity [0.85,1,0] / scale [1.05,1.9,2.4] 2세그).
    private func runBurst() {
        withAnimation(.timingCurve(0.32, 0, 0.67, 0, duration: Self.burstSec * 0.72)) {
            cardY = -14
            cardOpacity = 0
            cardScale = 1.42
            cardRot = 0
        }
        withAnimation(.easeOut(duration: 0.22)) { captionIn = false }

        let half = Self.burstSec / 2
        withAnimation(.easeOut(duration: half)) {
            poolOpacity = 1
            poolScale = 1.9
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + half) {
            withAnimation(.easeOut(duration: half)) {
                poolOpacity = 0
                poolScale = 2.4
            }
        }
    }
}

// MARK: - BURST: 확장 halo 링

/// 웹 ring — scale 0.35→(3.2+i*0.9), opacity 0.8→0, dur 0.62+i*0.12, delay i*0.08.
/// CardPackOpenerView.HaloRing 과 같은 어휘지만 그쪽은 private 이라 여기 다시 뒀다.
private struct FortuneDrawRing: View {
    let index: Int
    let color: Color
    @State private var scale: CGFloat = 0.35
    @State private var opacity: Double = 0.8

    var body: some View {
        Circle()
            .stroke(color, lineWidth: 2)
            .frame(width: 132, height: 132)
            .shadow(color: color, radius: 26)   // 웹 boxShadow 0 0 26px.
            .scaleEffect(scale)
            .opacity(opacity)
            .onAppear {
                withAnimation(.easeOut(duration: 0.62 + Double(index) * 0.12)
                    .delay(Double(index) * 0.08)) {
                    scale = 3.2 + CGFloat(index) * 0.9
                    opacity = 0
                }
            }
    }
}

// MARK: - BURST: 풀스크린 플래시

/// 웹 flash — opacity [0, 0.55, 0], dur 0.44, times [0, 0.28, 1].
/// 켜는 틱과 끄는 틱을 나눠야 두 쓰기가 병합되지 않는다.
private struct FortuneDrawFlash: View {
    let color: Color
    @State private var opacity: Double = 0

    var body: some View {
        RadialGradient(colors: [color, .clear],
                       center: .center, startRadius: 0, endRadius: 420)
        .blendMode(.screen)
        .opacity(opacity)
        .ignoresSafeArea()
        .onAppear {
            withAnimation(.easeOut(duration: 0.44 * 0.28)) { opacity = 0.55 }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.44 * 0.28) {
                withAnimation(.easeOut(duration: 0.44 * 0.72)) { opacity = 0 }
            }
        }
    }
}

// MARK: - SHAKE: 새어 나오는 입자

/// 흔들리는 동안 봉인에서 새어 나오는 빛 입자 8개.
///
/// 각도/거리/크기/지연은 고정 테이블 — 난수를 쓰면 리렌더마다 궤적이 바뀐다
/// (FortuneRevealOverlay.sparks 와 같은 이유). 8개 × 0.52초라 뷰로 쪼개는 대신
/// Canvas 한 장에 그린다(PackBurstParticles 관례).
private struct FortuneDrawMotes: View {
    let color: Color
    @State private var start = Date()

    /// 웹 MOTES 그대로. 반원 위쪽으로 치우치게 각도를 골랐다.
    private static let motes: [(angle: Double, distance: Double, size: Double, delay: Double)] = [
        (-2.4, 96, 4, 0.04), (-1.8, 118, 3, 0.12), (-1.1, 88, 5, 0), (-0.4, 110, 3, 0.18),
        (0.3, 92, 4, 0.08), (1.0, 104, 3, 0.22), (3.5, 86, 4, 0.06), (4.2, 100, 3, 0.16),
    ]
    private static let travel: Double = 0.52

    var body: some View {
        TimelineView(.animation) { ctx in
            let elapsed = ctx.date.timeIntervalSince(start)
            Canvas { g, size in
                let cx = size.width / 2
                let cy = size.height / 2
                for m in Self.motes {
                    let p = (elapsed - m.delay) / Self.travel
                    if p < 0 || p > 1 { continue }
                    // opacity [0,1,0] / scale [0.4,1,0.3] — 중간에서 꺾이는 삼각 보간.
                    let op = p < 0.5 ? p * 2 : (1 - p) * 2
                    if op <= 0.01 { continue }
                    let sc = p < 0.5 ? 0.4 + p * 2 * 0.6 : 1 - (p - 0.5) * 2 * 0.7
                    let reach = 1 - pow(1 - p, 3)   // easeOut — 튀어나갔다 잦아든다
                    let px = cx + cos(m.angle) * m.distance * reach
                    let py = cy + sin(m.angle) * m.distance * reach
                    let sz = max(m.size * sc, 0.1)
                    let dot = CGRect(x: px - sz / 2, y: py - sz / 2, width: sz, height: sz)
                    // 웹 shadow 0 0 8px 근사 — 큰 흐린 원을 뒤에 깐다.
                    g.fill(Path(ellipseIn: dot.insetBy(dx: -sz, dy: -sz)),
                           with: .color(color.opacity(op * 0.3)))
                    g.fill(Path(ellipseIn: dot), with: .color(color.opacity(op)))
                }
            }
        }
        .onAppear { start = Date() }
        .allowsHitTesting(false)
    }
}
