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

struct UpHeroGameView: View {
    @EnvironmentObject private var upHero: UpHeroStore

    var body: some View {
        // 웹 UpHeroGame 의 currentSession.status 분기 자리.
        // 슬라이스 14 는 세션 진입 경로가 아직 없으므로 항상 아지트.
        // 던전 뷰(전투)는 전투 슬라이스에서 이 분기에 추가된다.
        CampView()
            .onAppear { upHero.initialize() }
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

    /// 아지트 내부 화면 — 웹 CampPlaceholder 의 `view` 상태(home/dungeons/…) 대응.
    private enum CampScreen { case home, dungeons }

    var body: some View {
        Group {
            switch screen {
            case .home:
                campHome
            case .dungeons:
                DungeonSelectView(onBack: { screen = .home })
            }
        }
        .sheet(isPresented: $statsOpen) { HeroStatPanel() }
    }

    // MARK: 아지트 홈

    private var campHome: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                heroCard
                menu
            }
            .padding(16)
            .padding(.bottom, 88)  // 하단 플로팅 네비 여유
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
    }

    /// 영웅 전용 레벨 — 챌린지 레벨 기반. 웹 getEffectiveHeroLevel.
    private var heroLevel: Int {
        UpHeroRules.getEffectiveHeroLevel(
            gameLevel: store.progress?.level ?? 1,
            heroStartLevel: upHero.state.heroStartLevel)
    }

    // MARK: 헤더 — 제목 + 코인

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("아지트")
                .typography(.title)
                .foregroundStyle(Color.textPrimary)
            Spacer()
            Text("코인 \(upHero.state.coins)")
                .typography(.body)
                .foregroundStyle(Color.accentPrimary)
        }
    }

    // MARK: 영웅 요약 카드 — 탭하면 스탯 패널 sheet.

    private var heroCard: some View {
        let hero = upHero.state.hero
        let leveled = UpHeroRules.computeHeroForLevel(hero, level: heroLevel)
        return Button {
            statsOpen = true
        } label: {
            HStack(spacing: 14) {
                Image(systemName: "figure.stand")
                    .font(.system(size: 40))
                    .foregroundStyle(Color.accentPrimary)
                    .frame(width: 56)
                VStack(alignment: .leading, spacing: 4) {
                    Text(hero.name)
                        .typography(.heading)
                        .foregroundStyle(Color.textPrimary)
                    Text("Lv.\(heroLevel) · \(classLabel(hero.classType))")
                        .typography(.caption)
                        .foregroundStyle(Color.textTertiary)
                    Text("HP \(leveled.hp) / \(leveled.maxHp)")
                        .typography(.caption)
                        .foregroundStyle(Color.textSecondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.textTertiary)
            }
            .padding(16)
            .frame(maxWidth: .infinity)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }

    // MARK: 메뉴 — 탐험은 활성, 장비·상점은 다음 슬라이스 자리표시

    private var menu: some View {
        VStack(spacing: 10) {
            Button { screen = .dungeons } label: {
                menuRow(title: "탐험 시작", subtitle: "던전을 골라 출발",
                        icon: "map", active: true)
            }
            .buttonStyle(.plain)
            menuRow(title: "장비", subtitle: "인벤토리 — 다음 슬라이스",
                    icon: "shield", active: false)
            menuRow(title: "상점", subtitle: "갓생 상점 — 이후 슬라이스",
                    icon: "bag", active: false)
        }
    }

    private func menuRow(title: String, subtitle: String,
                         icon: String, active: Bool) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 18))
                .foregroundStyle(active ? Color.accentPrimary : Color.textTertiary)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .typography(.body)
                    .foregroundStyle(active ? Color.textPrimary : Color.textSecondary)
                Text(subtitle)
                    .typography(.micro)
                    .foregroundStyle(Color.textTertiary)
            }
            Spacer(minLength: 0)
            if active {
                Image(systemName: "chevron.right")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.textTertiary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
        .opacity(active ? 1 : 0.55)  // 비활성 메뉴는 흐리게 — 다음 슬라이스에서 활성화
    }

    private func classLabel(_ c: ClassType?) -> String {
        guard let c, let meta = UpHeroRules.classMeta[c] else { return "전직 전" }
        return meta.name
    }
}
