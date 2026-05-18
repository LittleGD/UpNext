//
//  EquipmentInventoryView.swift
//  UpNext — Up Hero 장비 인벤토리 (Phase 4 슬라이스 19).
//
//  웹 components/uphero/EquipmentInventory.tsx 포팅. 아지트 "장비" 메뉴 →
//  장착 중인 4슬롯 + 보유 장비 목록. 인벤토리 항목을 탭하면 장착/판매/버리기.
//
//  웹 인벤토리의 강화(enhance)·사진 부적·정렬/필터·상세 모달은 condensed —
//  각각 이후 슬라이스/Phase 4.5(사진)로 분리. 슬라이스 19 는 장착·판매·버리기만.
//  장비는 던전 전투 드롭으로 채워지므로 전투 슬라이스 전엔 인벤토리가 비어 있다.
//

import SwiftUI

struct EquipmentInventoryView: View {
    @EnvironmentObject private var upHero: UpHeroStore
    /// 아지트 홈으로 복귀.
    let onBack: () -> Void

    /// 인벤토리 항목 탭 → 장착/판매/버리기 액션 시트.
    @State private var actionItem: Equipment?

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    equippedSection
                    inventorySection
                }
                .padding(16)
                .padding(.bottom, 88)  // 하단 플로팅 네비 여유
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bgPrimary)
        .confirmationDialog(
            actionItem?.name ?? "",
            isPresented: Binding(
                get: { actionItem != nil },
                set: { if !$0 { actionItem = nil } }),
            presenting: actionItem
        ) { item in
            Button("장착") { upHero.equipItem(item.id) }
            Button("판매 (+\(UpHeroRules.sellPrice[item.rarity] ?? 0) 코인)") {
                upHero.sellItem(item.id)
            }
            Button("버리기", role: .destructive) { upHero.discardItem(item.id) }
            Button("취소", role: .cancel) {}
        }
    }

    // MARK: - 헤더

    private var header: some View {
        HStack(spacing: 8) {
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Color.textSecondary)
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)
            Text("장비")
                .typography(.title)
                .foregroundStyle(Color.textPrimary)
            Spacer()
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
    }

    // MARK: - 장착 중 (4 슬롯)

    private var equippedSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("장착 중")
                .typography(.heading)
                .foregroundStyle(Color.textPrimary)
            ForEach(EquipSlot.allCases, id: \.self) { slot in
                equippedSlotRow(slot)
            }
        }
    }

    @ViewBuilder
    private func equippedSlotRow(_ slot: EquipSlot) -> some View {
        if let item = upHero.state.hero.equipped[slot] {
            Button { upHero.unequipItem(slot) } label: {
                HStack(spacing: 10) {
                    slotLabel(slot)
                    itemSummary(item)
                    Spacer(minLength: 0)
                    Text("해제")
                        .typography(.micro)
                        .foregroundStyle(Color.textTertiary)
                }
                .padding(12)
                .frame(maxWidth: .infinity)
                .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 10))
            }
            .buttonStyle(.plain)
        } else {
            HStack(spacing: 10) {
                slotLabel(slot)
                Text("비어 있음")
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
                Spacer(minLength: 0)
            }
            .padding(12)
            .frame(maxWidth: .infinity)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 10))
            .opacity(0.6)
        }
    }

    // MARK: - 보유 장비

    private var inventorySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("보유 장비 (\(upHero.state.inventory.count))")
                .typography(.heading)
                .foregroundStyle(Color.textPrimary)
            if upHero.state.inventory.isEmpty {
                Text("보유한 장비가 없어요.\n던전을 탐험하면 장비를 얻을 수 있어요.")
                    .typography(.caption)
                    .foregroundStyle(Color.textTertiary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                ForEach(upHero.state.inventory) { item in
                    Button { actionItem = item } label: {
                        HStack(spacing: 10) {
                            itemSummary(item)
                            Spacer(minLength: 0)
                            Image(systemName: "ellipsis")
                                .font(.system(size: 14))
                                .foregroundStyle(Color.textTertiary)
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity)
                        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - 공용 조각

    private func slotLabel(_ slot: EquipSlot) -> some View {
        Text(slotName(slot))
            .typography(.micro)
            .foregroundStyle(Color.textTertiary)
            .frame(width: 48, alignment: .leading)
    }

    private func itemSummary(_ item: Equipment) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(item.name)
                .typography(.caption)
                .foregroundStyle(item.rarity.color)
                .lineLimit(1)
            Text(statSummary(item.stats))
                .typography(.micro)
                .foregroundStyle(Color.textTertiary)
                .lineLimit(1)
        }
    }

    private func slotName(_ slot: EquipSlot) -> String {
        switch slot {
        case .weapon:    return "무기"
        case .armor:     return "방어구"
        case .accessory: return "장신구"
        case .talisman:  return "부적"
        }
    }

    /// stats 딕셔너리 → "STR+5 AGI+3" 요약. 0 인 스탯은 생략.
    private func statSummary(_ stats: [StatKey: Int]) -> String {
        let parts = StatKey.allCases.compactMap { key -> String? in
            guard let v = stats[key], v != 0 else { return nil }
            return "\(statLabel(key))\(v > 0 ? "+" : "")\(v)"
        }
        return parts.isEmpty ? "효과 없음" : parts.joined(separator: " ")
    }

    private func statLabel(_ key: StatKey) -> String {
        switch key {
        case .str:       return "STR"
        case .int:       return "INT"
        case .vit:       return "VIT"
        case .dex:       return "DEX"
        case .agi:       return "AGI"
        case .crit:      return "CRIT"
        case .slotBonus: return "슬롯"
        }
    }
}
