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
    static func applyKodak(_ image: UIImage) -> UIImage? {
        guard let ciImage = CIImage(image: image) else { return nil }
        var output: CIImage = ciImage

        // 1. Sepia 0.28
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
        return UIImage(cgImage: cg, scale: image.scale, orientation: image.imageOrientation)
    }

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
