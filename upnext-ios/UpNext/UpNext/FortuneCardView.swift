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
//  기운 3종(재물·관계·건강)은 카드 아래가 아니라 **공개 오버레이 안**, 폴라로이드
//  바로 아래에 붙는다. 불꽃 탭에는 오늘의 기운 카드 한 장만 남고, 리딩은 폴라로이드를
//  본 흐름 그대로 이어진다 — "오늘의 기운을 본 자리"가 한 곳으로 모인다.
//

import SwiftUI

@MainActor
struct FortuneCardView: View {
    /// 오늘의 기운이 열린 순간 호출 — 부모가 공개 폴라로이드를 띄운다.
    let onReveal: (DailyFortune) -> Void
    /// 기운 리딩 요청 통로 — **지금은 카드가 쓰지 않는다.**
    ///   기운 3종이 공개 오버레이(FortuneRevealOverlay) 안으로 옮겨 가면서, 요청은
    ///   오버레이가 직접 탭 루트로 올린다. 호출부(RetentionSectionView)의 시그니처를
    ///   지키려고 자리만 남겨 뒀다 — 그쪽이 정리되면 함께 지운다.
    var onOpenAura: (AuraOverlayRequest) -> Void = { _ in }

    @EnvironmentObject private var store: GameStore
    @EnvironmentObject private var upHero: UpHeroStore
    /// 진입 팝업("지금 열기") 의 자동 열기 신호 — FortunePromptModal 의 계약.
    @ObservedObject private var autoOpen = FortuneAutoOpen.shared

    private enum Phase { case idle, loading, noCoins }

    @State private var fortune: DailyFortune?
    @State private var revealed = false
    @State private var phase: Phase = .idle
    /// 이번 세션에서 광고 경로가 실제로 실패했다. 한 번 확인되면 코인 경로로 전환한다.
    ///   `AdsService.isAvailable` 은 동의 갱신 전 낙관적으로 true 를 돌려주므로 그것만으로는
    ///   판정할 수 없다. 실제 `.unavailable` 을 받은 뒤에야 확정된다.
    @State private var adDeadEnd = false

    /// 해금 카드가 하나도 없으면(온보딩 직후) 열 것이 없다.
    private var isEmpty: Bool { fortune == nil }

    /// 코인 경로로 열어야 하는 상태.
    ///   광고를 볼 수 있으면 **광고가 기본 경로**다. 코인은 광고가 불가능할 때만 나타난다.
    ///   둘을 항상 나란히 보여주면 "코인 아까우니 광고 봐야지"라는 압박이 새로 생긴다.
    private var usesCoinPath: Bool { adDeadEnd || !AdsService.shared.isAvailable }

    var body: some View {
        // 카드는 **항상** 렌더한다. 예전엔 `AdsService.isAvailable` 이 false 면 통째로
        //   숨겼는데(죽은 CTA 금지 취지), 그 결과 광고를 구조적으로 못 받는 사용자
        //   (EEA 동의 거부·미승인 지역·오프라인)는 기능의 **존재조차 몰랐다**.
        //   이제 코인 경로가 병존하므로 CTA 가 죽지 않는다 — 숨길 이유가 없다.
        // 기운 3종은 여기 붙지 않는다 — 폴라로이드 오버레이 안으로 옮겼다.
        // 탭에는 오늘의 기운 카드 한 장만 남는다.
        card
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
        .onAppear {
            load()
            // 이미 불꽃 탭에 있던 경우 — 신호는 진입 시점에 와 있다.
            consumeAutoOpen()
        }
        // 다른 탭에서 전환해 온 경우 — 뷰가 이미 살아 있어 onAppear 가 안 뜬다.
        .onChange(of: autoOpen.pending) { pending in
            if pending { consumeAutoOpen() }
        }
    }

    private var caption: some View {
        Group {
            if isEmpty {
                Text("카드를 모으면 오늘의 기운을 볼 수 있어요")
            } else if phase == .loading {
                Text("불러오는 중…")
            } else if phase == .noCoins {
                Text("코인이 부족해요 (\(ShopPrices.fortune) 필요)")
            } else if revealed {
                Text("오늘의 기운을 확인했어요")
            } else if usesCoinPath {
                // 광고를 못 받는 상태 — 왜 코인을 쓰는지 밝혀야 납득이 된다.
                Text("지금은 광고를 볼 수 없어요 · 코인으로 열 수 있어요")
            } else {
                Text("광고를 보면 오늘의 카드와 색·문구·명언이 열려요")
            }
        }
        .typography(.caption)
        // 잔액 부족은 에러가 아니라 안내다 — accentSecondary(에러 전용색)를 쓰지 않는다.
        //   오늘의 기운은 렌즈이지 심판이 아니고, 코인이 모자란 것도 잘못이 아니다.
        //   웹 FortuneCard.tsx 의 같은 자리와 맞춘다(그쪽도 text-tertiary 한 색이다).
        .foregroundStyle(Color.textTertiary)
    }

    @ViewBuilder private var trailing: some View {
        if phase == .loading {
            ProgressView()
                .tint(Color.textTertiary)
                .scaleEffect(0.8)
        } else if !isEmpty && !revealed {
            HStack(spacing: 4) {
                // 코인 경로일 땐 가격을 CTA 에 박아 둔다. 눌러야 차감되므로 기습 결제가 없다
                //   (리롤의 `리롤 · 100코인` 과 같은 규약).
                Text(usesCoinPath
                     ? "오늘의 기운 · \(ShopPrices.fortune)코인"
                     : "오늘의 기운 열기")
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

    /// 진입 팝업 "지금 열기" 신호를 받아 사용자가 카드를 직접 탭한 것과 같은 경로를 탄다.
    /// 신호는 1회성 — 열 수 없는 상태(카드 없음·이미 진행 중)면 조용히 흘린다.
    /// 여기서 되돌려 두면 다음 렌더마다 다시 시도해 광고가 불쑥 뜰 수 있다.
    private func consumeAutoOpen() {
        guard FortuneAutoOpen.shared.consume() else { return }
        guard fortune != nil, phase != .loading else { return }
        // 코인 경로에서는 자동으로 열지 않는다. 팝업의 "지금 열기" 는 광고 옵트인을
        //   전제로 만든 신호라, 그대로 태우면 사용자가 가격을 보지 못한 채 코인이 빠진다
        //   (기습 결제 금지). 신호는 이미 소비했으니 카드의 CTA 가 가격을 달고 기다린다.
        //   웹 FortuneCard.tsx 의 자동 열기 effect 와 같은 가드다.
        guard !usesCoinPath else { return }
        Task { await tap() }
    }

    /// 공개 확정 — 광고 완주와 코인 결제가 **같은 절차**를 타야 한다.
    ///   (표시 상태 + 그날 1회 마킹 + 뽑기 연출 예약 + 부모에게 공개 위임)
    private func openRevealed(_ fortune: DailyFortune) {
        let today = GameStore.todayString()
        Fortune.markRevealed(today: today)
        // 그날 첫 공개 — 오버레이가 폴라로이드 앞에 뽑기 연출을 붙인다.
        FortuneDrawGate.arm(today: today)
        revealed = true
        phase = .idle
        onReveal(fortune)
    }

    private func tap() async {
        guard let fortune, phase != .loading else { return }
        SoundPlayer.shared.play(.select)

        // 오늘 이미 열었으면 광고 없이 다시 보여준다 (하루 1회 = 광고 1회).
        // 재열람은 뽑기 연출 없이 폴라로이드로 바로 간다 — 게이트를 걸지 않는다.
        if revealed {
            onReveal(fortune)
            return
        }

        // 코인 경로 — 광고를 못 받는 상태에서만 온다. 가격은 CTA 에 이미 적혀 있고
        //   이 탭이 곧 결제 확정이다(리롤과 같은 규약: 별도 확인 다이얼로그 없음).
        if usesCoinPath {
            guard upHero.spendCoins(ShopPrices.fortune) else {
                SoundPlayer.shared.play(.cancel)
                Haptics.play(.warning)
                phase = .noCoins
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                if phase == .noCoins { phase = .idle }
                return
            }
            openRevealed(fortune)
            return
        }

        phase = .loading
        let result = await AdsService.shared.showRewardedAd(slot: .fortune)
        switch result {
        case .rewarded:
            openRevealed(fortune)
        case .unavailable:
            // 막다른 길이던 자리. 예전엔 "지금은 보여줄 광고가 없어요"를 3초 띄우고
            //   원복해, 아무리 눌러도 열 수 없는 상태가 무한 반복됐다. 이제 광고 경로가
            //   실제로 죽었다는 사실을 확정하고 코인 경로로 전환한다 — 다음 탭부터
            //   CTA 가 `오늘의 기운 · 30코인` 으로 바뀐다. 여기서 코인을 자동 차감하지는
            //   않는다(사용자가 가격을 보고 한 번 더 눌러야 한다).
            SoundPlayer.shared.play(.cancel)
            adDeadEnd = true
            phase = .idle
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
/// 그날 첫 공개면 그 앞에 뽑기 연출(FortuneDrawView, 1.48초)이 먼저 붙는다.
/// 같은 날 재열람은 게이트가 비어 있어 폴라로이드로 바로 간다.
///
/// 폴라로이드 뒤에는 오늘 카드의 등급 backdrop(RarityBackdrop)이 깔려 광선이
/// 사방으로 뻗는다 — 카드 상세와 같은 등급 언어라 "귀한 카드" 라는 인상이 이어진다.
///
/// 폴라로이드 아래에는 기운 3종 고르기(AuraSectionView)가 이어 붙는다. 사진이 현상된
/// 뒤에 나타나 "오늘의 기운을 봤으니 이제 하나 골라 보라"는 순서가 그대로 읽힌다.
/// 내용이 화면보다 길어질 수 있어 **오버레이 안쪽에** 스크롤을 둔다 — 오버레이 자체는
/// 여전히 탭의 ScrollView 밖(RecordTabView ZStack)에 있어야 화면 전체를 덮는다.
///
/// 닫기: 스크롤과 겹치지 않도록 배경 전체 탭 대신 **폴라로이드 탭 + 하단 닫기 버튼**을
/// 쓴다. ScrollView 는 빈 영역의 탭까지 삼키므로 뒤에 깔린 스크림에 제스처를 달아 봐야
/// 반응하지 않는다 — 있는 척하는 어포던스가 제일 나쁘다.
///
/// SwiftUI 함정: 같은 런루프 틱에서 상태를 켰다 끄면 두 쓰기가 병합돼 애니메이션이
/// 통째로 사라진다. 번쩍임과 입자, 뽑기→폴라로이드 인계는 그래서 틱을 나눠 구동한다.
@MainActor
struct FortuneRevealOverlay: View {
    let fortune: DailyFortune
    /// 기운 리딩(재물·관계·건강) 오버레이를 열어달라는 요청 — 탭 루트가 이 오버레이
    /// **위** z 순서로 띄운다(리딩이 폴라로이드를 덮어야 한 흐름으로 읽힌다).
    var onOpenAura: (AuraOverlayRequest) -> Void = { _ in }
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
    /// 뽑기 연출 진행 중 — 그날 첫 공개에만 켜진다
    @State private var drawing = false

    /// 기운 3종이 **다 보이게 된** 시점. 히트테스트 게이트 전용.
    @State private var rowsTappable = false
    /// 닫기 버튼이 **다 보이게 된** 시점. 히트테스트 게이트 전용.
    @State private var hintTappable = false
    /// 기운 리딩 오버레이가 이 오버레이 **위**에 떠 있는지.
    /// VoiceOver 모달 스코프를 최상단 하나로 유지하는 데만 쓴다 — 둘 다 무조건 `.isModal`
    /// 이면 같은 ZStack 에 모달 형제가 둘이 되어 스코프가 어디에도 걸리지 않는다.
    @State private var auraOpen = false

    // ⚠️ 히트테스트를 `rowsIn`·`hintIn` 으로 열지 마라. 둘 다
    // `withAnimation(.easeOut(...).delay(_:)) { flag = true }` 안에서 켜지는데, delay 가
    // 미루는 것은 **값의 보간뿐**이라 상태 자체는 호출 즉시 true 가 된다. 그 플래그로
    // 게이트를 걸면 아직 완전히 투명한 기운 칩과 닫기 버튼이 연출 시작과 동시에 눌린다
    // (오탭 한 번이 광고를 본 보람을 지운다). 그래서 "다 보이는 순간"을 타이머로 따로
    // 잡아 그때 상호작용을 연다. reduceMotion 경로는 연출이 없으니 즉시 연다.

    private var lang: Language { store.progress?.language ?? .ko }
    private var accent: Color { Color(hexString: fortune.color.hex) }

    /// 리딩이 위에 떠 있으면 모달 스코프를 그쪽에 넘긴다. 삼항 결과를 그대로 넘기면
    /// 타입 추론이 모호해질 수 있어 빈 집합을 먼저 못 박는다.
    private var modalTraits: AccessibilityTraits {
        let none: AccessibilityTraits = []
        return auraOpen ? none : .isModal
    }

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
            // 스크림 — 뒤 불꽃 탭을 흐리고 어둡게. 웹 `bg-black/80 backdrop-blur-md` 대응.
            // Material 이 실제 블러를 만들고 그 위 검정이 밝기를 눌러 준다
            // (CardDrawScreen·CardDetailModal 과 같은 패턴).
            // 아래 글로우·빛기둥은 이 층 **위**라 스크림을 올려도 흐려지지 않는다.
            Rectangle().fill(.ultraThinMaterial)
                .overlay(Color.black.opacity(0.62))
                .ignoresSafeArea()

            // 오늘의 색 글로우 — 착지와 함께 부풀었다 가라앉는다
            RadialGradient(
                colors: [accent.opacity(0.22), .clear],
                center: .center, startRadius: 0, endRadius: 260
            )
            .scaleEffect(thrown ? 1 : 0.7)
            .opacity(thrown ? 1 : 0)
            .ignoresSafeArea()
            .allowsHitTesting(false)

            // 오늘 카드의 등급 빛기둥 — 폴라로이드 뒤, 스크림 앞. 카드 상세(CardDetailModal)와
            // 같은 컴포넌트라 등급이 높을수록 광선·궤도 입자가 화려해진다.
            // 뽑기 중에는 띄우지 않는다 — 웹은 뽑기와 폴라로이드가 별개 오버레이라 이 층이
            // 폴라로이드 쪽에만 있다(iOS 는 한 뷰라 drawing 으로 나눈다).
            if !drawing {
                RarityBackdrop(rarity: fortune.card.rarity)
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
            }

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

            scrollingContent

            closeBar

            // 뽑기 연출 — 폴라로이드보다 위. 끝나면 스스로 물러난다.
            if drawing {
                FortuneDrawView(accent: accent, onFinish: finishDraw)
            }
        }
        // VoiceOver 커서를 오버레이 안에 가둔다. 없으면 커서가 뒤로 새어 확인 다이얼로그가
        // 없는 듀오 "나가기" 같은 버튼에 닿는다. 리딩 오버레이가 위에 떠 있는 동안에는
        // 내려놓는다 — 모달 형제가 둘이면 스코프가 성립하지 않는다.
        .accessibilityAddTraits(modalTraits)
        .onAppear(perform: start)
        .onDisappear {
            // 네비 복구는 무슨 일이 있어도 여기서 — 중간에 닫히든 정상 종료든 한 곳뿐.
            store.fortuneOverlayOpen = false
        }
    }

    // MARK: - 본문 (폴라로이드 + 기운 3종)

    /// 폴라로이드와 기운 고르기를 한 흐름으로 세운 스크롤 본문.
    ///
    /// 짧을 때는 가운데, 길어지면 스크롤. `minHeight: geo.size.height` 한 줄이 두
    /// 상태를 모두 처리한다 — 기운 섹션이 붙기 전 폴라로이드가 위로 붙어 버리면
    /// 공개 연출의 무대가 무너진다.
    private var scrollingContent: some View {
        GeometryReader { geo in
            ScrollView {
                VStack(spacing: 22) {
                    polaroid
                        .rotationEffect(.degrees(thrown ? -2 : -16))
                        .scaleEffect(thrown ? 1 : 1.08)
                        .offset(x: thrown ? 0 : 26, y: thrown ? 0 : -560)
                        .opacity(thrown ? 1 : 0)
                        .contentShape(Rectangle())
                        // 사진을 탭하면 닫힌다(기존 배경 탭의 자리). 뽑기 중에는 받지
                        // 않는다 — 오탭으로 닫히면 광고를 본 보람이 사라진다.
                        .onTapGesture { if !drawing { onClose() } }

                    // 캡션이 다 들어온 뒤에야 기운 3종이 붙는다. 폴라로이드를 이미
                    // 봤다는 사실이 첫 리딩의 값이 된다(웹과 같은 계약).
                    // 페이드가 끝나기 전에는 히트테스트를 받지 않는다. transition(.opacity)
                    // 진행 중에도 SwiftUI 는 투명한 뷰를 그대로 히트테스트하므로,
                    // `if rowsIn` 만으로는 "보이지 않는 칩이 눌리는" 창이 열린다.
                    if rowsIn {
                        AuraSectionView(today: auraToday,
                                        accent: accent,
                                        onOpenReading: openAura)
                            .transition(.opacity)
                            .allowsHitTesting(rowsTappable && !drawing)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 24)
                // 하단 고정 닫기 버튼에 마지막 줄이 가리지 않도록
                .padding(.bottom, 92)
                .frame(maxWidth: .infinity, minHeight: geo.size.height)
            }
            .scrollIndicators(.hidden)
        }
    }

    /// 하단 고정 닫기. 스크롤이 붙은 화면에서 "어디를 눌러야 닫히나"를 남겨두면
    /// 유저가 갇힌다 — 연출이 끝나는 시점에 확실한 출구 하나를 띄운다.
    private var closeBar: some View {
        VStack {
            Spacer()
            Button { onClose() } label: {
                Text("닫기")
                    .typography(.caption)
                    .foregroundStyle(Color.textSecondary)
                    .padding(.vertical, 11)
                    .padding(.horizontal, 26)
                    .contentShape(Rectangle())
            }
            .buttonStyle(UNPressStyle())
            .background(Color.bgSurface.opacity(0.92), in: RoundedRectangle(cornerRadius: 12))
            .padding(.bottom, 28)
        }
        .opacity(hintIn ? 1 : 0)
        .allowsHitTesting(hintTappable && !drawing)
    }

    /// 기운 리딩 요청을 탭 루트로 올리면서, 리딩이 떠 있는 동안에는 이 오버레이의
    /// VoiceOver 모달 스코프를 내려놓는다. `onFinish` 는 리딩이 닫힌 유일한 경로라
    /// 여기에 복구를 얹으면 스코프가 새지 않는다.
    private func openAura(_ request: AuraOverlayRequest) {
        auraOpen = true
        onOpenAura(AuraOverlayRequest(
            reading: request.reading,
            accent: request.accent,
            needsRitual: request.needsRitual,
            allOpened: request.allOpened,
            onFinish: {
                auraOpen = false
                request.onFinish()
            }
        ))
    }

    /// 기운 리딩의 날짜 기준. 웹은 `daily.date` 를 쓴다 — 자정 롤오버를 스토어가
    /// 이미 반영한 값이라, 시계만 보는 todayString 보다 화면과 어긋날 여지가 적다.
    private var auraToday: String {
        store.daily?.date ?? GameStore.todayString()
    }

    // MARK: - 연출 구동

    /// 진입점. 하단 네비를 숨기고, 그날 첫 공개면 뽑기부터 시작한다.
    private func start() {
        store.fortuneOverlayOpen = true

        // reduceMotion 이면 뽑기를 통째로 건너뛴다(게이트는 소비해 다음에 남지 않게).
        let firstToday = FortuneDrawGate.consume(today: GameStore.todayString())
        if firstToday && !reduceMotion {
            drawing = true
            return
        }
        runReveal()
    }

    /// 뽑기 → 폴라로이드 인계.
    ///
    /// 같은 틱에서 뽑기를 걷고 던지기를 시작하면 두 쓰기가 병합돼 폴라로이드가
    /// 초기 상태(화면 밖)를 거치지 않고 그냥 나타난다. 한 틱 비워 준다.
    private func finishDraw() {
        // 웹 오버레이 진입 페이드(0.18s)와 같은 값 — 뽑기의 잔광이 스크림 위에서
        // 그대로 이어져 두 장면이 한 화면처럼 읽힌다.
        withAnimation(.easeOut(duration: 0.18)) { drawing = false }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) { runReveal() }
    }

    private func runReveal() {
        SoundPlayer.shared.play(.polaroidSlide)
        guard !reduceMotion else {
            // 전정 장애 대응 — 던지기·번쩍임·입자를 모두 건너뛰고 즉시 완성 상태로 둔다.
            thrown = true; developed = true; rowsIn = true; hintIn = true
            rowsTappable = true; hintTappable = true
            return
        }

        withAnimation(.interpolatingSpring(stiffness: 420, damping: 26)) { thrown = true }
        withAnimation(.easeInOut(duration: 0.80).delay(0.44)) { shine = true }
        withAnimation(.easeOut(duration: 0.85).delay(0.46)) { developed = true }
        withAnimation(.easeOut(duration: 0.45).delay(0.62)) { rowsIn = true }
        withAnimation(.easeIn(duration: 0.30).delay(1.30)) { hintIn = true }

        // 상호작용은 각자의 페이드가 **끝난 뒤에** 연다(위 ⚠️ 주석 참조).
        //   기운 3종: 0.62 + 0.45 = 1.07초, 닫기: 1.30 + 0.30 = 1.60초.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.07) { rowsTappable = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.60) { hintTappable = true }

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
                Text(verbatim: "· \(author)")
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
