//
//  PolaroidFrame.swift
//  UpNext — 폴라로이드 프레임 5종 (Figma 184×223 aspect ratio).
//
//  웹 src/components/growth/PolaroidFrameBase.tsx + PolaroidFrame1~5.tsx 의 SwiftUI 포팅.
//  공통 렌더 로직 + 5 variant 의 decoration (fold/crack) 차이만 분리.
//
//  레이아웃 (모든 variant 공통):
//   - 사진 영역: (15/184, 14/223) = (8.15%, 6.28%) 위치, 154/184 × 157/223 = (83.7%, 70.4%) 크기
//   - 검은 배경 #010101 + Kodak 필터 + 그레인 + 비네팅 + 오렌지 날짜 스탬프
//   - 캡션/서명 영역: 사진 아래 여백 (children)
//   - 빈티지 앰버 오버레이: timestamp 기준 0-21일 동안 점진적 황변 (0~25% opacity)
//

import SwiftUI

// MARK: - 폴라로이드 지오메트리 (화면 렌더 ⇄ 저장 합성 단일 진실의 원천)
//
// WYSIWYG 규약: PolaroidFrame(화면)과 PolaroidComposite(저장 600px 캔버스)는 **반드시**
// 이 비율만 보고 그린다. 과거엔 화면이 고정 pt(스탬프 11pt·fold 14pt·해칭 3pt)를,
// 합성이 별도 고정 px(스탬프 22px·fold 없음)를 써서 "꾸민 것"과 "앨범에서 보는 것"이
// 달랐다. 모든 치수를 프레임 가로폭 비율로 표현하면 어떤 크기로 그려도 동일해진다.
// (300 = 실기기 폴라로이드 표시 폭 기준값. 이 값으로 나눠 기존 디자인 수치를 비율화.)
enum PolaroidGeometry {
    /// 디자인 기준 표시 폭 — 기존 고정 pt 수치를 비율로 환산할 때의 분모.
    static let designWidth: CGFloat = 300

    // 사진/캡션 영역 — Figma 184×223 원본 비율.
    static let photoXRatio: CGFloat = 15.0 / 184.0
    static let photoYRatio: CGFloat = 14.0 / 223.0
    static let photoWRatio: CGFloat = 154.0 / 184.0
    static let photoHRatio: CGFloat = 157.0 / 223.0
    static let captionYRatio: CGFloat = (14.0 + 157.0) / 223.0

    // 오렌지 날짜 스탬프.
    static let stampFont: CGFloat = 11 / designWidth
    static let stampTracking: CGFloat = 1.2 / designWidth
    static let stampPad: CGFloat = 8 / designWidth
    static let stampGlow: CGFloat = 4 / designWidth

    // 모서리 fold / 크랙 데코레이션.
    static let foldSide: CGFloat = 14 / designWidth
    static let crackBoxW: CGFloat = 50 / designWidth
    static let crackBoxH: CGFloat = 12 / designWidth
    static let crackLen: CGFloat = 38 / designWidth
    static let crackLine: CGFloat = 0.6 / designWidth

    // 캡션 crosshatch 엠보스 — 캡션 폭 기준(≈250 @designWidth).
    static let hatchStep: CGFloat = 3 / 250
    static let hatchLine: CGFloat = 0.5 / 250

    /// 종이 그레인 오버레이 불투명도 (multiply).
    static let grainOpacity: CGFloat = 0.16
    /// 프레임 가장자리 어두움 stroke.
    static let edgeLine: CGFloat = 3 / designWidth

    static let stampColor = (r: 1.0, g: 107.0 / 255.0, b: 53.0 / 255.0)

    /// 웹 PolaroidFrameBase.tsx 포맷 `'YY MM DD HH:mm`.
    ///   Unicode 패턴에서 `'`는 리터럴 구간 구분자라, 닫히지 않은 `'yy…`는 뒤 전체를
    ///   리터럴로 삼아 "yy MM dd HH:mm" 이 그대로 찍힌다. 아포스트로피는 `''` 로 이스케이프.
    static func dateStamp(_ timestamp: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")   // 그레고리력·아라비아 숫자 고정
        f.dateFormat = "''yy MM dd HH:mm"
        return f.string(from: timestamp)
    }
}

enum PolaroidFrameVariant: Int, CaseIterable {
    case one = 1, two, three, four, five

    var backgroundHex: UInt32 {
        // Frame5 는 밝은 아이보리, 나머지는 베이지.
        self == .five ? 0xF9F8F5 : 0xF2F1EE
    }

    var aspectRatio: CGFloat {
        // Frame4 만 184/224, 나머지는 184/223.
        self == .four ? 184.0 / 224.0 : 184.0 / 223.0
    }

    /// 랜덤 프레임 선택 — 웹 PolaroidFrame.tsx:35-42 `pickVariant` 1:1 포팅.
    /// Knuth multiplicative hash `((ms * 2654435761) >>> 0) % 100` → 가중 버킷:
    /// 0-9 F1, 10-19 F2, 20-29 F3, 30-39 F4, 40-99 F5 (F5 흰색 60%, F1~4 각 10%).
    /// timestamp 는 저장 메타의 일부라 재현 가능(프레임 = 사진의 영구 속성).
    /// 사용자 선택 UI 없음 — 촬영 시점 timestamp 로 1회 결정하는 게 정상 경로.
    static func random(timestamp: Date) -> PolaroidFrameVariant {
        // 웹은 JS Number(double) * uint 후 `>>> 0`(ToUint32) — 동일 IEEE754 double
        // 연산 + mod 2^32 로 재현.
        let ms = (timestamp.timeIntervalSince1970 * 1000).rounded(.down)
        let product = ms * 2654435761.0
        let mod = product.truncatingRemainder(dividingBy: 4294967296.0)  // 2^32
        let u = mod < 0 ? mod + 4294967296.0 : mod
        let h = Int(u.rounded(.down)) % 100
        switch h {
        case ..<10: return .one
        case ..<20: return .two
        case ..<30: return .three
        case ..<40: return .four
        default:    return .five
        }
    }

    /// 데코레이션 — variant 별 모서리 fold + 크랙 위치 (단순화 — 픽토그램 fold).
    var decorations: [FrameDecoration] {
        switch self {
        case .one:
            return [.fold(.topLeading)]
        case .two:
            return [.fold(.topTrailing), .fold(.bottomLeading)]
        case .three:
            return [.fold(.topLeading), .fold(.topTrailing), .crack(.bottomLeading)]
        case .four:
            return [.fold(.bottomLeading), .fold(.bottomTrailing), .crack(.topTrailing)]
        case .five:
            return [.crack(.topLeading)]
        }
    }
}

enum FrameDecoration {
    case fold(Alignment)
    case crack(Alignment)
}

struct PolaroidFrame<Caption: View>: View {
    /// **이미 Kodak 필터가 적용된** 표시용 이미지 (06-photo-flow(a/perf)).
    /// 예전 `imageData: Data?` → body 안에서 `UIImage(data:)` + `applyKodak` 를
    /// 매 렌더 동기 실행하던 병목을 제거했다. 필터는 캡처 직후 백그라운드에서 1회만.
    let image: UIImage?
    let timestamp: Date
    let variant: PolaroidFrameVariant
    @ViewBuilder let caption: () -> Caption

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = w / variant.aspectRatio
            let photoX = w * PolaroidGeometry.photoXRatio
            let photoY = h * PolaroidGeometry.photoYRatio
            let photoW = w * PolaroidGeometry.photoWRatio
            let photoH = h * PolaroidGeometry.photoHRatio
            let captionY = h * PolaroidGeometry.captionYRatio
            let captionH = h - captionY

            ZStack(alignment: .topLeading) {
                // 배경 베이지/아이보리
                Color(hex: variant.backgroundHex)
                    .frame(width: w, height: h)
                    .clipShape(RoundedRectangle(cornerRadius: 2))

                // 사진 영역
                ZStack {
                    Color(hex: 0x010101)
                    if let image {
                        // 이미 필터된 이미지 — body 에서 CIFilter/디코드 없음.
                        //   `.frame + .clipped()` 필수: aspectRatio(.fill) 은 제안 크기보다 **큰**
                        //   레이아웃 크기를 가질 수 있고, ZStack 은 자식 중 최대 크기를 자기 크기로
                        //   삼는다. 그러면 가로 사진에서 ZStack 이 photoW 보다 넓어져, 우하단 정렬인
                        //   날짜 스탬프가 사진 밖으로 밀려나 잘려 보였다(가로 사진일수록 심함).
                        //   여기서 사진 자체를 사진 영역 크기로 잘라 ZStack 크기를 고정한다.
                        Image(uiImage: image)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: photoW, height: photoH)
                            .clipped()
                    } else {
                        PixelIcon(.image, size: 28, color: Color.textTertiary)
                    }
                    // 비네팅
                    RadialGradient(
                        colors: [.clear, Color.black.opacity(0.22)],
                        center: .center, startRadius: photoW * 0.25,
                        endRadius: photoW * 0.75
                    )
                    .blendMode(.multiply)
                    // 오렌지 날짜 스탬프 — 치수는 전부 프레임 폭 비율(저장 합성과 동일 규약).
                    VStack {
                        Spacer()
                        HStack {
                            Spacer()
                            Text(dateStamp)
                                .font(.system(size: w * PolaroidGeometry.stampFont,
                                              weight: .bold, design: .monospaced))
                                .foregroundStyle(Color.polaroidStamp)
                                .shadow(color: Color.polaroidStamp.opacity(0.5),
                                        radius: w * PolaroidGeometry.stampGlow)
                                .tracking(w * PolaroidGeometry.stampTracking)
                                .padding(w * PolaroidGeometry.stampPad)
                        }
                    }
                }
                .frame(width: photoW, height: photoH)
                .clipShape(Rectangle())
                .offset(x: photoX, y: photoY)
                .shadow(color: .black.opacity(0.1), radius: 2)

                // 캡션 영역 (children — 보통 빈 공간 + 서명 캔버스)
                caption()
                    .frame(width: photoW, height: captionH)
                    .offset(x: photoX, y: captionY)

                // 그레인 + 종이섬유 — 06-photo-flow(a): 매 렌더 랜덤 도트 재계산 대신
                // 1회 생성·캐시된 텍스처를 늘여 씀 (PolaroidFilters.paperTexture).
                Image(uiImage: PolaroidFilters.paperTexture())
                    .resizable()
                    .frame(width: w, height: h)
                    .opacity(0.16)
                    .blendMode(.multiply)
                    .allowsHitTesting(false)

                // 프레임 가장자리 어두움
                RoundedRectangle(cornerRadius: 2)
                    .stroke(Color.black.opacity(0.04), lineWidth: w * PolaroidGeometry.edgeLine)
                    .blur(radius: w * PolaroidGeometry.edgeLine * 1.33)
                    .frame(width: w, height: h)

                // 하단 엠보스 (caption 영역 cross-hatch) — 1회 생성·캐시된 타일을 늘여 쓴다.
                //   구현이 Canvas 였을 땐 렌더 1회당 Path 수백 개를 새로 만들었다(알파 1.5%,
                //   사실상 안 보이는 무늬에). 합성도 같은 타일을 쓰므로 무늬가 자동 일치한다.
                Image(uiImage: PolaroidFilters.crossHatchTexture())
                    .resizable()
                    .frame(width: photoW, height: captionH)
                    .offset(x: photoX, y: captionY)
                    .allowsHitTesting(false)

                // 데코레이션 (fold / crack)
                ForEach(0..<variant.decorations.count, id: \.self) { i in
                    decorationView(variant.decorations[i], frameSize: CGSize(width: w, height: h))
                }

                // 빈티지 앰버 (timestamp 기준)
                let vintage = PolaroidFilters.vintageOpacity(timestamp: timestamp)
                if vintage > 0 {
                    Color(red: 200/255, green: 165/255, blue: 114/255)
                        .opacity(vintage)
                        .blendMode(.multiply)
                        .frame(width: w, height: h)
                        .allowsHitTesting(false)
                }
            }
            .compositingGroup()
            .shadow(color: .black.opacity(0.12), radius: 2, x: 0, y: 1)
            .shadow(color: .black.opacity(0.08), radius: 12, x: 0, y: 4)
        }
        .aspectRatio(variant.aspectRatio, contentMode: .fit)
    }

    // MARK: - 데코레이션 뷰

    @ViewBuilder
    private func decorationView(_ dec: FrameDecoration, frameSize: CGSize) -> some View {
        // 치수는 전부 프레임 폭 비율 — 저장 합성(600px)에서도 같은 크기로 재현된다.
        let w = frameSize.width
        switch dec {
        case let .fold(alignment):
            // 모서리 fold — 삼각형 그늘.
            let side = w * PolaroidGeometry.foldSide
            ZStack {
                FoldShape(alignment: alignment)
                    .fill(LinearGradient(
                        colors: [Color.black.opacity(0.18), Color.black.opacity(0.03)],
                        startPoint: foldGradStart(alignment),
                        endPoint: foldGradEnd(alignment)
                    ))
                    .blendMode(.multiply)
                    .frame(width: side, height: side)
            }
            .frame(width: frameSize.width, height: frameSize.height, alignment: alignment)
        case let .crack(alignment):
            // 균열 — 미세 dark line (변형적 표현).
            let boxW = w * PolaroidGeometry.crackBoxW
            let boxH = w * PolaroidGeometry.crackBoxH
            let len = w * PolaroidGeometry.crackLen
            Path { p in
                p.move(to: CGPoint(x: 0, y: 0))
                p.addLine(to: CGPoint(x: len * 0.4, y: boxH * 0.5))
                p.addLine(to: CGPoint(x: len * 0.7, y: -boxH * 0.25))
                p.addLine(to: CGPoint(x: len, y: boxH * 0.33))
            }
            .stroke(Color.black.opacity(0.10), lineWidth: max(0.3, w * PolaroidGeometry.crackLine))
            .frame(width: boxW, height: boxH)
            .frame(width: frameSize.width, height: frameSize.height, alignment: alignment)
            .blendMode(.multiply)
        }
    }

    private func foldGradStart(_ a: Alignment) -> UnitPoint {
        switch a {
        case .topLeading:     return .topLeading
        case .topTrailing:    return .topTrailing
        case .bottomLeading:  return .bottomLeading
        case .bottomTrailing: return .bottomTrailing
        default: return .topLeading
        }
    }

    private func foldGradEnd(_ a: Alignment) -> UnitPoint {
        switch a {
        case .topLeading:     return .bottomTrailing
        case .topTrailing:    return .bottomLeading
        case .bottomLeading:  return .topTrailing
        case .bottomTrailing: return .topLeading
        default: return .bottomTrailing
        }
    }

    // MARK: - 날짜 스탬프 (포맷은 PolaroidGeometry 단일 출처 — 합성과 공용)

    private var dateStamp: String { PolaroidGeometry.dateStamp(timestamp) }
}

extension Color {
    /// 폴라로이드 오렌지 날짜 스탬프 색 — 화면·합성 공용.
    static let polaroidStamp = Color(red: PolaroidGeometry.stampColor.r,
                                     green: PolaroidGeometry.stampColor.g,
                                     blue: PolaroidGeometry.stampColor.b)
}

// MARK: - Fold 삼각형 모양

private struct FoldShape: Shape {
    let alignment: Alignment

    func path(in rect: CGRect) -> Path {
        var p = Path()
        switch alignment {
        case .topLeading:
            p.move(to: CGPoint(x: 0, y: 0))
            p.addLine(to: CGPoint(x: rect.width, y: 0))
            p.addLine(to: CGPoint(x: 0, y: rect.height))
        case .topTrailing:
            p.move(to: CGPoint(x: rect.width, y: 0))
            p.addLine(to: CGPoint(x: 0, y: 0))
            p.addLine(to: CGPoint(x: rect.width, y: rect.height))
        case .bottomLeading:
            p.move(to: CGPoint(x: 0, y: rect.height))
            p.addLine(to: CGPoint(x: rect.width, y: rect.height))
            p.addLine(to: CGPoint(x: 0, y: 0))
        case .bottomTrailing:
            p.move(to: CGPoint(x: rect.width, y: rect.height))
            p.addLine(to: CGPoint(x: 0, y: rect.height))
            p.addLine(to: CGPoint(x: rect.width, y: 0))
        default:
            p.move(to: CGPoint(x: 0, y: 0))
            p.addLine(to: CGPoint(x: rect.width, y: 0))
            p.addLine(to: CGPoint(x: 0, y: rect.height))
        }
        p.closeSubpath()
        return p
    }
}
