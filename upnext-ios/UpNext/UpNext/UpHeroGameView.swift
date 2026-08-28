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
    @State private var showTutorial = false
    @State private var screen: CampScreen = .home
    /// 웹 playground 의 두 탭 [영웅 / 카드매치] — 아지트 홈 상단 세그먼트.
    @State private var campTab: CampTab = .hero
    /// 카드매치 런(fullScreenCover) — startMinigame() 으로 티켓 소비 성공 시 true.
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
                    // 17-leaderboard-dummy — mock 제거. weekId 를 넘겨 뷰가 Firestore 실데이터를
                    // fetch 한다(fetchWeeklyTop + fetchMyRank). affix 는 weekId 기반 결정론.
                    WeeklyLeaderboardView(
                        onBack: { screen = .home },
                        weekId: RetentionEngine.weekId(for: AppClock.todayString()),
                        affixName: WeeklyAffixes.pickWeeklyAffix(
                            weekId: RetentionEngine.weekId(for: AppClock.todayString())
                        ).name
                    )
                }
            }
        }
        .sheet(isPresented: $statsOpen) { HeroStatPanel() }
        // 아지트 첫 진입 튜토리얼 — hasSeenCampTutorial=false 일 때 1회 노출(웹 패리티).
        .overlay {
            if showTutorial {
                CampTutorialOverlay(onClose: { showTutorial = false })
                    .transition(.opacity)
                    .zIndex(50)
            }
        }
        .onAppear {
            #if DEBUG
            // UITest 전용 — 스탯/스킬트리 패널 자동 오픈(검증용, 출시 바이너리엔 비포함).
            let uiTestOpenStats = ProcessInfo.processInfo.arguments.contains("UITestOpenStats")
            if uiTestOpenStats { statsOpen = true }
            // 17-leaderboard-dummy 검증 — 주간 리더보드 화면 바로 진입(실데이터 상태머신 확인용).
            if ProcessInfo.processInfo.arguments.contains("UITestCampWeekly") { screen = .weekly }
            // 아지트 서브화면 바로 진입(i18n·도감 검증용). 출시 바이너리엔 비포함.
            let campArgs = ProcessInfo.processInfo.arguments
            if campArgs.contains("UITestOpenCodex") { screen = .codex }
            if campArgs.contains("UITestOpenShop") { screen = .shop }
            if campArgs.contains("UITestOpenGear") { screen = .equipment }
            if campArgs.contains("UITestOpenDungeons") { screen = .dungeons }
            // 카드매치 탭 바로 진입(런 프레젠테이션 검증용). 티켓은 UITestSeedTickets 로.
            if campArgs.contains("UITestCampGame") { campTab = .game }
            #else
            let uiTestOpenStats = false
            #endif
            // 첫 진입 온보딩 — 아직 안 본 경우에만. (DEBUG 스탯 검증 중엔 충돌 방지로 건너뜀)
            if !(upHero.state.hasSeenCampTutorial ?? false), !uiTestOpenStats {
                showTutorial = true
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
        // 앰비언트 노출(요인1) — 화면 루트 투명화. MainShell 바닥의 오로라·별이 관통(웹 main z-[1] 패리티).
        // 전투(DungeonView)·미니게임(MinigameView) 풀스크린은 별도 몰입 배경이라 불투명 유지.
        // 카드매치 런은 fullScreenCover — .sheet 는 아래로 드래그하면 시트째 내려가며
        // 런이 강제 종료된다(티켓은 이미 소모, 획득 XP/카드는 awardMinigameWin 을 못 거쳐
        // 소멸). 보상 화면(roundResult/rewardDraft/runResult)도 같은 프레젠테이션 안이라
        // '받기' 전에 드래그로 빠지면 보상이 통째로 날아갔다. 종료 경로는 HUD 의 X
        // (finishRun = 부분 정산) 와 결과 화면 '받기' 두 개만 남긴다.
        .fullScreenCover(isPresented: $showMinigame) { MinigameView() }
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
                // 리텐션(불꽃/리포트/2인불꽃)은 전용 '불꽃' 탭으로 분리됨 — 아지트는 순수 RPG 허브.
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 96)   // 하단 플로팅 네비 여유
        }
    }

    // MARK: 카드매치 탭 — 웹 MinigameHome.tsx 패리티.
    //  타이틀+subtitle → 티켓 카운터 카드 → 전체폭 Play hero CTA → (티켓0)빈상태 →
    //  통계 그리드(runs/best) → How-to-play 3줄. 런은 fullScreenCover(드래그 dismiss 차단).

    private var gameTab: some View {
        let tickets = store.progress?.tickets ?? 0
        let canPlay = tickets > 0
        return ScrollView {
            VStack(spacing: 20) {
                // 타이틀 (웹 typo-display + subtitle)
                VStack(spacing: 6) {
                    Text(AppConfig.loc("카드 맞추기"))
                        .typography(.display).foregroundStyle(Color.textPrimary)
                    Text(AppConfig.loc("3라운드 메모리 매치로 카드를 모아요"))
                        .typography(.body).foregroundStyle(Color.textSecondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 20)

                // 티켓 카운터 — read-only 정보 카드 (coins 아이콘 + count/CAP)
                HStack(spacing: 12) {
                    PixelIcon(.coins, size: 32, color: Color.accentSecondary)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(AppConfig.loc("보유 티켓"))
                            .typography(.caption).foregroundStyle(Color.textTertiary)
                        HStack(alignment: .firstTextBaseline, spacing: 3) {
                            Text("\(tickets)")
                                .typography(.title).foregroundStyle(Color.textPrimary).monospacedDigit()
                            Text("/ \(GameConstants.minigameTicketCap)")
                                .typography(.caption).foregroundStyle(Color.textTertiary).monospacedDigit()
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(16)
                .frame(maxWidth: .infinity)
                .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))

                // Play hero CTA — 전체폭, 52 높이 (웹 min-h52 + scale0.97)
                Button {
                    Haptics.play(.selection)
                    if store.startMinigame() { showMinigame = true }
                    else { SoundPlayer.shared.play(.cancel) }
                } label: {
                    HStack(spacing: 8) {
                        PixelIcon(.play, size: 20, color: canPlay ? Color.bgPrimary : Color.textTertiary)
                        Text(AppConfig.loc("플레이"))
                            .typography(.title)
                            .foregroundStyle(canPlay ? Color.bgPrimary : Color.textTertiary)
                    }
                    .frame(maxWidth: .infinity).frame(minHeight: 52)
                    .background(canPlay ? Color.accentPrimary : Color.bgElevated,
                                in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.unPress)
                .disabled(!canPlay)

                // 티켓0 빈상태 카드
                if tickets == 0 {
                    VStack(spacing: 10) {
                        PixelIcon(.warningDiamond, size: 28, color: Color.accentSecondary)
                        VStack(spacing: 3) {
                            Text(AppConfig.loc("티켓이 없어요"))
                                .typography(.body).foregroundStyle(Color.textPrimary)
                            Text(AppConfig.loc("챌린지를 완료하면 티켓을 받아요"))
                                .typography(.caption).foregroundStyle(Color.textTertiary)
                                .multilineTextAlignment(.center)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(16)
                    .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
                }

                // 통계 그리드 (runs / best)
                // 그룹 등고(패턴 A + fixedSize) — 라벨이 언어별로 1줄/2줄이 갈려도 두 카드 높이 동일.
                HStack(spacing: 12) {
                    statCard(AppConfig.loc("플레이 횟수"), store.progress?.minigameRunsPlayed ?? 0)
                    statCard(AppConfig.loc("최고 매치"), store.progress?.minigameBestMatches ?? 0)
                }
                .fixedSize(horizontal: false, vertical: true)

                // How-to-play 3줄
                VStack(alignment: .leading, spacing: 10) {
                    Text(AppConfig.loc("플레이 방법"))
                        .typography(.title).foregroundStyle(Color.textPrimary)
                    ForEach([
                        AppConfig.loc("카드를 뒤집어 같은 짝을 맞추세요"),
                        AppConfig.loc("스킬 카드는 기회를, 저주 카드는 위험을 줘요"),
                        AppConfig.loc("라운드를 클리어하면 보상을 골라요"),
                    ], id: \.self) { line in
                        HStack(alignment: .top, spacing: 8) {
                            Text("•").foregroundStyle(Color.accentPrimary)
                            Text(line).typography(.caption).foregroundStyle(Color.textSecondary)
                            Spacer(minLength: 0)
                        }
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 96)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// 카드매치 통계 카드 (웹 stats grid runs/best).
    private func statCard(_ label: String, _ value: Int) -> some View {
        VStack(spacing: 4) {
            Text(label).typography(.caption).foregroundStyle(Color.textTertiary)
            Text("\(value)").typography(.heading).foregroundStyle(Color.textPrimary).monospacedDigit()
        }
        // 그룹 등고(패턴 A) — 라벨 줄 수가 갈려도 두 통계 카드가 같은 높이.
        .unCardCell(minHeight: CardHeights.statCard)
        .padding(.vertical, 16)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: 아지트 탭 세그먼트 [영웅 / 카드매치] (디자인 룰: 보더·아이콘 박스 금지)

    // 이슈#26 — 라임 채운 캡슐 세그먼트를 웹 sliding-underline(EquipmentInventory:473-504
    // 패리티)으로 교체. 하단 네비 라임 캡슐과 형태를 분리해 세그먼트 위계를 복원한다.
    private var campTabBar: some View {
        HStack(spacing: 0) {
            campTabButton(AppConfig.loc("영웅"), tab: .hero)
            campTabButton(AppConfig.loc("카드매치"), tab: .game)
        }
        // 탭 하단 경계선 1px rgb(255 255 255 / 0.06).
        .background(alignment: .bottom) {
            Rectangle()
                .fill(Color.white.opacity(0.06))
                .frame(height: 1)
        }
        // sliding-underline — 2탭 균등폭, 폭=총폭/2, 240ms cubic-bezier(.23,1,.32,1).
        .overlay {
            GeometryReader { geo in
                let seg = geo.size.width / 2
                Rectangle()
                    .fill(Color.accentPrimary)
                    .frame(width: seg, height: 2)
                    .shadow(color: Color.accentPrimary.opacity(0.4), radius: 2)
                    .offset(x: (campTab == .hero ? 0 : seg))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                    .animation(.timingCurve(0.23, 1, 0.32, 1, duration: 0.24), value: campTab)
            }
        }
    }

    private func campTabButton(_ label: String, tab: CampTab) -> some View {
        Button {
            Haptics.play(.selection)   // ② 햅틱 페어링 — select 사운드 지점.
            SoundPlayer.shared.play(.select)
            campTab = tab
        } label: {
            Text(label)
                .typography(.body)
                .foregroundStyle(campTab == tab ? Color.accentPrimary : Color.textSecondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .contentShape(Rectangle())
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
                    Haptics.play(.selection)   // ② 햅틱 페어링 — select 사운드 지점.
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
                .buttonStyle(.unPress)
                // 영웅 탭 안내 chip (웹 uphero-stats-hint, L:423-442)
                Button {
                    Haptics.play(.selection)   // ② 햅틱 페어링 — select 사운드 지점.
                    SoundPlayer.shared.play(.select)
                    statsOpen = true
                } label: {
                    HStack(spacing: 4) {
                        PixelIcon(.user, size: 10, color: GBPalette.lightest)
                        Text(hero.classType != nil ? AppConfig.loc("스탯 · 스킬") : AppConfig.loc("영웅 정보"))
                            .typography(.micro)
                            .foregroundStyle(GBPalette.lightest)
                            .tracking(0.5)
                    }
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(GBPalette.dark.opacity(0.75), in: Capsule())  // 보더 금지 — 채움만
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
        VStack(spacing: 10) {
            if classEligible {
                campCTA(icon: .sparkle, label: AppConfig.loc("전직"), hint: AppConfig.loc("Lv.30 — 전문 클래스 선택"),
                        primary: true) { screen = .classChoice }
            }
            // PrimaryCTA — 탐험 시작 (탐험권 0 이면 상점으로). 유일한 강조 CTA(위계 단일화).
            campCTA(icon: .target,
                    label: totalPasses > 0 ? AppConfig.loc("탐험 시작") : AppConfig.loc("탐험권 구매"),
                    hint: totalPasses > 0 ? AppConfig.loc("던전을 골라 출발") : AppConfig.loc("상점에서 구매"),
                    badge: totalPasses > 0 ? "×\(totalPasses)" : nil,
                    primary: true) {
                Haptics.play(.selection)   // ② 햅틱 페어링 — select 사운드 지점.
                SoundPlayer.shared.play(.select)
                if totalPasses > 0 { screen = .dungeons } else { screen = .shop }
            }
            // 보조 액션 — 2열 그리드(부제목 제거)로 압축해 한 페이지 위계를 줄인다.
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10),
                                GridItem(.flexible(), spacing: 10)], spacing: 10) {
                campTile(.shoppingBag, AppConfig.loc("상점")) { screen = .shop }
                campTile(.shield, AppConfig.loc("장비")) { screen = .equipment }
                campTile(.bookOpen, AppConfig.loc("도감")) { screen = .codex }
                campTile(.trophy, AppConfig.loc("주간 순위")) { screen = .weekly }
            }
        }
    }

    /// 보조 CTA 컴팩트 타일 — 아이콘 + 라벨(부제목 없음). 디자인 룰: 보더·아이콘 박스 금지.
    private func campTile(_ icon: PixelIconName, _ label: String,
                         action: @escaping () -> Void) -> some View {
        Button {
            Haptics.play(.selection)   // ② 햅틱 페어링 — select 사운드 지점.
            SoundPlayer.shared.play(.select); action()
        } label: {
            HStack(spacing: 8) {
                PixelIcon(icon, size: 16, color: GBPalette.light)
                Text(label)
                    .typography(.body)
                    .foregroundStyle(Color.textPrimary)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            // 그룹 등고(패턴 A) — 2×2 타일이 같은 행에서 같은 높이.
            // 고정 height 였던 자리 — 긴 번역/Dynamic Type/iPad 에서 라벨이 잘리던 것도 해소.
            .unCardCell(minHeight: CardHeights.campTile)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
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
        let heroName = hero.name.isEmpty ? AppConfig.loc("갓생 영웅") : hero.name
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

// 영웅 탭 프레스는 공용 `.buttonStyle(.unPress)`(UNButtonStyle.swift)로 통합됨
// — 웹 uphero-hero-tap(scale 0.97) 규약을 앱 전역 press 스타일 하나로 흡수.

// MARK: - 분위기 텍스트 (웹 ambience crossfade + fire flicker)

/// 캠프 분위기 한 줄 — 15줄 풀에서 20s 주기 교체(uphero-ambience-in 520ms blur+translateY)
/// + 상시 fire-flicker(uphero-fire-flicker 4.2s opacity+warm shadow). 웹 globals.css L:667-705.
private struct AmbientFlickerText: View {
    /// 웹 i18n ko `uphero.camp.ambience.1~15` — *원문 키 배열*만 static 으로 두고, 실제
    /// 언어 해석은 렌더 시점에 `AppConfig.locRuntime(key)` 로 (19-i18n-mixed).
    /// static let 이 결과 문자열을 캐싱하면 첫 접근 시점 언어로 고정돼, 이후 인앱 언어
    /// 전환이 반영되지 않는다(웹 CampPlaceholder / MinigameView.pool 과 동일한 키-저장·
    /// 렌더시-재해석 패턴).
    private static let lineKeys = [
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
                Text("— \(AppConfig.locRuntime(Self.lineKeys[index])) —")
                    .typography(.caption)
                    .foregroundStyle(GBPalette.light)
            } else {
                TimelineView(.animation) { tl in
                    let phase = tl.date.timeIntervalSinceReferenceDate
                        .truncatingRemainder(dividingBy: 4.2) / 4.2
                    let f = Self.fireFlicker(phase)
                    Text("— \(AppConfig.locRuntime(Self.lineKeys[index])) —")
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
        .onAppear { index = Int.random(in: 0..<Self.lineKeys.count) }
        .onReceive(rotate) { _ in
            var n = Int.random(in: 0..<Self.lineKeys.count)
            if n == index { n = (n + 1) % Self.lineKeys.count }
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
