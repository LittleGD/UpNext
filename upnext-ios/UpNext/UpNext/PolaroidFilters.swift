//
//  PolaroidFilters.swift
//  UpNext — Kodak Gold 필름 필터 + 빈티지 에이징 계산.
//
//  웹 src/lib/photoFilter.ts 의 SwiftUI/CoreImage 포팅.
//   - KODAK_FILM_FILTER (sepia 0.28 + saturate 1.35 + contrast 1.08 + brightness 1.03 + hue -8°)
//   - computeVintageOpacity (timestamp 기준 0-21일 0~25% 황변)
//
//  CIFilter 체인:
//   CISepiaTone(intensity 0.28)
//   → CIColorControls(saturation 1.35, contrast 1.08, brightness 0.03)
//   → CIHueAdjust(angle -8° = -0.1396 rad)
//

import UIKit
import CoreImage

enum PolaroidFilters {
    /// Kodak Gold 필름 룩을 적용한 UIImage 반환. CI 컨텍스트는 캐시.
    ///
    /// 06-photo-flow(a/perf): 이 함수는 **절대 SwiftUI body 안에서 호출하지 말 것** —
    /// CIFilter 체인 + createCGImage 는 무겁다. 캡처 직후 백그라운드 큐에서 1회만
    /// 실행해 결과 UIImage 를 캐시하고, 뷰에는 이미 필터된 이미지를 전달한다.
    /// `maxDimension` 을 주면 필터 전에 다운샘플해 CIFilter/CGImage 비용을 더 줄인다
    /// (프리뷰/데코 표시는 화면 해상도면 충분 — 원본 풀해상도 불필요).
    /// - Parameter exposureEV: 노출 보정(스톱). 웹 캡처의 `brightness(pow(2, EV))` 대응 —
    ///   EXPOSURE 다이얼 값을 실제 저장 이미지에 반영. CIExposureAdjust 는 EV(스톱) 직결이라
    ///   `pow(2, EV)` 밝기 배수와 동치. 0 이면 스킵.
    static func applyKodak(_ image: UIImage, maxDimension: CGFloat? = nil,
                           exposureEV: Double = 0) -> UIImage? {
        let working = maxDimension.map { downsample(image, maxDimension: $0) } ?? image
        guard let ciImage = CIImage(image: working) else { return nil }
        var output: CIImage = ciImage

        // 0. Exposure 보정 (EV 스톱) — 웹 captureFromVideo 의 brightness(2^EV).
        if abs(exposureEV) > 0.01, let f = CIFilter(name: "CIExposureAdjust") {
            f.setValue(output, forKey: kCIInputImageKey)
            f.setValue(exposureEV, forKey: kCIInputEVKey)
            if let result = f.outputImage { output = result }
        }
        // 1. Sepia 0.28
        //    P4-b 주: 웹 CSS `sepia(0.28)` 와 색조 방향이 다르지만(iOS 웜 vs 웹 틸), 이는 누락이
        //    아니라 피델리티 편차(blocker 아님). CSS sepia 행렬 + 승산 brightness 로 이식을 시도했으나
        //    CoreImage 의 saturation/contrast 색공간 차로 블루의 R 채널이 0 으로 하드클램프되어
        //    (skin/red 뭉개짐) 원본보다 나빠 회귀 위험 → 기존 CISepiaTone 체인 유지. 웹 정합은 후속.
        if let f = CIFilter(name: "CISepiaTone") {
            f.setValue(output, forKey: kCIInputImageKey)
            f.setValue(0.28, forKey: kCIInputIntensityKey)
            if let result = f.outputImage { output = result }
        }
        // 2. Color controls (saturation/contrast/brightness)
        if let f = CIFilter(name: "CIColorControls") {
            f.setValue(output, forKey: kCIInputImageKey)
            f.setValue(1.35, forKey: kCIInputSaturationKey)
            f.setValue(1.08, forKey: kCIInputContrastKey)
            f.setValue(0.03, forKey: kCIInputBrightnessKey)
            if let result = f.outputImage { output = result }
        }
        // 3. Hue -8°
        if let f = CIFilter(name: "CIHueAdjust") {
            f.setValue(output, forKey: kCIInputImageKey)
            f.setValue(-8.0 * .pi / 180.0, forKey: kCIInputAngleKey)
            if let result = f.outputImage { output = result }
        }

        let ctx = sharedContext
        guard let cg = ctx.createCGImage(output, from: ciImage.extent) else { return nil }
        return UIImage(cgImage: cg, scale: working.scale, orientation: working.imageOrientation)
    }

    /// 최장변이 maxDimension 을 넘으면 비례 축소 (넘지 않으면 원본 그대로).
    /// scale=1 렌더러로 픽셀=포인트 1:1 축소해 이후 CIFilter/디코드 메모리를 줄인다.
    static func downsample(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
        let px = CGSize(width: image.size.width * image.scale,
                        height: image.size.height * image.scale)
        let maxSide = max(px.width, px.height)
        guard maxSide > maxDimension else { return image }
        let ratio = maxDimension / maxSide
        let newSize = CGSize(width: px.width * ratio, height: px.height * ratio)
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale = 1
        return UIGraphicsImageRenderer(size: newSize, format: fmt).image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }

    /// 폴라로이드 종이 텍스처(그레인·섬유)를 1회 생성해 캐시. 프레임 크기와 무관하게
    /// 고정 해상도 노이즈를 만들어 resizable 로 늘여 쓴다 — 매 SwiftUI 렌더마다
    /// 랜덤 도트를 재계산하던 06-photo-flow(a) 병목 제거.
    /// grain: 미세 도트(불투명 다양), fiber: 저주파 짧은 획.
    /// 종이 텍스처 — `static let` 지연 초기화라 **스레드 안전**하다.
    ///   구 구현은 `if let cached = cachedPaperTexture` + `static var` 대입이라, 메인(뷰 렌더)과
    ///   백그라운드(저장 합성)가 동시에 처음 호출하면 UIGraphicsImageRenderer 를 두 번 돌리며
    ///   var 에 경쟁 쓰기를 했다(합성이 이 텍스처를 쓰기 시작하면서 실제 위험이 됐다).
    static func paperTexture() -> UIImage { sharedPaperTexture }

    private static let sharedPaperTexture: UIImage = makePaperTexture()

    private static func makePaperTexture() -> UIImage {
        let side: CGFloat = 512
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale = 1
        fmt.opaque = false
        var seed: UInt64 = 0x9E3779B97F4A7C15   // 고정 시드 — 결정적 결과.
        func rnd() -> Double {
            // xorshift64 — 결정적 의사난수.
            seed ^= seed << 13; seed ^= seed >> 7; seed ^= seed << 17
            return Double(seed % 100_000) / 100_000.0
        }
        let img = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: fmt).image { rc in
            let ctx = rc.cgContext
            // 그레인 도트 — 웹 feTurbulence 근사 (PolaroidFrame 이전 구현과 밀도 유사).
            let grainCount = Int(side * side / 200)
            for _ in 0..<grainCount {
                let x = rnd() * side, y = rnd() * side
                let g = 0.3 + rnd() * 0.6
                ctx.setFillColor(UIColor(white: CGFloat(g), alpha: 0.5).cgColor)
                ctx.fill(CGRect(x: x, y: y, width: 0.7, height: 0.7))
            }
            // 종이 섬유 — 짧은 저주파 획.
            let fiberCount = Int(side * side / 800)
            ctx.setLineWidth(0.4)
            for _ in 0..<fiberCount {
                let x = rnd() * side, y = rnd() * side
                let len = 2 + rnd() * 4
                let g = 0.5 + rnd() * 0.35
                ctx.setStrokeColor(UIColor(white: CGFloat(g), alpha: 0.45).cgColor)
                ctx.move(to: CGPoint(x: x, y: y))
                ctx.addLine(to: CGPoint(x: x + len, y: y + (rnd() * 2 - 1)))
                ctx.strokePath()
            }
        }
        return img
    }

    /// 캡션 crosshatch 엠보스 타일 — 45°/-45° 교차선. 알파 1.5% 의 거의 안 보이는 무늬라
    /// 매 렌더 수백 개 Path 를 새로 만들 이유가 없다(구 PolaroidFrame 의 Canvas 가 그랬다).
    /// 정사각 타일을 1회 만들어 화면·합성이 함께 늘여 쓴다 — 두 경로의 무늬가 자동으로 일치한다.
    static func crossHatchTexture() -> UIImage { sharedCrossHatch }

    private static let sharedCrossHatch: UIImage = {
        let side: CGFloat = 256
        // 타일 안 격자 간격 — PolaroidGeometry.hatchStep(캡션 폭의 1/83) 과 같은 밀도.
        let step = side * PolaroidGeometry.hatchStep
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale = 1
        fmt.opaque = false
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: fmt).image { rc in
            let ctx = rc.cgContext
            ctx.setLineWidth(max(0.25, side * PolaroidGeometry.hatchLine))
            ctx.setStrokeColor(UIColor.black.withAlphaComponent(0.015).cgColor)
            var d = -side
            while d <= side * 2 {
                ctx.move(to: CGPoint(x: d, y: 0))
                ctx.addLine(to: CGPoint(x: d + side, y: side))
                ctx.move(to: CGPoint(x: d, y: side))
                ctx.addLine(to: CGPoint(x: d + side, y: 0))
                d += step
            }
            ctx.strokePath()
        }
    }()

    /// 빈티지 에이징 opacity 계산 — 웹 computeVintageOpacity 1:1.
    /// 0~21일에 걸쳐 0~25% 점진적 황변. 같은 timestamp 라도 ±15% 편차 (LCG jitter).
    static func vintageOpacity(timestamp: Date, now: Date = Date()) -> Double {
        let day: TimeInterval = 86_400
        let elapsed = max(0, now.timeIntervalSince(timestamp))
        let daysPassed = Int(elapsed / day)
        let ageStep = min(7, daysPassed / 3)
        let ageRatio = Double(ageStep) / 7
        // LCG jitter
        let ts = Int(timestamp.timeIntervalSince1970 * 1000)
        let rnd = ((ts &* 9301 &+ 49297) % 233280)
        let jitter = (Double(rnd) / 233280.0 - 0.5) * 0.3
        let finalRatio = max(0, min(1, ageRatio + jitter * ageRatio))
        return finalRatio * 0.25
    }

    private static let sharedContext = CIContext(options: [.useSoftwareRenderer: false])
}
