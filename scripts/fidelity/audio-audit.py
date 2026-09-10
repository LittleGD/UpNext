#!/usr/bin/env python3
"""Verify the shipped audio catalog without requiring an audio device or ffmpeg."""
import json
import re
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "public/audio"
IOS = ROOT / "upnext-ios/UpNext/UpNext"
manifest = json.loads((WEB / "manifest.json").read_text())
assert manifest == json.loads((IOS / "Audio/manifest.json").read_text()), "Audio manifests differ"
catalog = set(re.findall(r"^    case (\w+)$", (IOS / "SoundName.swift").read_text(), re.M))
assert catalog == set(manifest["sfx"]), "Swift sound catalog differs from the manifest"
required_sounds = {
    "chargeUp", "ambientFloat", "pulseWave", "collect", "fireIgnite", "impactShake",
    "superIgnite", "meteorWhoosh", "matchPair", "curseTrigger", "rewardChoose",
    "cameraShutter", "polaroidSlide", "treeGrow",
}
assert required_sounds <= catalog, "Restored sound identities were removed"
assert len(catalog) >= 63, "SFX catalog was reduced"
assert len(manifest["music"]) >= 10, "Music catalog was reduced"
for category in ("sfx", "music"):
    for name, entry in manifest[category].items():
        filename = entry["file"]
        web_file, ios_file = WEB / filename, IOS / "Audio" / filename
        content = web_file.read_bytes()
        assert len(content) > 44, f"Empty audio: {name}"
        assert content == ios_file.read_bytes(), f"Web/iOS audio differs: {name}"
        if category == "sfx":
            with wave.open(str(web_file), "rb") as audio:
                assert audio.getnframes() > 0, f"Empty WAV: {name}"
                assert audio.getframerate() == manifest["sampleRate"], f"WAV sample rate: {name}"
                assert audio.getsampwidth() == 2, f"WAV must be 16-bit PCM: {name}"
                samples = audio.readframes(audio.getnframes())
                assert len(samples) == audio.getnframes() * audio.getnchannels() * 2, f"Truncated WAV: {name}"
                assert any(samples), f"Silent WAV: {name}"
print(f"{len(catalog)} SFX and {len(manifest['music'])} music assets verified")
