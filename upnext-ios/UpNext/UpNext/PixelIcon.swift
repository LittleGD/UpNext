//
//  PixelIcon.swift
//  UpNext 디자인 시스템 — 픽셀아트 아이콘.
//
//  웹 src/components/icons/PixelIcon.tsx 대응. pixelarticons npm의 SVG를
//  Assets.xcassets/Icons/에 imageset(template rendering)으로 포팅.
//
//  웹은 string name 동적 로드 → Swift는 enum으로 타입 안전 + 오타 컴파일 차단.
//  사용: PixelIcon(.camera, size: 18, color: .accentPrimary)
//
//  Target: UpNext (App). Widget은 SF Symbols 사용 — 아이콘 에셋이 App 번들에만 있음.
//
//  ════════════════════════════════════════════════════════════════════════════
//  SF Symbol 화이트리스트 (R3 — PixelIcon 표준화)
//  ════════════════════════════════════════════════════════════════════════════
//
//  *PixelIcon 우선 사용*. SF Symbol 은 다음 경우만 허용:
//
//   - `apple.logo` — Apple SIWA 가이드 강제 (커스텀 글리프 불가). LoginView 전용.
//
//  그 외 모든 아이콘은 이 enum 의 케이스 + Assets.xcassets/Icons/ 자산 사용.
//  CI 검증: `scripts/fidelity/icon-audit.sh` 가 PR 마다 차단. 위반 1건이라도 fail.
//

import SwiftUI

/// 앱에서 사용하는 픽셀 아이콘 — Assets.xcassets/Icons/{rawValue}.imageset 와 1:1.
enum PixelIconName: String, CaseIterable {
    case arrowUp        = "ArrowUp"
    case camera         = "Camera"
    case cancel         = "Cancel"
    case card           = "Card"
    case chart          = "Chart"        // R3 신규 — chart.svg
    case check          = "Check"
    case chevronDown    = "ChevronDown"
    case chevronLeft    = "ChevronLeft"
    case chevronRight   = "ChevronRight"
    case coins          = "Coins"
    case fire           = "Fire"
    case flag           = "Flag"
    case flame          = "Flame"        // pixelarticons에 flame 없음 → fire.svg 대체
    case gamepad        = "Gamepad"      // R3 신규 — gamepad.svg
    case gift           = "Gift"
    case heart          = "Heart"
    case image          = "Image"
    case languages      = "Languages"
    case lock           = "Lock"
    case monitor        = "Monitor"
    case moon           = "Moon"
    case moreHorizontal = "MoreHorizontal" // R3 신규 — more-horizontal.svg
    case penSquare      = "PenSquare"
    case play           = "Play"
    case plus           = "Plus"
    case redo           = "Redo"
    case reload         = "Reload"
    case search         = "Search"
    case send           = "Send"
    case sparkle        = "Sparkle"
    case star           = "Star"         // pixelarticons에 star 없음 → sparkle.svg 대체
    case target         = "Target"
    case trash          = "Trash"        // pixelarticons에 trash 없음 → delete.svg 대체
    case trophy         = "Trophy"
    case user           = "User"
    case warningDiamond = "WarningDiamond"
    case zap            = "Zap"
}

/// 픽셀아트 아이콘 뷰. 템플릿 렌더링이라 color로 자유롭게 틴팅.
struct PixelIcon: View {
    let name: PixelIconName
    var size: CGFloat = 24
    var color: Color = .textPrimary

    init(_ name: PixelIconName, size: CGFloat = 24, color: Color = .textPrimary) {
        self.name = name
        self.size = size
        self.color = color
    }

    var body: some View {
        Image(name.rawValue)
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .foregroundStyle(color)
    }
}

#Preview {
    ScrollView {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 5), spacing: 20) {
            ForEach(PixelIconName.allCases, id: \.self) { icon in
                VStack(spacing: 6) {
                    PixelIcon(icon, size: 28, color: .accentPrimary)
                    Text(icon.rawValue)
                        .font(.system(size: 8))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
    }
    .background(Color.bgPrimary)
}
