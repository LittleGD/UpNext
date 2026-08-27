//
//  FortuneCardView.swift
//  UpNext — 불꽃 탭 "오늘의 기운" 카드 (옵트인 리워드 광고 진입점) + 공개 폴라로이드.
//
//  웹 components/flame/FortuneCard.tsx 포팅. 원칙 동일:
//   - 유저가 눌러야만 광고가 뜬다. 자동 노출 금지.
//   - 보상은 코스메틱(오늘의 카드·색·문구·명언)까지만 — 코인/탐험권 등 노력 경제 불가침.
//   - 하루 1회. 같은 날 다시 오면 광고 없이 그대로 다시 볼 수 있다(Fortune.isRevealed).
//   - 결과는 결정론적이라 리롤로 좋은 기운을 찾는 행동이 성립하지 않는다.
//
//  공개 오버레이는 RecordTabView 가 ZStack 으로 띄운다 (카드 내부에 두면 ScrollView 에
//  갇혀 전체 화면을 못 덮는다) — onReveal 콜백으로 위임.
//

import SwiftUI

@MainActor
struct FortuneCardView: View {
    /// 오늘의 기운이 열린 순간 호출 — 부모가 공개 폴라로이드를 띄운다.
    let onReveal: (DailyFortune) -> Void

    @EnvironmentObject private var store: GameStore

    private enum Phase { case idle, loading, fail }

    @State private var fortune: DailyFortune?
    @State private var revealed = false
    @State private var phase: Phase = .idle

    /// 해금 카드가 하나도 없으면(온보딩 직후) 열 것이 없다.
    private var isEmpty: Bool { fortune == nil }

    var body: some View {
        // 광고를 띄울 수 없는 환경이면 카드 자체를 렌더하지 않는다 (죽은 CTA 금지).
        if AdsService.shared.isAvailable {
            card
        }
    }

    private var card: some View {
        Button {
            Task { await tap() }
        } label: {
            HStack(spacing: 12) {
                PixelIcon(.sparkle, size: 20,
                          color: (revealed || isEmpty) ? Color.textTertiary : Color.accentPrimary)
                VStack(alignment: .leading, spacing: 2) {
                    Text("오늘의 기운")
                        .typography(.body)
                        .foregroundStyle(Color.textPrimary)
                    caption
                }
                Spacer(minLength: 8)
                trailing
            }
            .padding(16)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 14))
        .opacity(isEmpty ? 0.7 : 1)
        .disabled(isEmpty || phase == .loading)
        .onAppear { load() }
    }

    private var caption: some View {
        Group {
            if isEmpty {
                Text("카드를 모으면 오늘의 기운을 볼 수 있어요")
            } else if phase == .loading {
                Text("불러오는 중…")
            } else if phase == .fail {
                Text("지금은 보여줄 광고가 없어요")
            } else if revealed {
                Text("오늘의 기운을 확인했어요")
            } else {
                Text("광고를 보면 오늘의 카드와 색·문구·명언이 열려요")
            }
        }
        .typography(.caption)
        .foregroundStyle(phase == .fail ? Color.accentSecondary : Color.textTertiary)
    }

    @ViewBuilder private var trailing: some View {
        if phase == .loading {
            ProgressView()
                .tint(Color.textTertiary)
                .scaleEffect(0.8)
        } else if !isEmpty && !revealed {
            HStack(spacing: 4) {
                Text("오늘의 기운 열기")
                    .typography(.micro)
                    .foregroundStyle(Color.accentPrimary)
                PixelIcon(.chevronRight, size: 12, color: Color.accentPrimary)
            }
        } else if !isEmpty {
            PixelIcon(.chevronRight, size: 12, color: Color.textTertiary)
        }
    }

    // MARK: - 동작

    private func load() {
        let today = GameStore.todayString()
        fortune = Fortune.compute(dateKey: today,
                                  salt: Fortune.salt,
                                  unlockedCardIds: store.progress?.unlockedCardIds ?? [])
        revealed = Fortune.isRevealed(today: today)
    }

    private func tap() async {
        guard let fortune, phase != .loading else { return }
        SoundPlayer.shared.play(.select)

        // 오늘 이미 열었으면 광고 없이 다시 보여준다 (하루 1회 = 광고 1회).
        if revealed {
            SoundPlayer.shared.play(.polaroidSlide)
            onReveal(fortune)
            return
        }

        phase = .loading
        let result = await AdsService.shared.showRewardedAd(slot: .fortune)
        switch result {
        case .rewarded:
            Fortune.markRevealed(today: GameStore.todayString())
            revealed = true
            phase = .idle
            SoundPlayer.shared.play(.polaroidSlide)
            onReveal(fortune)
        case .unavailable:
            SoundPlayer.shared.play(.cancel)
            phase = .fail
            // 3초 뒤 안내 문구 원복 — 탭 자체는 계속 가능
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            if phase == .fail { phase = .idle }
        case .dismissed:
            // 중도 이탈 — 아무 일도 없던 것처럼
            phase = .idle
        }
    }
}

// MARK: - 공개 폴라로이드 오버레이

/// 오늘의 기운 공개 오버레이.
///
/// 연출 은유는 "카메라에서 튀어나온 폴라로이드" 다. 위에서 빠르게 던져져 한 번 튕기고,
/// 착지 순간 오늘의 색이 번쩍이며 입자가 흩어진 뒤, 사진이 현상되듯 어둠이 걷힌다.
/// 웹 FortuneOverlay(src/components/flame/FortuneCard.tsx)와 타이밍을 맞췄다.
///
/// SwiftUI 함정: 같은 런루프 틱에서 상태를 켰다 끄면 두 쓰기가 병합돼 애니메이션이
/// 통째로 사라진다. 번쩍임과 입자는 그래서 틱을 나눠 구동한다.
struct FortuneRevealOverlay: View {
    let fortune: DailyFortune
    let onClose: () -> Void

    @EnvironmentObject private var store: GameStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// 카드가 위에서 던져져 자리를 잡았는지
    @State private var thrown = false
    /// 착지 번쩍임 (표시 → 페이드아웃 2틱)
    @State private var flashOn = false
    /// 입자 (표시 → 확산 2틱)
    @State private var sparksShown = false
    @State private var sparksOut = false
    /// 인화지를 스치는 빛
    @State private var shine = false
    /// 사진 현상
    @State private var developed = false
    /// 캡션 네 줄
    @State private var rowsIn = false
    /// 닫기 힌트
    @State private var hintIn = false

    private var lang: Language { store.progress?.language ?? .ko }
    private var accent: Color { Color(hexString: fortune.color.hex) }

    private static let paper = Color(red: 0.949, green: 0.945, blue: 0.933)  // #f2f1ee
    private static let inkStrong = Color(red: 0.165, green: 0.165, blue: 0.157) // #2a2a28
    private static let inkSoft = Color(red: 0.420, green: 0.420, blue: 0.400)   // #6b6b66
    private static let inkFaint = Color(red: 0.604, green: 0.604, blue: 0.580)  // #9a9a94

    /// 착지 입자 — 각도·거리·크기 고정 테이블. 난수를 쓰면 리렌더마다 궤적이 바뀐다.
    private static let sparks: [(angle: Double, distance: Double, size: Double)] = [
        (-1.9, 132, 5), (-1.2, 168, 4), (-0.5, 120, 6), (0.1, 152, 4),
        (0.8, 128, 5), (1.5, 174, 3), (2.2, 116, 5), (2.9, 160, 4),
        (3.6, 124, 6), (4.3, 148, 3), (-2.6, 140, 4), (5.1, 112, 5),
    ]

    var body: some View {
        ZStack {
            Color.black.opacity(0.6).ignoresSafeArea()

            // 오늘의 색 글로우 — 착지와 함께 부풀었다 가라앉는다
            RadialGradient(
                colors: [accent.opacity(0.22), .clear],
                center: .center, startRadius: 0, endRadius: 260
            )
            .scaleEffect(thrown ? 1 : 0.7)
            .opacity(thrown ? 1 : 0)
            .ignoresSafeArea()
            .allowsHitTesting(false)

            // 착지 번쩍임
            if flashOn {
                accent.opacity(0.22).ignoresSafeArea().blendMode(.screen).allowsHitTesting(false)
            }

            // 착지 입자
            if sparksShown {
                ZStack {
                    ForEach(Array(Self.sparks.enumerated()), id: \.offset) { _, s in
                        Circle()
                            .fill(accent)
                            .frame(width: s.size, height: s.size)
                            .offset(
                                x: sparksOut ? cos(s.angle) * s.distance : 0,
                                y: sparksOut ? sin(s.angle) * s.distance : 0
                            )
                            .opacity(sparksOut ? 0 : 1)
                    }
                }
                .allowsHitTesting(false)
            }

            polaroid
                .rotationEffect(.degrees(thrown ? -2 : -16))
                .scaleEffect(thrown ? 1 : 1.08)
                .offset(x: thrown ? 0 : 26, y: thrown ? 0 : -560)
                .opacity(thrown ? 1 : 0)

            VStack {
                Spacer()
                Text("탭해서 닫기")
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
                    .opacity(hintIn ? 1 : 0)
                    .padding(.bottom, 40)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { onClose() }
        .onAppear(perform: runReveal)
    }

    // MARK: - 연출 구동

    private func runReveal() {
        guard !reduceMotion else {
            // 전정 장애 대응 — 던지기·번쩍임·입자를 모두 건너뛰고 즉시 완성 상태로 둔다.
            thrown = true; developed = true; rowsIn = true; hintIn = true
            return
        }

        withAnimation(.interpolatingSpring(stiffness: 420, damping: 26)) { thrown = true }
        withAnimation(.easeInOut(duration: 0.80).delay(0.44)) { shine = true }
        withAnimation(.easeOut(duration: 0.85).delay(0.46)) { developed = true }
        withAnimation(.easeOut(duration: 0.45).delay(0.62)) { rowsIn = true }
        withAnimation(.easeIn(duration: 0.30).delay(1.30)) { hintIn = true }

        // 번쩍임: 켜는 틱과 끄는 틱을 분리해야 병합되지 않는다.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.30) {
            flashOn = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) {
                withAnimation(.easeOut(duration: 0.34)) { flashOn = false }
            }
        }
        // 입자: 같은 이유로 표시와 확산을 나눈다.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.30) {
            sparksShown = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) {
                withAnimation(.easeOut(duration: 0.72)) { sparksOut = true }
            }
        }
    }

    // MARK: - 폴라로이드

    private var polaroid: some View {
        VStack(spacing: 0) {
            // 사진 영역 — 어둡고 흐린 상태에서 현상되듯 잡힌다
            ZStack {
                Color.bgPrimary
                PixelIcon(PixelIconName.resolve(fortune.card.icon), size: 52, color: accent)
                    .blur(radius: developed ? 0 : 9)
                    .scaleEffect(developed ? 1 : 1.18)
                    .opacity(developed ? 1 : 0)
                // 현상 전 인화지의 잔여 어둠
                Color.black.opacity(developed ? 0 : 0.92)
            }
            .frame(height: 132)
            .clipped()

            // 폴라로이드 하단 캡션 여백 — 네 줄이 같은 카테고리에서 나온 한 벌
            VStack(spacing: 10) {
                row("오늘의 카드", fortune.card.localizedTitle(lang), strong: true, index: 0)
                row("오늘의 색", FortunePool.text(fortune.color.name, lang: lang), index: 1)
                row("오늘의 문구", FortunePool.text(fortune.phrase, lang: lang), index: 2)
                quoteRow
            }
            .padding(.top, 14)
            .padding(.bottom, 8)
            .padding(.horizontal, 6)
        }
        .padding(10)
        .frame(width: 268)
        .background(Self.paper)
        .clipShape(RoundedRectangle(cornerRadius: 2))
        .overlay {
            // 인화지 위를 한 번 스치는 빛 — 착지 직후 "열린다" 는 신호
            LinearGradient(
                colors: [.clear, .white.opacity(0.72), .clear],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            .frame(width: 130)
            .offset(x: shine ? 320 : -230)
            .allowsHitTesting(false)
        }
        .clipShape(RoundedRectangle(cornerRadius: 2))
        .shadow(color: .black.opacity(0.45), radius: 24, y: 10)
    }

    /// 오늘의 명언 — 실존 인물 인용이면 저자명을 한 줄 아래 덧붙인다.
    /// 앱 오리지널 문구는 저자가 없어 아무것도 그리지 않는다.
    private var quoteRow: some View {
        VStack(spacing: 3) {
            Text("오늘의 명언")
                .typography(.micro)
                .foregroundStyle(Self.inkFaint)
            Text(FortunePool.text(fortune.quote, lang: lang))
                .typography(.caption)
                .foregroundStyle(Self.inkSoft)
                .multilineTextAlignment(.center)
            if let author = FortunePool.author(fortune.quote, lang: lang) {
                Text(verbatim: "— \(author)")
                    .typography(.micro)
                    .foregroundStyle(Self.inkFaint)
            }
        }
        .frame(maxWidth: .infinity)
        .opacity(rowsIn ? 1 : 0)
        .offset(y: rowsIn ? 0 : 8)
        .animation(.easeOut(duration: 0.4).delay(reduceMotion ? 0 : 0.62 + 3 * 0.16), value: rowsIn)
    }

    private func row(_ label: LocalizedStringKey, _ value: String, strong: Bool = false, index: Int) -> some View {
        VStack(spacing: 3) {
            Text(label)
                .typography(.micro)
                .foregroundStyle(Self.inkFaint)
            Text(value)
                .typography(strong ? .body : .caption)
                .foregroundStyle(strong ? Self.inkStrong : Self.inkSoft)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .opacity(rowsIn ? 1 : 0)
        .offset(y: rowsIn ? 0 : 8)
        .animation(.easeOut(duration: 0.4).delay(reduceMotion ? 0 : 0.62 + Double(index) * 0.16), value: rowsIn)
    }
}
