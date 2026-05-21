//
//  SoundPlayer.swift
//  UpNext — 사운드 (R2 — UI/인터랙션 회복).
//
//  웹 src/lib/sounds.ts (680줄, 27 사운드) 의 *비트 단위* 복제.
//
//  웹과의 매핑:
//   - 파형: Square (default) + Triangle 하모니. Sine 미사용.
//   - Envelope: 5ms 어택 + 지수 decay (Web Audio `exponentialRampToValueAtTime` 동치).
//   - 주파수 sweep: 지수 보간 (Web Audio 동치). 일부 ambientFloat 만 linear.
//   - Multi-segment gain envelope: ambientFloat / pulseWave / chargeUp / impactShake /
//     superIgnite / meteorWhoosh 6 사운드는 *커스텀 envelope* 분기 사용.
//   - masterVolume: 0.18 (웹 MASTER_VOLUME 동치). 이전 0.35 (사각파 단독 보정) 폐기.
//
//  렌더링: 사운드별 1회 PCM 합성 → 캐시 → AVAudioPlayerNode.scheduleBuffer.
//

import AVFoundation

/// 27 사운드 — 웹 SoundName 전체. (이전 10 개 → 17 개 추가.)
enum SoundName: String, CaseIterable {
    // UI 클릭·확정·취소
    case select, confirm, cancel
    // 카드 상호작용
    case cardFlip, cardSelect, cardHover, cardPreview
    // 진행 단계
    case packOpen, complete, fullClear, levelUp
    case equip, xpGain
    // 새 ambient·effect (R2 신규 이식)
    case chargeUp, ambientFloat, pulseWave, collect
    case fireIgnite, impactShake, superIgnite
    case meteorWhoosh, matchPair, curseTrigger, rewardChoose
    case cameraShutter, polaroidSlide, treeGrow
}

// MARK: - 합성 모델

private enum WaveformType {
    case square, triangle, sine
}

private enum SweepKind {
    case exponential, linear
}

/// 사운드별 multi-segment gain envelope 의 한 분기점.
/// `time` 은 OscillatorRecipe.start 로부터 경과 시간 (초). `value` 는 0~1 (volume 으로 곱).
/// `kind` 는 *이전 점에서 이 점까지* 의 보간 방식.
private struct EnvelopePoint {
    var time: Double
    var value: Double
    var kind: SweepKind
}

/// 한 사운드의 오실레이터 한 개 — 웹 createOsc/createSweep 의 인자 묶음.
/// 같은 사운드는 여러 OscillatorRecipe 의 합성(시간 오프셋·파형·주파수 다층).
private struct OscillatorRecipe {
    var freqStart: Double
    var freqEnd: Double? = nil          // nil = 상수 주파수 (createOsc), 있으면 sweep
    var freqSweepKind: SweepKind = .exponential
    var start: Double = 0               // 사운드 시작점부터 offset (초)
    var duration: Double
    var volume: Double                  // 0~1+ (masterVolume 으로 추가 곱)
    var waveform: WaveformType = .square
    /// nil 일 때 default envelope: 5ms 어택 (0.0001→1 exp) + 지수 decay (1→0.0001 over duration).
    /// 비-nil 이면 절대 envelope 사용 (ambientFloat 등 multi-segment).
    var customEnvelope: [EnvelopePoint]? = nil

    init(_ freqStart: Double,
         _ freqEnd: Double? = nil,
         start: Double = 0,
         duration: Double,
         volume: Double,
         waveform: WaveformType = .square,
         freqSweepKind: SweepKind = .exponential,
         customEnvelope: [EnvelopePoint]? = nil) {
        self.freqStart = freqStart
        self.freqEnd = freqEnd
        self.freqSweepKind = freqSweepKind
        self.start = start
        self.duration = duration
        self.volume = volume
        self.waveform = waveform
        self.customEnvelope = customEnvelope
    }
}

// MARK: - Player

@MainActor
final class SoundPlayer {

    static let shared = SoundPlayer()

    /// 설정의 soundEnabled 와 동기. @MainActor — AVAudioEngine 메인 가정.
    @MainActor static var enabled = true

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let sampleRate = 44_100.0
    private lazy var format = AVAudioFormat(
        standardFormatWithSampleRate: sampleRate, channels: 1)!
    /// 사운드별 합성 버퍼 캐시 — 한 번 만들고 재사용.
    private var cache: [SoundName: AVAudioPCMBuffer] = [:]
    private var started = false

    /// 마스터 볼륨 — 웹 sounds.ts L:44 `MASTER_VOLUME = 0.18` 그대로.
    /// 이전 iOS 의 0.35 (사각파 단독 보정) 는 R2 다층 합성으로 폐기 (웹 동일치).
    private let masterVolume = 0.18

    private init() {
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
    }

    /// 사운드 재생. enabled=false 면 무음. 메인 스레드 전용.
    func play(_ name: SoundName) {
        guard Self.enabled else { return }
        let buffer: AVAudioPCMBuffer
        if let cached = cache[name] {
            buffer = cached
        } else {
            guard let synth = synthesize(Self.recipe(name)) else { return }
            cache[name] = synth
            buffer = synth
        }
        if !started {
            // .ambient — 무음 스위치 존중 + 타 오디오와 믹스.
            try? AVAudioSession.sharedInstance().setCategory(.ambient)
            try? AVAudioSession.sharedInstance().setActive(true)
            try? engine.start()
            player.play()
            started = true
        }
        // .interrupts — 새 효과음이 이전 것을 즉시 대체.
        player.scheduleBuffer(buffer, at: nil, options: .interrupts,
                              completionHandler: nil)
    }

    // MARK: - 합성

    /// 다중 OscillatorRecipe 의 합산 PCM 버퍼.
    /// 각 recipe 의 파형 sample × volume × envelope × masterVolume 을 시간축에서 합산하고
    /// [-1, 1] 범위로 클램프.
    private func synthesize(_ recipes: [OscillatorRecipe]) -> AVAudioPCMBuffer? {
        guard !recipes.isEmpty else { return nil }
        let total = (recipes.map { $0.start + $0.duration }.max() ?? 0) + 0.02
        let frameCount = AVAudioFrameCount(total * sampleRate)
        guard frameCount > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount)
        else { return nil }
        buffer.frameLength = frameCount
        let out = buffer.floatChannelData![0]
        let n = Int(frameCount)
        for i in 0..<n { out[i] = 0 }

        for r in recipes {
            let startFrame = Int(r.start * sampleRate)
            let nFrames = Int(r.duration * sampleRate)
            guard nFrames > 0 else { continue }
            var phase = 0.0
            let invSR = 1.0 / sampleRate

            for i in 0..<nFrames {
                let frame = startFrame + i
                guard frame >= 0, frame < n else { continue }
                let t = Double(i) * invSR

                // 주파수 — 지수 또는 선형 보간
                let progress = Double(i) / Double(nFrames)
                let freq: Double
                if let fEnd = r.freqEnd {
                    freq = interpolate(r.freqStart, fEnd, progress, kind: r.freqSweepKind)
                } else {
                    freq = r.freqStart
                }

                // 파형
                phase += freq * invSR
                while phase >= 1 { phase -= 1 }
                let sample: Double
                switch r.waveform {
                case .square:   sample = phase < 0.5 ? 1.0 : -1.0
                case .triangle: sample = 4.0 * abs(phase - 0.5) - 1.0
                case .sine:     sample = sin(2.0 * .pi * phase)
                }

                // Envelope
                let env = envelopeAt(t, recipe: r)

                out[frame] += Float(sample * r.volume * env * masterVolume)
            }
        }

        // 클립 방지
        for i in 0..<n {
            if out[i] > 1 { out[i] = 1 } else if out[i] < -1 { out[i] = -1 }
        }
        return buffer
    }

    /// 두 값 사이 보간. 지수 sweep 는 Web Audio `exponentialRampToValueAtTime` 와 동치:
    ///   x(p) = a · (b/a)^p,  p ∈ [0, 1].
    /// 0 또는 음수 endpoint 면 exp 정의 안 되어 linear 폴백 (Web Audio 도 동일 처리).
    private func interpolate(_ a: Double, _ b: Double, _ p: Double,
                             kind: SweepKind) -> Double {
        switch kind {
        case .linear:
            return a + (b - a) * p
        case .exponential:
            guard a > 0, b > 0 else { return a + (b - a) * p }
            return a * pow(b / a, p)
        }
    }

    /// Envelope 평가 — t 는 recipe.start 로부터 경과 시간.
    ///  - customEnvelope=nil: 5ms 어택 + 지수 decay (웹 createOsc/createSweep 의 default).
    ///  - 비-nil: multi-segment 사이 점별 보간 (ambientFloat 등).
    private func envelopeAt(_ t: Double, recipe r: OscillatorRecipe) -> Double {
        if let custom = r.customEnvelope {
            // 첫 점 이전: 0.0001 에서 첫 점.value 로 보간 (setValueAtTime 직후 첫 ramp).
            var prevTime = 0.0
            var prevValue = 0.0001
            for point in custom {
                if t <= point.time {
                    let segDur = point.time - prevTime
                    if segDur <= 0 { return point.value }
                    let segP = (t - prevTime) / segDur
                    return interpolate(prevValue, point.value, segP, kind: point.kind)
                }
                prevTime = point.time
                prevValue = point.value
            }
            return prevValue  // 마지막 점 이후 hold
        }

        // 기본 envelope — 웹 createOsc/createSweep 와 동치.
        let attackDur = 0.005
        if t < attackDur {
            // 5ms 어택: 0.0001 → 1 exp
            return interpolate(0.0001, 1.0, t / attackDur, kind: .exponential)
        } else {
            // 지수 decay to 0.0001 by duration
            let p = (t - attackDur) / max(0.0001, r.duration - attackDur)
            return interpolate(1.0, 0.0001, min(1.0, p), kind: .exponential)
        }
    }

    // MARK: - 27 사운드 레시피 — 웹 sounds.ts 비트 단위 복제

    private static func recipe(_ name: SoundName) -> [OscillatorRecipe] {
        switch name {
        // ───────── UI 클릭·확정·취소 ─────────
        case .select:
            // L:96-105 — punchy low thud + sub-bass triangle + brief high tick.
            return [
                OscillatorRecipe(180, duration: 0.06, volume: 0.8),
                OscillatorRecipe(90,  duration: 0.05, volume: 0.5, waveform: .triangle),
                OscillatorRecipe(600, duration: 0.02, volume: 0.25),
            ]
        case .confirm:
            // L:107-113 — two rising notes 600→800.
            return [
                OscillatorRecipe(600, duration: 0.1, volume: 1.0),
                OscillatorRecipe(800, start: 0.1, duration: 0.1, volume: 1.0),
            ]
        case .cancel:
            // L:115-120 — falling sweep 600→400.
            return [OscillatorRecipe(600, 400, duration: 0.1, volume: 1.0)]

        // ───────── 카드 상호작용 ─────────
        case .cardFlip:
            // L:122-127 — quick sweep 400→1200.
            return [OscillatorRecipe(400, 1200, duration: 0.08, volume: 1.0)]
        case .cardHover:
            // L:129-134 — subtle tick 700 (quiet).
            return [OscillatorRecipe(700, duration: 0.04, volume: 0.35)]
        case .cardPreview:
            // L:136-141 — smooth whoosh sweep 500→900.
            return [OscillatorRecipe(500, 900, duration: 0.12, volume: 0.5)]
        case .cardSelect:
            // L:143-149 — positive tick 900 + 1100 follow.
            return [
                OscillatorRecipe(900, duration: 0.06, volume: 1.0),
                OscillatorRecipe(1100, start: 0.04, duration: 0.05, volume: 0.6),
            ]

        // ───────── 진행 단계 ─────────
        case .packOpen:
            // L:151-158 — 3 ascending notes.
            return [
                OscillatorRecipe(600, duration: 0.1, volume: 1.0),
                OscillatorRecipe(800, start: 0.1, duration: 0.1, volume: 1.0),
                OscillatorRecipe(1000, start: 0.2, duration: 0.12, volume: 1.0),
            ]
        case .complete:
            // L:160-167 — C5 E5 G5 ascending.
            return [
                OscillatorRecipe(523, duration: 0.1, volume: 1.0),
                OscillatorRecipe(659, start: 0.1, duration: 0.1, volume: 1.0),
                OscillatorRecipe(784, start: 0.2, duration: 0.15, volume: 1.0),
            ]
        case .fullClear:
            // L:169-179 — 4-note fanfare + triangle harmony on final.
            return [
                OscillatorRecipe(523, duration: 0.12, volume: 1.0),
                OscillatorRecipe(659, start: 0.12, duration: 0.12, volume: 1.0),
                OscillatorRecipe(784, start: 0.24, duration: 0.12, volume: 1.0),
                OscillatorRecipe(1047, start: 0.36, duration: 0.25, volume: 1.0),
                // Triangle harmony — final note (R2 신규 이식)
                OscillatorRecipe(523, start: 0.36, duration: 0.25,
                                 volume: 0.4, waveform: .triangle),
            ]
        case .levelUp:
            // L:181-193 — 6 ascending + sustained final + triangle harmony.
            var recipes: [OscillatorRecipe] = []
            let freqs: [Double] = [523, 587, 659, 784, 1047, 1319]
            let dur = 0.11
            for (i, freq) in freqs.enumerated() {
                recipes.append(OscillatorRecipe(freq,
                                                start: Double(i) * dur,
                                                duration: dur + 0.02,
                                                volume: 1.0))
            }
            let endT = Double(freqs.count) * dur
            // 마지막 sustained note + triangle 784 하모니
            recipes.append(OscillatorRecipe(1319, start: endT, duration: 0.2, volume: 0.8))
            recipes.append(OscillatorRecipe(784, start: endT, duration: 0.2,
                                            volume: 0.35, waveform: .triangle))
            return recipes
        case .equip:
            // L:195-201 — "cha-ching" 1200 + 1600.
            return [
                OscillatorRecipe(1200, duration: 0.08, volume: 1.0),
                OscillatorRecipe(1600, start: 0.08, duration: 0.12, volume: 1.0),
            ]
        case .xpGain:
            // L:203-217 — 6 ascending staccato + shimmer + triangle harmony.
            var recipes: [OscillatorRecipe] = []
            let freqs: [Double] = [880, 988, 1047, 1175, 1319, 1568]
            let step = 0.055
            for (i, freq) in freqs.enumerated() {
                recipes.append(OscillatorRecipe(freq,
                                                start: Double(i) * step,
                                                duration: 0.045,
                                                volume: 0.4 + Double(i) * 0.08))
            }
            let endT = Double(freqs.count) * step
            recipes.append(OscillatorRecipe(1568, start: endT, duration: 0.12, volume: 0.7))
            recipes.append(OscillatorRecipe(784, start: endT, duration: 0.12,
                                            volume: 0.25, waveform: .triangle))
            return recipes

        // ───────── 신규 이식 (R2 17 개) ─────────
        case .collect:
            // L:219-230 — heavy thud + metallic latch + resonance tail.
            return [
                OscillatorRecipe(120, duration: 0.08, volume: 0.9, waveform: .triangle),
                OscillatorRecipe(80,  duration: 0.06, volume: 0.6),
                OscillatorRecipe(1400, start: 0.03, duration: 0.03, volume: 0.4),
                OscillatorRecipe(200, start: 0.06, duration: 0.1,
                                 volume: 0.3, waveform: .triangle),
            ]

        case .ambientFloat:
            // L:232-257 — deep space drone. Bass linear freq + multi-segment gain.
            return [
                // Bass — triangle 65→73 linear 1.2s, peak 0.45×master, hold middle
                OscillatorRecipe(
                    65, 73, duration: 1.2, volume: 0.45,
                    waveform: .triangle, freqSweepKind: .linear,
                    customEnvelope: [
                        EnvelopePoint(time: 0.3, value: 1.0, kind: .exponential),
                        EnvelopePoint(time: 0.7, value: 1.0, kind: .linear),     // hold
                        EnvelopePoint(time: 1.2, value: 0.0001, kind: .exponential),
                    ]
                ),
                // Mid-tone hum — square 98 0.8s
                OscillatorRecipe(98, start: 0.1, duration: 0.8, volume: 0.15),
                // High shimmer — triangle 262 0.5s, very quiet
                OscillatorRecipe(262, start: 0.4, duration: 0.5,
                                 volume: 0.08, waveform: .triangle),
                // Sub rumble — triangle 45 0.4s
                OscillatorRecipe(45, duration: 0.4, volume: 0.2, waveform: .triangle),
                // Sub rumble 2 — triangle 45 0.4s, delayed
                OscillatorRecipe(45, start: 0.5, duration: 0.4,
                                 volume: 0.15, waveform: .triangle),
            ]

        case .pulseWave:
            // L:259-284 — ascending pulses + rising undertone + peak shimmer.
            return [
                // Main pulse 220→880 exp 0.3s
                OscillatorRecipe(220, 880, duration: 0.3, volume: 0.5),
                // Echo 1 330→1100, delay 0.15
                OscillatorRecipe(330, 1100, start: 0.15, duration: 0.3, volume: 0.3),
                // Echo 2 440→1320, delay 0.3
                OscillatorRecipe(440, 1320, start: 0.3, duration: 0.3, volume: 0.18),
                // Rising undertone — triangle 110→440 exp, 0.9s, custom env
                OscillatorRecipe(
                    110, 440, duration: 0.9, volume: 0.35, waveform: .triangle,
                    customEnvelope: [
                        EnvelopePoint(time: 0.3, value: 1.0, kind: .exponential),
                        EnvelopePoint(time: 0.9, value: 0.0001, kind: .exponential),
                    ]
                ),
                // Peak shimmer — triangle 1320, delay 0.5, 0.15s
                OscillatorRecipe(1320, start: 0.5, duration: 0.15,
                                 volume: 0.15, waveform: .triangle),
            ]

        case .chargeUp:
            // L:286-319 — deep rumble + main sweep + overtone + drone + pulses + burst.
            var recipes: [OscillatorRecipe] = [
                // Deep sub-bass rumble 60→200 0.8s
                OscillatorRecipe(60, 200, duration: 0.8, volume: 0.7),
                // Main rising sweep 100→900 0.75s
                OscillatorRecipe(100, 900, duration: 0.75, volume: 0.55),
                // Overtone sweep 200→1400, delay 0.15, 0.65s
                OscillatorRecipe(200, 1400, start: 0.15, duration: 0.65, volume: 0.3),
                // Drone — triangle 55→110 exp, 0.8s, hold middle
                OscillatorRecipe(
                    55, 110, duration: 0.8, volume: 0.5, waveform: .triangle,
                    customEnvelope: [
                        EnvelopePoint(time: 0.15, value: 1.0, kind: .exponential),
                        EnvelopePoint(time: 0.5, value: 1.0, kind: .linear),
                        EnvelopePoint(time: 0.8, value: 0.0001, kind: .exponential),
                    ]
                ),
            ]
            // Accelerating staccato pulses
            let pulseOffsets: [Double] = [0, 0.12, 0.22, 0.30, 0.36, 0.41, 0.45, 0.48]
            for (i, offset) in pulseOffsets.enumerated() {
                let freq = 150.0 + Double(i) * 80.0
                let volume = 0.12 + Double(i) * 0.04
                recipes.append(OscillatorRecipe(freq, start: offset,
                                                duration: 0.04, volume: volume))
            }
            // Final bright burst
            recipes.append(OscillatorRecipe(1200, start: 0.7, duration: 0.1, volume: 0.25))
            recipes.append(OscillatorRecipe(600, start: 0.7, duration: 0.1,
                                            volume: 0.15, waveform: .triangle))
            return recipes

        case .fireIgnite:
            // L:321-336 — low rumble + crackling bursts + rising sweep.
            // Crackle 의 random offset/duration 은 *결정적 평균값* 으로 고정
            // (PCM 캐시라 재현 가능성 보장).
            var recipes: [OscillatorRecipe] = [
                OscillatorRecipe(80, duration: 0.5, volume: 0.7, waveform: .triangle),
                OscillatorRecipe(200, 600, start: 0.1, duration: 0.4, volume: 0.5),
            ]
            let crackleFreqs: [Double] = [1200, 1500, 1800, 1400, 2000]
            for (i, freq) in crackleFreqs.enumerated() {
                // web: 0.05 + i*0.07 + Math.random()*0.03 → 평균 0.015 offset
                let offset = 0.05 + Double(i) * 0.07 + 0.015
                // web: 0.02 + Math.random()*0.02 → 평균 0.03
                let dur = 0.03
                recipes.append(OscillatorRecipe(freq, start: offset,
                                                duration: dur, volume: 0.4))
            }
            return recipes

        case .impactShake:
            // L:338-359 — strong low impact 60→30 + sub-bass body.
            // Web 의 impactGain.gain peak 0.25 (absolute) → Swift volume = 0.25 / 0.18 ≈ 1.389.
            // 클립은 합산 후 마지막 단계에서 처리.
            return [
                OscillatorRecipe(60, 30, duration: 0.2, volume: 0.25 / 0.18),
                OscillatorRecipe(45, duration: 0.15, volume: 0.6, waveform: .triangle),
            ]

        case .superIgnite:
            // L:361-403 — bass + crackles + chorus(3 detuned) + reverse cymbal.
            var recipes: [OscillatorRecipe] = [
                OscillatorRecipe(50, duration: 0.7, volume: 0.8, waveform: .triangle),
            ]
            // Crackles 8 notes
            let crackleFreqs: [Double] = [1000, 1400, 1800, 2200, 1200, 2400, 1600, 2000]
            for (i, freq) in crackleFreqs.enumerated() {
                let offset = 0.05 + Double(i) * 0.06 + 0.015
                let dur = 0.03
                recipes.append(OscillatorRecipe(freq, start: offset,
                                                duration: dur, volume: 0.35))
            }
            // Chorus — 3 detuned at 200 ± 5
            for freq in [200.0, 205.0, 195.0] {
                recipes.append(OscillatorRecipe(
                    freq, freq * 3, start: 0.1, duration: 0.6, volume: 0.3,
                    customEnvelope: [
                        EnvelopePoint(time: 0.05, value: 1.0, kind: .exponential),
                        EnvelopePoint(time: 0.6, value: 0.0001, kind: .exponential),
                    ]
                ))
            }
            // Reverse cymbal — triangle 2000→200 exp, 0.7s starting at 0.2
            recipes.append(OscillatorRecipe(
                2000, 200, start: 0.2, duration: 0.7, volume: 0.4, waveform: .triangle,
                customEnvelope: [
                    EnvelopePoint(time: 0.3, value: 1.0, kind: .exponential),
                    EnvelopePoint(time: 0.7, value: 0.0001, kind: .exponential),
                ]
            ))
            return recipes

        case .matchPair:
            // L:405-413 — double-chime 880→1320 + triangle harmony 660.
            return [
                OscillatorRecipe(880, duration: 0.08, volume: 1.0),
                OscillatorRecipe(1320, start: 0.08, duration: 0.1, volume: 1.0),
                OscillatorRecipe(660, duration: 0.14, volume: 0.35, waveform: .triangle),
            ]

        case .curseTrigger:
            // L:415-426 — dissonant tritone + descending menace + low rumble.
            return [
                OscillatorRecipe(523, duration: 0.15, volume: 1.0),
                OscillatorRecipe(370, start: 0.05, duration: 0.18, volume: 1.0),
                OscillatorRecipe(523, 130, start: 0.12, duration: 0.28, volume: 0.6),
                OscillatorRecipe(70, duration: 0.35, volume: 0.8, waveform: .triangle),
            ]

        case .rewardChoose:
            // L:428-437 — rising triplet + shimmer tail.
            return [
                OscillatorRecipe(784, duration: 0.08, volume: 1.0),
                OscillatorRecipe(988, start: 0.07, duration: 0.08, volume: 1.0),
                OscillatorRecipe(1319, start: 0.14, duration: 0.14, volume: 1.0),
                OscillatorRecipe(1568, start: 0.18, duration: 0.1,
                                 volume: 0.5, waveform: .triangle),
            ]

        case .meteorWhoosh:
            // L:439-473 — descending sweep + cosmic pad + sparkle pings.
            // Pad 의 absolute gain 0.05 → Swift volume 0.05/0.18 ≈ 0.278.
            return [
                // Descending sweep — triangle 1500→300 exp 0.8s, custom env (peak 0.02s, dip 0.4s)
                OscillatorRecipe(
                    1500, 300, duration: 0.8, volume: 0.6, waveform: .triangle,
                    customEnvelope: [
                        EnvelopePoint(time: 0.02, value: 1.0, kind: .exponential),
                        EnvelopePoint(time: 0.4, value: 0.5, kind: .exponential),
                        EnvelopePoint(time: 0.8, value: 0.0001, kind: .exponential),
                    ]
                ),
                // Cosmic pad — triangle 200 1.15s starting at 0.2, slow swell + hold + decay
                OscillatorRecipe(
                    200, start: 0.2, duration: 1.15, volume: 0.05 / 0.18,
                    waveform: .triangle,
                    customEnvelope: [
                        EnvelopePoint(time: 0.2, value: 1.0, kind: .exponential),
                        EnvelopePoint(time: 0.8, value: 1.0, kind: .linear),  // hold
                        EnvelopePoint(time: 1.15, value: 0.0001, kind: .exponential),
                    ]
                ),
                // Sparkle pings
                OscillatorRecipe(1800, start: 1.0, duration: 0.06, volume: 0.25),
                OscillatorRecipe(1800, start: 1.12, duration: 0.06, volume: 0.15),
            ]

        case .cameraShutter:
            // L:475-484 — sharp click + mechanical body.
            return [
                OscillatorRecipe(2000, duration: 0.02, volume: 0.6),
                OscillatorRecipe(1600, start: 0.01, duration: 0.03, volume: 0.4),
                OscillatorRecipe(300, duration: 0.06, volume: 0.5, waveform: .triangle),
            ]

        case .polaroidSlide:
            // L:486-492 — soft whoosh.
            return [
                OscillatorRecipe(800, 300, duration: 0.15, volume: 0.35),
                OscillatorRecipe(200, start: 0.05, duration: 0.1,
                                 volume: 0.2, waveform: .triangle),
            ]

        case .treeGrow:
            // L:494-503 — A4 C#5 E5 ascending + triangle harmony 330.
            return [
                OscillatorRecipe(440, duration: 0.12, volume: 1.0),
                OscillatorRecipe(554, start: 0.1, duration: 0.12, volume: 1.0),
                OscillatorRecipe(659, start: 0.2, duration: 0.18, volume: 1.0),
                OscillatorRecipe(330, start: 0.2, duration: 0.18,
                                 volume: 0.3, waveform: .triangle),
            ]
        }
    }
}
