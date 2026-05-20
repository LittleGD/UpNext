#!/usr/bin/env bash
# scripts/fidelity/icon-audit.sh
#
# iOS native 코드에서 SF Symbol 사용을 화이트리스트와 비교.
# R3 (PixelIcon 표준화) 의 머지 게이트. 화이트리스트 외 항목 검출 시 exit 1.
#
# 화이트리스트:
#   - apple.logo (Apple SIWA 가이드 강제)
#
# 사용:
#   ./scripts/fidelity/icon-audit.sh
#
# 출력:
#   stdout: 검출된 호출 사이트 (파일:줄 호출)
#   exit 0 if 모두 화이트리스트만 / exit 1 otherwise

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IOS_DIR="${REPO_ROOT}/upnext-ios/UpNext/UpNext"

# 화이트리스트 — 이 값만 SF Symbol 사용 허용.
ALLOWED=(
    "apple.logo"
)

# 모든 Image(systemName:) 호출 찾기
echo "=== icon audit ==="
echo "scanning: ${IOS_DIR}"

ALL_HITS=$(grep -rnE 'Image\(systemName: *"[^"]+"' "${IOS_DIR}" --include="*.swift" || true)

if [ -z "${ALL_HITS}" ]; then
    echo "✓ no Image(systemName:) usage found"
    exit 0
fi

# 화이트리스트에 없는 항목만 추출
VIOLATIONS=""
while IFS= read -r line; do
    # 라인에서 "name" 추출
    SYMBOL=$(echo "${line}" | sed -nE 's/.*Image\(systemName: *"([^"]+)".*/\1/p')
    if [ -z "${SYMBOL}" ]; then continue; fi

    IS_ALLOWED=0
    for allowed in "${ALLOWED[@]}"; do
        if [ "${SYMBOL}" = "${allowed}" ]; then
            IS_ALLOWED=1
            break
        fi
    done

    if [ "${IS_ALLOWED}" -eq 0 ]; then
        VIOLATIONS="${VIOLATIONS}${line}"$'\n'
    fi
done <<< "${ALL_HITS}"

if [ -z "${VIOLATIONS}" ]; then
    TOTAL=$(echo "${ALL_HITS}" | wc -l | tr -d ' ')
    echo "✓ ${TOTAL} Image(systemName:) calls — all in allowlist"
    exit 0
fi

VIOLATION_COUNT=$(echo "${VIOLATIONS}" | grep -c . || echo 0)
echo "✗ ${VIOLATION_COUNT} SF Symbol violation(s) — should be PixelIcon:"
echo ""
echo "${VIOLATIONS}"
echo ""
echo "Allowlist:"
for allowed in "${ALLOWED[@]}"; do
    echo "  - ${allowed}"
done
echo ""
echo "Fix: replace Image(systemName: \"...\") with PixelIcon(.<name>, size: <pt>, color: <Color>)"
exit 1
