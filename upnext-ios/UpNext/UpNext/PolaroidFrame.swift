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
            let photoX = w * (15.0/184.0)
            let photoY = h * (14.0/223.0)
            let photoW = w * (154.0/184.0)
            let photoH = h * (157.0/223.0)
            let captionY = h * ((14.0 + 157.0)/223.0)
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
                        Image(uiImage: image)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
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
                    // 오렌지 날짜 스탬프
                    VStack {
                        Spacer()
                        HStack {
                            Spacer()
                            Text(dateStamp)
                                .font(.system(size: 11, weight: .bold, design: .monospaced))
                                .foregroundStyle(Color(red: 1.0, green: 107/255, blue: 53/255))
                                .shadow(color: Color(red: 1.0, green: 107/255, blue: 53/255).opacity(0.5), radius: 4)
                                .tracking(1.2)
                                .padding(8)
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
                    .stroke(Color.black.opacity(0.04), lineWidth: 3)
                    .blur(radius: 4)
                    .frame(width: w, height: h)

                // 하단 엠보스 (caption 영역 cross-hatch)
                Rectangle()
                    .fill(Color.clear)
                    .overlay(
                        Canvas { ctx, size in
                            let cw = size.width, ch = size.height
                            // 45° + -45° 교차 라인 (3px 간격)
                            for d in stride(from: -ch, through: cw + ch, by: 3) {
                                var p = Path()
                                p.move(to: CGPoint(x: d, y: 0))
                                p.addLine(to: CGPoint(x: d + ch, y: ch))
                                ctx.stroke(p, with: .color(Color.black.opacity(0.015)),
                                           lineWidth: 0.5)
                                var p2 = Path()
                                p2.move(to: CGPoint(x: d, y: ch))
                                p2.addLine(to: CGPoint(x: d + ch, y: 0))
                                ctx.stroke(p2, with: .color(Color.black.opacity(0.015)),
                                           lineWidth: 0.5)
                            }
                        }
                    )
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
        switch dec {
        case let .fold(alignment):
            // 14×14 모서리 fold — 삼각형 그늘.
            ZStack {
                FoldShape(alignment: alignment)
                    .fill(LinearGradient(
                        colors: [Color.black.opacity(0.18), Color.black.opacity(0.03)],
                        startPoint: foldGradStart(alignment),
                        endPoint: foldGradEnd(alignment)
                    ))
                    .blendMode(.multiply)
                    .frame(width: 14, height: 14)
            }
            .frame(width: frameSize.width, height: frameSize.height, alignment: alignment)
        case let .crack(alignment):
            // 균열 — 미세 dark line (변형적 표현).
            Path { p in
                let len: CGFloat = 38
                p.move(to: CGPoint(x: 0, y: 0))
                p.addLine(to: CGPoint(x: len * 0.4, y: 6))
                p.addLine(to: CGPoint(x: len * 0.7, y: -3))
                p.addLine(to: CGPoint(x: len, y: 4))
            }
            .stroke(Color.black.opacity(0.10), lineWidth: 0.6)
            .frame(width: 50, height: 12)
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

    // MARK: - 날짜 스탬프

    private var dateStamp: String {
        let f = DateFormatter()
        // 웹 PolaroidFrameBase.tsx 포맷: `'YY MM DD HH:mm` (예 '25 07 20 14:30).
        //   Unicode 패턴에서 `'`(단일 따옴표)는 리터럴 구간을 여는 구분자라, 닫히지 않은
        //   `'yy…`는 뒤 전체를 리터럴로 삼아 "yy MM dd HH:mm" 가 그대로 찍히던 버그.
        //   리터럴 아포스트로피는 `''`(두 개)로 이스케이프해야 한다.
        f.locale = Locale(identifier: "en_US_POSIX")   // 그레고리력·아라비아 숫자 고정
        f.dateFormat = "''yy MM dd HH:mm"
        return f.string(from: timestamp)
    }
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
