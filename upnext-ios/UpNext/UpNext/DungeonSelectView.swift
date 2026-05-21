//
//  DungeonSelectView.swift
//  UpNext — Up Hero 던전 선택 (Phase 4 슬라이스 17).
//
//  웹 components/uphero/CampPlaceholder.tsx 의 DungeonsView 포팅. 아지트에서
//  "탐험 시작" → 8개 던전 그리드. 각 카드는 던전 이름 + 최고 도달 층을 보여준다.
//
//  카드 탭 → prepareBuffDraw → 버프 드로우 패널(슬라이스 20). 세션 생성·전투와
//  탐험권(passes) 게이팅은 이후 슬라이스에서 붙는다.
//

import SwiftUI

struct DungeonSelectView: View {
    @EnvironmentObject private var upHero: UpHeroStore
    @EnvironmentObject private var store: GameStore
    /// 아지트 홈으로 복귀.
    let onBack: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            header
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
                PixelIcon(.chevronLeft, size: 16, color: Color.textSecondary)
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

    // MARK: - 던전 카드

    private func dungeonCard(_ dungeon: Dungeon) -> some View {
        let progress = upHero.state.dungeons[dungeon.id]
        // 표기는 역대 최고 도달 (사망/체크포인트와 무관). 웹 DungeonsView 와 동일.
        let best = progress?.bestFloorReached ?? progress?.floorReached ?? 0
        return Button {
            // 던전 선택 → 버프 카드 드로우. 해금 카드는 GameStore.progress 소관.
            upHero.prepareBuffDraw(
                dungeonId: dungeon.id,
                ownedCardIds: store.progress?.unlockedCardIds ?? [])
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                // 던전 테마색 — 웹은 카드 테두리, 우리는 보더 금지라 색 점으로.
                Circle()
                    .fill(Color(hexString: dungeon.themeColor))
                    .frame(width: 14, height: 14)
                Text(dungeon.name)
                    .typography(.body)
                    .foregroundStyle(Color.textPrimary)
                    .lineLimit(1)
                Text(best > 0 ? "최고 F\(best)" : "미탐험")
                    .typography(.micro)
                    .foregroundStyle(Color.textTertiary)
            }
            .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
            .padding(14)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}
