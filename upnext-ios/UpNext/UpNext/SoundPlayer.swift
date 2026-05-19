//
//  SoundPlayer.swift
//  UpNext — 사운드 (Phase 5 슬라이스 3 · Phase 5.1).
//
//  웹 src/lib/sounds.ts 의 Web Audio chiptune 합성을 AVAudioEngine 으로 포팅.
//  웹은 oscillator + gain 노드를 실시간 연결했고, 네이티브는 PCM 버퍼를 직접
//  합성해 AVAudioPlayerNode 로 재생한다 (사운드별 1회 합성 후 캐시).
//
//  condensed — 사각파 단일 파형으로 통일(웹의 triangle 하모니 레이어 생략),
//  데일리 루프 핵심음 10종만. 전투·Up Hero 음(드론·스윕 다층)은 후속 확장.
//

import AVFoundation

/// 사운드 이름 — 슬라이스 3 은 데일리 루프 핵심음. 웹 SoundName 의 부분 집합.
enum SoundName {
    case select, cardSelect, confirm, cancel, cardFlip
    case complete, fullClear, levelUp, packOpen, xpGain
}

/// 사운드 한 음 — 사각파 톤. freqStart != freqEnd 면 주파수 스윕.
private struct Note {
    var freqStart: Double
    var freqEnd: Double
    var start: Double       // 시작 오프셋 (초)
    var duration: Double
    var volume: Double

    init(_ f0: Double, _ f1: Double, _ start: Double,
         _ duration: Double, _ volume: Double = 0.5) {
        freqStart = f0; freqEnd = f1
        self.start = start; self.duration = duration; self.volume = volume
    }
}

@MainActor
final class SoundPlayer {

    static let shared = SoundPlayer()

    /// 설정의 soundEnabled 와 동기 — GameStore.progress 의 didSet 이 갱신.
    static var enabled = true

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let sampleRate = 44_100.0
    private lazy var format = AVAudioFormat(
        standardFormatWithSampleRate: sampleRate, channels: 1)!
    /// 사운드별 합성 버퍼 캐시 — 한 번 만들고 재사용.
    private var cache: [SoundName: AVAudioPCMBuffer] = [:]
    private var started = false

    /// 다중 노트 합산 클리핑 방지용 마스터 스케일.
    private let masterVolume = 0.35

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
            // UI 효과음 — .ambient: 무음 스위치 존중 + 타 오디오와 믹스.
            try? AVAudioSession.sharedInstance().setCategory(.ambient)
            try? AVAudioSession.sharedInstance().setActive(true)
            try? engine.start()
            player.play()
            started = true
        }
        // .interrupts — 새 효과음이 이전 것을 즉시 대체 (UI 피드백은 지연 없이).
        player.scheduleBuffer(buffer, at: nil, options: .interrupts,
                              completionHandler: nil)
    }

    // MARK: - 합성

    /// 노트 목록 → PCM 버퍼. 각 노트를 사각파로 써서 합산 후 클램프.
    private func synthesize(_ notes: [Note]) -> AVAudioPCMBuffer? {
        guard !notes.isEmpty else { return nil }
        let total = (notes.map { $0.start + $0.duration }.max() ?? 0) + 0.02
        let frameCount = AVAudioFrameCount(total * sampleRate)
        guard frameCount > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount)
        else { return nil }
        buffer.frameLength = frameCount
        let out = buffer.floatChannelData![0]
        let n = Int(frameCount)
        for i in 0..<n { out[i] = 0 }

        for note in notes {
            let startFrame = Int(note.start * sampleRate)
            let noteFrames = Int(note.duration * sampleRate)
            guard noteFrames > 0 else { continue }
            let attack = max(1.0, 0.005 * sampleRate)            // 5ms 페이드인
            let release = max(1.0, min(Double(noteFrames), 0.03 * sampleRate))
            var phase = 0.0
            for i in 0..<noteFrames {
                let frame = startFrame + i
                guard frame >= 0, frame < n else { continue }
                // 스윕 — 주파수 선형 보간
                let prog = Double(i) / Double(noteFrames)
                let freq = note.freqStart + (note.freqEnd - note.freqStart) * prog
                phase += freq / sampleRate
                if phase >= 1 { phase -= 1 }
                let square: Double = phase < 0.5 ? 1 : -1
                // 엔벨로프 — 클릭 방지 어택/릴리스
                var env = 1.0
                if Double(i) < attack {
                    env = Double(i) / attack
                } else if Double(noteFrames - i) < release {
                    env = Double(noteFrames - i) / release
                }
                out[frame] += Float(square * note.volume * env * masterVolume)
            }
        }
        for i in 0..<n {
            if out[i] > 1 { out[i] = 1 } else if out[i] < -1 { out[i] = -1 }
        }
        return buffer
    }

    // MARK: - 사운드 레시피 (웹 sounds.ts 의 createOsc / createSweep 시퀀스 포팅)

    private static func recipe(_ name: SoundName) -> [Note] {
        switch name {
        case .select:
            return [Note(180, 180, 0, 0.06, 0.8),
                    Note(90, 90, 0, 0.05, 0.5),
                    Note(600, 600, 0, 0.02, 0.25)]
        case .cardSelect:
            return [Note(900, 900, 0, 0.06, 0.7),
                    Note(1100, 1100, 0.04, 0.05, 0.5)]
        case .confirm:
            return [Note(600, 600, 0, 0.1), Note(800, 800, 0.1, 0.1)]
        case .cancel:
            return [Note(600, 400, 0, 0.1)]            // 하강 스윕
        case .cardFlip:
            return [Note(400, 1200, 0, 0.08)]          // 상승 스윕
        case .complete:
            return [Note(523, 523, 0, 0.1),            // C5
                    Note(659, 659, 0.1, 0.1),          // E5
                    Note(784, 784, 0.2, 0.15)]         // G5
        case .fullClear:
            return [Note(523, 523, 0, 0.12), Note(659, 659, 0.12, 0.12),
                    Note(784, 784, 0.24, 0.12), Note(1047, 1047, 0.36, 0.25)]
        case .levelUp:
            let freqs = [523.0, 587, 659, 784, 1047, 1319]   // C5 D5 E5 G5 C6 E6
            var notes = freqs.enumerated().map { i, f in
                Note(f, f, Double(i) * 0.11, 0.13, 0.5)
            }
            notes.append(Note(1319, 1319, Double(freqs.count) * 0.11, 0.2, 0.45))
            return notes
        case .packOpen:
            return [Note(600, 600, 0, 0.1), Note(800, 800, 0.1, 0.1),
                    Note(1000, 1000, 0.2, 0.12)]
        case .xpGain:
            let freqs = [880.0, 988, 1047, 1175, 1319, 1568]
            var notes = freqs.enumerated().map { i, f in
                Note(f, f, Double(i) * 0.055, 0.045, 0.3 + Double(i) * 0.05)
            }
            notes.append(Note(1568, 1568, Double(freqs.count) * 0.055, 0.12, 0.45))
            return notes
        }
    }
}
