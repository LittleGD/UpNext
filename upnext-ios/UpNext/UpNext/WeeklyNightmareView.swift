//
//  WeeklyNightmareView.swift
//  UpNext — 주간 악몽 던전 진입 (Phase 11c 웹 파리티 이식).
//
//  웹 components/uphero/CampPlaceholder.tsx WeeklyView (L:1405-1601) 포팅.
//  affix 설명 카드(주차 · 순위 버튼 · 내 최고 점수) → 8던전 2열 그리드 →
//  리셋 카운트다운 + "탐험권 소모 없음" 안내.
//
//  던전 탭 → UpHeroStore.enterWeeklyVariant — 성공 시 currentSession 이 생겨
//  UpHeroGameView 가 DungeonView(전투)로 자동 전환된다. 미해금("not-unlocked")과
//  주간 데이터 없음("no-weekly")은 토스트로 안내 (웹 onNotify 대응).
//  미해금 타일도 탭 가능 — dead-end 방지 (웹 Phase 11c R2).
//
//  ⚠️ 디자인 규칙(카드/버튼 보더 금지) — 웹의 sand/legend/theme 보더는
//  틴트 배경 wash 로 재현 (DungeonSelectView 와 동일한 번역 규약).
//

import SwiftUI
import Combine

struct WeeklyNightmareView: View {
    @EnvironmentObject private var upHero: UpHeroStore
    @EnvironmentObject private var store: GameStore
    /// 아지트 홈으로 복귀.
    let onBack: () -> Void

    /// 리더보드 — 웹은 lazy 모달(WeeklyLeaderboardLazy), iOS 는 시트.
    @State private var leaderboardOpen = false
    @State private var toast: String?
    /// 다음 UTC 월요일 00:00 까지 남은 ms — 60초 주기 갱신 (웹 Phase 12 R11).
    @State private var resetMs: Int = Self.nextWeeklyResetMs()
    private let resetTick = Timer.publish(every: 60, on: .main, in: .common).autoconnect()

    /// 주간 악몽 accent — 웹 SAND(#e8b887). GB_LEGEND 와 동일 톤.
    private static let sand = Color(hexString: "#e8b887")

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if let weekly = upHero.state.weeklyVariant,
                       let affix = WeeklyAffixes.getWeeklyAffixById(weekly.affixId) {
                        affixCard(weekly, affix)
                    }
                    dungeonGrid
                    countdownFooter
                }
                .padding(16)
                .padding(.bottom, 88)  // 하단 플로팅 네비 여유
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
        .overlay { if let toast { toastView(toast) } }
        .onReceive(resetTick) { _ in resetMs = Self.nextWeeklyResetMs() }
        .sheet(isPresented: $leaderboardOpen) {
            if let weekly = upHero.state.weeklyVariant {
                WeeklyLeaderboardView(
                    onBack: { leaderboardOpen = false },
                    weekId: weekly.week,
                    affixName: WeeklyAffixes.getWeeklyAffixById(weekly.affixId)?.name
                        ?? AppConfig.loc("이번 주 악몽"))
            }
        }
    }

    // MARK: - 헤더 (웹 SubHeader — uphero.subheader.weekly)

    private var header: some View {
        HStack(spacing: 8) {
            Button(action: onBack) {
                PixelIcon(.chevronLeft, size: 16, color: GBPalette.light)
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)
            Text("이번 주 악몽")
                .typography(.title)
                .foregroundStyle(Color.textPrimary)
            Spacer()
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
    }

    // MARK: - Affix 설명 카드 (웹 L:1454-1514)

    private func affixCard(_ weekly: WeeklyVariant, _ affix: WeeklyAffix) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                HStack(spacing: 6) {
                    PixelIcon(.warningDiamond, size: 14, color: Self.sand)
                    Text(weekly.week)
                        .typography(.caption)
                        .monospacedDigit()
                        .foregroundStyle(Self.sand)
                        .tracking(0.5)
                }
                Spacer(minLength: 0)
                // 리더보드 열기 (웹 Trophy 버튼).
                Button {
                    Haptics.play(.selection)
                    SoundPlayer.shared.play(.select)
                    leaderboardOpen = true
                } label: {
                    HStack(spacing: 4) {
                        PixelIcon(.trophy, size: 12, color: GBPalette.lightest)
                        Text("순위")
                            .typography(.caption)
                            .foregroundStyle(GBPalette.lightest)
                    }
                    .padding(.horizontal, 10)
                    .frame(minHeight: 32)
                    .background(GBPalette.darkest.opacity(0.55), in: Capsule())
                }
                .buttonStyle(.unPress)
                .accessibilityLabel(Text("리더보드 보기"))
                .accessibilityIdentifier("weeklyLeaderboardButton")
            }
            Text(LocalizedStringKey(affix.name))
                .typography(.body)
                .foregroundStyle(GBPalette.lightest)
            Text(LocalizedStringKey(affix.description))
                .typography(.caption)
                .foregroundStyle(GBPalette.light)
                .fixedSize(horizontal: false, vertical: true)
            if weekly.bestScore > 0 {
                Text(AppConfig.loc("내 최고 점수: \(weekly.bestScore)"))
                    .typography(.micro)
                    .monospacedDigit()
                    .foregroundStyle(GBPalette.lightest.opacity(0.8))
                    .padding(.top, 2)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        // 웹 gradient(sand 13% → GB.dark) + sand 보더 — 보더 금지 룰에 따라 wash 만.
        .background {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.bgSurface)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(LinearGradient(
                            colors: [Self.sand.opacity(0.13), GBPalette.dark.opacity(0.35)],
                            startPoint: .topLeading, endPoint: .bottomTrailing)))
        }
    }

    // MARK: - 던전 그리드 (웹 L:1517-1564 — F30 클리어 던전만 enable 시각화)

    private var dungeonGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10),
                            GridItem(.flexible(), spacing: 10)], spacing: 10) {
            ForEach(Dungeons.list) { dungeon in
                weeklyDungeonCard(dungeon)
            }
        }
    }

    private func weeklyDungeonCard(_ dungeon: Dungeon) -> some View {
        // 타일 뱃지는 *던전별* F30 클리어 여부 (실제 진입 게이트는 글로벌 — 스토어가 판정).
        let eligible = upHero.state.dungeons[dungeon.id]?.bossesDefeated.contains(30) == true
        let cleared = upHero.state.weeklyVariant?.clearedDungeons.contains(dungeon.id) == true
        let dColor = Color(hexString: dungeon.themeColor)
        return Button {
            SoundPlayer.shared.play(.select)
            Haptics.play(.selection)
            enter(dungeon.id)
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .top) {
                    PixelIcon(DungeonSelectView.dungeonIcon(dungeon.id), size: 18,
                              color: eligible ? dColor : GBPalette.light)
                    Spacer(minLength: 0)
                    if cleared {
                        // 이번 주 클리어 완료 (웹 Check + GB_LEGEND 보더 → 아이콘만).
                        PixelIcon(.check, size: 12, color: Self.sand)
                    }
                }
                Text(LocalizedStringKey(dungeon.name))
                    .typography(.caption)
                    .foregroundStyle(eligible ? GBPalette.lightest : GBPalette.light)
                    .lineLimit(1)
                Text(eligible ? AppConfig.loc("F30 변이") : AppConfig.loc("F30 미도달"))
                    .typography(.micro)
                    .monospacedDigit()
                    .foregroundStyle(eligible ? Self.sand : GBPalette.light)
                    .opacity(0.8)
            }
            .frame(maxWidth: .infinity, minHeight: 76, alignment: .topLeading)
            .padding(.horizontal, 10)
            .padding(.vertical, 12)
            // 보더 금지 — cleared: sand wash / eligible: theme wash / locked: 배경만 약하게.
            .background {
                RoundedRectangle(cornerRadius: 12)
                    .fill(eligible ? Color.bgSurface : Color.bgSurface.opacity(0.4))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(cleared ? Self.sand.opacity(0.12)
                                  : eligible ? dColor.opacity(0.10) : Color.clear))
            }
            .opacity(eligible ? 1 : 0.55)
        }
        .buttonStyle(.unPress)
        .accessibilityIdentifier("weeklyDungeon-\(dungeon.id.rawValue)")
    }

    /// 던전 탭 → 스토어 진입 시도. 웹 onEnter (L:1437-1446).
    private func enter(_ dungeonId: DungeonId) {
        let result = upHero.enterWeeklyVariant(
            dungeonId, gameLevel: store.progress?.level ?? 1)
        switch result {
        case .ok:
            break  // 세션 생성됨 — UpHeroGameView 가 DungeonView 로 전환 (사운드는 스토어가).
        case .notUnlocked:
            showToast(AppConfig.loc("먼저 이 던전의 F30 을 돌파하세요"))
        case .noWeekly:
            showToast(AppConfig.loc("주간 데이터 로딩 중"))
        }
    }

    // MARK: - 리셋 카운트다운 (웹 Phase 12 R11 — L:1566-1583)

    private var countdownFooter: some View {
        VStack(spacing: 2) {
            Text(AppConfig.loc("다음 악몽까지 \(formatCountdown(resetMs))"))
                .typography(.micro)
                .foregroundStyle(GBPalette.light.opacity(0.75))
                .tracking(0.5)
            Text("탐험권 소모 없음 · KST 월요일 오전 9시 리셋")
                .typography(.micro)
                .foregroundStyle(GBPalette.light.opacity(0.5))
                .tracking(0.5)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
    }

    /// 다음 UTC 월요일 00:00 까지 ms. 웹 getNextWeeklyResetMs (L:1370-1385) —
    /// KST 월요일 오전 9시 = UTC 월요일 00시와 같은 순간.
    static func nextWeeklyResetMs(now: Date = Date()) -> Int {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        let weekday = utc.component(.weekday, from: now)   // Swift: 1=Sun..7=Sat
        let dayOfWeek = weekday - 1                        // JS getUTCDay: 0=Sun..6=Sat
        // JS: dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7 || 7
        let raw = (8 - dayOfWeek) % 7
        let daysUntilMonday = dayOfWeek == 1 ? 7 : (raw == 0 ? 7 : raw)
        let startOfToday = utc.startOfDay(for: now)
        guard let nextMonday = utc.date(
            byAdding: .day, value: daysUntilMonday, to: startOfToday) else { return 0 }
        return Int(nextMonday.timeIntervalSince(now) * 1000)
    }

    /// ms → "N일 M시간" / "M시간 S분" / "S분". 웹 formatWeeklyCountdown (L:1390-1402).
    private func formatCountdown(_ ms: Int) -> String {
        if ms <= 0 { return AppConfig.loc("리셋 중") }
        let totalMin = ms / 60_000
        let d = totalMin / (60 * 24)
        let h = (totalMin % (60 * 24)) / 60
        let m = totalMin % 60
        if d > 0 { return AppConfig.loc("\(d)일 \(h)시간") }
        if h > 0 { return AppConfig.loc("\(h)시간 \(m)분") }
        return AppConfig.loc("\(m)분")
    }

    // MARK: - 토스트 (ShopView / PhotoTalismanPicker 패턴 재사용)

    private func toastView(_ msg: String) -> some View {
        VStack {
            Spacer()
            Text(msg).typography(.caption).foregroundStyle(Color.textPrimary)
                .padding(.horizontal, 16).padding(.vertical, 10)
                .background(Color.bgElevated, in: Capsule())
                .padding(.bottom, 40)
        }
    }

    private func showToast(_ msg: String) {
        toast = msg
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { if toast == msg { toast = nil } }
    }
}
