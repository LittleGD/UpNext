//
//  Typography.swift
//  UpNext 디자인 시스템 — 타이포그래피 6단계 + 다국어 폰트 오버라이드.
//
//  웹 src/app/globals.css 의 .typo-* 클래스 + 언어별 폰트 오버라이드 포팅:
//    - ko → April16th-Promise (기본)
//    - en → April16th-Promise (사용자 결정: KO와 동일 브랜드 폰트. 라틴 글리프 포함)
//    - ja → 'WDXL Lubrifont JP N' (Google Fonts, OFL)
//    - zh → 'ZCOOL QingKe HuangYou' (Google Fonts, OFL)
//
//  6단계: display > title > heading > body > caption > micro
//
//  번들 TTF (UpNext/ 동기화 폴더 → 자동 번들, register() 가 런타임 등록):
//    - April16th-Promise.ttf (ko·en)
//    - WDXLLubrifontJPN-Regular.ttf (ja) / ZCOOLQingKeHuangYou-Regular.ttf (zh)
//  파일이 없으면 자동으로 fallback 폰트가 적용됨.
//

import SwiftUI
import CoreText
import UIKit

// MARK: - 폰트 등록

enum AppFont {
    static let family = "April16th Promise"

    /// 언어 코드 (ko/en/ja/zh) 로 폰트 family 결정. bundle 에 ttf 있으면 사용, 없으면 fallback.
    static func family(forLangCode code: String) -> String {
        switch code {
        case "ko":
            return AppFont.family
        case "en":
            return AppFont.family   // 사용자 결정: EN = KO 동일 브랜드 폰트(April16th, 라틴 글리프 포함)
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
        case .caption: return 15   // 웹 14 대비 +1 — OLED/고DPI 에서 '작다' 증상 보정
        case .micro:   return 12   // 웹 11 대비 +1 — 본문/라벨에 쓰일 때 가독성 하한 확보
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
        // 줄간 보정 — SwiftUI .lineSpacing 은 폰트 intrinsic line height '위에 더해지는'
        // 추가 간격이라, 웹 CSS line-height(em 배수로 줄상자 치환)와 의미가 다르다.
        // 기존 size*(mult-1) 은 intrinsic 을 무시해 이중 계산(다중 줄이 들쭉날쭉)됐다.
        // 실제 폰트 행높이(intrinsic)를 빼고 목표 행높이(size*mult)와의 차이만 추가한다.
        let intrinsic = UIFont(name: family, size: size)?.lineHeight ?? size * 1.2
        let target = size * style.lineHeightMultiple
        // 라틴 디센더(g/y/p/j/q) 클리핑은 폰트 파일 자체의 hhea.descent/OS2.sTypoDescender/
        // usWinDescent 를 실측 잉크 yMin(-310/1000em) 을 포함하도록 -320/1000em 로 패치해
        // 근본 수정했다(20-font-clip-again fixSpec §1~§2, April16th-Promise.ttf). 폰트가 스스로
        // 올바른 수직 경계를 보고하므로 Text 의 intrinsic sizing 이 처음부터 잉크 전체를 포함해
        // 레이아웃하고, 여기서 별도로 `.padding(.bottom:)` 을 덧붙일 필요가 없다(그 방식은 Text
        // 자신의 렌더 캔버스가 아니라 바깥 래퍼 프레임만 넓혀 실제로는 클리핑을 막지 못했다).
        content
            .font(.custom(family, size: size).weight(style.weight))
            .tracking(size * style.trackingEm)
            .lineSpacing(max(0, target - intrinsic))
    }
}

extension View {
    func typography(_ style: TextStyle) -> some View {
        modifier(TypographyModifier(style: style))
    }
}
