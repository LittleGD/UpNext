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
    let imageData: Data?
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
                    if let imageData, let uiImage = UIImage(data: imageData) {
                        Image(uiImage: PolaroidFilters.applyKodak(uiImage) ?? uiImage)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    } else {
                        Image(systemName: "photo")
                            .foregroundStyle(Color.textTertiary)
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

                // 그레인 (전체)
                grainOverlay
                    .frame(width: w, height: h)
                    .opacity(0.18)
                    .blendMode(.multiply)

                // 종이 섬유 (저주파)
                paperFiberOverlay
                    .frame(width: w, height: h)
                    .opacity(0.08)
                    .blendMode(.multiply)

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

    // MARK: - Grain / 종이섬유 오버레이

    private var grainOverlay: some View {
        Canvas { ctx, size in
            // 50 시드 fractal noise — Swift 에 feTurbulence 가 없어 random dot 으로 근사.
            for _ in 0..<Int(size.width * size.height / 200) {
                let x = CGFloat.random(in: 0..<size.width)
                let y = CGFloat.random(in: 0..<size.height)
                let g = Double.random(in: 0.3...0.9)
                ctx.fill(
                    Path(CGRect(x: x, y: y, width: 0.7, height: 0.7)),
                    with: .color(Color(white: g))
                )
            }
        }
    }

    private var paperFiberOverlay: some View {
        Canvas { ctx, size in
            for _ in 0..<Int(size.width * size.height / 800) {
                let x = CGFloat.random(in: 0..<size.width)
                let y = CGFloat.random(in: 0..<size.height)
                let len = CGFloat.random(in: 2...6)
                let g = Double.random(in: 0.5...0.85)
                ctx.stroke(
                    Path { p in
                        p.move(to: CGPoint(x: x, y: y))
                        p.addLine(to: CGPoint(x: x + len, y: y + CGFloat.random(in: -1...1)))
                    },
                    with: .color(Color(white: g)),
                    lineWidth: 0.4
                )
            }
        }
    }

    // MARK: - 날짜 스탬프

    private var dateStamp: String {
        let f = DateFormatter()
        f.dateFormat = "'yy MM dd HH:mm"
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
