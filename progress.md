Original prompt: 앱 전반적인 사운드 개선. main-bg-ambient 로우파이 반복, 던전 BGM 크로스페이드, 보스 전환음 및 BGM 복귀, 레트로 SFX 에셋 교체와 영웅 키우기 효과음 보강.

2026-09-09 audio work:
- Source MP3s preserved in Downloads. Kenney CC0 samples downloaded to /tmp/upnext-audio-source.
- Prepared 10 music loops with 3-second equal-power seam, main low-pass/high-pass/compression, matched BGM loudness.
- Replaced oscillator synthesis with authored WAV samples. Shared cue names and identical media in web/iOS.
- Added music scene transitions, mute/background handling, overlapping SFX, and combat/UI/minigame cues.
- Existing XP balance and AGENTS changes belong to other work and remain untouched.
- Verification in progress: typecheck, lifecycle/race tests, real browser audio and iOS simulator build/playback.

Validation: web 332 tests pass, audio unit tests 11 pass, iOS AudioTests 4 pass, production web build passes, all 10 BGM and 67 SFX decode in Chromium and iOS. Live web F9→F10 boss→defeat→dungeon return confirmed with playback traces and screenshots. Supplied bossfight.mp3 duplicates the mountain track exactly. Physical-device listening remains for user review. See scripts/audio/README.md.
Native dungeon screenshot inspected on iPhone 17 Pro simulator. Listening preview saved to scripts/audio/preview.m4a. No commit or deployment performed.
Final iOS build succeeded after reward-claim cue changes. Final TypeScript and focused lint checks passed. Existing web critical/boss haptics preserved independently of the audio setting. QA dev server and simulator app stopped after verification.

2026-09-09 follow-up: replace Steel Mountain with a licensed internet track.
- Selected MintoDog's Mountain Stage, an 8-bit action track released as CC0: https://opengameart.org/content/mountain-stage
- Preserved the downloaded OGG in scripts/audio/sources. The generator now uses it for fitness on every rebuild.
- Kept its 165 BPM timing and baked an eight-beat (2.909-second) crossfade, producing a 55.273-second loop.
- Updated both platform assets, exact web loop length, source metadata, license notice, and recorded transition preview.
- Verified that only the fitness audio changed and the supplied boss audio stayed byte-identical. All web/iOS assets match.
- Chromium decoded all 10 BGM and 67 cues, rendered loop boundaries, and passed fitness-to-boss-to-fitness transitions and mute/background checks. Audio unit tests: 11 passed; focused lint and diff checks passed.
- iOS simulator build and all four AudioTests passed, including playback across the new fitness loop boundary. Built app's fitness audio hash matches the new asset. No commit or deployment performed.

2026-09-09 follow-up: boss transition timing and level.
- Diagnosed simultaneous BGM/stinger starts and the 2.482-second stinger at gain 0.65.
- Prepared a pitch-preserving, faster 0.9-second stinger with a 220 ms fade-out. Mixer gain is now 0.26 on both platforms.
- Stinger starts first; boss BGM follows after 450 ms. Outgoing dungeon music fades in 650 ms; boss music fades in over 1.4 seconds.
- Web waits for the actual stinger start even when its load is slower than BGM. Repeated gestures do not replay it, and leaving/muting cancels pending and scheduled playback.
- Browser measured lead 0.45 seconds, duration 0.9 seconds, gain 0.26. Audio tests: 14 passed; typecheck, focused lint and diff checks passed. Removed two byte-identical generated iCloud conflict copies from .next/types to unblock typecheck.
- All BGM files stayed byte-identical. Updated SFX and manifest match web/iOS. Focused real-mixer recording: scripts/audio/boss-transition-preview.m4a.
- iOS validation used an isolated copy with the exact sound source/tests/assets. The initial full-app build hit unrelated concurrent notification/widget setup compile errors; only the temporary copy received compatibility fixes. Shared source files from that task were preserved.
- All four iOS AudioTests passed, including actual music time/volume remaining zero during the intro, playback after the lead-in, and cancellation on a quick return. No commit or deployment performed.
