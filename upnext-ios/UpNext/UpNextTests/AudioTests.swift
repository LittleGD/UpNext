import XCTest
import AVFoundation
@testable import UpNext

@MainActor
final class AudioTests: XCTestCase {
    func testCardShuffleLoopsAndStopsOnReleaseAndBackground() async throws {
        let player = SoundPlayer.shared
        SoundPlayer.enabled = true
        player.setActive(true)
        player.startCardShuffle()
        try await Task.sleep(for: .milliseconds(750))
        XCTAssertTrue(player.isCardShufflePlaying, "Shuffle must continue beyond its 640ms sample")
        player.stopCardShuffle()
        player.startCardShuffle()
        try await Task.sleep(for: .milliseconds(100))
        XCTAssertTrue(player.isCardShufflePlaying, "Old fade must not stop a new press")
        player.setActive(false)
        XCTAssertFalse(player.isCardShufflePlaying)
        player.setActive(true)
        XCTAssertFalse(player.isCardShufflePlaying, "Returning does not replay the hold")
        player.setActive(false)
    }

    func testEffectsRecoverOnForegroundWithoutInterruptionEnded() {
        let player = SoundPlayer.shared
        SoundPlayer.enabled = true
        player.setActive(true)
        XCTAssertNotNil(player.play(.confirm))
        NotificationCenter.default.post(name: AVAudioSession.interruptionNotification, object: nil,
            userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue])
        XCTAssertNil(player.play(.complete))
        player.setActive(false)
        player.setActive(true)
        XCTAssertNotNil(player.play(.complete), "Foreground must recover without an ended notification")
        XCTAssertNotNil(player.currentTrack)
        player.setActive(false)
    }

    func testMediaResetRecoversEffectsAndForegroundPreservesMute() {
        let player = SoundPlayer.shared
        SoundPlayer.enabled = true
        player.setActive(false)
        player.setActive(true)
        NotificationCenter.default.post(name: AVAudioSession.interruptionNotification, object: nil,
            userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue])
        NotificationCenter.default.post(name: AVAudioSession.mediaServicesWereResetNotification, object: nil)
        XCTAssertNotNil(player.play(.confirm))
        player.setActive(false)
        XCTAssertNil(player.play(.complete))
        SoundPlayer.enabled = false
        player.setActive(true)
        XCTAssertNil(player.play(.complete), "Foreground must preserve the user's mute setting")
        player.setActive(false)
        SoundPlayer.enabled = true
    }

    func testEveryBundledCueAndMusicDecodes() throws {
        for name in SoundName.allCases {
            let url = try XCTUnwrap(SoundPlayer.assetURL("sfx-\(name.rawValue)", extension: "wav"), name.rawValue)
            let player = try AVAudioPlayer(contentsOf: url)
            XCTAssertGreaterThan(player.duration, 0.005, name.rawValue)
            XCTAssertTrue(player.prepareToPlay(), name.rawValue)
        }
        for track in MusicTrack.allCases {
            let url = try XCTUnwrap(SoundPlayer.assetURL("bgm-\(track.rawValue)", extension: "m4a"))
            let player = try AVAudioPlayer(contentsOf: url)
            XCTAssertGreaterThan(player.duration, 0, track.rawValue)
            XCTAssertTrue(player.prepareToPlay(), track.rawValue)
        }
    }

    func testMusicActuallyLoopsAcrossItsEnd() async throws {
        for track in [MusicTrack.main, .fitness] {
            let url = try XCTUnwrap(SoundPlayer.assetURL("bgm-\(track.rawValue)", extension: "m4a"))
            let player = try AVAudioPlayer(contentsOf: url)
            player.numberOfLoops = -1
            player.volume = 0.01
            player.currentTime = player.duration - 0.2
            XCTAssertTrue(player.play(), track.rawValue)
            try await Task.sleep(nanoseconds: 600_000_000)
            XCTAssertTrue(player.isPlaying, track.rawValue)
            XCTAssertLessThan(player.currentTime, 1, track.rawValue)
            player.stop()
        }
    }

    func testSceneChangesMuteAndBackgroundPlayback() async throws {
        let player = SoundPlayer.shared
        SoundPlayer.enabled = true
        player.setActive(true)
        player.setMusic(.fitness)
        XCTAssertEqual(player.currentTrack, .fitness)
        player.setMusic(.boss)
        XCTAssertEqual(player.currentTrack, .boss)
        try await Task.sleep(nanoseconds: 200_000_000)
        XCTAssertEqual(player.currentMusicTime, 0, accuracy: 0.02)
        XCTAssertEqual(player.currentMusicVolume, 0, accuracy: 0.001)
        try await Task.sleep(nanoseconds: 450_000_000)
        XCTAssertGreaterThan(player.currentMusicTime, 0.05)
        XCTAssertGreaterThan(player.currentMusicVolume, 0)
        player.play(.heroHit)
        player.play(.criticalHit)
        try await Task.sleep(nanoseconds: 250_000_000)
        player.setMusic(.fitness)
        XCTAssertEqual(player.currentTrack, .fitness)
        // Cancel another intro before its scheduled music start.
        player.setMusic(.boss)
        player.setMusic(.fitness)
        try await Task.sleep(nanoseconds: 550_000_000)
        XCTAssertEqual(player.currentTrack, .fitness)
        SoundPlayer.enabled = false
        XCTAssertNil(player.currentTrack)
        player.setMusic(.learning)
        XCTAssertNil(player.currentTrack)
        SoundPlayer.enabled = true
        XCTAssertEqual(player.currentTrack, .learning)
        player.setActive(false)
        XCTAssertNil(player.currentTrack)
        player.setActive(true)
        XCTAssertEqual(player.currentTrack, .learning)
        player.setMusic(.main)
        try await Task.sleep(nanoseconds: 2_500_000_000)
        XCTAssertEqual(player.currentTrack, .main)
        player.setActive(false)
    }

    func testBossMusicAndOutcomeMapping() {
        var rng = Mulberry32(seed: 1)
        var session = UpHeroSession.createSession(dungeonId: .fitness, hero: UpHeroRules.createDefaultHero(), startFloor: 1, rng: &rng)
        // Use a real generated monster, then mark the encounter as a boss.
        let monster = Monster(id: "audio-boss", name: "Boss", templateId: "audio-boss", kind: .beast,
                              level: 1, hp: 10, maxHp: 10, atk: 1, def: 1,
                              xpReward: 1, coinReward: 1, isBoss: true, dungeonId: .fitness, trait: nil)
        session.log = [.boss(monster: monster, floor: 10, timestamp: 0)]
        XCTAssertEqual(UpHeroAudio.music(session), .boss)
        session.status = .paused
        XCTAssertEqual(UpHeroAudio.music(session), .boss)
        session.status = .completed
        XCTAssertEqual(UpHeroAudio.music(session), .fitness)
        XCTAssertEqual(UpHeroAudio.music(nil), .main)
        XCTAssertEqual(UpHeroAudio.cue(.combat(attacker: .hero, damage: 10, outcome: .crit, narrative: nil, narrativeKey: nil, narrativeParams: nil, timestamp: 1)), .criticalHit)
        XCTAssertEqual(UpHeroAudio.cue(.combat(attacker: .enemy, damage: 0, outcome: .dodge, narrative: nil, narrativeKey: nil, narrativeParams: nil, timestamp: 1)), .dodge)
    }
}
