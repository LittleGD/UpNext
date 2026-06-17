//
//  UpHeroGameView.swift
//  UpNext — Up Hero RPG 루트 화면 (Phase 4 슬라이스 14 · Phase 4.4 시작).
//
//  웹 components/uphero/UpHeroGame.tsx 포팅. 웹은 currentSession.status 로 화면을
//  분기한다 — 세션이 없으면 아지트(Camp), 진행 중이면 던전(전투).
//
//  슬라이스 14~17 — 아지트(영웅 요약·스탯 패널·던전 선택). 전투·상점·장비·전직·
//  스킬은 이후 슬라이스에서 채운다. 그때 currentSession 분기에 던전 뷰가 들어온다.
//

import SwiftUI
import Combine

struct UpHeroGameView: View {
    @EnvironmentObject private var upHero: UpHeroStore

    var body: some View {
        // 웹 UpHeroGame 의 currentSession 분기 — 세션이 있으면 던전(전투), 없으면 아지트.
        // UpHeroStore 초기화·idle accrual 은 GameStore.bootstrapUpHero 가 앱 부팅
        // 시점(.ready)에 처리한다 — 이 화면 진입과 무관 (idle 은 "앱 닫은 사이" 기준).
        if upHero.state.currentSession != nil {
            DungeonView()
        } else {
            CampView()
        }
    }
}

// MARK: - 아지트 (Camp)

/// Up Hero 의 허브 화면. 웹 CampPlaceholder.
/// 슬라이스 17 — 아지트 홈(영웅 요약·코인·메뉴) ↔ 던전 선택 내부 전환.
/// 상점·장비 인벤토리는 이후 슬라이스에서 메뉴에 연결된다.
private struct CampView: View {
    @EnvironmentObject private var upHero: UpHeroStore
    @EnvironmentObject private var store: GameStore
    @State private var statsOpen = false
    @State private var screen: CampScreen = .home
    /// 웹 playground 의 두 탭 [영웅 / 카드매치] — 아지트 홈 상단 세그먼트.
    @State private var campTab: CampTab = .hero
    /// 카드매치 런 시트 — startMinigame() 으로 티켓 소비 성공 시 true.
    @State private var showMinigame = false

    /// 아지트 내부 화면 — 웹 CampPlaceholder 의 `view` 상태(home/dungeons/…) 대응.
    /// P0-3 — `.weekly` 추가 (WeeklyLeaderboardView 진입 경로 회복).
    private enum CampScreen { case home, dungeons, equipment, shop, classChoice, codex, weekly }
    /// 웹 src/app/playground/page.tsx TABS=[uphero, game] 이식.
    private enum CampTab { case hero, game }

    var body: some View {
        Group {
            if let prep = upHero.state.pendingDungeon {
                // 던전 진입 준비 중 — 버프 드로우가 다른 화면보다 우선 (웹 CampPlaceholder
                // 의 pendingDungeon 우선 분기와 동일). 취소하면 던전 선택으로 복귀.
                BuffDrawPanel(prep: prep)
            } else {
                switch screen {
                case .home:
                    campHome
                case .dungeons:
                    DungeonSelectView(onBack: { screen = .home })
                case .equipment:
                    EquipmentInventoryView(onBack: { screen = .home })
                case .shop:
                    ShopView(onBack: { screen = .home })
                case .classChoice:
                    ClassChoiceView(onBack: {
                        upHero.acknowledgeClassChoice()  // 전직 안 하고 닫음 → 제안 소비
                        screen = .home
                    })
                case .codex:
                    CodexView(onBack: { screen = .home })
                case .weekly:
                    // P0-3 — 데이터는 후속 슬라이스에서 Firestore 연동. 현재 mock + affix.
                    // 주간 affix 는 오늘 날짜 weekId 기반 결정론.
                    WeeklyLeaderboardView(
                        onBack: { screen = .home },
                        entries: WeeklyLeaderboardView.mockEntries,
                        affixName: WeeklyAffixes.pickWeeklyAffix(
                            weekId: RetentionEngine.weekId(for: AppClock.todayString())
                        ).name
                    )
                }
            }
        }
        .sheet(isPresented: $statsOpen) { HeroStatPanel() }
        .onAppear {
            // UITest — 스탯/스킬트리 패널 자동 오픈(검증용).
            if ProcessInfo.processInfo.arguments.contains("UITestOpenStats") {
                statsOpen = true
            }
        }
        // Lv.30 자동 전직 제안 — pendingClassChoice 가 set 되면 전직 화면으로 자동 진입.
        // (웹 ClassChoiceModal 자동 트리거 패리티. 이전엔 set 만 되고 아무도 안 읽던 dead write.)
        .onChange(of: upHero.state.pendingClassChoice != nil) { pending in
            if pending, screen != .classChoice { screen = .classChoice }
        }
        .onAppear {
            if upHero.state.pendingClassChoice != nil { screen = .classChoice }
        }
    }

    // MARK: 아지트 홈 (웹 CampPlaceholder HomeView — 중앙 hero 공간 + 하단 CTA 스택)
    //  GB 팔레트는 GBPalette (단일 출처) 참조.

    private var campHome: some View {
        // 웹 playground IA: [영웅/카드매치] 탭이 페이지 최상단(헤더 위). 영웅 헤더(nameplate)는
        // 영웅 탭 안에서만 — 카드매치 탭 위에 영웅 Lv/코인이 안 뜨도록 (맥락 충돌 해소).
        VStack(spacing: 0) {
            campTabBar
                .padding(.horizontal, 16)
                .padding(.top, 14)
            if campTab == .hero {
                heroTab
            } else {
                gameTab
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
        .sheet(isPresented: $showMinigame) { MinigameView() }
    }

    // MARK: 영웅 탭 — nameplate → 중앙 hero+분위기 → CTA → (하단) 일일 리텐션.
    //  웹 CampPlaceholder hierarchy(영웅 헤더 → flex-1 중앙 hero → CTA) 복원.
    //  리텐션(불꽃/리포트/듀오)은 RPG 동선을 막지 않게 최하단 별도 섹션으로 분리.

    private var heroTab: some View {
        ScrollView {
            VStack(spacing: 16) {
                header
                if upHero.state.idleReward != nil {
                    idleRewardBanner
                }
                heroCampSpace
                    .frame(height: 260)
                ctaStack
                // 일일 리텐션 — 영웅 RPG 와 성격이 다른 매일-반복 행동이라 하단에 분리.
                VStack(alignment: .leading, spacing: 10) {
                    Text("오늘의 기록")
                        .typography(.caption)
                        .foregroundStyle(Color.textTertiary)
                    RetentionSectionView()
                }
                .padding(.top, 6)
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 96)   // 하단 플로팅 네비 여유
        }
    }

    // MARK: 카드매치 탭 — 웹 MinigameHome(idle) 패리티. 티켓 보유 시 시작, 런은 시트.

    private var gameTab: some View {
        let tickets = store.progress?.tickets ?? 0
        return VStack(spacing: 18) {
            Spacer(minLength: 0)
            PixelIcon(.gamepad, size: 56,
                      color: tickets > 0 ? Color.accentPrimary : Color.textTertiary)
            VStack(spacing: 6) {
                Text("카드 맞추기")
                    .typography(.title)
                    .foregroundStyle(Color.textPrimary)
                Text(tickets > 0
                     ? "티켓 \(tickets)장 · 3라운드 메모리 매치로 카드를 모아요"
                     : "티켓이 없어요 · 챌린지를 완료하면 받아요")
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }
            Button {
                if store.startMinigame() { showMinigame = true }
            } label: {
                Text("시작하기")
                    .typography(.body)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .foregroundStyle(Color.bgPrimary)
                    .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 12))
                    .opacity(tickets > 0 ? 1 : 0.3)
            }
            .buttonStyle(.plain)
            .disabled(tickets == 0)
            .padding(.horizontal, 32)
            Spacer(minLength: 0)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, 90)
    }

    // MARK: 아지트 탭 세그먼트 [영웅 / 카드매치] (디자인 룰: 보더·아이콘 박스 금지)

    private var campTabBar: some View {
        HStack(spacing: 8) {
            campTabButton("영웅", tab: .hero)
            campTabButton("카드매치", tab: .game)
            Spacer(minLength: 0)
        }
    }

    private func campTabButton(_ label: String, tab: CampTab) -> some View {
        Button {
            SoundPlayer.shared.play(.select)
            campTab = tab
        } label: {
            Text(label)
                .typography(.caption)
                .foregroundStyle(campTab == tab ? Color.bgPrimary : Color.textTertiary)
                .padding(.horizontal, 16)
                .frame(height: 34)
                .background(campTab == tab ? Color.accentPrimary : Color.bgSurface, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    // MARK: 영웅 캠프 공간 — sprite + 그림자 + 분위기 텍스트 (웹 HomeView <section flex-1>)

    private var heroCampSpace: some View {
        let hero = upHero.state.hero
        let variant = UpHeroRules.getHeroAppearanceVariant(level: heroLevel)
        let spriteColor = HeroSprite.themeColor(hero.classType)
        return ZStack {
            // 배경 별/이펙트 — radial(GB.dark @ 50%/70%, opacity 30%) (웹 L:367-372)
            RadialGradient(colors: [GBPalette.dark.opacity(0.4), .clear],
                           center: UnitPoint(x: 0.5, y: 0.7), startRadius: 0, endRadius: 240)
                .opacity(0.3)
                .allowsHitTesting(false)
            VStack(spacing: 0) {
                // 픽셀 영웅 sprite — 탭하면 스탯 패널 (웹 uphero-hero-tap scale 0.97)
                Button {
                    SoundPlayer.shared.play(.select)
                    statsOpen = true
                } label: {
                    ZStack(alignment: .bottom) {
                        HeroSprite(variant: variant, classType: hero.classType,
                                   size: 80, color: spriteColor)
                        // 발 밑 그림자 타원 (웹 L:402-410)
                        Ellipse().fill(GBPalette.dark).frame(width: 40, height: 4)
                            .opacity(0.6).offset(y: 5)
                    }
                }
                .buttonStyle(HeroTapStyle())
                // 영웅 탭 안내 chip (웹 uphero-stats-hint, L:423-442)
                Button {
                    SoundPlayer.shared.play(.select)
                    statsOpen = true
                } label: {
                    HStack(spacing: 4) {
                        PixelIcon(.user, size: 10, color: GBPalette.lightest)
                        Text(hero.classType != nil ? "스탯 · 스킬" : "영웅 정보")
                            .typography(.micro)
                            .foregroundStyle(GBPalette.lightest)
                            .tracking(0.5)
                    }
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(GBPalette.dark.opacity(0.67), in: RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6)
                        .strokeBorder(GBPalette.light.opacity(0.4), lineWidth: 1))
                }
                .buttonStyle(.plain)
                .padding(.top, 10)
                // 분위기 텍스트 — crossfade + fire flicker (웹 L:444-462)
                AmbientFlickerText()
                    .padding(.top, 20)
            }
        }
    }

    // MARK: 하단 CTA 스택 (웹 HomeView <section> PrimaryCTA + SecondaryCTA ×3)

    private var totalPasses: Int { upHero.state.passes.values.reduce(0, +) }

    private var ctaStack: some View {
        VStack(spacing: 8) {
            if classEligible {
                campCTA(icon: .sparkle, label: "전직", hint: "Lv.30 — 전문 클래스 선택",
                        primary: true) { screen = .classChoice }
            }
            // PrimaryCTA — 탐험 시작 (탐험권 0 이면 상점으로) (웹 L:481-499)
            campCTA(icon: .target,
                    label: totalPasses > 0 ? "탐험 시작" : "탐험권 구매",
                    hint: totalPasses > 0 ? "던전을 골라 출발" : "상점에서 구매",
                    badge: totalPasses > 0 ? "×\(totalPasses)" : nil,
                    primary: true) {
                SoundPlayer.shared.play(.select)
                if totalPasses > 0 { screen = .dungeons } else { screen = .shop }
            }
            campCTA(icon: .shoppingBag, label: "상점", hint: "코인으로 카드팩·탐험권") {
                SoundPlayer.shared.play(.select); screen = .shop
            }
            campCTA(icon: .shield, label: "장비", hint: "장착·판매·정리") {
                SoundPlayer.shared.play(.select); screen = .equipment
            }
            campCTA(icon: .bookOpen, label: "도감", hint: "몬스터·보스·장비 발견 현황") {
                SoundPlayer.shared.play(.select); screen = .codex
            }
            // P0-3 — 주간 리더보드 진입 (이전엔 enum 케이스 없어 절대 접근 불가).
            campCTA(icon: .trophy, label: "주간 순위", hint: "이번 주 변종 던전 상위") {
                SoundPlayer.shared.play(.select); screen = .weekly
            }
        }
    }

    private func campCTA(icon: PixelIconName, label: String, hint: String,
                         badge: String? = nil, primary: Bool = false,
                         action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                PixelIcon(icon, size: 16, color: primary ? Color.bgPrimary : GBPalette.light)
                    .frame(width: 22)
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 6) {
                        Text(label)
                            .typography(.body)
                            .foregroundStyle(primary ? Color.bgPrimary : Color.textPrimary)
                        if let badge {
                            Text(badge)
                                .typography(.micro)
                                .foregroundStyle(primary ? Color.bgPrimary.opacity(0.8) : Color.accentPrimary)
                                .padding(.horizontal, 5).padding(.vertical, 1)
                                .background((primary ? Color.bgPrimary.opacity(0.18) : Color.bgElevated),
                                            in: Capsule())
                        }
                    }
                    Text(hint)
                        .typography(.caption)
                        .foregroundStyle(primary ? Color.bgPrimary.opacity(0.7) : Color.textTertiary)
                }
                Spacer(minLength: 0)
                PixelIcon(.chevronRight, size: 13,
                          color: primary ? Color.bgPrimary.opacity(0.6) : Color.textTertiary)
            }
            .padding(14)
            .frame(maxWidth: .infinity)
            .background(primary ? Color.accentPrimary : Color.bgSurface,
                        in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    // MARK: 오프라인 수련 보상 토스트 (웹 IdleRewardToast)

    /// idle accrual 결과가 있으면 표시. 확인하면 acknowledgeIdleReward 로 사라진다.
    @ViewBuilder private var idleRewardBanner: some View {
        if let reward = upHero.state.idleReward {
            VStack(alignment: .leading, spacing: 8) {
                Text("영웅의 수련 성과")
                    .typography(.caption)
                    .foregroundStyle(Color.accentPrimary)
                Text("영웅이 \(IdleAccrual.formatElapsed(reward.elapsedMin)) 동안 수련했어요")
                    .typography(.body)
                    .foregroundStyle(Color.textPrimary)
                HStack(spacing: 14) {
                    Text("경험치 +\(reward.xp)")
                        .typography(.caption)
                        .foregroundStyle(Color.textSecondary)
                    Text("코인 +\(reward.coins)")
                        .typography(.caption)
                        .foregroundStyle(Color.textSecondary)
                }
                Button {
                    upHero.acknowledgeIdleReward()
                } label: {
                    Text("확인")
                        .typography(.caption)
                        .foregroundStyle(Color.bgPrimary)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 7)
                        .background(Color.accentPrimary, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 12))
        }
    }

    /// 영웅 전용 레벨 — 챌린지 레벨 기반. 웹 getEffectiveHeroLevel.
    private var heroLevel: Int {
        UpHeroRules.getEffectiveHeroLevel(
            gameLevel: store.progress?.level ?? 1,
            heroStartLevel: upHero.state.heroStartLevel)
    }

    // MARK: 헤더 — 영웅 nameplate (웹 CampPlaceholder 헤더: 영웅 이름 + 영웅 Lv + XP + NG+ + 코인)

    /// 글로벌 AppHeader 가 아지트 탭에서 숨겨졌으므로(MainShell), 이 헤더가 아지트의 유일한
    /// Lv 표기다. 따라서 **영웅 레벨(heroLevel)**을 보여 게임 레벨과 의미적으로 구분한다.
    /// 단 XP 진행률(curXp/needXp)은 게임 레벨 기준으로 계산해야 진행바가 정확하다
    /// (영웅 Lv 진행률 % == 게임 Lv 진행률 %, 웹 CampPlaceholder 와 동일 로직).
    private var header: some View {
        let hero = upHero.state.hero
        let heroName = hero.name.isEmpty ? "갓생 영웅" : hero.name
        let gameLevel = store.progress?.level ?? 0
        let xp = store.progress?.xp ?? 0
        let curXp = max(0, xp - GameRules.totalXPForLevel(gameLevel))
        let needXp = max(1, GameRules.totalXPForLevel(gameLevel + 1) - GameRules.totalXPForLevel(gameLevel))
        let ngPlus = upHero.state.ngPlusLevel ?? 0
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                // 영웅 정체성 (이름) — 핵심 정보라 heading 급.
                Text(heroName)
                    .typography(.heading)
                    .foregroundStyle(Color.textPrimary)
                    .lineLimit(1)
                // 영웅 레벨 — 'Lv'만이 아니라 '영웅 Lv'로 명시해 게임 레벨과 구분.
                Text("영웅 Lv.\(heroLevel)")
                    .typography(.caption)
                    .foregroundStyle(Color.accentPrimary)
                if ngPlus > 0 {
                    // NG+ 배지 — micro 는 배지 전용(타이포 규칙). 보더 금지.
                    Text("NG+\(ngPlus)")
                        .typography(.micro)
                        .foregroundStyle(Color.bgPrimary)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color.rarityLegend, in: Capsule())
                }
                Spacer(minLength: 0)
                HStack(spacing: 4) {
                    PixelIcon(.coins, size: 15, color: Color.accentPrimary)
                    NumberRollView(value: upHero.state.coins, baseColor: Color.accentPrimary)
                        .typography(.body)
                }
            }
            // XP 진행 바 + 수치 (게임레벨 기준 · 디자인 룰: 보더 금지)
            HStack(spacing: 8) {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color.bgElevated)
                        Capsule().fill(Color.accentPrimary)
                            .frame(width: geo.size.width * min(1, Double(curXp) / Double(needXp)))
                    }
                }
                .frame(height: 5)
                Text("\(curXp)/\(needXp) XP")
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
                    .monospacedDigit()
            }
        }
    }

    // MARK: 전직 가능 여부

    /// Lv.30 도달 + 미전직이면 전직 가능 — 웹 ClassChoiceModal 트리거 조건.
    private var classEligible: Bool {
        heroLevel >= 30 && upHero.state.hero.classType == nil
    }
}

// MARK: - 영웅 탭 프레스 스타일 (웹 uphero-hero-tap: scale 0.97 on active)

private struct HeroTapStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

// MARK: - 분위기 텍스트 (웹 ambience crossfade + fire flicker)

/// 캠프 분위기 한 줄 — 15줄 풀에서 20s 주기 교체(uphero-ambience-in 520ms blur+translateY)
/// + 상시 fire-flicker(uphero-fire-flicker 4.2s opacity+warm shadow). 웹 globals.css L:667-705.
private struct AmbientFlickerText: View {
    /// 웹 i18n ko `uphero.camp.ambience.1~15` 그대로 (디바이스 한국어 기준).
    private static let lines = [
        "모닥불이 조용히 타오른다", "장작이 탁, 하고 튀었다", "재 속에서 붉은 숨이 깜빡인다",
        "연기가 느리게 하늘로 번진다", "불씨 하나가 바람을 따라 올라갔다", "주전자가 나지막이 끓고 있다",
        "지도를 다시 펼쳐본다", "천막 너머로 별이 번진다", "바람이 먼 곳에서 불어온다",
        "밤이 한 겹 더 깊어졌다", "발자국 소리가 멀어진다", "무기의 날을 한 번 갈아둔다",
        "오늘의 피로가 천천히 가신다", "모닥불 그림자가 길게 늘어진다", "여행자의 일기에 한 줄을 적는다",
    ]
    private static let warm = Color(red: 0.910, green: 0.722, blue: 0.529)  // rgb(232,184,135)

    @State private var index = 0
    @State private var shown = true
    private let rotate = Timer.publish(every: 20, on: .main, in: .common).autoconnect()
    // 리뷰 #6 — reduce-motion 시 fire-flicker/crossfade 중단, 20s 텍스트만 즉시 교체.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if reduceMotion {
                Text("— \(Self.lines[index]) —")
                    .typography(.caption)
                    .foregroundStyle(GBPalette.light)
            } else {
                TimelineView(.animation) { tl in
                    let phase = tl.date.timeIntervalSinceReferenceDate
                        .truncatingRemainder(dividingBy: 4.2) / 4.2
                    let f = Self.fireFlicker(phase)
                    Text("— \(Self.lines[index]) —")
                        .typography(.caption)
                        .foregroundStyle(GBPalette.light)
                        // inner fire-flicker: opacity + warm text-shadow
                        .opacity(f.opacity)
                        .shadow(color: Self.warm.opacity(f.shadowOpacity), radius: f.shadowRadius)
                        // outer ambience-in: blur + translateY + opacity (key 교체 시 1회 재생)
                        .opacity(shown ? 1 : 0)
                        .blur(radius: shown ? 0 : 2.5)
                        .offset(y: shown ? 0 : -3)
                }
            }
        }
        .onAppear { index = Int.random(in: 0..<Self.lines.count) }
        .onReceive(rotate) { _ in
            var n = Int.random(in: 0..<Self.lines.count)
            if n == index { n = (n + 1) % Self.lines.count }
            index = n
            guard !reduceMotion else { return }
            shown = false
            DispatchQueue.main.async {
                withAnimation(.timingCurve(0.23, 1, 0.32, 1, duration: 0.52)) { shown = true }
            }
        }
    }

    /// 웹 uphero-fire-flicker keyframe (4.2s): 0/100%→op0.82 r4 o0.15, 45%→op1 r8 o0.45, 62%→op0.88 r5 o0.2.
    private static func fireFlicker(_ p: Double) -> (opacity: Double, shadowRadius: CGFloat, shadowOpacity: Double) {
        func lerp(_ a: Double, _ b: Double, _ t: Double) -> Double { a + (b - a) * t }
        if p < 0.45 {
            let t = p / 0.45
            return (lerp(0.82, 1.0, t), CGFloat(lerp(4, 8, t)), lerp(0.15, 0.45, t))
        } else if p < 0.62 {
            let t = (p - 0.45) / (0.62 - 0.45)
            return (lerp(1.0, 0.88, t), CGFloat(lerp(8, 5, t)), lerp(0.45, 0.2, t))
        } else {
            let t = (p - 0.62) / (1.0 - 0.62)
            return (lerp(0.88, 0.82, t), CGFloat(lerp(5, 4, t)), lerp(0.2, 0.15, t))
        }
    }
}
