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
    /// 강화 의식이 끝난 뒤 띄울 결과 문구 (웹 결과 모달 대응 — iOS 는 토스트).
    @State private var enhanceMessage: String?
    @State private var showTalismanPicker = false
    /// 강화 확인 다이얼로그의 방지권 토글 2종. 다이얼로그를 열 때마다 기본 ON 으로
    /// 되돌린다 (웹 EquipmentInventory 와 동일) — 소모는 실제로 막아냈을 때만
    /// 일어나므로 켜둔 채로 두는 것이 유저에게 손해가 아니다.
    @State private var useDestroyGuard = true
    @State private var useDownGuard = true
    @State private var toast: String?
    // 05-modal-design — 판매/버리기(비가역)는 GbConfirm 재확인. 강화도 이제 확인을 거친다
    // (성공률·소실/하락 위험·비용·방지권을 보여줘야 하므로 — 웹 GbConfirm 과 같은 자리).
    // 웹 EquipmentInventory.tsx 처럼 pending 하나로 세 액션 공유, title/body 만 분기.
    @State private var pendingAction: PendingEquipAction?

    private enum EquipConfirmKind { case sell, discard, enhance }
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

            // 강화 의식 오버레이. 소리·결과 문구는 연출이 끝난 뒤에 — 2초 연출보다 먼저
            // 들리면 결과가 스포일된다 (웹 Phase 11b-fix 와 같은 이유).
            if let item = enhancingItem, let outcome = enhanceOutcome {
                EnhanceRitualOverlay(equipment: item, outcome: outcome) {
                    enhancingItem = nil
                    enhanceOutcome = nil
                    if outcome == .success {
                        Haptics.play(.success)
                        SoundPlayer.shared.play(.collect)
                    } else {
                        Haptics.play(.warning)
                        SoundPlayer.shared.play(.cancel)
                    }
                    if let msg = enhanceMessage { showToast(msg) }
                    enhanceMessage = nil
                }
                .transition(.opacity)
                .zIndex(50)
            }

            // 05-modal-design — 판매/버리기 재확인 (danger). 웹 EquipmentInventory.tsx:741~ 문구.
            if let pending = pendingAction, pending.kind != .enhance {
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

            // 강화 재확인 — 성공률·소실/하락 위험·비용, 그리고 위험 구간에서만 방지권 토글.
            if let pending = pendingAction, pending.kind == .enhance {
                enhanceConfirm(pending.item)
                    .transition(.opacity)
                    .zIndex(60)
            }

            if let toast { toastView(toast) }
        }
        // 액션 선택 시트 — 장착만 즉시 실행. 강화·판매·버리기는 GbConfirm 재확인을 거친다
        // (강화는 성공률·소실/하락 위험·방지권을 먼저 보여줘야 하므로 즉시 실행에서 승격).
        .confirmationDialog(
            // 액션시트 타이틀은 raw name(한국어 원문) 대신 현지화 표시명 사용 — 전 언어 정합.
            actionItem?.localizedDisplayName ?? "",
            isPresented: Binding(get: { actionItem != nil }, set: { if !$0 { actionItem = nil } }),
            presenting: actionItem
        ) { item in
            Button("장착") { upHero.equipItem(item.id); actionItem = nil }
            // 비용은 등급·현재 레벨에 따라 달라진다 (웹 enhanceCost) — 고정 100 이 아니다.
            let enhanceLevel = item.enhanceLevel ?? 0
            if enhanceLevel < UpHeroRules.maxEnhanceLevel {
                let cost = UpHeroRules.enhanceCost(rarity: item.rarity, currentLevel: enhanceLevel)
                Button(AppConfig.loc("강화 (−\(cost) 코인)")) {
                    useDestroyGuard = true   // 열 때마다 기본 ON (웹 onEnhance)
                    useDownGuard = true
                    pendingAction = PendingEquipAction(kind: .enhance, item: item)
                    actionItem = nil
                }
                .disabled(upHero.state.coins < cost)
            }
            Button("판매 (+\(UpHeroRules.sellPrice[item.rarity] ?? 0) 코인)") {
                pendingAction = PendingEquipAction(kind: .sell, item: item); actionItem = nil
            }
            Button("버리기", role: .destructive) {
                pendingAction = PendingEquipAction(kind: .discard, item: item); actionItem = nil
            }
            Button("취소", role: .cancel) { actionItem = nil }
        }
    }

    // MARK: - 강화 확인 (웹 GbConfirm enhance 분기 1:1)

    /// 강화 확인 다이얼로그에 필요한 파생값. 확률은 전부 `enhanceOutcomeRates` 단일
    /// 출처에서 나온다 — 표시값과 실제 롤이 어긋나지 않도록 한 곳에서만 뽑는다.
    private struct EnhancePreview {
        let level: Int
        let cost: Int
        let successPct: Int
        let destroyPct: Int
        let downPct: Int
        /// 실패해도 소실·하락이 둘 다 0 인 완전 안전 구간인가 (현재 레벨 0..2).
        let safe: Bool
        let canDestroy: Bool
        let canDown: Bool
        let equipped: Bool
    }

    private func enhancePreview(_ item: Equipment) -> EnhancePreview {
        let level = item.enhanceLevel ?? 0
        let rate = UpHeroRules.enhanceSuccessRate(
            rarity: item.rarity, currentLevel: level,
            failStreak: item.enhanceFailStreak ?? 0)
        let rates = UpHeroRules.enhanceOutcomeRates(rarity: item.rarity, currentLevel: level)
        return EnhancePreview(
            level: level,
            cost: UpHeroRules.enhanceCost(rarity: item.rarity, currentLevel: level),
            successPct: Int((rate * 100).rounded()),
            destroyPct: Int((rates.destroy * 100).rounded()),
            downPct: Int((rates.down * 100).rounded()),
            safe: rates.destroy == 0 && rates.down == 0,
            canDestroy: rates.destroy > 0,
            canDown: rates.down > 0,
            equipped: EquipSlot.allCases.contains {
                upHero.state.hero.equipped[$0]?.id == item.id
            })
    }

    /// 이번 시도에 실제로 걸리는 방지권. 웹 `guardArm` 과 같은 3중 조건 —
    /// 토글 ON + 보유 1 이상 + 그 결과가 나올 수 있는 레벨. 안전 구간에서는 걸지 않는다
    /// (걸어도 소모되지 않지만, 애초에 넘기지 않는 편이 계약이 분명하다).
    private func armedGuards(_ item: Equipment) -> EnhanceGuardArm {
        let level = item.enhanceLevel ?? 0
        return EnhanceGuardArm(
            destroy: useDestroyGuard
                && (upHero.state.destroyGuards ?? 0) > 0
                && UpHeroRules.canEnhanceDestroy(rarity: item.rarity, currentLevel: level),
            down: useDownGuard
                && (upHero.state.downGuards ?? 0) > 0
                && UpHeroRules.canEnhanceDowngrade(rarity: item.rarity, currentLevel: level))
    }

    @ViewBuilder
    private func enhanceConfirm(_ item: Equipment) -> some View {
        let p = enhancePreview(item)
        let destroyHeld = upHero.state.destroyGuards ?? 0
        let downHeld = upHero.state.downGuards ?? 0
        GbConfirm(
            title: "\(item.localizedDisplayName) 강화 (+\(p.level) → +\(p.level + 1))?",
            message: "\(enhanceBody(item, p))",
            onBackdropTap: { pendingAction = nil }
        ) { tint in
            VStack(alignment: .leading, spacing: 6) {
                // 해당 결과가 나올 수 있는 레벨에서만 노출한다. 안전 구간에서 권하면
                // 필요 없는 것을 파는 셈이라 아예 그리지 않는다.
                // 보유 0 이면 토글 대신 "어디서 구하는지" 안내만 보여준다.
                if p.canDestroy {
                    if destroyHeld > 0 {
                        guardToggle(kind: .destroy, owned: destroyHeld)
                    } else {
                        guardNoneHint(AppConfig.loc(
                            "\(AppConfig.loc("소실방지권")) 없음 · 보스와 탐험 상자에서 나와요"))
                    }
                }
                if p.canDown {
                    if downHeld > 0 {
                        guardToggle(kind: .down, owned: downHeld)
                    } else {
                        guardNoneHint(AppConfig.loc(
                            "\(AppConfig.loc("하락방지권")) 없음 · 상점에서 살 수 있어요"))
                    }
                }
                GbConfirmStandardFooter(
                    confirmLabel: "강화 시도",
                    cancelLabel: "취소",
                    tint: tint,
                    onConfirm: { runEnhance(item) },
                    onCancel: { pendingAction = nil })
                .padding(.top, 4)
            }
        }
    }

    /// 위험 안내는 정직하게 — 안전 구간에서는 "그대로예요" 라고 말하고, 위험 구간에서는
    /// 소실·하락을 **각각** 숫자로 준다. 하락을 유지와 같은 칸에 묶으면 기만이 된다.
    /// 방지권을 건 줄에는 "막힘" 태그를 붙인다 (웹 blockedTag).
    private func enhanceBody(_ item: Equipment, _ p: EnhancePreview) -> String {
        let armed = armedGuards(item)
        let blocked = AppConfig.loc("· 막힘")
        var lines: [String] = [AppConfig.loc("성공률 \(p.successPct)%")]
        if p.safe {
            lines.append(AppConfig.loc("이 단계는 실패해도 그대로예요"))
        } else {
            if p.canDestroy {
                lines.append(AppConfig.loc("실패 시 \(p.destroyPct)% 확률로 아이템 소실")
                    + (armed.destroy ? " \(blocked)" : ""))
            }
            if p.canDown {
                lines.append(AppConfig.loc("실패 시 \(p.downPct)% 확률로 한 단계 하락")
                    + (armed.down ? " \(blocked)" : ""))
            }
        }
        lines.append(AppConfig.loc("비용 \(p.cost) 코인 (보유 \(upHero.state.coins))"))
        if p.equipped {
            lines.append(AppConfig.loc("장착 중 — 소실 시 스탯이 즉시 하락합니다"))
        }
        return lines.joined(separator: "\n")
    }

    /// 방지권 사용 토글. 체크/원 아이콘은 SettingsView 라디오와 같은 결(박스 없음).
    private func guardToggle(kind: EnhanceGuardKind, owned: Int) -> some View {
        let on = kind == .destroy ? useDestroyGuard : useDownGuard
        let name = AppConfig.loc(kind == .destroy ? "소실방지권" : "하락방지권")
        return Button {
            if kind == .destroy { useDestroyGuard.toggle() } else { useDownGuard.toggle() }
            Haptics.play(.selection)
        } label: {
            HStack(spacing: 8) {
                PixelIcon(on ? .check : .circle, size: 14,
                          color: on ? Color.accentPrimary : GBPalette.light)
                Text(AppConfig.loc("\(name) 쓰기 (보유 \(owned))"))
                    .typography(.caption)
                    .foregroundStyle(on ? GBPalette.lightest : GBPalette.light)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, minHeight: 40, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }

    private func guardNoneHint(_ text: String) -> some View {
        Text(text)
            .typography(.micro)
            .foregroundStyle(GBPalette.light.opacity(0.8))
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func runEnhance(_ item: Equipment) {
        let result = upHero.enhanceItem(item.id, guards: armedGuards(item))
        pendingAction = nil
        switch result {
        case .success:
            startRitual(item, .success, AppConfig.loc("강화 성공"))
        case .keep:
            startRitual(item, .keep, AppConfig.loc("강화 실패 — 아이템은 남았다"))
        case .down:
            startRitual(item, .keep, AppConfig.loc("한 단계 내려갔다"))
        case .guarded(_, let kind):
            startRitual(item, .keep, kind == .destroy
                ? AppConfig.loc("사라질 뻔했다")
                : AppConfig.loc("내려갈 뻔했다"))
        case .destroyed:
            startRitual(item, .destroyed, AppConfig.loc("아이템 소실"))
        case .coinShort(let need):
            failToast(AppConfig.loc("코인 부족 (\(need) 필요)"))
        case .maxed:
            failToast(AppConfig.loc("이미 최대 강화(+\(UpHeroRules.maxEnhanceLevel))예요"))
        case .notFound:
            failToast(AppConfig.loc("아이템을 찾을 수 없음"))
        }
    }

    private func startRitual(_ item: Equipment, _ outcome: EnhanceRitualOutcome, _ message: String) {
        enhancingItem = item
        enhanceOutcome = outcome
        enhanceMessage = message
    }

    /// 시도 자체가 성립하지 않은 경우 — 연출 없이 즉시 알린다 (웹과 동일).
    private func failToast(_ msg: String) {
        Haptics.play(.warning)
        SoundPlayer.shared.play(.cancel)
        showToast(msg)
    }

    // MARK: - 토스트 (ShopView 패턴 재사용)

    private func toastView(_ msg: String) -> some View {
        VStack {
            Spacer()
            Text(msg)
                .typography(.caption)
                .foregroundStyle(Color.textPrimary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16).padding(.vertical, 10)
                .background(Color.bgElevated, in: Capsule())
                .padding(.bottom, 40)
        }
        .allowsHitTesting(false)
    }

    private func showToast(_ msg: String) {
        toast = msg
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { if toast == msg { toast = nil } }
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
            // 그룹 등고(패턴 A) — 빈 슬롯과 장착 카드가 같은 행에서 같은 높이.
            // 고정 height 였던 자리 — Dynamic Type/iPad 에서 라벨이 잘리던 것도 함께 해소.
            .unCardCell(minHeight: CardHeights.equipmentCell)
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
            // 그룹 등고(패턴 A) — 이름 2줄·강화 배지 유무로 갈리던 셀 높이를 행 단위로 통일.
            // 빈 슬롯 카드(EquipmentInventoryView.slotCard)와 같은 바닥값이라 2×2 행이 맞는다.
            .unCardCell(minHeight: CardHeights.equipmentCell)
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
