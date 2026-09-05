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
//   - 강화 → EnhanceRitualOverlay (밴드별 2.0/2.6/3.4s) + 결과 후 토스트
//   - Phase 5-B: +20 상한, 시도당 방지권 패널(GbConfirmPanel), 밴드 힌트, 칭호 칩
//

import SwiftUI

struct EquipmentInventoryView: View {
    @EnvironmentObject private var upHero: UpHeroStore
    let onBack: () -> Void

    @State private var actionItem: Equipment?
    @State private var enhancingItem: Equipment?
    @State private var enhanceOutcome: EnhanceRitualOutcome?
    /// Phase 5-B — 진행 중인 강화 연출의 밴드 (enhanceRitualBand(targetLevel)).
    @State private var enhanceBand = 0
    /// 강화 의식이 끝난 뒤 띄울 결과 문구 (웹 결과 모달 대응 — iOS 는 토스트).
    /// Phase 5-B — 각성/초월 타이틀 + 소모된 방지권 한 줄씩이 여기 실린다.
    @State private var enhanceMessage: String?
    @State private var showTalismanPicker = false
    /// 강화 확인 다이얼로그의 방지권 토글 2종. Phase 5-B — 기본 OFF 이고 다이얼로그를
    /// 열 때마다 OFF 로 되돌린다 (웹 EquipmentInventory 와 동일). 시도당 소모라 켜둔 채
    /// 잊으면 매 시도 1장씩 조용히 나가므로, 명시적 선택만 받는다.
    @State private var useDestroyGuard = false
    @State private var useDownGuard = false
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
                EnhanceRitualOverlay(equipment: item, outcome: outcome, band: enhanceBand) {
                    enhancingItem = nil
                    enhanceOutcome = nil
                    // Phase 5-B — band 0 은 기존 그대로, band 1/2 는 전용 큐 + 햅틱 (웹 onDone).
                    switch outcome {
                    case .success:
                        let cue: SoundName = enhanceBand == 2 ? .enhanceSuccessMax
                            : enhanceBand == 1 ? .enhanceSuccessHigh : .collect
                        Haptics.play(cue.enhanceHapticIntent ?? .success)
                        SoundPlayer.shared.play(cue)
                    case .destroyed:
                        if enhanceBand >= 1 {
                            Haptics.play(SoundName.enhanceShatter.enhanceHapticIntent ?? .heavy)
                            SoundPlayer.shared.play(.enhanceShatter)
                        } else {
                            Haptics.play(.warning)
                            SoundPlayer.shared.play(.cancel)
                        }
                    case .keep:
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
            // Phase 5-B — 사진 부적(photoId) 은 제외. 부적은 사진 부적 탭의 재의식(+10 상한)
            //   경로만 쓴다. 밴드 배지(웹 enhanceBadge)는 버튼 라벨 뒤에 붙인다.
            let enhanceLevel = item.enhanceLevel ?? 0
            if item.photoId == nil && enhanceLevel < UpHeroRules.maxEnhanceLevel {
                let cost = UpHeroRules.enhanceCost(rarity: item.rarity, currentLevel: enhanceLevel)
                let badge = enhanceBandBadge(item).map { " · \($0)" } ?? ""
                Button(AppConfig.loc("강화 (−\(cost) 코인)") + badge) {
                    useDestroyGuard = false   // 열 때마다 OFF (웹 onEnhance, 시도당 소모)
                    useDownGuard = false
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

    /// 이번 시도에 실제로 걸리는(arm 되는) 방지권 — 표시용. 토글 ON + 보유 1 이상 +
    /// 그 결과가 나올 수 있는 레벨. 스토어가 같은 3중 조건을 한 곳에서 다시 검증하므로
    /// 실제 호출에는 토글 값을 그대로 넘긴다 (웹 Phase 5-B 와 동일).
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

    /// Phase 5-B — 밴드 배지 (웹 enhanceBadge). 10..14 "실패 시 한 단계 하락",
    /// 15..19 "소실 N%". 그 외 nil (안전/하위 밴드는 확인 다이얼로그가 숫자로 말한다).
    private func enhanceBandBadge(_ item: Equipment) -> String? {
        let level = item.enhanceLevel ?? 0
        if level >= UpHeroRules.enhanceTitleAwakenedLevel {
            let pct = Int((UpHeroRules.enhanceOutcomeRates(
                rarity: item.rarity, currentLevel: level).destroy * 100).rounded())
            let pctText = "\(pct)%"
            return AppConfig.loc("소실 \(pctText)")
        }
        if level >= UpHeroRules.enhanceHighBandStart {
            return AppConfig.loc("실패 시 한 단계 하락")
        }
        return nil
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
            VStack(alignment: .leading, spacing: 8) {
                // Phase 5-B — 방지권 패널 2종 (웹 sections 슬롯). 안전 구간(소실·하락 0)
                // 에서는 아예 그리지 않는다. 그 외에는 둘 다 그리되, 불가능한 쪽은
                // 회색 NA 로 남긴다.
                if !p.safe {
                    Text(AppConfig.loc("방지권"))
                        .typography(.micro)
                        .foregroundStyle(GBPalette.light)
                    guardPanel(kind: .destroy, held: destroyHeld,
                               armed: useDestroyGuard, applicable: p.canDestroy)
                    guardPanel(kind: .down, held: downHeld,
                               armed: useDownGuard, applicable: p.canDown)
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
    /// 소실·하락을 **각각** 숫자로 준다 (그 결과가 가능한 줄만). 하락을 유지와 같은 칸에
    /// 묶으면 기만이 된다. 방지권을 건 줄에는 "막힘" 태그를 붙인다 (웹 blockedTag).
    /// Phase 5-B — 밴드 힌트(10..14 / 15..19), 방지권이 걸리면 "이번 시도: 코인 + 방지권" 요약.
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
            if p.level >= UpHeroRules.enhanceTitleAwakenedLevel {
                lines.append(AppConfig.loc(
                    "+15 이후 실패는 주로 소실이고, 아니면 +14로 내려가요. 두 방지권을 모두 걸어야 제자리에서 버텨요"))
            } else if p.level >= UpHeroRules.enhanceHighBandStart {
                lines.append(AppConfig.loc(
                    "+10 이후 실패는 한 단계 내려가요. +9로 내려가면 소실 위험이 다시 생겨요"))
            }
        }
        lines.append(AppConfig.loc("비용 \(p.cost) 코인 (보유 \(upHero.state.coins))"))
        var wards: [String] = []
        if armed.destroy { wards.append(AppConfig.loc("소실방지권")) }
        if armed.down { wards.append(AppConfig.loc("하락방지권")) }
        if !wards.isEmpty {
            lines.append(AppConfig.loc("이번 시도: \(p.cost) 코인 + \(wards.joined(separator: " + "))"))
        }
        if p.equipped {
            lines.append(AppConfig.loc("장착 중 — 소실 시 스탯이 즉시 하락합니다"))
        }
        return lines.joined(separator: "\n")
    }

    /// Phase 5-B — 방지권 패널 (웹 GuardPanel). GbConfirmPanel 위에 올라가며, 걸리면
    /// (armed && applicable && held > 0) 라임 글로우.
    ///   - applicable=false : 이 레벨에서 그 결과가 날 수 없다 (소실 0 인 +10..+14 등).
    ///                        회색 NA 문구만, 버튼 없음. 걸어도 소모되지 않는다는 뜻.
    ///   - held 0           : 구하는 경로를 한 줄로.
    ///   - 그 외             : 40pt 토글 + "켜면 이번 시도에 1장 (결과 무관)" 마이크로 힌트.
    private func guardPanel(kind: EnhanceGuardKind, held: Int, armed: Bool, applicable: Bool) -> some View {
        let name = AppConfig.loc(kind == .destroy ? "소실방지권" : "하락방지권")
        let active = armed && applicable && held > 0
        return GbConfirmPanel(active: active, title: name) {
            Text(AppConfig.loc("보유 \(held)"))
                .typography(.micro).monospacedDigit()
                .foregroundStyle(GBPalette.lightest)
                .padding(.horizontal, 6).padding(.vertical, 1)
                .background(GBPalette.darkest, in: RoundedRectangle(cornerRadius: 4))
        } content: {
            if !applicable {
                Text(AppConfig.loc(kind == .destroy
                    ? "이 단계에서는 소실이 없어요" : "이 단계에서는 하락이 없어요"))
                    .typography(.micro)
                    .foregroundStyle(GBPalette.light.opacity(0.5))
                    .padding(.top, 2)
            } else if held <= 0 {
                guardNoneHint(kind == .destroy
                    ? AppConfig.loc("\(name) 없음 · 보스와 탐험 상자에서 나와요")
                    : AppConfig.loc("\(name) 없음 · 상점에서 살 수 있어요"))
                .padding(.top, 2)
            } else {
                guardToggle(kind: kind, on: armed)
                Text(AppConfig.loc("켜면 이번 시도에 1장을 씁니다. 결과와 상관없이 소모돼요"))
                    .typography(.micro)
                    .foregroundStyle(GBPalette.light.opacity(0.8))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// 방지권 사용 토글. 체크/원 아이콘은 SettingsView 라디오와 같은 결(박스 없음).
    private func guardToggle(kind: EnhanceGuardKind, on: Bool) -> some View {
        Button {
            if kind == .destroy { useDestroyGuard.toggle() } else { useDownGuard.toggle() }
            Haptics.play(.selection)
        } label: {
            HStack(spacing: 8) {
                PixelIcon(on ? .check : .circle, size: 14,
                          color: on ? Color.accentPrimary : GBPalette.light)
                Text(AppConfig.loc("이번 시도에 쓰기"))
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
        // Phase 5-B — 토글 값을 그대로 넘긴다. 보유 0 / 그 결과가 불가능한 레벨 검증은
        //   스토어가 한 곳에서 한다 (UI 게이트는 안내용).
        let lvl = item.enhanceLevel ?? 0
        let result = upHero.enhanceItem(
            item.id, guards: EnhanceGuardArm(destroy: useDestroyGuard, down: useDownGuard))
        pendingAction = nil
        let band = UpHeroRules.enhanceRitualBand(targetLevel: lvl + 1)
        switch result {
        case .success(let newItem, _, let spent):
            // 각성(+15..+19) / 초월(+20) 타이틀 (웹 awakenTitle / transcendTitle).
            let newLevel = newItem.enhanceLevel ?? lvl + 1
            let title = newLevel >= UpHeroRules.enhanceTitleTranscendedLevel
                ? AppConfig.loc("초월 강화 성공")
                : newLevel >= UpHeroRules.enhanceTitleAwakenedLevel
                    ? AppConfig.loc("각성 강화 성공")
                    : AppConfig.loc("강화 성공")
            startRitual(item, .success, band, withSpent(title, spent))
        case .keep(_, let spent):
            startRitual(item, .keep, band,
                        withSpent(AppConfig.loc("강화 실패 — 아이템은 남았다"), spent))
        case .down(_, _, let spent):
            startRitual(item, .keep, band, withSpent(AppConfig.loc("한 단계 내려갔다"), spent))
        case .guarded(_, let kind, let spent):
            startRitual(item, .keep, band, withSpent(kind == .destroy
                ? AppConfig.loc("사라질 뻔했다")
                : AppConfig.loc("내려갈 뻔했다"), spent))
        case .destroyed(_, let spent):
            startRitual(item, .destroyed, band, withSpent(AppConfig.loc("아이템 소실"), spent))
        case .coinShort(let need):
            failToast(AppConfig.loc("코인 부족 (\(need) 필요)"))
        case .maxed:
            failToast(AppConfig.loc("이미 최대 강화(+\(UpHeroRules.maxEnhanceLevel))예요"))
        case .notFound:
            failToast(AppConfig.loc("아이템을 찾을 수 없음"))
        }
    }

    /// Phase 5-B — 소모된 방지권을 한 줄씩 덧붙인다 (웹 EnhanceResultModal spent.line).
    /// 시도당 소모라 어떤 결과에서도 나올 수 있다.
    private func withSpent(_ message: String, _ spent: EnhanceGuardSpend) -> String {
        var lines = [message]
        let destroyName = AppConfig.loc("소실방지권")
        let downName = AppConfig.loc("하락방지권")
        if spent.destroy > 0 { lines.append(AppConfig.loc("\(destroyName) 1장 사용")) }
        if spent.down > 0 { lines.append(AppConfig.loc("\(downName) 1장 사용")) }
        return lines.joined(separator: "\n")
    }

    private func startRitual(
        _ item: Equipment, _ outcome: EnhanceRitualOutcome, _ band: Int, _ message: String
    ) {
        enhancingItem = item
        enhanceOutcome = outcome
        enhanceBand = band
        enhanceMessage = message
        // Phase 5-B — band >= 1 은 시작 시 충전음 (결과와 무관해 스포일 아님).
        if band >= 1 {
            Haptics.play(SoundName.enhanceCharge.enhanceHapticIntent ?? .light)
            SoundPlayer.shared.play(.enhanceCharge)
        }
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
                        // Phase 5-B — +N 칩 톤은 밴드 표 (웹 enhanceChipTone):
                        //   1..9 어두운 배경 / 10..14 legend 골드 / 15..19 라임 + 글로우 /
                        //   20 라임 + 더 강한 글로우. 보더 없음.
                        let tone = EnhanceChipTone.forLevel(lvl)
                        Text("+\(lvl)")
                            .typography(.micro).monospacedDigit()
                            .foregroundStyle(tone.fg)
                            .padding(.horizontal, 4).padding(.vertical, 1)
                            .background(tone.bg, in: RoundedRectangle(cornerRadius: 3))
                            .shadow(color: tone.glow, radius: tone.glowRadius)
                            .accessibilityLabel(AppConfig.loc("강화 +\(lvl)"))
                    }
                    Spacer(minLength: 0)
                }
                PixelIcon(PixelIconName.resolve(item.iconName), size: 28, color: item.rarity.color)
                Text(item.localizedDisplayName)
                    .typography(.micro)
                    .foregroundStyle(Color.textPrimary)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                // Phase 5-B — 칭호 칩 (각성/초월). 저장하지 않고 레벨에서 파생. 3열 인벤토리
                // 카드(웹 sm)는 공간이 없어 장착 슬롯 카드(웹 md/lg)에서만 그린다.
                if slot != nil, let title = UpHeroRules.enhanceTitle(level: item.enhanceLevel ?? 0) {
                    let titleText = AppConfig.loc(String.LocalizationValue(EnhanceChipTone.titleKey(title)))
                    Text(titleText)
                        .typography(.micro)
                        .foregroundStyle(GBPalette.lightest)
                        .padding(.horizontal, 5).padding(.vertical, 1)
                        .background(GBPalette.lightest.opacity(0.13), in: Capsule())
                        .accessibilityLabel(AppConfig.loc("칭호 \(titleText)"))
                }
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

// MARK: - Phase 5-B — +N 칩 톤 (웹 EquipmentCard.enhanceChipTone)

/// 강화 레벨 칩의 밴드별 톤. 1..9 어두운 배경, 10..14 legend 골드, 15..19 라임 + 글로우,
/// 20 라임 + 더 강한 글로우. 보더는 쓰지 않는다 (카드/버튼 보더 금지 규칙).
struct EnhanceChipTone {
    let bg: Color
    let fg: Color
    let glow: Color
    let glowRadius: CGFloat

    static func forLevel(_ level: Int) -> EnhanceChipTone {
        if level >= UpHeroRules.enhanceTitleTranscendedLevel {
            return EnhanceChipTone(bg: GBPalette.lightest, fg: GBPalette.darkest,
                                   glow: GBPalette.lightest, glowRadius: 6)
        }
        if level >= UpHeroRules.enhanceTitleAwakenedLevel {
            return EnhanceChipTone(bg: GBPalette.lightest, fg: GBPalette.darkest,
                                   glow: GBPalette.lightest.opacity(0.67), glowRadius: 3)
        }
        if level >= UpHeroRules.enhanceHighBandStart {
            return EnhanceChipTone(bg: GBPalette.legend, fg: GBPalette.darkest,
                                   glow: .clear, glowRadius: 0)
        }
        return EnhanceChipTone(bg: GBPalette.darkest.opacity(0.87), fg: GBPalette.lightest,
                               glow: .clear, glowRadius: 0)
    }

    /// 칭호 카탈로그 키 (웹 uphero.enhance.title.awakened / transcended 와 같은 dotted 키).
    static func titleKey(_ title: EnhanceTitle) -> String {
        "uphero.enhance.title.\(title.rawValue)"
    }
}
