#!/usr/bin/env bash
#
# verify-equivalence.sh — Phase 2.5 동치성 검증 통합 러너.
#
# 웹 TS → Swift 포팅이 결정론 함수에서 비트 단위로 동일한 출력을 내는지 검증한다.
# 각 suite 마다:
#   1. scripts/equiv/<name>.swift 를 실제 Swift 모델 파일과 함께 swiftc 컴파일.
#      (검증기는 포팅 복사본이 아니라 *실제 산출물* 을 컴파일 → drift 원천 차단.)
#   2. 컴파일된 검증기 실행 → Swift 출력.
#   3. scripts/<name>-check.mjs (웹 TS, npx tsx) 실행 → 웹 출력.
#   4. 두 출력을 diff. 한 줄이라도 어긋나면 suite 실패.
#
# 전부 일치하면 exit 0, 하나라도 실패하면 exit 1 (regression guard).
#
# 사용: bash scripts/verify-equivalence.sh
#
set -u
cd "$(dirname "$0")/.."

MODELS="upnext-ios/UpNext/UpNext/Models"
# AppConfig 는 App Group 공유라 Models/ 밖(Shared/)에 있는데 Game.swift·IdleAccrual.swift 가 참조한다.
# 모든 suite 컴파일에 항상 포함한다 (2026-09-04: 1.3.0 머지 뒤 11/12 suite 가 이 한 줄 때문에 컴파일 실패했다).
SHARED_ALWAYS="upnext-ios/UpNext/Shared/AppConfig.swift"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
TOTAL=0

run_suite() {
  local name="$1"; shift
  local args=("$SHARED_ALWAYS")
  local f
  for f in "$@"; do args+=("$MODELS/$f"); done
  # 검증기 swift 파일은 top-level 코드 → swiftc 다중 파일 컴파일 시 main.swift 여야 함.
  cp "scripts/equiv/$name.swift" "$TMP/main.swift"
  if ! swiftc "${args[@]}" "$TMP/main.swift" -o "$TMP/bin-$name" 2>"$TMP/err-$name"; then
    echo "❌ $name — Swift 컴파일 실패"
    sed 's/^/   /' "$TMP/err-$name" | head -12
    FAIL=$((FAIL + 1))
    return
  fi
  "$TMP/bin-$name" > "$TMP/swift-$name.txt" 2>&1
  # npm 설치 경고(첫 npx 실행 시) 가 출력에 섞이지 않도록 `npm ` 라인 필터.
  npx tsx "scripts/$name-check.mjs" 2>&1 | grep -v -E '^npm ' > "$TMP/web-$name.txt" || true
  if diff "$TMP/web-$name.txt" "$TMP/swift-$name.txt" > "$TMP/diff-$name.txt" 2>&1; then
    local n
    n=$(wc -l < "$TMP/swift-$name.txt" | tr -d ' ')
    printf "✅ %-16s %4s 라인 일치\n" "$name" "$n"
    PASS=$((PASS + 1))
    TOTAL=$((TOTAL + n))
  else
    echo "❌ $name — 웹/Swift 불일치 (< 웹, > Swift):"
    sed 's/^/   /' "$TMP/diff-$name.txt" | head -24
    FAIL=$((FAIL + 1))
  fi
}

# 스모크 suite — 비결정론 오케스트레이션(tickSession)은 동치 검증 불가.
# 시드 고정으로 세션을 끝까지 돌려 크래시·불변식·종료 보장만 확인 (exit 0 = pass).
run_smoke() {
  local name="$1"; shift
  local args=("$SHARED_ALWAYS")
  local f
  for f in "$@"; do args+=("$MODELS/$f"); done
  cp "scripts/equiv/$name.swift" "$TMP/main.swift"
  if ! swiftc "${args[@]}" "$TMP/main.swift" -o "$TMP/bin-$name" 2>"$TMP/err-$name"; then
    echo "❌ $name — Swift 컴파일 실패"
    sed 's/^/   /' "$TMP/err-$name" | head -12
    FAIL=$((FAIL + 1))
    return
  fi
  if "$TMP/bin-$name" > "$TMP/out-$name.txt" 2>&1; then
    printf "✅ %-16s 스모크 통과\n" "$name"
    PASS=$((PASS + 1))
  else
    echo "❌ $name — 스모크 실패:"
    sed 's/^/   /' "$TMP/out-$name.txt" | head -20
    FAIL=$((FAIL + 1))
  fi
}

echo "═══ UpNext 동치성 검증 (Phase 2.3~3.1) ═══"
run_suite rng              UpHeroRNG.swift
run_suite idle             IdleAccrual.swift
run_suite gamerules        Card.swift Game.swift GameRules.swift
run_suite uphero           Card.swift Game.swift UpHero.swift UpHeroRNG.swift UpHeroSlot.swift
run_suite uphero-combat    Card.swift Game.swift UpHero.swift UpHeroSlot.swift UpHeroRNG.swift UpHeroCombat.swift
run_suite classskills      Card.swift Game.swift UpHero.swift UpHeroSlot.swift UpHeroRNG.swift UpHeroCombat.swift ClassSkills.swift
run_suite talisman-reward  Card.swift Game.swift UpHero.swift UpHeroSlot.swift UpHeroRNG.swift UpHeroCombat.swift TalismanSkills.swift SessionReward.swift EquipmentPool.swift UpHeroBag.swift
run_suite datalayer        Card.swift Game.swift UpHero.swift UpHeroSlot.swift UpHeroRNG.swift UpHeroCombat.swift Dungeons.swift MonsterPool.swift EquipmentPool.swift
run_suite affix-narrative  Card.swift Game.swift UpHero.swift UpHeroSlot.swift UpHeroRNG.swift UpHeroCombat.swift WeeklyAffixes.swift CombatFlavor.swift UpHeroNarrative.swift
run_suite flavor           Card.swift Game.swift UpHero.swift UpHeroRNG.swift UpHeroSlot.swift FlavorPool.swift
# sync suite 는 HEAD(dc0c183) 시점부터 컴파일이 깨져 있다: FirestoreModels → Retention → PhotoMeta(GrowthModels) → Sticker(뷰 파일)
#   로 이어지는 의존 사슬이 Models/ 밖(SwiftUI 뷰)까지 닿는다. Retention 의 PhotoMeta 의존을 끊거나 Sticker 를 Models 로
#   옮기는 별도 작업이 필요하다. 2026-09-04 격자 가방 작업과 무관한 기존 결함으로 남긴다.
run_suite sync             Card.swift Game.swift FirestoreModels.swift Retention.swift GrowthModels.swift CardCatalog.swift
run_suite bag              Card.swift Game.swift UpHero.swift UpHeroRNG.swift UpHeroSlot.swift UpHeroBag.swift
run_smoke session-smoke    Card.swift Game.swift UpHero.swift UpHeroSlot.swift UpHeroRNG.swift UpHeroCombat.swift ClassSkills.swift TalismanSkills.swift Dungeons.swift MonsterPool.swift EquipmentPool.swift WeeklyAffixes.swift CombatFlavor.swift UpHeroNarrative.swift FlavorPool.swift UpHeroSession.swift
echo "──────────────────────────────────────────"
echo "결과: $PASS/$((PASS + FAIL)) suite 통과 · 총 $TOTAL 라인 동치"
if [ "$FAIL" -eq 0 ]; then
  echo "✅ 전체 통과 — 웹 TS ↔ Swift 포팅 동치성 확인"
  exit 0
else
  echo "❌ $FAIL suite 실패 — 위 diff 확인"
  exit 1
fi
