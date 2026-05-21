#!/usr/bin/env bash
# scripts/fidelity/icon-audit.sh
#
# iOS native 코드에서 SF Symbol 사용을 화이트리스트와 비교.
# R3 (PixelIcon 표준화) 의 머지 게이트. 화이트리스트 외 항목 검출 시 exit 1.
#
# 검출 대상 (3 형태 — R3 마감 시 강화):
#   1. Image(systemName: "리터럴")   — 화이트리스트(apple.logo) 검증
#   2. Image(systemName: 변수)        — 동적 SF 이름은 화이트리스트 검증 불가 → 위반
#   3. Label(..., systemImage: ...)   — Label 의 SF Symbol → 위반 (PixelIcon+Text 로 교체)
#
# 화이트리스트:
#   - apple.logo (Apple SIWA 가이드 강제 — 커스텀 글리프 불가)
#
# 사용: ./scripts/fidelity/icon-audit.sh
# 출력: stdout 위반 사이트 / exit 0 if clean / exit 1 otherwise

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IOS_DIR="${REPO_ROOT}/upnext-ios/UpNext/UpNext"

# 화이트리스트 — 이 값만 SF Symbol 리터럴 사용 허용.
ALLOWED=(
    "apple.logo"
)

echo "=== icon audit ==="
echo "scanning: ${IOS_DIR}"

VIOLATIONS=""
LITERAL_OK=0

# ── 1+2. Image(systemName:) 전체 (리터럴 + 변수) ──
IMG_HITS=$(grep -rnE 'Image\(systemName:' "${IOS_DIR}" --include="*.swift" || true)
if [ -n "${IMG_HITS}" ]; then
    while IFS= read -r line; do
        [ -z "${line}" ] && continue
        # 리터럴이면 "name" 추출, 아니면 빈 문자열.
        SYMBOL=$(echo "${line}" | sed -nE 's/.*Image\(systemName: *"([^"]+)".*/\1/p')
        if [ -n "${SYMBOL}" ]; then
            # 리터럴 — 화이트리스트 검증
            IS_ALLOWED=0
            for allowed in "${ALLOWED[@]}"; do
                [ "${SYMBOL}" = "${allowed}" ] && IS_ALLOWED=1 && break
            done
            if [ "${IS_ALLOWED}" -eq 1 ]; then
                LITERAL_OK=$((LITERAL_OK + 1))
            else
                VIOLATIONS="${VIOLATIONS}${line}"$'\n'
            fi
        else
            # 변수형 Image(systemName: x) — 동적이라 검증 불가 → 위반
            VIOLATIONS="${VIOLATIONS}${line}"$'\n'
        fi
    done <<< "${IMG_HITS}"
fi

# ── 3. Label(..., systemImage:) ──
LABEL_HITS=$(grep -rnE 'systemImage:' "${IOS_DIR}" --include="*.swift" || true)
if [ -n "${LABEL_HITS}" ]; then
    while IFS= read -r line; do
        [ -z "${line}" ] && continue
        VIOLATIONS="${VIOLATIONS}${line}"$'\n'
    done <<< "${LABEL_HITS}"
fi

if [ -z "${VIOLATIONS}" ]; then
    echo "✓ clean — ${LITERAL_OK} allowlisted SF literal(s) (apple.logo), 0 variable, 0 Label(systemImage:)"
    exit 0
fi

VIOLATION_COUNT=$(echo "${VIOLATIONS}" | grep -c . || echo 0)
echo "✗ ${VIOLATION_COUNT} SF Symbol violation(s) — should be PixelIcon:"
echo ""
echo "${VIOLATIONS}"
echo "Allowlist (literal only):"
for allowed in "${ALLOWED[@]}"; do
    echo "  - ${allowed}"
done
echo ""
echo "Fix:"
echo "  Image(systemName: \"x\")  → PixelIcon(.<name>, size: <pt>, color: <Color>)"
echo "  Image(systemName: var)   → 변수에 PixelIconName 매핑 후 PixelIcon(var, ...)"
echo "  Label(t, systemImage: x) → HStack { PixelIcon(.<name>, ...); Text(t) }"
exit 1
