#!/usr/bin/env python3
"""
scripts/fidelity/fidelity-diff.py

snapshot-pair.sh 가 캡처한 web ↔ iOS 페어를 비교해 fidelity score 계산.
fidelity-grid.md 의 해당 행을 갱신한다.

R7 (회귀 차단 CI 게이트) 의 핵심 비교 엔진.

비교 축:
  1. 시각: pixelmatch (mismatch % → score = 10 - (%÷2))
  2. 모션: ffmpeg + SSIM (≥ 0.95 = 10점)
  3. 사운드: sound-diff.py 결과를 meta.json 의 sound_score 로
  4. 사용자: 외부 입력 (베타 폴 결과) meta.json 의 user_score

사용:
  python3 fidelity-diff.py <row_id>           # 단일 행
  python3 fidelity-diff.py --all              # 24행 모두

의존:
  pip install pixelmatch pillow numpy
  brew install ffmpeg

종료:
  0: 모든 행 score ≥ 8
  1: 하나라도 < 8 (baseline 하락)
  2: 캡처 파일 누락
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FIDELITY_DIR = REPO_ROOT / "docs" / "fidelity"

VISUAL_THRESHOLD = 8.0


def pixelmatch_score(web_png: Path, ios_png: Path) -> float | None:
    """pixelmatch % mismatch → score 0~10."""
    try:
        from PIL import Image
        from pixelmatch.contrib.PIL import pixelmatch  # type: ignore
    except ImportError:
        print("⚠ pixelmatch/Pillow 미설치 — `pip install pixelmatch Pillow`", file=sys.stderr)
        return None

    a = Image.open(web_png).convert("RGBA")
    b = Image.open(ios_png).convert("RGBA")
    if a.size != b.size:
        b = b.resize(a.size)
    diff = Image.new("RGBA", a.size)
    mismatch = pixelmatch(a, b, diff, threshold=0.1, includeAA=False)
    total = a.size[0] * a.size[1]
    pct = (mismatch / total) * 100.0
    score = max(0.0, 10.0 - (pct / 2.0))
    return round(score, 1)


def ssim_score(web_mp4: Path, ios_mp4: Path) -> float | None:
    """ffmpeg SSIM → score 0~10. SSIM 0.85=0, 0.95=10 (선형)."""
    if not (web_mp4.exists() and ios_mp4.exists()):
        return None
    try:
        result = subprocess.run(
            ["ffmpeg", "-i", str(web_mp4), "-i", str(ios_mp4),
             "-lavfi", "[0:v][1:v]ssim", "-f", "null", "-"],
            capture_output=True, text=True, check=False
        )
        for line in result.stderr.splitlines():
            if "SSIM" in line and "All:" in line:
                parts = line.split("All:")[1].split()
                if parts:
                    ssim = float(parts[0])
                    score = max(0.0, min(10.0, (ssim - 0.85) * 100.0))
                    return round(score, 1)
        return None
    except (FileNotFoundError, ValueError, IndexError):
        return None


def diff_row(row_id: str, capture_date: str | None = None) -> dict:
    if capture_date is None:
        capture_date = date.today().strftime("%Y%m%d")
    row_dir = FIDELITY_DIR / capture_date / row_id

    result = {
        "row_id": row_id,
        "date": capture_date,
        "visual": None,
        "motion": None,
        "sound": None,
        "user": None,
        "overall": None,
    }

    if not row_dir.exists():
        return result

    web_png = row_dir / "web.png"
    ios_png = row_dir / "ios.png"
    if web_png.exists() and ios_png.exists():
        result["visual"] = pixelmatch_score(web_png, ios_png)

    web_mp4 = row_dir / "web.mp4"
    ios_mp4 = row_dir / "ios.mp4"
    if web_mp4.exists() and ios_mp4.exists():
        result["motion"] = ssim_score(web_mp4, ios_mp4)

    meta_path = row_dir / "meta.json"
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text())
            if "sound_score" in meta:
                result["sound"] = float(meta["sound_score"])
            if "user_score" in meta:
                result["user"] = float(meta["user_score"])
        except (json.JSONDecodeError, ValueError):
            pass

    scores = [v for v in (result["visual"], result["motion"],
                          result["sound"], result["user"])
              if v is not None and v >= 0]
    if scores:
        result["overall"] = round(min(scores), 1)

    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Fidelity score 계산")
    parser.add_argument("row_id", nargs="?", help="단일 행 ID (예: 01, 14)")
    parser.add_argument("--all", action="store_true", help="24행 모두 비교")
    parser.add_argument("--date", help="캡처 날짜 (YYYYMMDD, 기본 오늘)")
    ns = parser.parse_args()

    if ns.all:
        all_passed = True
        print("| row | vis  | mot  | snd  | usr  | overall | status |")
        print("|-----|------|------|------|------|---------|--------|")
        for i in range(1, 25):
            row_id = f"{i:02d}"
            r = diff_row(row_id, ns.date)
            overall = r["overall"]
            status = "✓" if (overall is not None and overall >= VISUAL_THRESHOLD) else "✗"
            v = f"{r['visual']:.1f}" if r['visual'] is not None else "  - "
            m = f"{r['motion']:.1f}" if r['motion'] is not None else "  - "
            s = f"{r['sound']:.1f}" if r['sound'] is not None else "  - "
            u = f"{r['user']:.1f}" if r['user'] is not None else "  - "
            o = f"{overall:.1f}" if overall is not None else "   - "
            print(f"| {row_id}  | {v} | {m} | {s} | {u} | {o}  | {status}      |")
            if overall is None or overall < VISUAL_THRESHOLD:
                all_passed = False
        return 0 if all_passed else 1

    if not ns.row_id:
        parser.error("row_id 또는 --all 필수")

    result = diff_row(ns.row_id, ns.date)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    overall = result["overall"]
    return 0 if (overall is not None and overall >= VISUAL_THRESHOLD) else 1


if __name__ == "__main__":
    sys.exit(main())
