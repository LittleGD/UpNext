//
//  OnboardingView.swift
//  UpNext — 온보딩 (웹 components/onboarding/OnboardingFlow.tsx 1:1 격상).
//
//  4단계: intro(3-page 캐러셀 — 카드팬 / 에너지펄스 / 영웅·불꽃 + 언어선택) → difficulty(난이도)
//        → starterPack(스타터팩) → levelUp(레벨 1).
//
//  모든 문구는 OnboardingI18n(웹 i18n 4개국어) + 데이터(StarterPack.localizedName)로
//  현재 앱 언어(progress.language)에 맞춰 렌더. 인트로의 LanguageToggle 로 언어 즉시 전환.
//

import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject private var store: GameStore
    @State private var step: Step = .intro
    private var lang: Language { store.progress?.language ?? .ko }

    private enum Step: Int, CaseIterable {
        case intro, difficulty, starterPack, levelUp
    }

    var body: some View {
        ZStack(alignment: .top) {
            Color.bgPrimary.ignoresSafeArea()

            Group {
                switch step {
                case .intro:
                    OnboardingIntro { goTo(.difficulty) }
                case .difficulty:
                    OnboardingDifficulty(onBack: { goTo(.intro) }) { mode in
                        store.setMode(mode)
                        goTo(.starterPack)
                    }
                case .starterPack:
                    OnboardingStarterPack(onBack: { goTo(.difficulty) }) { packId in
                        store.selectStarterPack(packId)
                        goTo(.levelUp)
                    }
                case .levelUp:
                    LevelUpBurstScreen(nextLevel: 1) {
                        store.finishOnboarding()
                    }
                }
            }

            if step != .intro {
                stepIndicator
            }
        }
        .onAppear {
            #if DEBUG
            // UITest 전용 — 특정 온보딩 단계로 바로 진입(검증용).
            if let raw = ProcessInfo.processInfo.arguments
                .first(where: { $0.hasPrefix("UITestOnboardingStep=") })?
                .replacingOccurrences(of: "UITestOnboardingStep=", with: "") {
                switch raw {
                case "difficulty": step = .difficulty
                case "starterPack": step = .starterPack
                case "levelUp": step = .levelUp
                default: break
                }
            }
            #endif
        }
    }

    private func goTo(_ next: Step) {
        withAnimation(.easeInOut(duration: 0.2)) { step = next }
    }

    private var stepIndicator: some View {
        HStack(spacing: 6) {
            ForEach(Step.allCases, id: \.self) { s in
                Capsule()
                    .fill(s.rawValue <= step.rawValue ? Color.accentPrimary : Color.bgElevated)
                    .frame(width: 28, height: 4)
            }
        }
        .padding(.top, 14)
    }
}

// MARK: - 1. 앱 소개 (2-page 캐러셀 + 언어 선택)

private struct OnboardingIntro: View {
    @EnvironmentObject private var store: GameStore
    let onNext: () -> Void
    @State private var page = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var lang: Language { store.progress?.language ?? .ko }
    private let pageCount = 3

    /// 페이지별 헤드라인(본문 상단) — 1행 textPrimary + 2행 accentPrimary.
    private func titleAccent(_ p: Int) -> (String, String) {
        switch p {
        case 0:  return (OnboardingI18n.desc1Title(lang), OnboardingI18n.desc1Accent(lang))
        case 1:  return (OnboardingI18n.desc2Title(lang), OnboardingI18n.desc2Accent(lang))
        default: return (OnboardingI18n.desc3Title(lang), OnboardingI18n.desc3Accent(lang))
        }
    }
    private func bodyCopy(_ p: Int) -> String {
        switch p {
        case 0:  return OnboardingI18n.desc1Body(lang)
        case 1:  return OnboardingI18n.desc2Body(lang)
        default: return OnboardingI18n.desc3Body(lang)
        }
    }

    /// 한 페이지(그래픽 + 카피) — TabView 각 탭에 들어가는 본문. maxHeight 로 세로 중앙 정렬.
    @ViewBuilder
    private func pageContent(_ p: Int) -> some View {
        VStack(spacing: 32) {
            ZStack {
                switch p {
                case 0:  CardFanGraphic()
                case 1:  EnergyPulseGraphic(lang: lang)
                default: HeroFlameGraphic(lang: lang)
                }
            }
            .frame(height: 200)

            VStack(spacing: 12) {
                // Text 연결의 색은 iOS16 호환 위해 .foregroundColor 사용(Text 한정, iOS13+).
                (Text(titleAccent(p).0)
                    .foregroundColor(Color.textPrimary)
                 + Text("\n")
                 + Text(titleAccent(p).1)
                    .foregroundColor(Color.accentPrimary))
                    .typography(.title)
                    .multilineTextAlignment(.center)
                Text(bodyCopy(p))
                    .typography(.body)
                    .foregroundStyle(Color.textSecondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // 페이지 인디케이터
            HStack(spacing: 8) {
                ForEach(0..<pageCount, id: \.self) { i in
                    Capsule()
                        .fill(i == page ? Color.accentPrimary : Color.bgElevated)
                        .frame(width: i == page ? 24 : 6, height: 6)
                        .animation(.easeOut(duration: 0.25), value: page)
                }
            }
            .padding(.top, 24)

            // 좌우 스와이프 페이지 — 커스텀 인디케이터를 쓰므로 내장 점은 숨김.
            // 다음 버튼/스와이프 모두 동일한 page 바인딩을 갱신 → 인디케이터·CTA 동기화.
            TabView(selection: $page) {
                ForEach(0..<pageCount, id: \.self) { p in
                    pageContent(p)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .padding(.horizontal, 32)
                        .tag(p)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))

            // 언어 선택 + 진행 버튼
            VStack(spacing: 12) {
                LanguageToggle(current: lang) { store.setLanguage($0) }
                UNButton(page == pageCount - 1 ? OnboardingI18n.start(lang) : OnboardingI18n.next(lang)) {
                    if page == pageCount - 1 { onNext() }
                    else { withAnimation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.85)) { page += 1 } }
                }
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            #if DEBUG
            // UITest 전용 — 특정 인트로 페이지로 바로 진입(검증용).
            if let raw = ProcessInfo.processInfo.arguments
                .first(where: { $0.hasPrefix("UITestIntroPage=") })?
                .replacingOccurrences(of: "UITestIntroPage=", with: ""),
               let p = Int(raw), (0..<pageCount).contains(p) {
                page = p
            }
            #endif
        }
    }
}

// MARK: - 언어 토글 (한국어 / English / 日本語 / 中文)

private struct LanguageToggle: View {
    let current: Language
    let onSelect: (Language) -> Void

    private func label(_ l: Language) -> String {
        switch l { case .ko: return "한국어"; case .en: return "EN"; case .ja: return "日本語"; case .zh: return "中文" }
    }

    var body: some View {
        HStack(spacing: 6) {
            ForEach(Language.allCases, id: \.self) { l in
                let sel = l == current
                Button { onSelect(l) } label: {
                    Text(label(l))
                        .typography(.caption)
                        .foregroundStyle(sel ? Color.bgPrimary : Color.textTertiary)
                        .frame(maxWidth: .infinity)
                        .frame(height: 36)
                        .background(sel ? Color.accentPrimary : Color.bgSurface, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// MARK: - 카드 팬 그래픽 (인트로 1)

private struct CardFanGraphic: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var floatPhase = false

    private struct Fan { let icon: PixelIconName; let rarity: Rarity; let rotate: Double; let x: CGFloat }
    private let cards: [Fan] = [
        .init(icon: .human, rarity: .normal, rotate: -18, x: -52),
        .init(icon: .heart, rarity: .rare, rotate: -8, x: -26),
        .init(icon: .sparkle, rarity: .unique, rotate: 2, x: 0),
        .init(icon: .bookOpen, rarity: .rare, rotate: 12, x: 26),
        .init(icon: .trophy, rarity: .legend, rotate: 22, x: 52),
    ]

    var body: some View {
        ZStack {
            Circle().fill(Color.accentPrimary.opacity(0.1))
                .frame(width: 220, height: 150).blur(radius: 40)
            ForEach(Array(cards.enumerated()), id: \.offset) { i, c in
                miniCard(c)
                    .rotationEffect(.degrees(c.rotate))
                    .offset(x: c.x, y: (floatPhase && !reduceMotion) ? -4 : 0)
                    .animation(reduceMotion ? nil
                        : .easeInOut(duration: 3 + Double(i) * 0.3).repeatForever(autoreverses: true)
                            .delay(Double(i) * 0.2), value: floatPhase)
            }
        }
        .onAppear { floatPhase = true }
    }

    private func miniCard(_ c: Fan) -> some View {
        VStack(spacing: 6) {
            PixelIcon(c.icon, size: 22, color: c.rarity.color)
            VStack(spacing: 2) {
                Capsule().fill(c.rarity.color.opacity(0.4)).frame(width: 24, height: 2)
                Capsule().fill(c.rarity.color.opacity(0.2)).frame(width: 16, height: 2)
            }
        }
        .frame(width: 56, height: 78)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 8))
        .overlay(alignment: .top) {
            Rectangle().fill(c.rarity.color).frame(height: 2)
                .clipShape(RoundedRectangle(cornerRadius: 2))
        }
        .shadow(color: c.rarity.color.opacity(0.12), radius: 10)
    }
}

// MARK: - 에너지 펄스 그래픽 (인트로 2 — Lv.1 → Lv.2)

private struct EnergyPulseGraphic: View {
    let lang: Language
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false
    @State private var xpFill = false

    var body: some View {
        ZStack {
            Circle().fill(Color.accentCyan.opacity(0.1)).frame(width: 200, height: 200).blur(radius: 45)
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .stroke(Color.accentCyan.opacity(0.3), lineWidth: 1)
                    .frame(width: 120, height: 120)
                    .scaleEffect((pulse && !reduceMotion) ? 1.4 : 0.4)
                    .opacity((pulse && !reduceMotion) ? 0 : 0.3)
                    .animation(reduceMotion ? nil
                        : .easeOut(duration: 2.4).repeatForever(autoreverses: false).delay(Double(i) * 0.8),
                        value: pulse)
            }
            PixelIcon(.zap, size: 56, color: Color.accentCyan)
                .scaleEffect((pulse && !reduceMotion) ? 1.06 : 1)
                .shadow(color: Color.accentCyan.opacity(0.6), radius: (pulse && !reduceMotion) ? 18 : 8)
                .animation(reduceMotion ? nil : .easeInOut(duration: 2).repeatForever(autoreverses: true), value: pulse)

            // 하단 XP 바 Lv.1 → Lv.2
            VStack(spacing: 4) {
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color.bgElevated)
                        Capsule()
                            .fill(LinearGradient(colors: [Color.accentCyan, Color.accentPrimary],
                                                 startPoint: .leading, endPoint: .trailing))
                            .frame(width: g.size.width * (xpFill ? 0.75 : 0))
                    }
                }
                .frame(width: 160, height: 4)
                HStack {
                    Text(OnboardingI18n.levelShort(lang, 1)).typography(.micro).foregroundStyle(Color.textTertiary)
                    Spacer()
                    Text(OnboardingI18n.levelShort(lang, 2)).typography(.micro).foregroundStyle(Color.accentCyan)
                }
                .frame(width: 160)
            }
            .offset(y: 78)
        }
        .onAppear {
            pulse = true
            withAnimation(reduceMotion ? nil : .easeOut(duration: 1.4).delay(0.3)) { xpFill = true }
        }
    }
}

// MARK: - 영웅 + 불꽃 그래픽 (인트로 3 — 아지트 영웅 성장 + 연속 불꽃)

private struct HeroFlameGraphic: View {
    let lang: Language
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var flameGrow = false
    @State private var heroBob = false

    var body: some View {
        ZStack {
            // 따뜻한 글로우 (불꽃 = accentPrimary, 실제 불꽃 탭과 동일 색)
            Circle().fill(Color.accentPrimary.opacity(0.12))
                .frame(width: 210, height: 170).blur(radius: 44)

            VStack(spacing: 4) {
                // 불꽃 — 연속 기록이 쌓일수록 커지는 불꽃
                PixelIcon(.flame, size: 38, color: Color.accentPrimary)
                    .scaleEffect((flameGrow && !reduceMotion) ? 1.12 : 0.9, anchor: .bottom)
                    .shadow(color: Color.accentPrimary.opacity(0.55),
                            radius: (flameGrow && !reduceMotion) ? 16 : 7)
                    .animation(reduceMotion ? nil
                        : .easeInOut(duration: 1.3).repeatForever(autoreverses: true), value: flameGrow)

                // 영웅 — 아지트에서 자라는 영웅 (Lv30+ 갑옷 variant)
                HeroSprite(variant: 2, classType: nil, size: 74, color: Color.accentPrimary)
                    .offset(y: (heroBob && !reduceMotion) ? -3 : 0)
                    .animation(reduceMotion ? nil
                        : .easeInOut(duration: 2.2).repeatForever(autoreverses: true), value: heroBob)
            }
            .offset(y: -6)

            // 연속 불꽃 배지 (카운터 = micro)
            HStack(spacing: 4) {
                PixelIcon(.flame, size: 11, color: Color.accentPrimary)
                Text(OnboardingI18n.streakDays(lang, 7))
                    .typography(.micro)
                    .foregroundStyle(Color.textSecondary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Color.bgElevated, in: Capsule())
            .offset(y: 84)
        }
        .onAppear { flameGrow = true; heroBob = true }
    }
}

// MARK: - 2. 난이도 선택

private struct OnboardingDifficulty: View {
    @EnvironmentObject private var store: GameStore
    let onBack: () -> Void
    let onSelect: (GameMode) -> Void
    @State private var selected: GameMode?
    private var lang: Language { store.progress?.language ?? .ko }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text(OnboardingI18n.diffHeading(lang))
                    .typography(.title)
                    .foregroundStyle(Color.textPrimary)
                Text(OnboardingI18n.diffSub(lang))
                    .typography(.body)
                    .foregroundStyle(Color.textSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 56)

            Spacer()

            VStack(spacing: 10) {
                ForEach(GameMode.allCases, id: \.self) { mode in
                    modeCard(mode)
                }
            }

            Spacer()

            OnboardingBottomBar(onBack: onBack, title: OnboardingI18n.next(lang), enabled: selected != nil) {
                if let selected { onSelect(selected) }
            }
        }
        .padding(.horizontal, 32)
        .padding(.bottom, 40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func modeCard(_ mode: GameMode) -> some View {
        let isSel = selected == mode
        return Button {
            selected = mode
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(label(mode))
                        .typography(.heading)
                        .foregroundStyle(isSel ? Color.bgPrimary : Color.textPrimary)
                    Text(desc(mode))
                        .typography(.caption)
                        .foregroundStyle(isSel ? Color.bgPrimary.opacity(0.7) : Color.textTertiary)
                }
                Spacer()
                Text(OnboardingI18n.cardsPerDay(lang, mode.cardCount))
                    .typography(.caption)
                    .foregroundStyle(isSel ? Color.bgPrimary.opacity(0.7) : Color.textTertiary)
            }
            .padding(16)
            .frame(maxWidth: .infinity)
            .background(isSel ? Color.accentPrimary : Color.bgSurface,
                        in: RoundedRectangle(cornerRadius: 12))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func label(_ m: GameMode) -> String {
        switch m {
        case .normal:  return OnboardingI18n.diffNormal(lang)
        case .godlife: return OnboardingI18n.diffGodlife(lang)
        case .ultra:   return OnboardingI18n.diffUltra(lang)
        }
    }

    private func desc(_ m: GameMode) -> String {
        switch m {
        case .normal:  return OnboardingI18n.diffNormalDesc(lang)
        case .godlife: return OnboardingI18n.diffGodlifeDesc(lang)
        case .ultra:   return OnboardingI18n.diffUltraDesc(lang)
        }
    }
}

// MARK: - 3. 스타터 팩 선택

private struct OnboardingStarterPack: View {
    @EnvironmentObject private var store: GameStore
    let onBack: () -> Void
    let onSelect: (String) -> Void
    @State private var selectedId: String?
    @State private var revealing = false
    private var lang: Language { store.progress?.language ?? .ko }

    var body: some View {
        if revealing, let id = selectedId,
           let pack = StarterPacks.all.first(where: { $0.id == id }) {
            revealView(pack)
        } else {
            selectView
        }
    }

    private var selectView: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text(OnboardingI18n.starterHeading(lang))
                    .typography(.title)
                    .foregroundStyle(Color.textPrimary)
                Text(OnboardingI18n.starterSub(lang))
                    .typography(.body)
                    .foregroundStyle(Color.textSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 56)

            Spacer()

            VStack(spacing: 10) {
                ForEach(StarterPacks.all) { pack in
                    packCard(pack)
                }
            }

            Spacer()

            OnboardingBottomBar(onBack: onBack, title: OnboardingI18n.starterOpenPack(lang),
                                enabled: selectedId != nil) {
                withAnimation(.easeInOut(duration: 0.2)) { revealing = true }
            }
        }
        .padding(.horizontal, 32)
        .padding(.bottom, 40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func packCard(_ pack: StarterPack) -> some View {
        let isSel = selectedId == pack.id
        return Button {
            selectedId = pack.id
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text(pack.localizedName(lang))
                    .typography(.body)
                    .foregroundStyle(isSel ? Color.bgPrimary : Color.textPrimary)
                Text(pack.localizedDescription(lang))
                    .typography(.caption)
                    .foregroundStyle(isSel ? Color.bgPrimary.opacity(0.7) : Color.textTertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(isSel ? Color.accentPrimary : Color.bgSurface,
                        in: RoundedRectangle(cornerRadius: 12))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func revealView(_ pack: StarterPack) -> some View {
        let cards = CardCatalog.cards(ids: pack.cardIds)
        return VStack(spacing: 0) {
            Spacer()
            VStack(spacing: 4) {
                Text(pack.localizedName(lang))
                    .typography(.title)
                    .foregroundStyle(Color.accentPrimary)
                Text(OnboardingI18n.starterReveal(lang))
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
                    .multilineTextAlignment(.center)
            }
            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3),
                spacing: 10
            ) {
                ForEach(cards) { card in
                    revealCard(card)
                }
            }
            .padding(.top, 24)
            Spacer()
            OnboardingBottomBar(
                onBack: { withAnimation(.easeInOut(duration: 0.2)) { revealing = false } },
                title: OnboardingI18n.start(lang)
            ) {
                onSelect(pack.id)
            }
        }
        .padding(.horizontal, 32)
        .padding(.bottom, 40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func revealCard(_ card: ChallengeCard) -> some View {
        VStack(spacing: 6) {
            Text(card.rarity.displayName)
                .typography(.micro)
                .foregroundStyle(Color.bgPrimary)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(card.rarity.color, in: Capsule())
            Text(card.localizedTitle(.current))
                .typography(.micro)
                .foregroundStyle(Color.textPrimary)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .padding(.horizontal, 6)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - 공통 하단 바 (좌: 아이콘 백버튼 · 우: 진행 버튼)

private struct OnboardingBottomBar: View {
    var onBack: (() -> Void)? = nil
    let title: String
    var enabled: Bool = true
    let action: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            if let onBack {
                Button(action: onBack) {
                    PixelIcon(.chevronLeft, size: 17, color: Color.textSecondary)
                        .frame(width: 52, height: 52)
                        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.unPress)   // 아이콘 스퀘어 — 채움/치수 유지, 공통 press 어포던스만.
                .accessibilityLabel(Text("Back"))
            }
            // 공용 primary — 화면마다 복붙되던 OnboardingPrimaryButton 흡수(13-button-system).
            UNButton(title, enabled: enabled, action: action)
        }
    }
}
