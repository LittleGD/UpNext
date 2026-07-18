//
//  DungeonSelectView.swift
//  UpNext — Up Hero 던전 선택 (R5 — Up Hero camp 충실 회복).
//
//  웹 components/uphero/CampPlaceholder.tsx DungeonsView (L:545-660) 충실 포팅.
//  아지트 "탐험 시작" → 8개 던전 2열 그리드. 각 카드: 카테고리 아이콘(던전 테마색) +
//  던전 이름 + 최고 도달 층. 상단에 총 탐험권 배지.
//
//  ⚠️ 디자인 규칙(카드/버튼 보더 금지) — 웹은 카드에 themeColor 보더를 쓰지만 iOS 는
//  보더 대신 *themeColor 틴트 배경 + themeColor 아이콘* 으로 던전별 색 구분을 재현.
//  ⚠️ 패스 하드 게이팅(passes==0 시 disable)은 미적용 — iOS 패스 경제가 아직 진입을
//  소비/게이팅하지 않아(웹 confirmDungeon 주석: "패스 경제 슬라이스에서"), 하드 게이팅을
//  넣으면 작동 중인 던전 진입을 깨뜨림. 총 탐험권은 정보용 배지로만 표기.
//

import SwiftUI

struct DungeonSelectView: View {
    @EnvironmentObject private var upHero: UpHeroStore
    @EnvironmentObject private var store: GameStore
    /// 아지트 홈으로 복귀.
    let onBack: () -> Void

    // GB 팔레트는 GBPalette (단일 출처) 참조 — 캠프는 의도적으로 GB 게임보이 테마.
    private var totalPasses: Int { upHero.state.passes.values.reduce(0, +) }

    var body: some View {
        VStack(spacing: 0) {
            header
            passBadgeRow
            ScrollView {
                LazyVGrid(
                    columns: [GridItem(.flexible(), spacing: 10),
                              GridItem(.flexible(), spacing: 10)],
                    spacing: 10
                ) {
                    ForEach(Dungeons.list) { dungeon in
                        dungeonCard(dungeon)
                    }
                }
                .padding(16)
                .padding(.bottom, 88)  // 하단 플로팅 네비 여유
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
    }

    // MARK: - 헤더 (뒤로 + 제목)

    private var header: some View {
        HStack(spacing: 8) {
            Button(action: onBack) {
                PixelIcon(.chevronLeft, size: 16, color: GBPalette.light)
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)
            Text("던전 선택")
                .typography(.title)
                .foregroundStyle(Color.textPrimary)
            Spacer()
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
    }

    // MARK: - 총 탐험권 배지 (웹 L:594-611)

    private var passBadgeRow: some View {
        HStack {
            Text("보유 탐험권")
                .typography(.caption)
                .foregroundStyle(GBPalette.light)
            Spacer()
            Text("×\(totalPasses)")
                .typography(.caption)
                .monospacedDigit()
                .foregroundStyle(totalPasses > 0 ? GBPalette.lightest : GBPalette.light)
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .background(totalPasses > 0 ? GBPalette.light.opacity(0.13) : Color.clear, in: Capsule())
        }
        .padding(.horizontal, 17)
        .padding(.bottom, 2)
    }

    // MARK: - 던전 카드

    private func dungeonCard(_ dungeon: Dungeon) -> some View {
        let progress = upHero.state.dungeons[dungeon.id]
        // 표기는 역대 최고 도달 (사망/체크포인트와 무관). 웹 DungeonsView 와 동일.
        let best = progress?.bestFloorReached ?? progress?.floorReached ?? 0
        let dColor = Color(hexString: dungeon.themeColor)
        return Button {
            SoundPlayer.shared.play(.select)
            Haptics.play(.selection)
            // 던전 선택 → 버프 카드 드로우. 해금 카드는 GameStore.progress 소관.
            upHero.prepareBuffDraw(
                dungeonId: dungeon.id,
                ownedCardIds: store.progress?.unlockedCardIds ?? [])
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                // 카테고리 아이콘 — 던전 테마색 (웹 CATEGORY_ICON, 보더 대신 색 신호).
                PixelIcon(Self.dungeonIcon(dungeon.id), size: 22, color: dColor)
                Spacer(minLength: 0)
                Text(LocalizedStringKey(dungeon.name))
                    .typography(.caption)
                    .foregroundStyle(GBPalette.lightest)
                    .lineLimit(1)
                Text(best > 0 ? AppConfig.loc("최고 F\(best)") : AppConfig.loc("미탐험"))
                    .typography(.micro)
                    .monospacedDigit()
                    .foregroundStyle(GBPalette.light)
                    .opacity(0.75)
            }
            .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
            .padding(.horizontal, 12)
            .padding(.vertical, 14)
            // themeColor 틴트 배경 (보더 금지 규칙 — 보더 대신 옅은 색 wash).
            .background {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.bgSurface)
                    .overlay(RoundedRectangle(cornerRadius: 12).fill(dColor.opacity(0.10)))
            }
        }
        .buttonStyle(.unPress)   // 공용 press(13-button-system) — 기존 DungeonPressStyle 흡수.
    }

    /// 던전(=카테고리)별 PixelIcon — 웹 CATEGORY_ICON 맵 1:1.
    private static func dungeonIcon(_ id: DungeonId) -> PixelIconName {
        switch id {
        case .fitness:      return .human
        case .learning:     return .bookOpen
        case .mindfulness:  return .moon
        case .nutrition:    return .coffee
        case .social:       return .message
        case .productivity: return .clock
        case .wellness:     return .heart
        case .trending:     return .sparkle
        }
    }
}

// 던전 카드 프레스는 공용 `.buttonStyle(.unPress)`(UNButtonStyle.swift)로 통합됨
// — 웹 uphero-press-btn(scale 0.97) 규약을 앱 전역 press 스타일 하나로 흡수.
