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

    /// April16th Promise 폰트 실측 결함 보정치 — fontTools 로 hhea/OS2 descent(-220/1000em)와
    /// 실제 라틴 디센더(g/y/p/j/q) 글리프 잉크 yMin(-310/1000em)을 직접 측정한 차이(90/1000em = 0.09em).
    /// 이 폰트는 한글 기준으로 수직 메트릭이 잡혀 있어(한글 yMin=-155, 숫자 yMin=-115 는 -220 안에 들어옴)
    /// 라틴 디센더만 선언된 폰트 박스를 벗어난다. `.lineSpacing()` 은 '줄 사이' 간격만 늘릴 뿐 단일 줄
    /// 텍스트의 실제 렌더 프레임(=1.04em intrinsic)에는 반영되지 않아, 버튼 라벨 등 단일 줄에서도
    /// 디센더가 frame 경계에 닿아 잘린다(조사 리포트 15-font-clipping). 웹은 CSS 가 잉크 오버플로를
    /// 클리핑하지 않아 동일 폰트를 써도 문제가 드러나지 않았을 뿐, 대응하는 웹 코드는 없음(1:1 이식 아님).
    static let latinDescenderOvershoot: CGFloat = 0.09

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
        // 라틴 디센더 클리핑 보정 — family == April16th Promise(ko/en) 일 때만 적용.
        // ja/zh(WDXL Lubrifont JP N / ZCOOL QingKe HuangYou)는 별도 실측이 필요해 범위 밖(후속 이슈).
        // .lineSpacing() 과 달리 .padding(.bottom:) 은 단일 줄/멀티 줄 관계없이 항상 프레임 높이에
        // 반영되므로, 이후 체이닝되는 .frame(height:)/.clipShape()/.clipped() 모두 여유를 포함한
        // 크기를 받는다(개별 호출부 땜빵이 아닌 근본 수정 — 15-font-clipping fixSpec §1).
        let descenderPad = family == AppFont.family ? size * AppFont.latinDescenderOvershoot : 0
        content
            .font(.custom(family, size: size).weight(style.weight))
            .tracking(size * style.trackingEm)
            .lineSpacing(max(0, target - intrinsic))
            .padding(.bottom, descenderPad)
    }
}

extension View {
    func typography(_ style: TextStyle) -> some View {
        modifier(TypographyModifier(style: style))
    }
}
