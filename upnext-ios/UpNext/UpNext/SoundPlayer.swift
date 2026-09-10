import AVFoundation
import UIKit

/// Matches the web mixer. Prepared tracks contain their loop crossfades.
enum MusicTrack: String, CaseIterable {
    case main, boss, fitness, learning, mindfulness, nutrition, social, productivity, wellness, trending
    var volume: Float { self == .main ? 0.24 : self == .boss ? 0.55 : 0.42 }
}

@MainActor
final class SoundPlayer: NSObject {
    static let shared = SoundPlayer()
    static var enabled = true {
        didSet { if !enabled { shared.stopAll() } else { shared.resume() } }
    }
    private struct MusicVoice {
        let player: AVAudioPlayer
        var start: Float
        var target: Float
        var delay: TimeInterval
        var duration: TimeInterval
    }
    private var samples: [SoundName: Data] = [:]
    private var effects: [(SoundName, AVAudioPlayer)] = []
    private var lastPlayed: [SoundName: TimeInterval] = [:]
    private var music: [MusicVoice] = []
    private var fadeTimer: Timer?
    private var fadeStart: TimeInterval = 0
    private var fadeDuration: TimeInterval = 2.4
    private var bossMusicNotBefore: TimeInterval = 0
    private var active = true
    private var interrupted = false
    private var sessionReady = false
    private var desired: MusicTrack = .main
    private(set) var currentTrack: MusicTrack?
    var currentMusicTime: TimeInterval { music.last?.player.currentTime ?? 0 }
    var currentMusicVolume: Float { music.last?.player.volume ?? 0 }
    private let quiet: Set<SoundName> = [.select, .cardHover, .miss, .heroHit, .enemyHit]

    private override init() {
        super.init()
        NotificationCenter.default.addObserver(self, selector: #selector(interruption),
            name: AVAudioSession.interruptionNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(routeChanged),
            name: AVAudioSession.routeChangeNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(mediaReset),
            name: AVAudioSession.mediaServicesWereResetNotification, object: nil)
    }

    static func assetURL(_ name: String, extension ext: String) -> URL? {
        Bundle.main.url(forResource: name, withExtension: ext, subdirectory: "Audio")
            ?? Bundle.main.url(forResource: name, withExtension: ext)
    }

    func prewarm() {
        for name in SoundName.allCases {
            if let url = Self.assetURL("sfx-\(name.rawValue)", extension: "wav"),
               let data = try? Data(contentsOf: url) { samples[name] = data }
        }
        resume()
    }

    func setActive(_ value: Bool) {
        active = value
        if value { resume() } else { stopAll() }
    }

    private func configureSession() -> Bool {
        if sessionReady { return true }
        do {
            // Respect Silent Mode, mix with the user's audio, stop when app is inactive.
            try AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
            sessionReady = true
            return true
        } catch { return false }
    }

    private func resume() {
        guard Self.enabled, active, !interrupted, configureSession() else { return }
        startMusic()
    }

    func setMusic(_ track: MusicTrack) {
        guard track != desired else { return }
        desired = track
        bossMusicNotBefore = 0
        if track == .boss, let started = play(.bossTransition) {
            bossMusicNotBefore = started + 0.45
        }
        else {
            for (name, player) in effects where name == .bossTransition { player.stop() }
            effects.removeAll { $0.0 == .bossTransition }
        }
        resume()
    }

    @discardableResult
    func play(_ name: SoundName) -> TimeInterval? {
        guard Self.enabled, active, !interrupted else { return nil }
        let now = ProcessInfo.processInfo.systemUptime
        let cooldown = (name == .select) ? 0.045 : 0.11
        guard now - (lastPlayed[name] ?? -.infinity) >= cooldown else { return nil }
        lastPlayed[name] = now
        effects.removeAll { !$0.1.isPlaying }
        if effects.count >= 12 {
            guard let index = effects.firstIndex(where: { quiet.contains($0.0) }) else { return nil }
            effects.remove(at: index).1.stop()
        }
        if samples[name] == nil,
           let url = Self.assetURL("sfx-\(name.rawValue)", extension: "wav") {
            samples[name] = try? Data(contentsOf: url)
        }
        guard let data = samples[name], let player = try? AVAudioPlayer(data: data), configureSession() else { return nil }
        player.volume = name == .bossTransition ? 0.26 : quiet.contains(name) ? 0.22 : 0.42
        player.prepareToPlay()
        guard player.play() else { return nil }
        effects.append((name, player))
        return ProcessInfo.processInfo.systemUptime
    }

    private func startMusic() {
        guard currentTrack != desired,
              let url = Self.assetURL("bgm-\(desired.rawValue)", extension: "m4a"),
              let player = try? AVAudioPlayer(contentsOf: url) else { return }
        player.numberOfLoops = -1
        player.volume = 0
        player.prepareToPlay()
        let now = ProcessInfo.processInfo.systemUptime
        let delay = desired == .boss ? max(0, bossMusicNotBefore - now) : 0
        let duration = desired == .boss ? 1.4 : 2.4
        let outgoingDuration = delay > 0 ? 0.65 : duration
        guard delay > 0 ? player.play(atTime: player.deviceCurrentTime + delay) : player.play() else { return }
        // Retarget from the actual current volumes, including interrupted crossfades.
        fadeTimer?.invalidate()
        // Stop a silent, scheduled intro if the user leaves before it starts.
        for voice in music where voice.player.volume == 0 { voice.player.stop() }
        music = music.filter { $0.player.isPlaying }.map {
            MusicVoice(player: $0.player, start: $0.player.volume, target: 0, delay: 0, duration: outgoingDuration)
        }
        music.append(MusicVoice(player: player, start: 0, target: desired.volume, delay: delay, duration: duration))
        currentTrack = desired
        fadeDuration = delay + duration
        fadeStart = now
        fadeTimer = Timer.scheduledTimer(timeInterval: 1.0 / 30, target: self,
            selector: #selector(updateFade), userInfo: nil, repeats: true)
        if let fadeTimer { RunLoop.main.add(fadeTimer, forMode: .common) }
    }

    @objc private func updateFade() {
        let elapsed = ProcessInfo.processInfo.systemUptime - fadeStart
        for voice in music {
            let fraction = Float(min(1, max(0, (elapsed - voice.delay) / voice.duration)))
            voice.player.volume = voice.start + (voice.target - voice.start) * fraction
        }
        if elapsed >= fadeDuration {
            for voice in music where voice.target == 0 { voice.player.stop() }
            music.removeAll { $0.target == 0 }
            fadeTimer?.invalidate(); fadeTimer = nil
        }
    }

    private func stopAll() {
        fadeTimer?.invalidate(); fadeTimer = nil
        music.forEach { $0.player.stop() }; music.removeAll()
        effects.forEach { $0.1.stop() }; effects.removeAll()
        lastPlayed.removeAll()
        currentTrack = nil
        bossMusicNotBefore = 0
        sessionReady = false
    }

    @objc private func interruption(_ notification: Notification) {
        guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        if type == .began { interrupted = true; stopAll() }
        else {
            interrupted = false
            let rawOptions = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            if AVAudioSession.InterruptionOptions(rawValue: rawOptions).contains(.shouldResume) { resume() }
        }
    }

    @objc private func routeChanged(_ notification: Notification) {
        guard let raw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable else { return }
        stopAll()
    }

    @objc private func mediaReset() { stopAll(); resume() }
}

// Enhancement tiers retain their established feedback when samples change.
extension SoundName {
    var enhanceHapticIntent: Haptics.Intent? {
        switch self {
        case .enhanceCharge: return .light
        case .enhanceSuccessHigh: return .success
        case .enhanceSuccessMax: return .celebration
        case .enhanceShatter: return .heavy
        default: return nil
        }
    }
}
