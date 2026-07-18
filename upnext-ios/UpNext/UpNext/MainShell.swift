//
//  MainShell.swift
//  UpNext — 메인 앱 셸 (Phase 4 슬라이스 6 · Phase 4.2 시작).
//
//  로그인·부트스트랩 완료(.ready) 후의 앱 구조:
//   AppHeader(상단 Lv·XP) + 탭별 화면 + BottomNav(하단 플로팅 네비).
//
//  웹 components/layout/BottomNav.tsx · Header.tsx 포팅. 탭 4종 —
//  챌린지/컬렉션/플레이그라운드/설정. 설정만 실제 화면이고 나머지는
//  Phase 4.2~4.4 다음 슬라이스에서 채워질 placeholder.
//
//  R-Effects(5/25): 웹 ClientEffects(globals) 의 글로벌 마운트 패리티 회복.
//   - BurningBorder(extra/super 활성 시) — 화면 가장자리 inner glow
//   - MeteorShower(super phase 활성·미완 시) — 우상→좌하 메테오
//   - PixelConfetti(챌린지 풀클리어 카운터 증가 시) — 픽셀 파티클 버스트
//   - PatchNotesModal — lastSeenPatchVersion 갱신 시 자동 1회 표시
//   - UpHeroLevelUpOverlay — GameStore.pendingLevelUp 발행 시 표시
//   - PhotoCaptureModal — GrowthStore.pendingCapture(Identifiable) 트리거 시
//

import SwiftUI

// MARK: - 탭 정의

enum MainTab: CaseIterable {
    // 순서 = 하단 네비 노출 순서. 데일리 루프(챌린지·불꽃) → RPG(아지트) → 컬렉션 → 설정.
    case challenge, record, playground, collection, settings

    /// LocalizedStringKey 라야 Text(tab.label)/accessibilityLabel(tab.label) 가
    /// 카탈로그를 lookup 한다. String 이면 Text(_:String) verbatim 오버로드라
    /// 카탈로그를 우회해 모든 언어에서 한국어가 그대로 노출됐다(P0).
    var label: LocalizedStringKey {
        switch self {
        case .challenge:  return "챌린지"
        case .record:     return "불꽃"
        case .collection: return "컬렉션"
        case .playground: return "아지트"
        case .settings:   return "설정"
        }
    }

    /// 탭 PixelIcon — 웹 `NAV_ICONS` (components/icons/index.ts) 1:1.
    /// R3 마감 — SF Symbol(checklist/rectangle.stack/…) 폐기.
    var pixelIcon: PixelIconName {
        switch self {
        case .challenge:  return .card           // NAV_ICONS.today = "Card"
        case .record:     return .flame           // 일일 불꽃/리텐션 허브
        case .collection: return .archive         // NAV_ICONS.collection = "Archive"
        case .playground: return .treePine        // NAV_ICONS.playground = "TreePine"
        case .settings:   return .moreHorizontal  // NAV_ICONS.settings = "MoreHorizontal"
        }
    }
}

// MARK: - 메인 셸

struct MainTabView: View {
    @EnvironmentObject private var store: GameStore
    @EnvironmentObject private var growth: GrowthStore
    // 11-buff-nav-overlap / 12-combat-parity — 전투 활성 여부로 하단 네비 가시성을 결정하기 위해
    // 앱 전역에 이미 주입된 UpHeroStore(UpNextApp.swift:45)를 참조.
    @EnvironmentObject private var upHero: UpHeroStore
    @State private var tab: MainTab = .challenge
    @State private var showPackOpener = false

    // R-Effects(5/25): 글로벌 효과 마운트 트리거 상태.
    /// PixelConfetti 발사 트리거 — daily/extra/super 완료 카운트가 증가했을 때 toggle.
    @State private var celebrate: Bool = false
    /// completedCount 변화 감지용 — 모든 phase 의 완료 카드 수 + 풀클리어 가산점.
    @State private var lastCompletedScore: Int = 0
    /// 패치 노트 모달 표시 — onAppear 에서 lastSeenPatchVersion 비교 후 true.
    @State private var showPatchNotes: Bool = false

    /// 마지막으로 본 패치 노트 버전 — UserDefaults 영속. 신규 버전 노트가 있으면 모달 1회 표시.
    @AppStorage("lastSeenPatchVersion") private var lastSeenPatchVersion: String = ""

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.bgPrimary.ignoresSafeArea()

            // 전 화면 앰비언트 — 웹 ClientEffects(AmbientBackground + PixelStars) 글로벌 마운트.
            AmbientBackground()
            PixelStars()

            VStack(spacing: 0) {
                // 이슈#26 — 상단 Lv/XP 헤더는 챌린지 탭에서만 노출. 아지트는 자체 hero
                // nameplate, 불꽃은 자체 RitualGreetingHeader, 컬렉션/설정은 자체 타이틀이
                // 있어 글로벌 Lv 헤더가 중복. 웹은 아지트만 완전 숨김 + collection/settings=compact
                // 규약이나, 사용자 결정으로 불꽃/설정/컬렉션도 상단 Lv/XP 인디케이터를 제거해
                // 세그먼트/필터/네비 3단 위계와 정보 출처를 정리한다. (챌린지=게임 Lv+XP 유지)
                if tab == .challenge {
                    AppHeader(showXP: true)
                }
                screen
            }

            // R-Effects: BurningBorder — extra/super 챌린지 phase 진행 중 가장자리 inner glow.
            // active phase 가 없으면 (.daily 또는 phase 완료) Color.clear 가 와도 비용 0.
            if let phase = activeBurningPhase {
                BurningBorder(phase: phase, active: true)
                    .allowsHitTesting(false)
                    .ignoresSafeArea()
            }

            // R-Effects: MeteorShower — super phase 진행 중 + 미완료일 때만 활성.
            MeteorShower(active: isSuperActiveAndUnfinished)
                .allowsHitTesting(false)
                .ignoresSafeArea()

            // 11/12 — 전투(던전) 몰입 중엔 하단 네비를 숨겨 화면 전체를 덮는다.
            // 웹 BottomNav.tsx:81-102 hideForUpHero(return null) + playground/page.tsx:36-49 immersive
            // 풀스크린 규약 이식. 이로써 (a) 전투 중 탭 이탈 차단 (b) DungeonView 선택지/포기 footer 를
            // 가리던 겹침 제거 → 필수 선택 게이트가 다시 보이고 전투 루프가 정지하지 않는다.
            if !hideNavForDungeon {
                BottomNav(selected: $tab)
            }

            // R-Effects: PixelConfetti — 챌린지 완료 시 카운터 증가 트리거. trigger 가 토글되면
            // 1회 발사 후 자동 reset (자체 1.5s 정리 + trigger=false 복귀).
            PixelConfetti(trigger: $celebrate)
                .allowsHitTesting(false)
                .ignoresSafeArea()

            // 컬렉션 100% 최초 달성 축하 오버레이.
            if showCelebration {
                CollectionCelebrationView()
                    .transition(.opacity)
                    .zIndex(1)
            }

            // R-Effects: UpHeroLevelUpOverlay — GameStore.pendingLevelUp 발행 시 표시.
            // D agent 가 GameStore 에 pendingLevelUp(LevelUpEvent?) + acknowledgeLevelUp() 을
            // 이미 추가했음(L:56-66, L:159, L:290). 챌린지 레벨업이 발생하면 progress.didSet 의
            // detectLevelUp 이 set, 사용자가 모달 dismiss 시 acknowledgeLevelUp() 가 nil 처리.
            if let event = store.pendingLevelUp {
                UpHeroLevelUpOverlay(
                    oldLevel: event.oldLevel,
                    newLevel: event.newLevel,
                    onDismiss: { store.acknowledgeLevelUp() }
                )
                .zIndex(100)
                .transition(.opacity)
            }

            // R-Effects: PatchNotesModal — 새 버전 노트가 있을 때 자동 1회 표시.
            // dismiss 시 lastSeenPatchVersion 을 현재 최신으로 갱신해 다시 안 나타남.
            if showPatchNotes {
                PatchNotesModal(
                    lastSeenVersion: lastSeenPatchVersion.isEmpty ? nil : lastSeenPatchVersion,
                    onDismiss: {
                        lastSeenPatchVersion = currentPatchVersion
                        showPatchNotes = false
                    }
                )
                .zIndex(110)
                .transition(.opacity)
            }

            #if DEBUG
            // UITest 전용 — 검증 화면 자동 표시(출시 바이너리엔 비포함).
            if ProcessInfo.processInfo.arguments.contains("UITestOpenPhotoDetail"),
               let meta = growth.photoMetas.first {
                PhotoDetailModal(meta: meta, onClose: {})
                    .zIndex(120)
            }
            if ProcessInfo.processInfo.arguments.contains("UITestOpenMonsterDetail"),
               let m = MonsterPool.allTemplates.first(where: { $0.id == "fit_wolf" }) {
                MonsterCodexDetailModal(template: m, onClose: {})
                    .zIndex(120)
            }
            if ProcessInfo.processInfo.arguments.contains("UITestOpenTalismanPicker") {
                PhotoTalismanPicker(onClose: {})
                    .zIndex(120)
            }
            #endif
        }
        .animation(.easeInOut(duration: 0.3), value: showCelebration)
        .animation(.easeOut(duration: 0.25), value: store.pendingLevelUp != nil)
        .animation(.easeOut(duration: 0.25), value: showPatchNotes)
        .onAppear {
            #if DEBUG
            // UITest 전용 — 특정 탭 바로 진입(IA 검증용). 출시 바이너리엔 비포함.
            if ProcessInfo.processInfo.arguments.contains("UITestTabPlayground") {
                tab = .playground
            }
            if ProcessInfo.processInfo.arguments.contains("UITestTabRecord") {
                tab = .record
            }
            if ProcessInfo.processInfo.arguments.contains("UITestTabCollection") {
                tab = .collection
            }
            if ProcessInfo.processInfo.arguments.contains("UITestTabSettings") {
                tab = .settings
            }
            #endif
            syncPackOpener()
            evaluatePatchNotes()
            lastCompletedScore = currentCompletedScore
        }
        .onChange(of: pendingPackCount) { _ in syncPackOpener() }
        // 01-login-prompt: 로그인 오버레이가 닫히는 시점(로그인 성공 또는 "건너뛰기")에 팩 오프너를
        // 재평가해, 온보딩 직후 "로그인 권유 먼저 → 닫은 뒤 카드팩 개봉" 순서(웹 패리티)를 만든다.
        .onChange(of: store.showLoginOverlay) { isShowing in
            if !isShowing { syncPackOpener() }
        }
        // R-Effects: 챌린지 완료 카운터(daily/extra/super 합산 + 풀클리어 가산) 증가 시 confetti.
        // 단순 completed count 증가만 보지 않고 "풀클리어" 가산점을 함께 보면, 마지막 1장 완료가
        // 일반 카드 완료보다 더 큰 increment(=가산점 발화) 를 만들어 풀클리어시 확실히 발사.
        .onChange(of: currentCompletedScore) { newScore in
            if newScore > lastCompletedScore {
                celebrate.toggle()
            }
            lastCompletedScore = newScore
        }
        .onOpenURL { url in
            handleDeepLink(url)
        }
        .fullScreenCover(isPresented: $showPackOpener) {
            CardPackOpenerView { showPackOpener = false }
        }
        // R-Effects: PhotoCaptureModal — GrowthStore.pendingCapture(Identifiable) 트리거 시 표시.
        // A agent 가 GrowthStore 에 pendingCapture/cancelCapture/savePhoto(7-arg) 를 추가했음
        // (L:35, L:175, L:194). GameStore.completeChallenge 가 beginCapture(cardId:title:category:)
        // 를 호출해 모달 마운트를 트리거 (별도 슬라이스).
        .fullScreenCover(item: $growth.pendingCapture) { item in
            PhotoCaptureModal(
                cardId: item.cardId,
                // 10-i18n-leaks(a): 헤더 표시 제목만 인앱 언어로 현지화하고, 저장(challengeTitle)은
                // 언어중립 원문(item.title) 유지 — 표시측만 수정한다.
                title: localizedCaptureTitle(item),
                category: item.category,
                onSave: { image, signature, memo, stickers in
                    growth.savePhoto(
                        image: image,
                        signature: signature,
                        memo: memo,
                        challengeCardId: item.cardId,
                        challengeTitle: item.title,
                        category: item.category,
                        stickers: stickers
                    )
                },
                onCancel: { growth.cancelCapture() }
            )
        }
    }

    // MARK: - R-Effects: 마운트 조건 계산

    /// BurningBorder 가 표시될 phase. extra/super 진행 중(=phase 가 일치) 이고 미완료일 때만.
    /// daily 완료 → extra 진입 후엔 BurningBorder.Phase.extra, super 도 마찬가지.
    private var activeBurningPhase: BurningBorder.Phase? {
        guard let d = store.daily else { return nil }
        switch d.challengePhase {
        case .daily: return nil
        case .extra:
            // extra 선택 진행 중 또는 전체 완료 전.
            let totalSelected = d.extraSelectedCards.count
            if totalSelected == 0 { return .extra }   // 진입 직후 (드로/선택 단계)
            if d.extraCompletedIds.count < totalSelected { return .extra }
            return nil
        case .`super`:
            let totalSelected = d.superSelectedCards.count
            if totalSelected == 0 { return .sup }
            if d.superCompletedIds.count < totalSelected { return .sup }
            return nil
        }
    }

    /// MeteorShower 조건 — super phase 활성 + 미완료. 웹 ClientEffects 의 super phase 한정 트리거.
    private var isSuperActiveAndUnfinished: Bool {
        guard let d = store.daily, d.challengePhase == .`super` else { return false }
        let totalSelected = d.superSelectedCards.count
        // 진입 직후(0) 또는 진행 중 — 풀클리어 시점에 false 로 떨어져 사라진다.
        return totalSelected == 0 || d.superCompletedIds.count < totalSelected
    }

    /// 챌린지 완료 단조 카운터 — daily/extra/super 풀클리어 가산점 포함.
    /// 단순 합산이면 마지막 1장(=풀클리어) 가 일반 카드와 같은 +1 증분이라 임팩트 표시가 약해진다.
    /// 풀클리어 시 +10 가산해 confetti 가 확실히 한 번 더 토글되도록.
    private var currentCompletedScore: Int {
        guard let d = store.daily else { return 0 }
        var s = d.completedIds.count + d.extraCompletedIds.count + d.superCompletedIds.count
        if !d.selectedCards.isEmpty, d.completedIds.count >= d.selectedCards.count { s += 10 }
        if !d.extraSelectedCards.isEmpty,
           d.extraCompletedIds.count >= d.extraSelectedCards.count { s += 10 }
        if !d.superSelectedCards.isEmpty,
           d.superCompletedIds.count >= d.superSelectedCards.count { s += 10 }
        return s
    }

    private func handleDeepLink(_ url: URL) {
        guard url.scheme == "upnext" else { return }
        let target = url.host ?? url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        switch target {
        case "daily", "challenge", "":
            tab = .challenge
        case "collection", "album":
            tab = .collection
        case "playground", "hero", "agit":
            tab = .playground
        case "settings":
            tab = .settings
        default:
            break
        }
    }

    /// 현재 패치 노트 최신 버전. PatchNotesModal.notes 의 첫 항목(=가장 최근) 기준.
    private var currentPatchVersion: String {
        PatchNotesModal.notes.first?.version ?? ""
    }

    /// onAppear 시 새 패치 노트 노출 평가 — 한번도 본 적이 없거나 새 버전이 있으면 1회 표시.
    private func evaluatePatchNotes() {
        #if DEBUG
        // UITest 런치(UITest* 인자)에서는 패치 노트 자동 표시를 건너뛴다 — 화면 검증 차단 방지.
        // DEBUG 전용 — 출시 바이너리엔 ProcessInfo UITest 가드가 컴파일되지 않는다.
        if ProcessInfo.processInfo.arguments.contains(where: { $0.hasPrefix("UITest") }) { return }
        #endif
        let current = currentPatchVersion
        guard !current.isEmpty else { return }
        if lastSeenPatchVersion != current {
            showPatchNotes = true
        }
    }

    /// 미개봉 카드팩 수 (레벨업 팩 + 보너스 카드).
    private var pendingPackCount: Int {
        (store.progress?.pendingPacks ?? 0) + (store.progress?.pendingBonusCards ?? 0)
    }

    /// 촬영 모달 헤더에 표시할 챌린지 제목 — 카탈로그에서 cardId 로 카드를 찾아 인앱 언어로
    /// 현지화(10-i18n-leaks(a)). PendingCaptureContext.title 은 완료 시점 원문(한국어) 스냅샷이라
    /// 그대로 쓰면 카드명만 한국어로 샜다. 저장용 challengeTitle 은 여전히 원문(item.title)을 쓴다.
    private func localizedCaptureTitle(_ item: GrowthStore.PendingCaptureContext) -> String {
        if let card = CardCatalog.allCards.first(where: { $0.id == item.cardId }) {
            return card.localizedTitle(.current)
        }
        return item.title
    }

    /// 컬렉션 완성 축하 모달 노출 조건. 팩 개봉(fullScreenCover)이 떠 있는 동안엔
    /// 보류했다가 닫힌 뒤 등장 — 웹 CollectionCelebration 의 `flag && !isOpeningPack`.
    /// (개봉 중 띄우면 등장 연출이 cover 뒤에서 소진돼 버린다.)
    private var showCelebration: Bool {
        store.collectionCelebration && !showPackOpener
    }

    /// 전투(던전) 몰입 중 하단 네비 숨김 여부 — 11/12 통합 네비 가시성 규약.
    /// 웹 BottomNav.tsx:85-90 `hideForUpHero`(status active/paused/awaitingChoice) 이식에
    /// iOS 는 미니게임을 DungeonView 오버레이(awaitingMinigame)로도 그리므로 그 상태까지 포함해
    /// 세션이 진행 중인 동안(=`.completed` 결산 전까지) 네비를 숨긴다. 이는 웹
    /// playground/page.tsx:36-49 의 `!= completed` immersive 판정(12-combat-parity)과도 동치.
    ///  · nil(캠프·버프 드로우) → 네비 노출(버프 드로우는 패딩으로 겹침 회피, 11-buff-nav-overlap A).
    ///  · .completed → 노출(SessionResultModal 이 풀백드롭으로 덮고, 확인 시 캠프로 복귀 = 웹 패리티).
    private var hideNavForDungeon: Bool {
        guard tab == .playground else { return false }
        switch upHero.state.currentSession?.status {
        case .active, .paused, .awaitingChoice, .awaitingMinigame:
            return true
        default:
            return false
        }
    }

    /// 열 팩이 있으면 개봉 화면을 띄운다. 개봉 중 pendingPacks 가 0 이 돼도
    /// showPackOpener 는 별도 상태라 마지막 reveal 까지 보이고 "완료" 로 닫힌다.
    private func syncPackOpener() {
        // 01-login-prompt: 로그인 권유가 떠 있는 동안은 팩 오프너(fullScreenCover)로 뒤덮지 않는다 —
        // 웹은 LoginOverlay(z-50)가 CardPackOpener 위에 뜨는데, iOS 의 fullScreenCover 는 zIndex 로
        // 못 이기는 네이티브 모달이라 온보딩 직후 순서가 뒤집히던 회귀를 여기서 게이트로 보정.
        // (오버레이가 닫히면 아래 onChange(showLoginOverlay) 가 이 함수를 재평가해 팩을 연다.)
        guard !store.showLoginOverlay else { return }
        if pendingPackCount > 0 { showPackOpener = true }
    }

    @ViewBuilder private var screen: some View {
        switch tab {
        case .challenge:
            DailyHomeView()
        case .record:
            RecordTabView()
        case .collection:
            CollectionView()
        case .playground:
            UpHeroGameView()
        case .settings:
            SettingsView()
        }
    }
}

// MARK: - 상단 헤더 (Lv · XP)

struct AppHeader: View {
    @EnvironmentObject private var store: GameStore
    /// 챌린지 탭에서만 XP 바를 노출.
    let showXP: Bool

    /// R8 — 레벨업 3-phase 애니메이션 상태.
    @State private var levelUpPhase: LevelUpPhase = .idle
    @State private var lvPulseScale: Double = 1
    @State private var lastSeenLevel: Int = 0

    private enum LevelUpPhase { case idle, full, snap, idle2 }

    var body: some View {
        let level = store.progress?.level ?? 0
        let xp = store.progress?.xp ?? 0
        VStack(spacing: 6) {
            HStack {
                HStack(spacing: 0) {
                    Text("Lv.")
                        .typography(.heading)
                        .foregroundStyle(Color.accentPrimary)
                    NumberRollView(value: level, baseColor: Color.accentPrimary)
                        .typography(.heading)
                }
                .scaleEffect(lvPulseScale)
                Spacer()
                if showXP {
                    HStack(spacing: 0) {
                        NumberRollView(value: xpCurrent(level, xp), baseColor: Color.textTertiary)
                        Text(" / \(xpNeeded(level)) XP")
                            .foregroundStyle(Color.textTertiary)
                    }
                    .typography(.micro)
                }
            }
            if showXP {
                xpBar(level: level, xp: xp)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 10)
        // 앰비언트 노출(요인1) — 웹 Header.tsx L178 `bg-bg-primary/80 backdrop-blur-md` 패리티.
        // 완전 불투명 대신 0.8 로 낮춰 상단 오로라가 은은히 관통(Lv·XP 가독성은 유지).
        // (다크 고정 앱이라 시스템 material 대신 명시 토큰 opacity 사용 — 라이트모드 오염 방지.)
        .background(Color.bgPrimary.opacity(0.8))
        .onAppear { lastSeenLevel = level }
        .onChange(of: level) { newLevel in
            if newLevel > lastSeenLevel {
                runLevelUpSequence()
                lastSeenLevel = newLevel
            }
        }
    }

    /// R8 — 3-phase 애니메이션: full (700ms 100% 채움) → snap (150ms 0% 점프) → idle (500ms 현재값으로 fill).
    /// 동시에 Lv 텍스트 scale 1→1.25→1 펄스.
    private func runLevelUpSequence() {
        Haptics.play(.celebration)
        SoundPlayer.shared.play(.levelUp)

        levelUpPhase = .full
        withAnimation(.easeOut(duration: 0.7)) {
            // xpBar 가 fractionForPhase(.full) 로 1.0 표시
        }
        // 동시 펄스
        withAnimation(.spring(response: 0.35, dampingFraction: 0.5)) {
            lvPulseScale = 1.25
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) {
                lvPulseScale = 1
            }
        }
        // snap to 0
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
            levelUpPhase = .snap
            // 짧은 fill 0 → 새 진행
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.85) {
            withAnimation(.easeOut(duration: 0.5)) {
                levelUpPhase = .idle2
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
            levelUpPhase = .idle
        }
    }

    /// 현재 레벨 구간에서 쌓인 XP. 웹 getXPProgress 의 current (음수 클램프).
    private func xpCurrent(_ level: Int, _ xp: Int) -> Int {
        max(0, xp - GameRules.totalXPForLevel(level))
    }

    /// 다음 레벨까지 필요한 XP.
    private func xpNeeded(_ level: Int) -> Int {
        GameRules.totalXPForLevel(level + 1) - GameRules.totalXPForLevel(level)
    }

    private func xpBar(level: Int, xp: Int) -> some View {
        let needed = xpNeeded(level)
        let actualFraction = needed > 0
            ? min(Double(xpCurrent(level, xp)) / Double(needed), 1)
            : 0
        // 레벨업 3-phase 별 표시 fraction.
        let fraction: Double
        switch levelUpPhase {
        case .idle, .idle2:  fraction = actualFraction
        case .full:          fraction = 1.0
        case .snap:          fraction = 0.0
        }
        return GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.bgElevated)
                Capsule().fill(Color.accentPrimary)
                    .frame(width: geo.size.width * fraction)
            }
        }
        .frame(height: 5)
    }
}

// MARK: - 하단 플로팅 네비

struct BottomNav: View {
    @Binding var selected: MainTab

    /// R8 — rise-in: 마운트 시 y:30→0 + opacity 0→1.
    @State private var entered: Bool = false

    var body: some View {
        HStack(spacing: 4) {
            ForEach(MainTab.allCases, id: \.self) { tab in
                tabButton(tab)
            }
        }
        .padding(6)
        .background(Color.bgElevated, in: Capsule())
        .padding(.bottom, 8)
        .offset(y: entered ? 0 : 30)
        .opacity(entered ? 1 : 0)
        .onAppear {
            withAnimation(.spring(response: 0.55, dampingFraction: 0.75)) {
                entered = true
            }
        }
    }

    /// R8 — label width 0→auto expand 애니메이션 (활성 탭만 라벨 표시).
    /// SwiftUI 는 width:auto 직접 애니가 어려워 fixed width transition + animation 으로 근사.
    private func tabButton(_ tab: MainTab) -> some View {
        let isSelected = selected == tab
        return Button {
            if selected != tab { Haptics.play(.selection) }
            withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                selected = tab
            }
        } label: {
            HStack(spacing: isSelected ? 6 : 0) {
                PixelIcon(tab.pixelIcon, size: 18,
                          color: isSelected ? Color.bgPrimary : Color.textTertiary)
                if isSelected {
                    Text(tab.label)
                        .typography(.caption)
                        .lineLimit(1)
                        .fixedSize(horizontal: true, vertical: false)
                        .transition(.asymmetric(
                            insertion: .scale(scale: 0.5, anchor: .leading).combined(with: .opacity),
                            removal: .opacity
                        ))
                }
            }
            .foregroundStyle(isSelected ? Color.bgPrimary : Color.textTertiary)
            .padding(.horizontal, 16)
            .frame(minWidth: 44, minHeight: 44)
            .background(isSelected ? Color.accentPrimary : Color.clear, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tab.label)
        .accessibilityIdentifier("\(tab.accessibilityKey)TabButton")
    }
}

private extension MainTab {
    var accessibilityKey: String {
        switch self {
        case .challenge: return "challenge"
        case .record: return "record"
        case .collection: return "collection"
        case .playground: return "playground"
        case .settings: return "settings"
        }
    }
}
