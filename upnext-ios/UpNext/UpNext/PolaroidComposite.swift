//
//  PolaroidComposite.swift
//  UpNext — 폴라로이드 합성 → 공유 가능한 UIImage 생성.
//
//  웹 src/lib/polaroidComposite.ts 포팅.
//  600×727px 캔버스에 베이지 배경 + 사진(Kodak 필터) + 날짜 스탬프 + 스티커 + 서명을
//  순서대로 합성. UIGraphicsImageRenderer 사용.
//

import UIKit

struct CompositeSticker {
    let id: String
    let type: StickerType
    let content: String   // emoji char 또는 자산 이름
    /// 폴라로이드 영역 기준 % 좌표 (0-100)
    let x: Double
    let y: Double
    let rotation: Double  // degrees
    let scale: Double
    let zIndex: Int

    enum StickerType { case emoji, image }
}

enum PolaroidComposite {
    /// 합성 캔버스 가로 (pt). 세로는 variant.aspectRatio 로 결정된다.
    static let width: CGFloat = 600

    /// 저장 캔버스 세로 — 화면 PolaroidFrame 의 `h = w / variant.aspectRatio` 와 동일 식.
    /// (예전엔 727 고정이라 aspect 가 다른 Frame4 에서 화면과 세로 비율이 어긋났다.)
    static func canvasHeight(for variant: PolaroidFrameVariant) -> CGFloat {
        (width / variant.aspectRatio).rounded()
    }

    /// 폴라로이드 합성 → UIImage. 06-photo-flow(a): UIGraphicsImageRenderer 는
    /// 오프스크린이라 백그라운드 큐에서 호출해도 안전 (저장 시 메인 블로킹 제거).
    /// signatureImage 는 nil 가능, stickers 빈 배열 가능.
    /// `applyFilter=false` 면 photo 가 이미 Kodak 필터된 것으로 간주해 재필터 생략
    /// (캡처 직후 캐시한 필터 이미지를 재사용 — 이중 CIFilter 방지).
    ///
    /// **WYSIWYG 규약** — 이 함수는 PolaroidFrame(화면) 의 ZStack 레이어를 같은 순서·같은
    /// 비율(PolaroidGeometry)로 재현한다. 예전엔 배경/사진/스탬프만 그리고 종이 그레인·
    /// 모서리 fold·크랙·캡션 엠보스·가장자리 어둠을 전부 빠뜨려서, 꾸미기 화면과 앨범
    /// 저장본이 눈에 띄게 달랐다. 레이어를 추가/변경할 땐 **양쪽을 함께** 고쳐야 한다.
    static func render(
        photo: UIImage,
        timestamp: Date,
        signatureImage: UIImage? = nil,
        stickers: [CompositeSticker] = [],
        variant: PolaroidFrameVariant = .five,
        applyFilter: Bool = true
    ) -> UIImage {
        // 픽셀 스케일 고정 2x — 기본 포맷은 기기 screen scale(3x)이라 출력이 1800×2181
        // (디코드 시 장당 ≈15.7MB)로 부풀었다. 사진 소스가 ≤960px 프리뷰라 3x 는 순수
        // 업스케일 낭비. 2x 는 사진 영역(502pt→1004px)이 소스와 1:1 로 정합해 디테일
        // 손실 없이 메모리·인코드·이후 앨범 디코드 비용을 절반 이하로 줄인다
        // (실기기 촬영/앨범 반복 시 메모리 압박 렉의 배율 항).
        let height = canvasHeight(for: variant)
        let frameRect = CGRect(x: 0, y: 0, width: width, height: height)
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale = 2
        // wide-gamut(P3) 기기 기본값은 extended range — 픽셀당 8바이트로 구워져 메모리가 두 배가
        //   된다. 소스가 sRGB JPEG 이고 출력도 JPEG 저장이라 얻는 게 없다.
        fmt.preferredRange = .standard
        let renderer = UIGraphicsImageRenderer(size: frameRect.size, format: fmt)
        return renderer.image { ctx in
            let cgCtx = ctx.cgContext

            // ── 1. 배경 (variant 별 베이지/아이보리) ─────────────────────────────
            UIColor(Color(hex: variant.backgroundHex)).setFill()
            cgCtx.fill(frameRect)

            // ── 2. 사진 영역 — Figma 좌표 (15, 14, 154x157) 비율 ────────────────
            let photoRect = CGRect(
                x: width * PolaroidGeometry.photoXRatio,
                y: height * PolaroidGeometry.photoYRatio,
                width: width * PolaroidGeometry.photoWRatio,
                height: height * PolaroidGeometry.photoHRatio
            )
            let captionRect = CGRect(
                x: photoRect.minX,
                y: height * PolaroidGeometry.captionYRatio,
                width: photoRect.width,
                height: height - height * PolaroidGeometry.captionYRatio
            )

            cgCtx.setFillColor(UIColor.black.cgColor)
            cgCtx.fill(photoRect)

            // 사진 — Kodak 필터 적용 후 object-cover 로 그림 (이미 필터됐으면 그대로).
            let filtered = applyFilter ? (PolaroidFilters.applyKodak(photo) ?? photo) : photo
            drawImageCover(filtered, in: photoRect)

            // 비네팅 (가운데 transparent, 가장자리 어둡게)
            drawVignette(in: photoRect, ctx: cgCtx)

            // ── 3. 오렌지 날짜 스탬프 (사진 우하단, 글로우 포함) ────────────────
            drawDateStamp(timestamp, photoRect: photoRect, ctx: cgCtx)

            // ── 4. 종이 그레인 + 섬유 (프레임 전체, multiply) ───────────────────
            PolaroidFilters.paperTexture().draw(in: frameRect, blendMode: .multiply,
                                                alpha: PolaroidGeometry.grainOpacity)

            // ── 5. 캡션 crosshatch 엠보스 ───────────────────────────────────────
            drawCrossHatch(in: captionRect, ctx: cgCtx)

            // ── 6. 프레임 가장자리 어두움 (blur(4) 근사 — 다중 스트로크) ────────
            drawEdgeDarkening(in: frameRect, ctx: cgCtx)

            // ── 7. variant 데코레이션 (fold / crack) ────────────────────────────
            for dec in variant.decorations {
                drawDecoration(dec, in: frameRect, ctx: cgCtx)
            }

            // ── 8. 빈티지 앰버 (timestamp 기준 황변, 0 이면 스킵) ───────────────
            let vintage = PolaroidFilters.vintageOpacity(timestamp: timestamp)
            if vintage > 0.001 {
                cgCtx.saveGState()
                cgCtx.setBlendMode(.multiply)
                UIColor(red: 200/255, green: 165/255, blue: 114/255,
                        alpha: CGFloat(vintage)).setFill()
                cgCtx.fill(frameRect)
                cgCtx.restoreGState()
            }

            // ── 9. 스티커 (zIndex 오름차순 — 동률이면 배열 순서 유지) ───────────
            //   Swift 의 sorted 는 안정 정렬이 아니라 zIndex 가 전부 같으면 순서가
            //   뒤바뀔 수 있다(겹친 스티커의 앞뒤가 저장본에서 달라지던 원인). 배열
            //   인덱스를 2차 키로 넣어 화면 ZStack 순서를 그대로 보존한다.
            let ordered = stickers.enumerated()
                .sorted { ($0.element.zIndex, $0.offset) < ($1.element.zIndex, $1.offset) }
                .map(\.element)
            for sticker in ordered {
                drawSticker(sticker, canvas: frameRect.size, in: cgCtx)
            }

            // ── 10. 서명 (폴라로이드 전체 위) ───────────────────────────────────
            if let sig = signatureImage {
                sig.draw(in: frameRect)
            }
        }
    }

    // MARK: - 프레임 레이어 (PolaroidFrame 의 ZStack 과 1:1 대응)

    private static func drawVignette(in photoRect: CGRect, ctx: CGContext) {
        guard let vignette = CGGradient(
            colorsSpace: CGColorSpaceCreateDeviceRGB(),
            colors: [UIColor.clear.cgColor,
                     UIColor.black.withAlphaComponent(0.22).cgColor] as CFArray,
            locations: [0, 1]      // 화면 RadialGradient(2색)의 균등 분포와 정합.
        ) else { return }
        ctx.saveGState()
        ctx.clip(to: photoRect)
        let center = CGPoint(x: photoRect.midX, y: photoRect.midY)
        ctx.drawRadialGradient(vignette,
                               startCenter: center, startRadius: photoRect.width * 0.25,
                               endCenter: center, endRadius: photoRect.width * 0.75,
                               options: [])
        ctx.restoreGState()
    }

    private static func drawDateStamp(_ timestamp: Date, photoRect: CGRect, ctx: CGContext) {
        let dateStr = PolaroidGeometry.dateStamp(timestamp) as NSString
        let stampColor = UIColor(red: PolaroidGeometry.stampColor.r,
                                 green: PolaroidGeometry.stampColor.g,
                                 blue: PolaroidGeometry.stampColor.b, alpha: 1)
        // 화면은 `.system(design: .monospaced, weight: .bold)` — Courier 가 아니라
        // SF Mono 계열이다. 저장본만 Courier 로 찍혀 글자 모양이 달라 보이던 것 교정.
        let attr: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: width * PolaroidGeometry.stampFont,
                                               weight: .bold),
            .foregroundColor: stampColor,
            .kern: width * PolaroidGeometry.stampTracking,
        ]
        let size = dateStr.size(withAttributes: attr)
        let pad = width * PolaroidGeometry.stampPad
        let origin = CGPoint(x: photoRect.maxX - size.width - pad,
                             y: photoRect.maxY - size.height - pad)
        ctx.saveGState()
        ctx.clip(to: photoRect)
        // 화면의 `.shadow(color: stamp.opacity(0.5), radius: 4)` 글로우.
        ctx.setShadow(offset: .zero, blur: width * PolaroidGeometry.stampGlow * 2,
                      color: stampColor.withAlphaComponent(0.5).cgColor)
        dateStr.draw(at: origin, withAttributes: attr)
        ctx.restoreGState()
    }

    private static func drawCrossHatch(in rect: CGRect, ctx: CGContext) {
        guard rect.width > 0, rect.height > 0 else { return }
        // 화면 PolaroidFrame 과 **같은 캐시 타일**을 같은 rect 로 늘여 그린다 → 무늬 완전 일치.
        PolaroidFilters.crossHatchTexture().draw(in: rect)
    }

    /// 화면의 `RoundedRectangle.stroke(black 0.04, lineWidth: 3).blur(4)` 근사 —
    /// 폭을 넓혀가며 알파를 낮춘 다중 스트로크로 부드러운 감쇠를 흉내낸다.
    private static func drawEdgeDarkening(in rect: CGRect, ctx: CGContext) {
        let base = rect.width * PolaroidGeometry.edgeLine
        ctx.saveGState()
        for (mult, alpha) in [(1.0, 0.020), (2.2, 0.012), (3.6, 0.006)] {
            ctx.setStrokeColor(UIColor.black.withAlphaComponent(alpha).cgColor)
            ctx.setLineWidth(base * mult)
            ctx.addPath(UIBezierPath(roundedRect: rect.insetBy(dx: 0, dy: 0),
                                     cornerRadius: rect.width * 0.007).cgPath)
            ctx.strokePath()
        }
        ctx.restoreGState()
    }

    private static func drawDecoration(_ dec: FrameDecoration, in frame: CGRect, ctx: CGContext) {
        let w = frame.width
        switch dec {
        case let .fold(alignment):
            let side = w * PolaroidGeometry.foldSide
            let box = alignedRect(size: CGSize(width: side, height: side),
                                  in: frame, alignment: alignment)
            guard let grad = CGGradient(
                colorsSpace: CGColorSpaceCreateDeviceRGB(),
                colors: [UIColor.black.withAlphaComponent(0.18).cgColor,
                         UIColor.black.withAlphaComponent(0.03).cgColor] as CFArray,
                locations: [0, 1]
            ) else { return }
            ctx.saveGState()
            ctx.setBlendMode(.multiply)
            ctx.addPath(foldPath(in: box, alignment: alignment).cgPath)
            ctx.clip()
            let (s, e) = foldGradientPoints(box: box, alignment: alignment)
            ctx.drawLinearGradient(grad, start: s, end: e, options: [])
            ctx.restoreGState()

        case let .crack(alignment):
            let boxW = w * PolaroidGeometry.crackBoxW
            let boxH = w * PolaroidGeometry.crackBoxH
            let len = w * PolaroidGeometry.crackLen
            let box = alignedRect(size: CGSize(width: boxW, height: boxH),
                                  in: frame, alignment: alignment)
            ctx.saveGState()
            ctx.setBlendMode(.multiply)
            ctx.setStrokeColor(UIColor.black.withAlphaComponent(0.10).cgColor)
            ctx.setLineWidth(max(0.3, w * PolaroidGeometry.crackLine))
            ctx.move(to: CGPoint(x: box.minX, y: box.minY))
            ctx.addLine(to: CGPoint(x: box.minX + len * 0.4, y: box.minY + boxH * 0.5))
            ctx.addLine(to: CGPoint(x: box.minX + len * 0.7, y: box.minY - boxH * 0.25))
            ctx.addLine(to: CGPoint(x: box.minX + len, y: box.minY + boxH * 0.33))
            ctx.strokePath()
            ctx.restoreGState()
        }
    }

    /// SwiftUI `.frame(width:height:alignment:)` 배치 동치 — 데코레이션 박스를 모서리에 앉힌다.
    private static func alignedRect(size: CGSize, in frame: CGRect,
                                    alignment: Alignment) -> CGRect {
        let x: CGFloat
        let y: CGFloat
        switch alignment {
        case .topLeading:     x = frame.minX;                 y = frame.minY
        case .topTrailing:    x = frame.maxX - size.width;    y = frame.minY
        case .bottomLeading:  x = frame.minX;                 y = frame.maxY - size.height
        case .bottomTrailing: x = frame.maxX - size.width;    y = frame.maxY - size.height
        default:              x = frame.midX - size.width / 2; y = frame.midY - size.height / 2
        }
        return CGRect(x: x, y: y, width: size.width, height: size.height)
    }

    /// PolaroidFrame 의 FoldShape 와 동일한 삼각형.
    private static func foldPath(in r: CGRect, alignment: Alignment) -> UIBezierPath {
        let p = UIBezierPath()
        switch alignment {
        case .topLeading:
            p.move(to: CGPoint(x: r.minX, y: r.minY))
            p.addLine(to: CGPoint(x: r.maxX, y: r.minY))
            p.addLine(to: CGPoint(x: r.minX, y: r.maxY))
        case .topTrailing:
            p.move(to: CGPoint(x: r.maxX, y: r.minY))
            p.addLine(to: CGPoint(x: r.minX, y: r.minY))
            p.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        case .bottomLeading:
            p.move(to: CGPoint(x: r.minX, y: r.maxY))
            p.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
            p.addLine(to: CGPoint(x: r.minX, y: r.minY))
        case .bottomTrailing:
            p.move(to: CGPoint(x: r.maxX, y: r.maxY))
            p.addLine(to: CGPoint(x: r.minX, y: r.maxY))
            p.addLine(to: CGPoint(x: r.maxX, y: r.minY))
        default:
            p.move(to: CGPoint(x: r.minX, y: r.minY))
            p.addLine(to: CGPoint(x: r.maxX, y: r.minY))
            p.addLine(to: CGPoint(x: r.minX, y: r.maxY))
        }
        p.close()
        return p
    }

    private static func foldGradientPoints(box: CGRect,
                                           alignment: Alignment) -> (CGPoint, CGPoint) {
        switch alignment {
        case .topLeading:     return (CGPoint(x: box.minX, y: box.minY), CGPoint(x: box.maxX, y: box.maxY))
        case .topTrailing:    return (CGPoint(x: box.maxX, y: box.minY), CGPoint(x: box.minX, y: box.maxY))
        case .bottomLeading:  return (CGPoint(x: box.minX, y: box.maxY), CGPoint(x: box.maxX, y: box.minY))
        case .bottomTrailing: return (CGPoint(x: box.maxX, y: box.maxY), CGPoint(x: box.minX, y: box.minY))
        default:              return (CGPoint(x: box.minX, y: box.minY), CGPoint(x: box.maxX, y: box.maxY))
        }
    }

    /// object-cover 동치 — 영역을 채우되 종횡비 유지 (잘림 허용).
    private static func drawImageCover(_ image: UIImage, in rect: CGRect) {
        let imgRatio = image.size.width / image.size.height
        let dstRatio = rect.width / rect.height
        var src = CGRect(origin: .zero, size: image.size)
        if imgRatio > dstRatio {
            // 가로 더 길음 — 좌우 잘라냄
            let newW = image.size.height * dstRatio
            src = CGRect(x: (image.size.width - newW) / 2, y: 0,
                         width: newW, height: image.size.height)
        } else {
            let newH = image.size.width / dstRatio
            src = CGRect(x: 0, y: (image.size.height - newH) / 2,
                         width: image.size.width, height: newH)
        }
        guard let cg = image.cgImage?.cropping(to: src) else {
            image.draw(in: rect)
            return
        }
        UIImage(cgImage: cg).draw(in: rect)
    }

    /// 스티커 1개 합성.
    ///
    /// 크기 규약: 기본 변은 **캔버스 가로폭 비율**(StickerMetrics)로 계산한다. 화면
    /// StickerLayer 도 같은 비율을 쓰므로 어떤 표시 크기에서 꾸며도 저장본이 일치한다.
    /// (구 구현은 화면 ≈300pt 카드의 48pt 를 600px 캔버스에 그대로 48 로 박아, 저장본
    ///  스티커가 화면의 **절반 크기**로 나왔다. "×2 는 이중 적용"이라던 주석은 픽셀
    ///  스케일과 레이아웃 스케일을 혼동한 것 — 실제로 필요한 배율이었다.)
    private static func drawSticker(_ s: CompositeSticker, canvas: CGSize, in ctx: CGContext) {
        let cx = (s.x / 100) * Double(canvas.width)
        let cy = (s.y / 100) * Double(canvas.height)
        let base = StickerMetrics.baseSize(for: s.content, containerWidth: canvas.width)
        let size = base * CGFloat(s.scale)

        ctx.saveGState()
        ctx.translateBy(x: cx, y: cy)
        ctx.rotate(by: s.rotation * .pi / 180)

        switch s.type {
        case .emoji:
            // 화면은 `Text.font(.system(size: base * 0.85))` — 같은 글리프 크기를 쓴다.
            let attr: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: size * StickerMetrics.emojiGlyph),
            ]
            let textSize = (s.content as NSString).size(withAttributes: attr)
            (s.content as NSString).draw(
                at: CGPoint(x: -textSize.width / 2, y: -textSize.height / 2),
                withAttributes: attr
            )
        case .image:
            if s.content == "upnext-logo" {
                // P3(g) 브랜드 스티커 합성 — 화면 StickerLayer 와 동일한 흰 카드 + 워드마크.
                //   기존 UIImage(named:"upnext-logo") 는 asset 부재로 nil → 저장본에서 소실됐다.
                let cardW = size * StickerMetrics.logoCardW
                let cardH = size * StickerMetrics.logoCardH
                let logo = brandLogoImage(cardW: cardW, cardH: cardH)
                logo.draw(in: CGRect(x: -cardW / 2, y: -cardH / 2, width: cardW, height: cardH))
            } else if let img = UIImage(named: s.content) {
                // 그 외 자산 이름으로 로드 (Assets.xcassets / Bundle).
                img.draw(in: CGRect(x: -size/2, y: -size/2, width: size, height: size))
            }
        }

        ctx.restoreGState()
    }

    /// 브랜드 로고 스티커 — 흰 둥근 카드 위 UpNext 워드마크(#212727)를 오프스크린 렌더.
    /// 웹 StickerLayer 의 흰 카드 + UpNextLogoMark 와 시각 일치. 합성 컨텍스트 안에서
    /// 회전/이동 CTM 아래 draw 되도록 UIImage 로 만들어 넘긴다.
    private static func brandLogoImage(cardW: CGFloat, cardH: CGFloat) -> UIImage {
        // 바깥 합성 캔버스가 fmt.scale = 2 로 고정돼 있으므로 여기도 2x — 기본값(기기 screen
        //   scale 3x)을 쓰면 3x 로 래스터한 뒤 2x 캔버스에 축소 그리기가 돼 워드마크가 뭉갠다.
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale = 2
        return UIGraphicsImageRenderer(size: CGSize(width: cardW, height: cardH),
                                       format: fmt).image { _ in
            let cardRect = CGRect(x: 0, y: 0, width: cardW, height: cardH)
            UIColor.white.setFill()
            UIBezierPath(roundedRect: cardRect,
                         cornerRadius: cardH * StickerMetrics.logoCardRadius).fill()

            guard let wm = UIImage(named: "Wordmark") else { return }
            let padX = cardW * 0.10
            let padY = cardH * 0.16
            let avail = CGRect(x: padX, y: padY,
                               width: cardW - 2 * padX, height: cardH - 2 * padY)
            let aspect = wm.size.height > 0 ? wm.size.width / wm.size.height : 2.673
            var dw = avail.width
            var dh = dw / aspect
            if dh > avail.height { dh = avail.height; dw = dh * aspect }
            let drawRect = CGRect(x: avail.midX - dw / 2, y: avail.midY - dh / 2,
                                  width: dw, height: dh)
            let tint = UIColor(red: 33.0 / 255, green: 39.0 / 255, blue: 39.0 / 255, alpha: 1)
            wm.withTintColor(tint, renderingMode: .alwaysOriginal).draw(in: drawRect)
        }
    }
}

// MARK: - 공유 시트 헬퍼

import SwiftUI
import LinkPresentation

/// `.sheet(item:)` 용 공유 페이로드 — 값이 확정된 뒤에만 시트가 만들어지도록 강제한다.
/// (`.sheet(isPresented:)` + `if let image` 조합은 content 클로저가 직전 body 평가본을
///  캡처해 **빈 시트**가 먼저 뜨는 SwiftUI 함정이 있다.)
struct SharePayload: Identifiable {
    let id = UUID()
    let image: UIImage
    let filename: String
}

struct PolaroidShareSheet: UIViewControllerRepresentable {
    let image: UIImage
    var filename: String = "upnext-polaroid.jpg"

    func makeUIViewController(context: Context) -> UIActivityViewController {
        // UIImage 를 그대로 activityItem 으로 넘기면 대상 앱이 미리보기를 스스로 만들 때까지
        //   시트 상단이 빈 채로 뜬다. UIActivityItemSource 로 제목·썸네일을 미리 주고,
        //   실제 데이터는 임시 파일 URL 로 넘겨 저장/타 앱 전달에서 파일명이 살아있게 한다.
        let source = PolaroidActivityItem(image: image, filename: filename)
        let vc = UIActivityViewController(activityItems: [source], applicationActivities: nil)
        // iPad — sourceView 가 없으면 popover 가 앵커를 못 잡아 아무것도 안 뜬다.
        vc.popoverPresentationController?.permittedArrowDirections = []
        return vc
    }

    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {
        guard let pop = vc.popoverPresentationController, pop.sourceView == nil,
              let host = vc.view.superview ?? vc.view else { return }
        pop.sourceView = host
        pop.sourceRect = CGRect(x: host.bounds.midX, y: host.bounds.midY, width: 0, height: 0)
    }
}

/// 공유 항목 소스 — 미리보기(썸네일·제목)를 즉시 제공하고, 본문은 JPEG 임시 파일로 넘긴다.
private final class PolaroidActivityItem: NSObject, UIActivityItemSource {
    private let image: UIImage
    private let filename: String
    /// 임시 파일은 lazy 로 1회만 인코딩 — 대상 앱이 여러 번 물어봐도 재인코딩하지 않는다.
    private lazy var fileURL: URL? = {
        guard let data = image.jpegData(compressionQuality: 0.92) else { return nil }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        do { try data.write(to: url, options: .atomic); return url } catch { return nil }
    }()

    init(image: UIImage, filename: String) {
        self.image = image
        self.filename = filename
    }

    func activityViewControllerPlaceholderItem(_ c: UIActivityViewController) -> Any { image }

    func activityViewController(_ c: UIActivityViewController,
                                itemForActivityType type: UIActivity.ActivityType?) -> Any? {
        // 파일 인코딩이 실패해도 이미지 자체로 폴백 — 공유가 통째로 죽지 않게.
        fileURL ?? image
    }

    func activityViewControllerLinkMetadata(_ c: UIActivityViewController) -> LPLinkMetadata? {
        let md = LPLinkMetadata()
        md.title = AppConfig.loc("UpNext 폴라로이드")
        md.imageProvider = NSItemProvider(object: image)
        return md
    }
}
