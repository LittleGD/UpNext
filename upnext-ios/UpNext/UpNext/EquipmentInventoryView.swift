//
//  EquipmentInventoryView.swift
//  UpNext — Up Hero 장비 인벤토리 (R8 격상).
//
//  웹 components/uphero/EquipmentInventory.tsx (1079 LOC) 비주얼 회복:
//   - 4 슬롯 카드 그리드 (weapon/armor/accessory/talisman)
//   - 등급별 외곽 글로우 (common 무 / rare 청 / unique 자홍 / legend 라임)
//   - 슬롯 미장착 시 placeholder + PixelIcon
//   - 보유 장비 그리드 — 등급 글로우 카드
//   - 탭 → 액션 (장착/판매/강화/버리기)
//   - 강화 → EnhanceRitualOverlay (2s) + 결과 후 모달
//

import SwiftUI

struct EquipmentInventoryView: View {
    @EnvironmentObject private var upHero: UpHeroStore
    let onBack: () -> Void

    @State private var actionItem: Equipment?
    @State private var enhancingItem: Equipment?
    @State private var enhanceOutcome: EnhanceRitualOutcome?
    @State private var showTalismanPicker = false
    // 05-modal-design — 판매/버리기(비가역)만 GbConfirm 재확인. 장착/강화는 즉시 실행 유지.
    // 웹 EquipmentInventory.tsx 처럼 pending 하나로 두 액션 공유, title/body 만 분기.
    @State private var pendingAction: PendingEquipAction?

    private enum EquipConfirmKind { case sell, discard }
    private struct PendingEquipAction: Identifiable {
        let id = UUID()
        let kind: EquipConfirmKind
        let item: Equipment
    }

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                header
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        photoTalismanCTA
                        equippedGrid
                        inventoryGrid
                    }
                    .padding(16)
                    .padding(.bottom, 100)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.bgPrimary)
            .fullScreenCover(isPresented: $showTalismanPicker) {
                PhotoTalismanPicker(onClose: { showTalismanPicker = false })
            }

            // 강화 의식 오버레이
            if let item = enhancingItem, let outcome = enhanceOutcome {
                EnhanceRitualOverlay(equipment: item, outcome: outcome) {
                    enhancingItem = nil
                    enhanceOutcome = nil
                }
                .transition(.opacity)
                .zIndex(50)
            }

            // 05-modal-design — 판매/버리기 재확인 (danger). 웹 EquipmentInventory.tsx:741~ 문구.
            if let pending = pendingAction {
                GbConfirm(
                    title: pending.kind == .sell
                        ? "\(pending.item.localizedDisplayName) — 판매할까요?"
                        : "\(pending.item.localizedDisplayName) — 버릴까요?",
                    message: pending.kind == .sell
                        ? "+\(UpHeroRules.sellPrice[pending.item.rarity] ?? 0) 코인"
                        : "환급 없음 · 복구 불가",
                    confirmLabel: pending.kind == .sell ? "판매" : "버리기",
                    danger: true,
                    onConfirm: {
                        if pending.kind == .sell { upHero.sellItem(pending.item.id) }
                        else { upHero.discardItem(pending.item.id) }
                        pendingAction = nil
                    },
                    onCancel: { pendingAction = nil })
                .transition(.opacity)
                .zIndex(60)
            }
        }
        // 액션 선택 시트는 장착/강화 즉시 실행 + 판매/버리기 재확인(GbConfirm) 구조로 유지.
        // (스펙: 장착/강화 는 현 액션시트 안에 유지 가능, 판매/버리기만 GbConfirm 경유.)
        .confirmationDialog(
            // 액션시트 타이틀은 raw name(한국어 원문) 대신 현지화 표시명 사용 — 전 언어 정합.
            actionItem?.localizedDisplayName ?? "",
            isPresented: Binding(get: { actionItem != nil }, set: { if !$0 { actionItem = nil } }),
            presenting: actionItem
        ) { item in
            Button("장착") { upHero.equipItem(item.id); actionItem = nil }
            Button("강화 (-100 코인)") {
                let outcome = upHero.enhanceItem(item.id)
                enhancingItem = item
                enhanceOutcome = outcome
                actionItem = nil
            }
            .disabled(upHero.state.coins < 100)
            Button("판매 (+\(UpHeroRules.sellPrice[item.rarity] ?? 0) 코인)") {
                pendingAction = PendingEquipAction(kind: .sell, item: item); actionItem = nil
            }
            Button("버리기", role: .destructive) {
                pendingAction = PendingEquipAction(kind: .discard, item: item); actionItem = nil
            }
            Button("취소", role: .cancel) { actionItem = nil }
        }
    }

    // MARK: - 헤더

    private var header: some View {
        HStack(spacing: 8) {
            Button(action: onBack) {
                PixelIcon(.chevronLeft, size: 16, color: Color.textSecondary)
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)
            Text("장비")
                .typography(.title)
                .foregroundStyle(Color.textPrimary)
            Spacer()
            HStack(spacing: 4) {
                PixelIcon(.coins, size: 14, color: Color.accentPrimary)
                Text("\(upHero.state.coins)").typography(.caption).foregroundStyle(Color.textPrimary)
                    .monospacedDigit()
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
    }

    // MARK: - 사진 부적 만들기 CTA (웹 EquipmentInventory → PhotoTalismanPicker)

    private var photoTalismanCTA: some View {
        Button { showTalismanPicker = true } label: {
            HStack(spacing: 12) {
                PixelIcon(.image, size: 18, color: Color.accentPrimary).frame(width: 24)
                VStack(alignment: .leading, spacing: 2) {
                    Text("사진 부적 만들기")
                        .typography(.body).foregroundStyle(Color.textPrimary)
                    Text("성장의 순간을 부적으로 — 코인 \(PhotoTalisman.ritualCost)")
                        .typography(.caption).foregroundStyle(Color.textTertiary)
                }
                Spacer(minLength: 0)
                PixelIcon(.chevronRight, size: 13, color: Color.textTertiary)
            }
            .padding(14)
            .frame(maxWidth: .infinity)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    // MARK: - 4 슬롯 그리드

    private var equippedGrid: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("장착 중")
                .typography(.heading).foregroundStyle(Color.textPrimary)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(EquipSlot.allCases, id: \.self) { slot in
                    slotCard(slot)
                }
            }
        }
    }

    @ViewBuilder
    private func slotCard(_ slot: EquipSlot) -> some View {
        if let item = upHero.state.hero.equipped[slot] {
            EquipmentSlotCard(item: item, slot: slot) {
                upHero.unequipItem(slot)
            }
        } else {
            VStack(spacing: 6) {
                PixelIcon(slotIcon(slot), size: 28, color: Color.textTertiary.opacity(0.4))
                Text(slotName(slot))
                    .typography(.micro).foregroundStyle(Color.textTertiary)
                Text("비어 있음")
                    .typography(.micro).foregroundStyle(Color.textTertiary.opacity(0.5))
            }
            .frame(height: 120)
            .frame(maxWidth: .infinity)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.textTertiary.opacity(0.2), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
            )
        }
    }

    // MARK: - 보유 장비 그리드

    private var inventoryGrid: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("보유 장비 (\(upHero.state.inventory.count))")
                .typography(.heading).foregroundStyle(Color.textPrimary)
            if upHero.state.inventory.isEmpty {
                Text("보유한 장비가 없어요.\n던전을 탐험하면 얻을 수 있어요.")
                    .typography(.caption).foregroundStyle(Color.textTertiary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(upHero.state.inventory) { item in
                        Button { actionItem = item } label: {
                            EquipmentSlotCard(item: item, slot: nil, onAction: nil)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - 헬퍼

    private func slotIcon(_ slot: EquipSlot) -> PixelIconName {
        switch slot {
        case .weapon:    return .sword
        case .armor:     return .shield
        case .accessory: return .sparkle
        case .talisman:  return .star
        }
    }

    private func slotName(_ slot: EquipSlot) -> String {
        switch slot {
        case .weapon:    return AppConfig.loc("무기")
        case .armor:     return AppConfig.loc("방어구")
        case .accessory: return AppConfig.loc("장신구")
        case .talisman:  return AppConfig.loc("부적")
        }
    }
}

// MARK: - 슬롯 카드 (rarity glow + stats summary)

struct EquipmentSlotCard: View {
    let item: Equipment
    let slot: EquipSlot?
    let onAction: (() -> Void)?

    var body: some View {
        ZStack(alignment: .topLeading) {
            VStack(spacing: 6) {
                HStack(spacing: 4) {
                    Text(item.rarity.displayName)
                        .typography(.micro)
                        .foregroundStyle(Color.bgPrimary)
                        .padding(.horizontal, 5).padding(.vertical, 1)
                        .background(item.rarity.color, in: Capsule())
                    if let lvl = item.enhanceLevel, lvl > 0 {
                        Text("+\(lvl)")
                            .typography(.micro).monospacedDigit()
                            .foregroundStyle(Color.accentPrimary)
                    }
                    Spacer(minLength: 0)
                }
                PixelIcon(PixelIconName.resolve(item.iconName), size: 28, color: item.rarity.color)
                Text(item.localizedDisplayName)
                    .typography(.micro)
                    .foregroundStyle(Color.textPrimary)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                Text(statSummary(item.stats))
                    .typography(.micro)
                    .foregroundStyle(Color.textTertiary)
                    .lineLimit(1)
            }
            .padding(8)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 120)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(item.rarity.color.opacity(rarityBorderAlpha),
                            lineWidth: item.rarity == .legend ? 2 : 1)
            )
            .shadow(color: item.rarity.color.opacity(rarityGlowAlpha),
                    radius: rarityGlowRadius)

            // 해제 버튼 (장착 슬롯 카드일 때만)
            if let onAction {
                Button(action: onAction) {
                    Text("해제")
                        .typography(.micro)
                        .foregroundStyle(Color.textTertiary)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color.bgElevated, in: Capsule())
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity, alignment: .topTrailing)
                .padding(6)
            }
        }
    }

    private var rarityBorderAlpha: Double {
        switch item.rarity {
        case .normal: return 0.15
        case .rare:   return 0.4
        case .unique: return 0.5
        case .legend: return 0.7
        }
    }

    private var rarityGlowAlpha: Double {
        switch item.rarity {
        case .normal: return 0
        case .rare:   return 0.28
        case .unique: return 0.32
        case .legend: return 0.42
        }
    }

    private var rarityGlowRadius: CGFloat {
        switch item.rarity {
        case .normal: return 0
        case .rare:   return 8
        case .unique: return 10
        case .legend: return 14
        }
    }

    private func statSummary(_ stats: [StatKey: Int]) -> String {
        let parts = StatKey.allCases.compactMap { key -> String? in
            guard let v = stats[key], v != 0 else { return nil }
            return "\(key.label)\(v > 0 ? "+" : "")\(v)"
        }
        return parts.isEmpty ? AppConfig.loc("효과 없음") : parts.joined(separator: " ")
    }
}
