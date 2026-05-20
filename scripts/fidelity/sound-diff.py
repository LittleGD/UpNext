#!/usr/bin/env python3
"""
scripts/fidelity/sound-diff.py

웹 (OfflineAudioContext 캡처) vs iOS (AVAudioEngine manual rendering 캡처) 의
사운드 WAV 페어를 FFT 피크 주파수 + 길이로 비교.

R2 (사운드 정체성 회복) 의 머지 게이트.

사용:
  python3 sound-diff.py <web.wav> <ios.wav>           # 단일 페어 비교
  python3 sound-diff.py --dir <captures_dir>          # 디렉토리 일괄 (sounds/<name>/{web,ios}.wav)

통과 기준:
  - FFT 피크 주파수 차이 ≤ 2% (or ≤ 5 Hz, max)
  - 길이 차이 ≤ 5ms

의존:
  pip install librosa numpy

종료:
  0: 모든 페어 통과
  1: 하나라도 실패
  2: 입력 파일 누락
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

try:
    import librosa
    import numpy as np
except ImportError:
    print("⚠ librosa/numpy 미설치 — `pip install librosa numpy`", file=sys.stderr)
    sys.exit(2)


FREQ_TOLERANCE_PCT = 2.0       # ±2%
FREQ_TOLERANCE_HZ_MAX = 5.0    # ±5 Hz (저주파에서 % 가 너무 빡빡할 때)
LENGTH_TOLERANCE_MS = 5.0      # ±5ms


@dataclass
class DiffResult:
    name: str
    web_peak_hz: float
    ios_peak_hz: float
    web_length_ms: float
    ios_length_ms: float
    peak_delta_pct: float
    length_delta_ms: float
    passed: bool


def peak_frequency(wav_path: Path) -> tuple[float, float]:
    """WAV → (peak Hz, length ms)."""
    y, sr = librosa.load(str(wav_path), sr=None, mono=True)
    if len(y) == 0:
        return (0.0, 0.0)
    # STFT 후 magnitude 평균으로 dominant frequency 추출
    stft = np.abs(librosa.stft(y, n_fft=2048))
    avg_mag = stft.mean(axis=1)
    peak_bin = int(np.argmax(avg_mag))
    peak_hz = peak_bin * sr / 2048.0
    length_ms = (len(y) / sr) * 1000.0
    return (peak_hz, length_ms)


def diff_pair(web: Path, ios: Path, name: str | None = None) -> DiffResult:
    name = name or web.parent.name
    web_hz, web_ms = peak_frequency(web)
    ios_hz, ios_ms = peak_frequency(ios)

    # 주파수 차이 — %와 Hz 둘 중 더 너그러운 쪽
    if web_hz > 0:
        pct = abs(web_hz - ios_hz) / web_hz * 100.0
    else:
        pct = float("inf")
    hz_abs = abs(web_hz - ios_hz)

    freq_ok = (pct <= FREQ_TOLERANCE_PCT) or (hz_abs <= FREQ_TOLERANCE_HZ_MAX)
    length_delta = abs(web_ms - ios_ms)
    length_ok = length_delta <= LENGTH_TOLERANCE_MS

    return DiffResult(
        name=name,
        web_peak_hz=web_hz,
        ios_peak_hz=ios_hz,
        web_length_ms=web_ms,
        ios_length_ms=ios_ms,
        peak_delta_pct=pct,
        length_delta_ms=length_delta,
        passed=freq_ok and length_ok,
    )


def format_row(r: DiffResult) -> str:
    status = "✓" if r.passed else "✗"
    return (f"| {r.name:20s} | {r.web_peak_hz:7.1f} | {r.ios_peak_hz:7.1f} | "
            f"{r.peak_delta_pct:5.2f}% | {r.length_delta_ms:5.1f}ms | {status} |")


def main() -> int:
    parser = argparse.ArgumentParser(description="Sound FFT/length diff")
    parser.add_argument("web", nargs="?", help="web WAV 경로")
    parser.add_argument("ios", nargs="?", help="ios WAV 경로")
    parser.add_argument("--dir", help="페어 디렉토리 (sounds/<name>/{web,ios}.wav)")
    ns = parser.parse_args()

    results: list[DiffResult] = []

    if ns.dir:
        root = Path(ns.dir)
        for sub in sorted(root.iterdir()):
            if not sub.is_dir():
                continue
            w = sub / "web.wav"
            i = sub / "ios.wav"
            if not (w.exists() and i.exists()):
                print(f"⚠ {sub.name}: missing web.wav or ios.wav", file=sys.stderr)
                continue
            results.append(diff_pair(w, i, sub.name))
    elif ns.web and ns.ios:
        results.append(diff_pair(Path(ns.web), Path(ns.ios)))
    else:
        parser.error("either (web ios) or --dir required")

    if not results:
        print("no pairs compared", file=sys.stderr)
        return 2

    # 표 출력
    print("| name                 | web Hz  | ios Hz  | Δ%    | Δms   | ok |")
    print("|----------------------|---------|---------|-------|-------|----|")
    for r in results:
        print(format_row(r))

    passed = sum(1 for r in results if r.passed)
    total = len(results)
    print(f"\n{passed}/{total} passed (freq ≤ {FREQ_TOLERANCE_PCT}% or ≤ {FREQ_TOLERANCE_HZ_MAX}Hz, "
          f"length ≤ {LENGTH_TOLERANCE_MS}ms)")

    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
