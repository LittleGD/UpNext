"use client";

/**
 * Up Hero — Phase 11c: Dev 테스트 패널 (production 제외).
 *
 * 리더보드 / NG+ / 주간 변이 동작을 실제 F30 클리어 없이 빠르게 검증하기 위한
 * 개발자 전용 도구. Settings 페이지 맨 아래에 `NODE_ENV === "development"` 일 때만 렌더.
 *
 * 기능:
 *   1. F30 강제 해금 — 모든 던전 bossesDefeated=[10,20,30] 주입
 *   2. NG+ 레벨 강제 설정 (0~5)
 *   3. 주간 최고 점수 리셋 (local)
 *   4. 주간 점수 수동 업로드 — 임의 score 로 Firestore 리더보드 entry 생성
 *   5. 가짜 리더보드 데이터 seed — 10 명의 bot entry 일괄 푸시 (본인 Firestore 권한
 *      필요해서 실제로는 current uid 로만 upload 됨. 멀티계정 테스트는 별도.)
 *   6. 주간 affix 재롤 (local) — week 동일하되 affixId 재선택
 *
 * 주의: 이 컴포넌트는 dev 환경에서만 번들링. Tree shaking 되어 production 영향 없음.
 */

import { useState } from "react";
import { useUpHeroStore } from "@/store/useUpHeroStore";
import { useAuthStore } from "@/store/useAuthStore";
import { DUNGEON_LIST } from "@/data/upHeroDungeons";
import { getISOWeekId } from "@/types/uphero";
import { pickWeeklyAffix, WEEKLY_AFFIX_POOL } from "@/data/weeklyAffixes";
import {
  uploadWeeklyScore,
  fetchWeeklyTop,
  type WeeklyLeaderboardEntry,
} from "@/lib/weeklyLeaderboard";
import { isFirebaseConfigured } from "@/lib/firebase";

export default function DevLeaderboardPanel() {
  const user = useAuthStore((s) => s.user);
  const weeklyVariant = useUpHeroStore((s) => s.weeklyVariant);
  const ngPlusLevel = useUpHeroStore((s) => s.ngPlusLevel ?? 0);
  const dungeons = useUpHeroStore((s) => s.dungeons);

  const [log, setLog] = useState<string[]>([]);
  const [scoreInput, setScoreInput] = useState("5000");

  const appendLog = (msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setLog((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 20));
  };

  const f30Count = Object.values(dungeons).filter((d) =>
    d?.bossesDefeated?.includes(30),
  ).length;

  /** 1. F30 강제 해금 — 모든 던전 bossesDefeated 에 [10,20,30] 주입 */
  const forceClearF30 = () => {
    const newDungeons: typeof dungeons = {};
    for (const d of DUNGEON_LIST) {
      const existing = dungeons[d.id];
      newDungeons[d.id] = {
        dungeonId: d.id,
        floorReached: Math.max(existing?.floorReached ?? 0, 30),
        bossesDefeated: [10, 20, 30],
      };
    }
    useUpHeroStore.setState({ dungeons: newDungeons });
    // persist
    const state = useUpHeroStore.getState();
    localStorage.setItem(
      "uphero",
      JSON.stringify({
        hero: state.hero,
        inventory: state.inventory,
        coins: state.coins,
        passes: state.passes,
        dungeons: newDungeons,
        currentSession: state.currentSession,
        codex: state.codex,
        cosmetics: state.cosmetics,
        lastIdleAccrualAt: state.lastIdleAccrualAt,
        heroStartLevel: state.heroStartLevel,
        shopDaily: state.shopDaily,
        ngPlusLevel: state.ngPlusLevel,
        weeklyVariant: state.weeklyVariant,
        schemaVersion: 5,
      }),
    );
    appendLog("✓ 모든 던전 F30 해금 (보스 10/20/30 기록)");
  };

  /** 2. NG+ 레벨 강제 설정 */
  const setNgPlus = (n: number) => {
    useUpHeroStore.setState({ ngPlusLevel: n });
    const state = useUpHeroStore.getState();
    localStorage.setItem(
      "uphero",
      JSON.stringify({
        hero: state.hero,
        inventory: state.inventory,
        coins: state.coins,
        passes: state.passes,
        dungeons: state.dungeons,
        currentSession: state.currentSession,
        codex: state.codex,
        cosmetics: state.cosmetics,
        lastIdleAccrualAt: state.lastIdleAccrualAt,
        heroStartLevel: state.heroStartLevel,
        shopDaily: state.shopDaily,
        ngPlusLevel: n,
        weeklyVariant: state.weeklyVariant,
        schemaVersion: 5,
      }),
    );
    appendLog(`✓ NG+ 레벨 ${n} 로 설정`);
  };

  /** 3. 주간 best score 리셋 (local) */
  const resetWeeklyBest = () => {
    if (!weeklyVariant) {
      appendLog("✗ weeklyVariant 없음");
      return;
    }
    useUpHeroStore.setState({
      weeklyVariant: { ...weeklyVariant, bestScore: 0, clearedDungeons: [] },
    });
    appendLog("✓ 주간 best score / clearedDungeons 리셋");
  };

  /** 4. 주간 점수 수동 업로드 */
  const manualUpload = async () => {
    if (!weeklyVariant) {
      appendLog("✗ weeklyVariant 없음");
      return;
    }
    if (!user) {
      appendLog("✗ 로그인 안 됨 — Firebase upload skip");
      return;
    }
    const score = parseInt(scoreInput, 10);
    if (isNaN(score) || score < 0) {
      appendLog("✗ 유효하지 않은 점수");
      return;
    }
    appendLog(`→ 업로드 시도: score=${score}`);
    const result = await uploadWeeklyScore(weeklyVariant.week, {
      displayName: user.displayName ?? "Dev Tester",
      score,
      floorsCleared: 30,
      heroLevel: 10,
      classType: null,
      clearedAt: Date.now(),
    });
    appendLog(`→ 결과: ${result}`);
    // local bestScore 도 갱신
    if (result === "ok" && score > weeklyVariant.bestScore) {
      useUpHeroStore.setState({
        weeklyVariant: { ...weeklyVariant, bestScore: score },
      });
      appendLog("✓ local bestScore 갱신");
    }
  };

  /** 5. 리더보드 top 10 조회 */
  const checkLeaderboard = async () => {
    if (!weeklyVariant) {
      appendLog("✗ weeklyVariant 없음");
      return;
    }
    appendLog(`→ 리더보드 조회: ${weeklyVariant.week}`);
    const top = await fetchWeeklyTop(weeklyVariant.week, 10);
    if (top.length === 0) {
      appendLog("→ 결과: 비어있음 (아직 entry 없음)");
    } else {
      top.forEach((e: WeeklyLeaderboardEntry, i) => {
        appendLog(`  #${i + 1} ${e.displayName}: ${e.score} (F${e.floorsCleared})`);
      });
    }
  };

  /** 6. 주간 affix 재롤 (local week 는 유지하되 affix 만 변경) */
  const rerollAffix = () => {
    if (!weeklyVariant) return;
    // 현재와 다른 affix 중 랜덤
    const others = WEEKLY_AFFIX_POOL.filter((a) => a.id !== weeklyVariant.affixId);
    const pick = others[Math.floor(Math.random() * others.length)];
    useUpHeroStore.setState({
      weeklyVariant: { ...weeklyVariant, affixId: pick.id },
    });
    appendLog(`✓ affix → "${pick.name}" (${pick.id})`);
  };

  /** 7. 주간 week 강제 증가 (리셋 테스트) */
  const nextWeek = () => {
    if (!weeklyVariant) return;
    // week string 은 YYYY-WNN 형식. 단순히 NN+1 (overflow 안전성 낮지만 테스트용).
    const match = weeklyVariant.week.match(/^(\d{4})-W(\d{2})$/);
    if (!match) {
      appendLog("✗ week 포맷 파싱 실패");
      return;
    }
    const year = parseInt(match[1], 10);
    const wk = parseInt(match[2], 10);
    const newWeekId =
      wk >= 52
        ? `${year + 1}-W01`
        : `${year}-W${String(wk + 1).padStart(2, "0")}`;
    const newAffix = pickWeeklyAffix(newWeekId);
    useUpHeroStore.setState({
      weeklyVariant: {
        week: newWeekId,
        affixId: newAffix.id,
        clearedDungeons: [],
        bestScore: 0,
      },
    });
    appendLog(`✓ week → ${newWeekId}, affix → "${newAffix.name}"`);
  };

  return (
    <section className="max-w-lg mx-auto px-4 py-4 mt-6">
      <div
        className="rounded-lg p-4"
        style={{
          background: "#FFF8E133",
          border: "1px dashed #FFE066",
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span style={{ fontSize: 16 }}>🛠</span>
          <h3 className="typo-body" style={{ color: "#FFE066", fontWeight: 600 }}>
            Dev: 리더보드 / NG+ 테스트
          </h3>
        </div>

        {/* 현재 상태 */}
        <div
          className="typo-caption mb-3 p-2 rounded tabular-nums"
          style={{ background: "rgba(0,0,0,0.3)", color: "#ccc" }}
        >
          <div>
            Firebase: {isFirebaseConfigured ? "✓ 구성됨" : "✗ 미구성"}
            {" · "}
            로그인: {user ? `✓ ${user.displayName ?? user.uid}` : "✗ 익명"}
          </div>
          <div>
            NG+: {ngPlusLevel} · F30 던전: {f30Count}/8
          </div>
          {weeklyVariant ? (
            <div>
              Week: {weeklyVariant.week} · affix: {weeklyVariant.affixId}
              {" · "}best: {weeklyVariant.bestScore}
            </div>
          ) : (
            <div>weeklyVariant: 없음</div>
          )}
        </div>

        {/* 버튼 그룹 */}
        <div className="flex flex-col gap-1.5">
          <DevBtn label="1. F30 강제 해금 (모든 던전)" onClick={forceClearF30} />
          <div className="flex items-center gap-1.5">
            <span className="typo-caption flex-1" style={{ color: "#FFE066" }}>
              2. NG+ 레벨:
            </span>
            {[0, 1, 2, 3, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNgPlus(n)}
                className="typo-caption tabular-nums rounded px-2.5 py-1"
                style={{
                  background: ngPlusLevel === n ? "#FFE066" : "rgba(0,0,0,0.3)",
                  color: ngPlusLevel === n ? "#333" : "#FFE066",
                  border: "1px solid #FFE066",
                  minHeight: 32,
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <DevBtn label="3. 주간 best / cleared 리셋 (local)" onClick={resetWeeklyBest} />
          <DevBtn label="4. 주간 affix 재롤 (local)" onClick={rerollAffix} />
          <DevBtn label="5. 다음 주로 점프 (리셋 테스트)" onClick={nextWeek} />
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={scoreInput}
              onChange={(e) => setScoreInput(e.target.value)}
              placeholder="score"
              className="typo-caption tabular-nums rounded px-2 py-1 flex-1"
              style={{
                background: "rgba(0,0,0,0.3)",
                color: "#FFE066",
                border: "1px solid #FFE066",
                minHeight: 32,
              }}
            />
            <DevBtn label="6. 점수 업로드" onClick={manualUpload} inline />
          </div>
          <DevBtn label="7. 리더보드 top 10 조회" onClick={checkLeaderboard} />
        </div>

        {/* 로그 */}
        {log.length > 0 && (
          <div
            className="mt-3 p-2 rounded typo-caption font-mono"
            style={{
              background: "#000",
              color: "#0f0",
              fontSize: 11,
              maxHeight: 200,
              overflowY: "auto",
              lineHeight: 1.5,
            }}
          >
            {log.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function DevBtn({
  label,
  onClick,
  inline = false,
}: {
  label: string;
  onClick: () => void;
  inline?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`typo-caption rounded text-left ${inline ? "" : "w-full"}`}
      style={{
        background: "rgba(0,0,0,0.3)",
        color: "#FFE066",
        border: "1px solid #FFE066",
        padding: "8px 12px",
        minHeight: 36,
      }}
    >
      {label}
    </button>
  );
}
