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

/// 광고 시청 완료 직후 "한 장 인화되는" 연출. 인화지 프레임은 실물이라 테마와 무관하게
/// 밝은 베이지(#f2f1ee, 웹 PolaroidFrameBase 관례) 고정, 지면 위 잉크 색도 고정값을 쓴다.
/// 사진 자리는 오늘의 색으로 채우고 그 위에 오늘의 카드 아이콘을 얹어, 넷이 한 장으로 묶인다.
struct FortuneRevealOverlay: View {
    let fortune: DailyFortune
    let onClose: () -> Void

    @EnvironmentObject private var store: GameStore
    @State private var settled = false

    private var lang: Language { store.progress?.language ?? .ko }

    private static let paper = Color(red: 0.949, green: 0.945, blue: 0.933)  // #f2f1ee
    private static let inkStrong = Color(red: 0.165, green: 0.165, blue: 0.157) // #2a2a28
    private static let inkSoft = Color(red: 0.420, green: 0.420, blue: 0.400)   // #6b6b66
    private static let inkFaint = Color(red: 0.604, green: 0.604, blue: 0.580)  // #9a9a94

    var body: some View {
        ZStack {
            Color.black.opacity(0.6).ignoresSafeArea()

            polaroid
                .rotationEffect(.degrees(settled ? -2 : 6))
                .offset(y: settled ? 0 : 140)
                .opacity(settled ? 1 : 0)

            VStack {
                Spacer()
                Text("탭해서 닫기")
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
                    .padding(.bottom, 40)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { onClose() }
        .onAppear {
            withAnimation(.spring(response: 0.45, dampingFraction: 0.75)) {
                settled = true
            }
        }
    }

    private var polaroid: some View {
        VStack(spacing: 0) {
            // 사진 영역 — 오늘의 색 지면 위 오늘의 카드 아이콘
            ZStack {
                Color(hexString: fortune.color.hex)
                PixelIcon(PixelIconName.resolve(fortune.card.icon), size: 48, color: Self.inkStrong)
            }
            .frame(height: 132)

            // 폴라로이드 하단 캡션 여백 — 네 줄이 같은 카테고리에서 나온 한 벌
            VStack(spacing: 10) {
                row("오늘의 카드", fortune.card.localizedTitle(lang), strong: true)
                row("오늘의 색", FortunePool.text(fortune.color.name, lang: lang))
                row("오늘의 문구", FortunePool.text(fortune.phrase, lang: lang))
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
    }

    private func row(_ label: LocalizedStringKey, _ value: String, strong: Bool = false) -> some View {
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
    }
}
