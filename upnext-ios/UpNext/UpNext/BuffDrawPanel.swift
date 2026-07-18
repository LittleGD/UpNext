//
//  BuffDrawPanel.swift
//  UpNext — Up Hero 던전 진입 전 버프 카드 선택 (Phase 4 슬라이스 20).
//
//  웹 components/uphero/BuffDrawPanel.tsx 포팅. 던전을 고르면 보유 카드에서 6장이
//  뽑히고(같은 카테고리 2배 가중), 영웅의 버프 슬롯 수만큼 골라 전투를 강화한다.
//
//  "탐험 시작" → confirmDungeon — 선택 카드를 CardBuffs.getCardBuff 로 버프 변환 후
//  createSession 으로 전투 세션 생성. 전투 진행(tick·로그)은 다음 슬라이스.
//

import SwiftUI

struct BuffDrawPanel: View {
    @EnvironmentObject private var upHero: UpHeroStore
    @EnvironmentObject private var store: GameStore
    /// 진입 준비 상태 — CampView 가 pendingDungeon 을 확인하고 전달한다.
    let prep: PendingDungeonPrep

    /// 선택한 버프 카드 id. 슬롯 수만큼만 선택 가능.
    @State private var selectedIds: Set<String> = []

    /// 뽑힌 6장 — drawnCardIds 를 카탈로그에서 해소.
    private var cards: [ChallengeCard] {
        prep.drawnCardIds.compactMap { id in
            CardCatalog.allCards.first { $0.id == id }
        }
    }

    /// 선택 가능한 버프 슬롯 수 — 영웅 레벨/장비 기반. 웹 getBuffSlotCount.
    private var slotCount: Int {
        let level = UpHeroRules.getEffectiveHeroLevel(
            gameLevel: store.progress?.level ?? 1,
            heroStartLevel: upHero.state.heroStartLevel)
        return UpHeroRules.getBuffSlotCount(hero: upHero.state.hero, level: level)
    }

    private var dungeonName: String {
        AppConfig.locRuntime(Dungeons.all[prep.dungeonId]?.name ?? "")
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("버프 슬롯 \(slotCount)개 — 카드를 골라 영웅을 강화하세요")
                        .typography(.caption)
                        .foregroundStyle(Color.textTertiary)
                    grid
                }
                .padding(16)
                .padding(.bottom, 88)  // 하단 플로팅 네비 여유
            }
            bottomBar
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
    }

    // MARK: - 헤더

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(dungeonName)
                .typography(.caption)
                .foregroundStyle(Color.accentPrimary)
            Text("버프 카드 선택 (\(selectedIds.count)/\(slotCount))")
                .typography(.title)
                .foregroundStyle(Color.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    // MARK: - 카드 그리드

    private var grid: some View {
        LazyVGrid(
            columns: [GridItem(.flexible(), spacing: 10),
                      GridItem(.flexible(), spacing: 10)],
            spacing: 10
        ) {
            ForEach(cards) { card in
                cardCell(card)
            }
        }
    }

    private func cardCell(_ card: ChallengeCard) -> some View {
        let selected = selectedIds.contains(card.id)
        return Button {
            toggle(card.id)
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(card.rarity.displayName)
                        .typography(.micro)
                        .foregroundStyle(Color.bgPrimary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(card.rarity.color, in: Capsule())
                    Spacer()
                    if selected {
                        PixelIcon(.check, size: 16, color: Color.accentPrimary)
                    }
                }
                Text(card.localizedTitle(.current))
                    .typography(.caption)
                    .foregroundStyle(Color.textPrimary)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, minHeight: 84, alignment: .topLeading)
            .padding(12)
            .background(selected ? Color.accentPrimary.opacity(0.16) : Color.bgSurface,
                        in: RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    // MARK: - 하단 바

    private var bottomBar: some View {
        HStack(spacing: 10) {
            Button { upHero.cancelBuffDraw() } label: {
                Text("취소")
                    .typography(.body)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .foregroundStyle(Color.textSecondary)
                    .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            Button {
                upHero.confirmDungeon(
                    selectedCardIds: Array(selectedIds),
                    gameLevel: store.progress?.level ?? 1)
            } label: {
                Text("탐험 시작")
                    .typography(.body)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .foregroundStyle(Color.bgPrimary)
                    .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
        }
        // 11-buff-nav-overlap(A): 버프 드로우는 세션 미생성(pendingDungeon)이라 하단 플로팅
        // 네비가 계속 떠 있다(웹 BottomNav hideForUpHero 조건 미발동). 고정 CTA 바가 네비 알약과
        // 겹치던 갭을 코드베이스 관례(DungeonSelectView.swift:42 등)와 통일해 보정.
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 88)   // 하단 플로팅 네비 여유
    }

    // MARK: - 선택 토글

    private func toggle(_ id: String) {
        if selectedIds.contains(id) {
            selectedIds.remove(id)
        } else if selectedIds.count < slotCount {
            selectedIds.insert(id)
        }
        // 슬롯이 꽉 차면 추가 선택은 무시 (먼저 해제해야 함).
    }
}
