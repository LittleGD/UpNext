//
//  Typography.swift
//  UpNext 디자인 시스템 — 타이포그래피 6단계 스케일.
//
//  웹 src/app/globals.css의 .typo-* 클래스를 1:1 포팅.
//  Target Membership: UpNext ✅ + UpNextWidgetExtension ✅
//
//  6단계: display > title > heading > body > caption > micro
//  웹은 mobile/tablet/desktop 3-breakpoint. iOS는 iPhone=phone, iPad=pad 2단계로 압축
//  (desktop 사이즈는 iPad에 매핑). CJK 보정은 Phase 5.6 i18n에서 처리.
//
//  폰트: April16th-Promise.ttf (단일 weight 400, bold/semibold는 iOS가 synthesize —
//  웹의 faux-bold 동작과 동일).
//
//  Phase 1.2 (디자인 시스템 Swift 포팅) 산출물.
//

import SwiftUI
import CoreText

// MARK: - 폰트 등록

enum AppFont {
    static let family = "April16th Promise"  // ttf nameID 1 (family name)

    /// 번들에 포함된 커스텀 ttf를 런타임에 등록.
    /// Info.plist UIAppFonts 대신 CTFontManager 사용 — 전 iOS 버전 호환, plist 불필요.
    /// App과 Widget Extension 각각의 init에서 1회 호출.
    static func register() {
        guard let url = Bundle.main.url(forResource: "April16th-Promise", withExtension: "ttf") else {
            return  // ttf 누락 — 시스템 폰트로 graceful fallback
        }
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
    }
}

// MARK: - 타이포 스케일 정의

/// 6단계 텍스트 스타일. 웹 .typo-display ~ .typo-micro 대응.
enum TextStyle {
    case display, title, heading, body, caption, micro

    /// iPhone(compact) 폰트 크기 — globals.css 기본(모바일) 값.
    var phoneSize: CGFloat {
        switch self {
        case .display: return 32
        case .title:   return 24
        case .heading: return 19
        case .body:    return 16
        case .caption: return 14
        case .micro:   return 11
        }
    }

    /// iPad(regular) 폰트 크기 — globals.css desktop(≥1024px) 값.
    var padSize: CGFloat {
        switch self {
        case .display: return 48
        case .title:   return 34
        case .heading: return 24
        case .body:    return 19
        case .caption: return 17
        case .micro:   return 14
        }
    }

    var weight: Font.Weight {
        switch self {
        case .display: return .bold       // 700
        case .title:   return .bold       // 700
        case .heading: return .semibold   // 600
        case .body:    return .medium     // 500
        case .caption: return .regular    // 400
        case .micro:   return .medium     // 500
        }
    }

    /// CSS line-height 배수. SwiftUI는 lineSpacing(절대값)을 쓰므로
    /// `(lineHeight - 1) * fontSize`로 환산해서 적용.
    var lineHeightMultiple: CGFloat {
        switch self {
        case .display: return 1.1
        case .title:   return 1.2
        case .heading: return 1.3
        case .body:    return 1.5
        case .caption: return 1.4
        case .micro:   return 1.3
        }
    }

    /// CSS letter-spacing(em) → SwiftUI tracking(point). fontSize 곱해서 환산.
    var trackingEm: CGFloat {
        switch self {
        case .display: return -0.02
        case .title:   return -0.01
        case .micro:   return 0.02
        default:       return 0
        }
    }
}

// MARK: - View Modifier

private struct TypographyModifier: ViewModifier {
    let style: TextStyle
    @Environment(\.horizontalSizeClass) private var sizeClass

    func body(content: Content) -> some View {
        let size = sizeClass == .regular ? style.padSize : style.phoneSize
        content
            .font(.custom(AppFont.family, size: size).weight(style.weight))
            .tracking(size * style.trackingEm)
            .lineSpacing(size * (style.lineHeightMultiple - 1))
    }
}

extension View {
    /// 디자인 시스템 타이포 스타일 적용. 웹의 `className="typo-heading"`에 대응.
    /// 예: `Text("제목").typography(.heading)`
    func typography(_ style: TextStyle) -> some View {
        modifier(TypographyModifier(style: style))
    }
}
