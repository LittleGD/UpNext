#!/usr/bin/env bash
# scripts/fidelity/snapshot-pair.sh
#
# 동일 시드로 web (Playwright) + iOS native (xcrun simctl) 동시 캡처.
# fidelity-grid.md 의 한 행에 대한 baseline 또는 diff 비교용 자료를 만든다.
#
# 사용:
#   ./scripts/fidelity/snapshot-pair.sh <row_id> [<seed_args>]
#
# 출력:
#   docs/fidelity/<YYYYMMDD>/<row_id>/
#     ├── web.png        # Playwright screenshot
#     ├── web.mp4        # Playwright video (모션 행만)
#     ├── ios.png        # xcrun simctl screenshot
#     ├── ios.mp4        # xcrun simctl recordVideo (모션 행만)
#     └── meta.json      # 시드/타임스탬프/디바이스 정보
#
# 의존:
#   - Playwright (chromium)
#   - Xcode + iOS 17 시뮬레이터
#   - jq (meta.json)
#
# 결정성:
#   - UITestNow=2026-05-20 환경변수 (iOS) — AppClock.todayString 고정
#   - Playwright --mock-date=2026-05-20 — Date.now 고정
#   - 시뮬레이터 시계 freeze 시도 (xcrun simctl status_bar override)

set -euo pipefail

ROW_ID="${1:?usage: snapshot-pair.sh <row_id> [seed_args]}"
shift || true
SEED_ARGS="$*"

DATE=$(date +%Y%m%d)
OUT_DIR="docs/fidelity/${DATE}/${ROW_ID}"
mkdir -p "${OUT_DIR}"

WEB_URL="${UPNEXT_WEB_URL:-http://localhost:3000}"
SIM_DEVICE="${UPNEXT_SIM_DEVICE:-iPhone 17}"
MOCK_DATE="${UPNEXT_MOCK_DATE:-2026-05-20T09:00:00.000Z}"
SEED_KEY="${UPNEXT_SEED_KEY:-fidelity-baseline-001}"

echo "[snapshot-pair] row=${ROW_ID} out=${OUT_DIR}"

# ── 1) Playwright web 캡처 ──
# row_id 별 시나리오는 별도 정의 (scripts/fidelity/scenes/<row_id>.spec.ts)
# 여기선 기본 home 스크린샷만 폴백.
SCENE_SPEC="scripts/fidelity/scenes/${ROW_ID}.spec.ts"
if [ -f "${SCENE_SPEC}" ]; then
    echo "[web] running scene: ${SCENE_SPEC}"
    npx playwright test "${SCENE_SPEC}" \
        --config=scripts/fidelity/playwright.config.ts \
        --output="${OUT_DIR}" \
        || echo "[web] WARN: Playwright scene failed (continuing)"
else
    echo "[web] no scene spec — fallback to URL screenshot"
    npx playwright screenshot \
        --browser=chromium \
        --device="iPhone 14" \
        --full-page \
        "${WEB_URL}" \
        "${OUT_DIR}/web.png" \
        || echo "[web] WARN: Playwright not installed or web not running"
fi

# ── 2) iOS 시뮬레이터 캡처 ──
# 시뮬레이터가 부팅돼 있고 UpNext가 설치돼 있다고 가정.
SIM_BOOTED=$(xcrun simctl list devices booted 2>/dev/null | grep -c "${SIM_DEVICE}" || echo 0)
if [ "${SIM_BOOTED}" -eq 0 ]; then
    echo "[ios] WARN: simulator '${SIM_DEVICE}' not booted. Run:"
    echo "  xcrun simctl boot \"${SIM_DEVICE}\""
    echo "  xcrun simctl install booted /tmp/upnext-build/Build/Products/Debug-iphonesimulator/UpNext.app"
    exit 1
fi

# 시계 고정 + 캡처
xcrun simctl status_bar booted override --time "9:00" --batteryLevel 100 --wifiBars 3 || true

# launch arg 로 시드 전달 (UpNextApp 의 applyUITestSeedIfNeeded 가 해석)
SIM_LAUNCH_ARGS="UITestBypassAuth UITestNow=${MOCK_DATE:0:10}"
if [ -n "${SEED_ARGS}" ]; then
    SIM_LAUNCH_ARGS="${SIM_LAUNCH_ARGS} ${SEED_ARGS}"
fi
echo "[ios] launching com.littlegd.upnext with: ${SIM_LAUNCH_ARGS}"
xcrun simctl launch booted com.littlegd.upnext ${SIM_LAUNCH_ARGS} > /dev/null

sleep 4  # 스플래시 + 시드 적용 대기

echo "[ios] screenshot"
xcrun simctl io booted screenshot "${OUT_DIR}/ios.png"

# ── 3) 메타 ──
cat > "${OUT_DIR}/meta.json" <<EOF
{
  "row_id": "${ROW_ID}",
  "date": "${DATE}",
  "captured_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "web_url": "${WEB_URL}",
  "sim_device": "${SIM_DEVICE}",
  "mock_date": "${MOCK_DATE}",
  "seed_key": "${SEED_KEY}",
  "seed_args": "${SEED_ARGS}",
  "ios_launch_args": "${SIM_LAUNCH_ARGS}"
}
EOF

echo "[snapshot-pair] done → ${OUT_DIR}"
