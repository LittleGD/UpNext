//
//  Typography.swift
//  UpNext 디자인 시스템 — 타이포그래피 6단계 + 다국어 폰트 오버라이드.
//
//  웹 src/app/globals.css 의 .typo-* 클래스 + 언어별 폰트 오버라이드 1:1 포팅:
//    - ko → April16th-Promise (기본)
//    - en → 'slight-chance-mono' (Typekit) — bundle 미포함 시 monospaced fallback
//    - ja → 'WDXL Lubrifont JP N' (Google Fonts) — bundle 미포함 시 system fallback
//    - zh → 'ZCOOL QingKe HuangYou' (Google Fonts) — bundle 미포함 시 system fallback
//
//  6단계: display > title > heading > body > caption > micro
//
//  Bundle 에 추가할 TTF/OTF (선택):
//    - SlightChanceMono-Regular.otf
//    - WDXLLubrifontJPN-Regular.ttf
//    - ZCOOLQingKeHuangYou-Regular.ttf
//  파일이 없으면 자동으로 fallback 폰트가 적용됨.
//

import SwiftUI
import CoreText

// MARK: - 폰트 등록

enum AppFont {
    static let family = "April16th Promise"

    /// 언어 코드 (ko/en/ja/zh) 로 폰트 family 결정. bundle 에 ttf 있으면 사용, 없으면 fallback.
    static func family(forLangCode code: String) -> String {
        switch code {
        case "ko":
            return AppFont.family
        case "en":
            return registered("slight-chance-mono") ?? "Menlo"
        case "ja":
            return registered("WDXL Lubrifont JP N") ?? AppFont.family
        case "zh":
            return registered("ZCOOL QingKe HuangYou") ?? AppFont.family
        default:
            return AppFont.family
        }
    }

    private static func registered(_ name: String) -> String? {
        // UIFont 가 폰트를 알면 그 이름 반환.
        return UIFont(name: name, size: 12) != nil ? name : nil
    }

    /// 번들에 포함된 ttf/otf 들을 런타임에 등록.
    static func register() {
        for (base, ext) in [
            ("April16th-Promise", "ttf"),
            ("SlightChanceMono-Regular", "otf"),
            ("WDXLLubrifontJPN-Regular", "ttf"),
            ("ZCOOLQingKeHuangYou-Regular", "ttf"),
        ] {
            guard let url = Bundle.main.url(forResource: base, withExtension: ext) else { continue }
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }
}

// MARK: - 타이포 스케일 정의

enum TextStyle {
    case display, title, heading, body, caption, micro

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

    /// CJK 가독성 보정 — 한자 +1px (globals.css 의 lang=ja/zh 매핑).
    func cjkSize(phone: CGFloat) -> CGFloat {
        switch self {
        case .display: return phone + 2
        case .title:   return phone + 2
        case .heading: return phone + 2
        case .body:    return phone + 1
        case .caption: return phone + 1
        case .micro:   return phone + 1
        }
    }

    var weight: Font.Weight {
        switch self {
        case .display: return .bold
        case .title:   return .bold
        case .heading: return .semibold
        case .body:    return .medium
        case .caption: return .regular
        case .micro:   return .medium
        }
    }

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
    @Environment(\.locale) private var locale

    func body(content: Content) -> some View {
        let code = locale.language.languageCode?.identifier ?? "ko"
        let baseSize = sizeClass == .regular ? style.padSize : style.phoneSize
        // CJK 보정 (ja/zh)
        let size = (code == "ja" || code == "zh") ? style.cjkSize(phone: baseSize) : baseSize
        let family = AppFont.family(forLangCode: code)
        content
            .font(.custom(family, size: size).weight(style.weight))
            .tracking(size * style.trackingEm)
            .lineSpacing(size * (style.lineHeightMultiple - 1))
    }
}

extension View {
    func typography(_ style: TextStyle) -> some View {
        modifier(TypographyModifier(style: style))
    }
}
