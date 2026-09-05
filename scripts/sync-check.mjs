// sync-check.mjs — Phase 3.1 Firestore 스키마 동치성 검증 (웹 측).
//
// 웹 sync.ts 의 hydrateDaily / dehydrateDaily / isValidProgress (검증기 복사본이
// 아니라 *실제 산출물*) 로 픽스처 문서를 처리한 구조적 사실을 찍는다. Swift
// FirestoreModels 디코더가 같은 픽스처에서 같은 사실을 찍으면 — 기존 웹 유저의
// Firestore 문서가 native 에서 동일하게 읽힌다는 보장 (웹 sunset 안전망).
//
// 실행: cd /Users/jmlee/Documents/UpNext && npx tsx scripts/sync-check.mjs

import { readFileSync } from "node:fs";
import { hydrateDaily, dehydrateDaily, isValidProgress } from "../src/lib/sync.ts";
import { normalizeRetentionState } from "../src/lib/retention.ts";

const fx = JSON.parse(readFileSync("scripts/equiv/user-doc.json", "utf8"));
const lines = [];

// 키 정렬 후 "k:v" 나열 — JS Object.keys().sort() ↔ Swift dict.sorted{$0.key<$1.key}.
const sortedKV = (obj) =>
  Object.keys(obj).sort().map((k) => `${k}:${obj[k]}`).join(" ");

function dumpDaily(tag, st) {
  const ids = (cards) => cards.map((c) => c.id).join(",");
  lines.push(`${tag}.daily date=${st.date} phase=${st.challengePhase} reroll=${st.rerollUsed} nudge=${st.extraNudgeScheduled} penalty=${st.penaltyCardId ?? "nil"}`);
  lines.push(`${tag}.daily drawn=${ids(st.drawnCards)} selected=${ids(st.selectedCards)} completed=${st.completedIds.join(",")}`);
  lines.push(`${tag}.daily flags draw=${st.isDrawComplete} sel=${st.isSelectionComplete}`);
  lines.push(`${tag}.daily extra drawn=${ids(st.extraDrawnCards)} sel=${ids(st.extraSelectedCards)} done=${st.extraCompletedIds.join(",")} dc=${st.extraDrawComplete} sc=${st.extraSelectionComplete}`);
  lines.push(`${tag}.daily super drawn=${ids(st.superDrawnCards)} sel=${ids(st.superSelectedCards)} done=${st.superCompletedIds.join(",")} dc=${st.superDrawComplete} sc=${st.superSelectionComplete}`);
  lines.push(`${tag}.daily hasPenalty=${st.hasPenalty}`);
}

function dumpRedehydrate(tag, d) {
  lines.push(`${tag}.redehydrate drawnIds=${d.drawnCardIds.join(",")} phase=${d.challengePhase} penalty=${d.penaltyCardId ?? "nil"} nudge=${d.extraNudgeScheduled}`);
}

function dumpProgress(tag, p) {
  lines.push(`${tag}.progress lvl=${p.level} xp=${p.xp} days=${p.totalDaysCompleted} streak=${p.currentStreak}/${p.longestStreak} unlocked=${p.unlockedCardIds.length} mode=${p.mode} lang=${p.language}`);
  lines.push(`${tag}.progress dtnl=${p.daysTowardNextLevel} packs=${p.pendingPacks} bonus=${p.pendingBonusCards} full=${p.pendingFullPacks ?? 0} extraC=${p.extraChallengesCompleted} superC=${p.superChallengesCompleted}`);
  lines.push(`${tag}.progress titleEq=${p.equippedTitleId ?? "nil"} titlesSeen=${p.seenTitleIds.length} pendPenalty=${p.hasPendingPenalty} pendMode=${p.pendingMode ?? "nil"}`);
  lines.push(`${tag}.progress sound=${p.soundEnabled} haptic=${p.hapticEnabled} notif=${p.notificationsEnabled} notifTime=${p.notificationTime}`);
  lines.push(`${tag}.progress tickets=${p.tickets} mgRuns=${p.minigameRunsPlayed} mgBest=${p.minigameBestMatches}`);
  const shop = p.cardmatchShopDaily ? `${p.cardmatchShopDaily.date}:${p.cardmatchShopDaily.bought}` : "nil";
  lines.push(`${tag}.progress shop=${shop} patch=${p.lastSeenPatchVersion ?? "nil"} collDone=${p.collectionCompletedAt ?? "nil"}`);
  lines.push(`${tag}.progress cats=${sortedKV(p.categoryCompletions)}`);
  lines.push(`${tag}.progress cardC=${sortedKV(p.cardCompletions)}`);
  lines.push(`${tag}.progress history=${p.completionHistory.length}`);
  p.completionHistory.forEach((r, i) => {
    lines.push(`${tag}.progress hist${i}=${r.date} mode=${r.mode} clear=${r.wasFullClear} extra=${r.extraCompleted ?? "nil"} super=${r.superCompleted ?? "nil"} fail=${r.wasFailed ?? "nil"}`);
  });
}

// 웹 sync.ts onSnapshot 과 같은 식: 필드 부재/null 은 null(로컬 유지 신호), 있으면 관용 디코드.
const retentionOf = (d) => (d.retention == null ? null : normalizeRetentionState(d.retention));

function dumpRetention(tag, r) {
  if (r === null) { lines.push(`${tag}.retention nil`); return; }
  lines.push(`${tag}.retention streak=${r.currentLightStreak}/${r.bestLightStreak} last=${r.lastCheckInDate ?? "nil"} savers=${r.streakSavers} month=${r.saverRefreshMonth} checkIns=${r.checkInDates.join(",")} usedSavers=${r.usedSaverDates.join(",")} reports=${r.weeklyReports.length}`);
  r.weeklyReports.forEach((w, i) => {
    lines.push(`${tag}.retention report${i}=${w.weekStart}..${w.weekEnd} gen=${w.generatedAt} checkIns=${w.checkInCount} cards=${w.completedCardCount} top=${w.topCategory ?? "nil"} hl=${w.highlightCardTitle ?? "nil"} photos=${w.photoLogCount} saver=${w.usedSaver}`);
  });
}

// full — 완전한 문서 (모든 필드 + __ghost__ 미존재 ID 탈락)
{
  const d = fx.full;
  lines.push(`full valid=${isValidProgress(d.progress)} onboarding=${d.onboardingComplete} device=${d.meta.lastDeviceId}`);
  const st = hydrateDaily(d.daily);
  dumpDaily("full", st);
  dumpRedehydrate("full", dehydrateDaily(st));
  dumpProgress("full", d.progress);
  dumpRetention("full", retentionOf(d));
}

// legacy — 옛 버전 최소 문서 (hydrateDaily 기본값 경로)
{
  const d = fx.legacy;
  lines.push(`legacy valid=${isValidProgress(d.progress)}`);
  const st = hydrateDaily(d.daily);
  dumpDaily("legacy", st);
  dumpRedehydrate("legacy", dehydrateDaily(st));
  dumpRetention("legacy", retentionOf(d));
}

// retentionPartial — retention 만 있는 부분 문서 (누락 필드 기본값, 깨진 weeklyReports 원소 → 배열 전체 탈락)
{
  dumpRetention("partial", retentionOf(fx.retentionPartial));
}

// corrupt — unlockedCardIds 에 비-문자열 혼입 → isValidProgress 거부
{
  const d = fx.corrupt;
  lines.push(`corrupt valid=${isValidProgress(d.progress)}`);
}

console.log(lines.join("\n"));
