//
//  PhotoTalismanPicker.swift
//  UpNext — 사진 부적 만들기 화면.
//
//  웹 components/uphero/PhotoTalismanPicker.tsx 포팅. 장비 인벤토리의 "사진 부적
//  만들기" CTA 에서 열림. 미바인딩 사진 그리드 → 선택 → 80코인 확인 → 랜덤 rarity
//  부적 생성 → reveal. 이미 바인딩된 사진은 재의식(+1 강화) 리스트로 분리.
//  디자인 규칙 준수 — 보더·아이콘 박스 금지.
//

import SwiftUI

struct PhotoTalismanPicker: View {
    let onClose: () -> Void

    @EnvironmentObject private var upHero: UpHeroStore
    @EnvironmentObject private var growth: GrowthStore

    @State private var pendingBind: PhotoMeta?
    @State private var pendingRebind: (photo: PhotoMeta, item: Equipment)?
    @State private var revealItem: Equipment?
    @State private var toast: String?

    private let cols = [GridItem(.flexible(), spacing: 10),
                        GridItem(.flexible(), spacing: 10),
                        GridItem(.flexible(), spacing: 10)]

    private var photos: [PhotoMeta] { growth.photoMetas }
    private var unbound: [PhotoMeta] {
        photos.filter { !PhotoTalisman.isBound($0.id, inventory: upHero.state.inventory,
                                               equipped: upHero.state.hero.equipped) }
    }
    private var bound: [(photo: PhotoMeta, item: Equipment)] {
        photos.compactMap { p in
            PhotoTalisman.findBound(p.id, inventory: upHero.state.inventory,
                                    equipped: upHero.state.hero.equipped)
                .map { (p, $0.item) }
        }
    }

    var body: some View {
        ZStack {
            Color.bgPrimary.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                rarityTable
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        if photos.isEmpty { emptyHint }
                        if !unbound.isEmpty { unboundSection }
                        if !bound.isEmpty { boundSection }
                    }
                    .padding(16)
                    .padding(.bottom, 40)
                }
            }
            if let item = revealItem { revealView(item) }
            if let t = toast { toastView(t) }
        }
        .overlay { confirmOverlay }
    }

    // MARK: 헤더

    private var header: some View {
        HStack(spacing: 8) {
            Button(action: onClose) {
                HStack(spacing: 2) {
                    PixelIcon(.chevronLeft, size: 14, color: Color.textSecondary)
                    Text("닫기").typography(.caption).foregroundStyle(Color.textSecondary)
                }
                .frame(height: 40).padding(.horizontal, 6)
            }
            .buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 1) {
                Text("사진 부적").typography(.body).foregroundStyle(Color.textPrimary)
                Text("미바인딩 \(unbound.count) · 부적 \(bound.count) · \(PhotoTalisman.ritualCost)코인")
                    .typography(.micro).monospacedDigit().foregroundStyle(Color.textTertiary)
            }
            Spacer()
            HStack(spacing: 4) {
                PixelIcon(.coins, size: 14, color: Color.accentPrimary)
                Text("\(upHero.state.coins)").typography(.caption).monospacedDigit()
                    .foregroundStyle(Color.accentPrimary)
            }
            .padding(.trailing, 8)
        }
        .padding(.horizontal, 8).padding(.vertical, 6)
    }

    // MARK: rarity 확률 표

    private var rarityTable: some View {
        HStack(spacing: 14) {
            rarityProb(.normal, AppConfig.loc("일반"), 50)
            rarityProb(.rare, AppConfig.loc("레어"), 35)
            rarityProb(.unique, AppConfig.loc("유니크"), 12)
            rarityProb(.legend, AppConfig.loc("레전드"), 3)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(Color.bgSurface.opacity(0.5))
    }

    private func rarityProb(_ r: Rarity, _ label: String, _ pct: Int) -> some View {
        HStack(spacing: 4) {
            Circle().fill(r.color).frame(width: 6, height: 6)
            Text(label).typography(.micro).foregroundStyle(r.color)
            Text("\(pct)%").typography(.micro).monospacedDigit().foregroundStyle(Color.textTertiary)
        }
    }

    // MARK: 섹션

    private var emptyHint: some View {
        Text("아직 사진이 없어요.\n챌린지를 완료하고 사진을 남기면 부적으로 만들 수 있어요.")
            .typography(.caption).foregroundStyle(Color.textTertiary)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity).padding(.top, 40)
    }

    private var unboundSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                PixelIcon(.sparkle, size: 14, color: Color.accentPrimary)
                Text("새 부적 만들기").typography(.caption).foregroundStyle(Color.textPrimary)
            }
            LazyVGrid(columns: cols, spacing: 10) {
                ForEach(unbound) { p in
                    Button { pendingBind = p } label: { photoThumb(p) }
                        .buttonStyle(.plain)
                        .disabled(upHero.state.coins < PhotoTalisman.ritualCost)
                        .opacity(upHero.state.coins < PhotoTalisman.ritualCost ? 0.5 : 1)
                }
            }
        }
    }

    private var boundSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                PixelIcon(.flame, size: 14, color: Color.accentPrimary)
                Text("재의식 — 강화 (최대 +\(PhotoTalisman.maxEnhanceLevel))")
                    .typography(.caption).foregroundStyle(Color.textPrimary)
            }
            VStack(spacing: 8) {
                ForEach(bound, id: \.item.id) { entry in
                    rebindRow(entry.photo, entry.item)
                }
            }
        }
    }

    private func rebindRow(_ photo: PhotoMeta, _ item: Equipment) -> some View {
        let level = item.enhanceLevel ?? 0
        let isMax = level >= PhotoTalisman.maxEnhanceLevel
        let cost = PhotoTalisman.rebindCost(currentLevel: level)
        let canAfford = upHero.state.coins >= cost
        return HStack(spacing: 10) {
            PixelIcon(.image, size: 16, color: item.rarity.color).frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.localizedDisplayName).typography(.caption).foregroundStyle(Color.textPrimary).lineLimit(1)
                Text("+\(level) → +\(min(PhotoTalisman.maxEnhanceLevel, level + 1))")
                    .typography(.micro).monospacedDigit().foregroundStyle(Color.textTertiary)
            }
            Spacer(minLength: 0)
            Button { if !isMax && canAfford { pendingRebind = (photo, item) } } label: {
                Text(isMax ? "MAX" : AppConfig.loc("재의식 \(cost)"))
                    .typography(.micro).monospacedDigit()
                    .foregroundStyle((isMax || !canAfford) ? Color.textTertiary : Color.bgPrimary)
                    .padding(.horizontal, 12).frame(height: 36)
                    .background((isMax || !canAfford) ? Color.bgElevated : Color.accentPrimary,
                                in: RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain).disabled(isMax || !canAfford)
        }
        .padding(12)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 10))
    }

    private func photoThumb(_ photo: PhotoMeta) -> some View {
        VStack(spacing: 0) {
            ZStack {
                Color.black
                if let img = growth.image(for: photo.id) {
                    Image(uiImage: img).resizable().scaledToFill()
                } else {
                    PixelIcon(.image, size: 20, color: Color.textTertiary)
                }
                if let cat = photo.category {
                    Circle().fill(Color(hexString: Dungeons.all[cat]?.themeColor ?? "#808080"))
                        .frame(width: 8, height: 8)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                        .padding(5)
                }
            }
            .aspectRatio(1, contentMode: .fill)
            .clipped()
            Text(photo.date)
                .typography(.micro).monospacedDigit()
                .foregroundStyle(Color.inkWarmText)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 5).padding(.vertical, 4)
                .background(Color.paperCream)
        }
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    // MARK: 확인 다이얼로그

    @ViewBuilder private var confirmOverlay: some View {
        if let p = pendingBind {
            confirmCard(
                title: AppConfig.loc("사진 부적 만들기"),
                body: AppConfig.loc("\(PhotoTalisman.ritualCost) 코인을 써서 이 사진을 부적으로 만들어요. 등급은 무작위예요."),
                confirm: AppConfig.loc("의식 시작"),
                onConfirm: {
                    pendingBind = nil
                    let r = upHero.bindPhotoAsTalisman(photo: p)
                    if r.ok { revealItem = r.item } else if let e = r.error { showToast(e) }
                },
                onCancel: { pendingBind = nil })
        } else if let rb = pendingRebind {
            let lvl = rb.item.enhanceLevel ?? 0
            confirmCard(
                title: AppConfig.loc("재의식 — \(rb.item.localizedDisplayName)"),
                body: AppConfig.loc("\(PhotoTalisman.rebindCost(currentLevel: lvl)) 코인으로 +\(lvl) → +\(lvl + 1) 강화해요. +5·+10 에서 부적 스킬을 얻어요."),
                confirm: AppConfig.loc("재의식"),
                onConfirm: {
                    pendingRebind = nil
                    let r = upHero.rebindPhotoTalisman(photoId: rb.photo.id)
                    if r.ok { revealItem = r.item } else if let e = r.error { showToast(e) }
                },
                onCancel: { pendingRebind = nil })
        }
    }

    private func confirmCard(title: String, body: String, confirm: String,
                             onConfirm: @escaping () -> Void,
                             onCancel: @escaping () -> Void) -> some View {
        ZStack {
            Color.black.opacity(0.6).ignoresSafeArea().onTapGesture(perform: onCancel)
            VStack(spacing: 14) {
                Text(title).typography(.body).foregroundStyle(Color.textPrimary)
                    .multilineTextAlignment(.center)
                Text(body).typography(.caption).foregroundStyle(Color.textTertiary)
                    .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                // 중첩 다이얼로그(bgSurface 카드) 위 — 취소는 대비 위해 bgElevated 채움이라
                // secondary(bgSurface) 로 흡수하면 카드에 묻힌다. 두 버튼의 짝(46pt) 유지 +
                // 공통 press 어포던스만 얹는다.
                HStack(spacing: 10) {
                    Button(action: onCancel) {
                        Text("취소").typography(.body).foregroundStyle(Color.textSecondary)
                            .frame(maxWidth: .infinity).frame(height: 46)
                            .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 12))
                    }.buttonStyle(.unPress)
                    Button(action: onConfirm) {
                        Text(confirm).typography(.body).foregroundStyle(Color.bgPrimary)
                            .frame(maxWidth: .infinity).frame(height: 46)
                            .background(Color.accentPrimary, in: RoundedRectangle(cornerRadius: 12))
                    }.buttonStyle(.unPress)
                }
            }
            .padding(22).frame(maxWidth: 320)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 18))
            .padding(.horizontal, 32)
        }
    }

    // MARK: reveal

    private func revealView(_ item: Equipment) -> some View {
        ZStack {
            Color.black.opacity(0.85).ignoresSafeArea()
            VStack(spacing: 0) {
                VStack(spacing: 6) {
                    Text(item.rarity.displayName).typography(.caption).tracking(1)
                        .foregroundStyle(item.rarity.color)
                    Text(item.localizedDisplayName).typography(.heading).foregroundStyle(Color.textPrimary)
                }
                .frame(maxWidth: .infinity).padding(.vertical, 18)
                .background(LinearGradient(colors: [item.rarity.color.opacity(0.18), .clear],
                                           startPoint: .top, endPoint: .bottom))
                VStack(alignment: .leading, spacing: 8) {
                    Text("스탯").typography(.caption).foregroundStyle(Color.textTertiary)
                    ForEach(item.stats.sorted(by: { $0.value > $1.value }), id: \.key) { k, v in
                        Text("\(statLabel(k)) +\(v)").typography(.caption).foregroundStyle(Color.textPrimary)
                    }
                    if let skills = item.talismanSkills, !skills.isEmpty {
                        Text("부적 스킬").typography(.caption).foregroundStyle(Color.textTertiary).padding(.top, 4)
                        ForEach(skills, id: \.self) { sid in
                            // 런타임 문자열 — 인앱 언어 카탈로그 경유(HeroStatPanel 과 동일 패턴).
                            Text(AppConfig.locRuntime(TalismanSkills.catalog[sid]?.name ?? sid))
                                .typography(.caption).foregroundStyle(Color.accentPrimary)
                        }
                    }
                    if let flavor = item.flavor {
                        // rarity prefix(회상의/빛바랜/운명의/신성한)만 현지화, 사용자 텍스트는 원문 유지.
                        Text(PhotoTalisman.localizedFlavor(flavor, rarity: item.rarity))
                            .typography(.micro).foregroundStyle(Color.textTertiary)
                            .fixedSize(horizontal: false, vertical: true).padding(.top, 4)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(16)
                Button("인벤토리로") { revealItem = nil }
                    .buttonStyle(.un(.primary))
                    .padding(16)
            }
            .frame(maxWidth: 320)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 18))
            .padding(.horizontal, 28)
        }
    }

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

    private func statLabel(_ k: StatKey) -> String {
        switch k {
        case .slotBonus: return AppConfig.loc("슬롯")
        case .crit:      return AppConfig.loc("크리")
        default:         return k.rawValue.uppercased()
        }
    }
}
