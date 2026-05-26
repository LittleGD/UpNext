//
//  DropRevealCard.swift
//  UpNext — 세션 결산 후 장비 reveal 카드.
//
//  웹 src/components/uphero/DropRevealCard.tsx 포팅.
//  - 뒷면: rarity 색 보더 + 중앙 "?" 가 fire-flicker (4.2s 호흡)
//  - 탭: 520ms easeOut 으로 rotateY 0→180° flip
//  - 앞면: 등급 chip + 아이콘 + 이름
//  - 한 번 reveal 후 비활성화 (다시 못 뒤집음)
//

import SwiftUI

struct DropRevealCard: View {
    let equipment: Equipment
    var initiallyRevealed: Bool = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var revealed: Bool = false
    @State private var flickerProgress: Double = 0

    var body: some View {
        ZStack {
            // 뒷면
            backFace
                .opacity(revealed ? 0 : 1)
                .rotation3DEffect(.degrees(revealed ? 180 : 0), axis: (x: 0, y: 1, z: 0))

            // 앞면
            frontFace
                .opacity(revealed ? 1 : 0)
                .rotation3DEffect(.degrees(revealed ? 0 : -180), axis: (x: 0, y: 1, z: 0))
        }
        .frame(width: 100, height: 130)
        .contentShape(Rectangle())
        .onTapGesture {
            guard !revealed else { return }
            Haptics.play(.selection)
            withAnimation(.timingCurve(0.23, 1, 0.32, 1, duration: 0.52)) {
                revealed = true
            }
        }
        .onAppear {
            revealed = initiallyRevealed
            // flicker progress 4.2s 호흡
            if !reduceMotion {
                Timer.scheduledTimer(withTimeInterval: 4.2 / 30, repeats: true) { timer in
                    if revealed { timer.invalidate(); return }
                    flickerProgress += 1.0 / 30
                    if flickerProgress > 1 { flickerProgress = 0 }
                }
            }
        }
    }

    private var rarityColor: Color {
        switch equipment.rarity {
        case .normal: return GBPalette.light
        case .rare:   return Color(red: 0.647, green: 0.784, blue: 0.859)  // #a5c8db
        case .unique: return Color(red: 0.804, green: 0.722, blue: 0.529)  // #cdb887
        case .legend: return Color(red: 0.910, green: 0.722, blue: 0.529)  // #e8b887
        }
    }

    private var backFace: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8)
                .fill(GBPalette.dark.opacity(0.85))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(rarityColor, lineWidth: 1)
                )

            // ? 마크 (fire-flicker 호흡)
            Text("?")
                .typography(.title)
                .foregroundStyle(rarityColor)
                .shadow(color: rarityColor.opacity(flickerShadow), radius: 8)
                .opacity(flickerOpacity)
        }
    }

    private var flickerOpacity: Double {
        // 웹 uphero-fire-flicker 의 0.82↔1↔0.88 호흡 근사
        let p = flickerProgress
        if p < 0.45 { return 0.82 + (1.0 - 0.82) * (p / 0.45) }
        else if p < 0.62 { return 1.0 - (1.0 - 0.88) * ((p - 0.45) / 0.17) }
        else { return 0.88 - (0.88 - 0.82) * ((p - 0.62) / 0.38) }
    }

    private var flickerShadow: Double {
        let p = flickerProgress
        if p < 0.45 { return 0.15 + 0.30 * (p / 0.45) }
        else { return 0.45 - 0.30 * ((p - 0.45) / 0.55) }
    }

    private var frontFace: some View {
        VStack(spacing: 6) {
            Text(equipment.rarity.displayName)
                .typography(.micro)
                .foregroundStyle(Color.bgPrimary)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(rarityColor, in: Capsule())

            PixelIcon(PixelIconName.resolve(equipment.iconName), size: 28, color: rarityColor)

            Text(equipment.name)
                .typography(.micro)
                .foregroundStyle(Color.textPrimary)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
        .padding(8)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(GBPalette.dark.opacity(0.85), in: RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(rarityColor, lineWidth: 1)
        )
    }
}

// Equipment.iconName 은 String 으로 모델에 있으며 PixelIconName.resolve 로 안전 변환.
