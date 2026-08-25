import { describe, it, expect } from "vitest";
import type { UserProgress } from "@/types/game";
import type { RetentionState, WeeklyReportSummary } from "@/types/retention";
import {
  MAX_MONTHLY_SAVERS,
  MAX_STORED_CHECK_INS,
  MAX_WEEKLY_REPORTS,
  freshRetentionState,
  normalizeRetentionState,
  retentionCheckIn,
  refreshMonthlySavers,
  generatePreviousWeekReport,
  addDays,
  dayGap,
  monthKey,
  weekStartOf,
  stripUndefined,
} from "./retention";
import { ALL_CARDS } from "@/data/cards";

/**
 * iOS RetentionEngineTests.swift 의 7케이스를 날짜/기대값 그대로 포팅.
 * 추가: 420 캡 / 12 캡 / 관용 디코드 / 월경계 / 날짜 헬퍼 / stripUndefined.
 * 크로스 플랫폼 스트릭 일관성의 회귀 방어선이므로 기대값을 임의로 바꾸지 말 것.
 */

// game.test.ts 의 makeProgress 패턴 재사용
function makeProgress(partial: Partial<UserProgress>): UserProgress {
  return {
    currentStreak: 0,
    longestStreak: 0,
    totalDaysCompleted: 0,
    unlockedCardIds: [],
    completionHistory: [],
    categoryCompletions: {
      fitness: 0,
      nutrition: 0,
      mindfulness: 0,
      learning: 0,
      social: 0,
      productivity: 0,
      wellness: 0,
      trending: 0,
    },
    mode: "normal",
    level: 0,
    xp: 0,
    daysTowardNextLevel: 0,
    pendingPacks: 0,
    pendingBonusCards: 0,
    cardCompletions: {},
    extraChallengesCompleted: 0,
    superChallengesCompleted: 0,
    equippedTitleId: null,
    seenTitleIds: [],
    hasPendingPenalty: false,
    language: "ko",
    soundEnabled: true,
    hapticEnabled: true,
    notificationsEnabled: false,
    notificationTime: "09:00",
    tickets: 0,
    minigameRunsPlayed: 0,
    minigameBestMatches: 0,
    ...partial,
  };
}

describe("RetentionEngine (iOS RetentionEngineTests 포팅)", () => {
  it("같은 날 재체크인은 no-op", () => {
    const first = retentionCheckIn(freshRetentionState("2026-05-19"), "2026-05-19");
    const second = retentionCheckIn(first.state, "2026-05-19");

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.state.currentLightStreak).toBe(1);
    expect(second.state.checkInDates).toEqual(["2026-05-19"]);
  });

  it("연속일 체크인은 스트릭 +1", () => {
    const dayOne = retentionCheckIn(freshRetentionState("2026-05-19"), "2026-05-19");
    const dayTwo = retentionCheckIn(dayOne.state, "2026-05-20");

    expect(dayTwo.state.currentLightStreak).toBe(2);
    expect(dayTwo.state.bestLightStreak).toBe(2);
    expect(dayTwo.usedSaver).toBe(false);
  });

  it("하루 결석은 방패를 소비해 이어진다", () => {
    const dayOne = retentionCheckIn(freshRetentionState("2026-05-19"), "2026-05-19");
    const repaired = retentionCheckIn(dayOne.state, "2026-05-21");

    expect(repaired.usedSaver).toBe(true);
    expect(repaired.state.currentLightStreak).toBe(2);
    expect(repaired.state.streakSavers).toBe(MAX_MONTHLY_SAVERS - 1);
    expect(repaired.state.usedSaverDates).toEqual(["2026-05-20"]);
  });

  it("긴 공백은 스트릭 리셋", () => {
    const dayOne = retentionCheckIn(freshRetentionState("2026-05-19"), "2026-05-19");
    const reset = retentionCheckIn(dayOne.state, "2026-05-24");

    expect(reset.usedSaver).toBe(false);
    expect(reset.state.currentLightStreak).toBe(1);
    expect(reset.state.bestLightStreak).toBe(1);
  });

  it("월이 바뀌면 방패 리필", () => {
    const state: RetentionState = { ...freshRetentionState("2026-04-30"), streakSavers: 0 };

    const refreshed = refreshMonthlySavers(state, "2026-05-01");

    expect(refreshed.streakSavers).toBe(MAX_MONTHLY_SAVERS);
    expect(refreshed.saverRefreshMonth).toBe("2026-05");
  });

  it("주간 리포트 요약 생성", () => {
    const card = ALL_CARDS[0];
    const progress = makeProgress({
      completionHistory: [
        {
          date: "2026-05-05",
          selectedCardIds: [card.id],
          completedCardIds: [card.id],
          wasFullClear: true,
          mode: "normal",
        },
      ],
    });
    const retention: RetentionState = {
      ...freshRetentionState("2026-05-11"),
      checkInDates: ["2026-05-04", "2026-05-05", "2026-05-09"],
      usedSaverDates: ["2026-05-06"],
    };
    // iOS 테스트의 PhotoMeta(kind: .challengeLog, date: "2026-05-07") 대응:
    // 웹 엔진은 호출자가 챌린지 로그 날짜 배열만 주입한다
    const photoLogDates = ["2026-05-07"];

    const updated = generatePreviousWeekReport(retention, progress, photoLogDates, "2026-05-11");
    const report = updated.weeklyReports[0];

    expect(report).toBeDefined();
    expect(report.weekStart).toBe("2026-05-04");
    expect(report.weekEnd).toBe("2026-05-10");
    expect(report.checkInCount).toBe(3);
    expect(report.completedCardCount).toBe(1);
    expect(report.topCategory).toBe(card.category);
    expect(report.highlightCardTitle).toBe(card.title);
    expect(report.photoLogCount).toBe(1);
    expect(report.usedSaver).toBe(true);
  });

  // 2주+ 결주 후 복귀 시 자리비운 모든 *활동 있는* 주의 리포트가 한 번에 생성돼야.
  // 이전 iOS 구현은 직전 1주만 채우고 끝나 중간 주의 리포트가 영원히 사라졌다.
  it("결주 여러 개를 한 번에 백필하고 빈 주는 skip", () => {
    const card = ALL_CARDS[0];
    // 4주 전(활동 있음) + 2주 전(활동 있음). 3주 전은 빈 주.
    const progress = makeProgress({
      completionHistory: [
        {
          date: "2026-04-14", // 4월 4주차 (2026-04-13 ~ 04-19)
          selectedCardIds: [card.id],
          completedCardIds: [card.id],
          wasFullClear: true,
          mode: "normal",
        },
        {
          date: "2026-04-28", // 4월 5주차 (2026-04-27 ~ 05-03)
          selectedCardIds: [card.id],
          completedCardIds: [card.id],
          wasFullClear: true,
          mode: "normal",
        },
      ],
    });
    const retention = freshRetentionState("2026-05-11");

    const updated = generatePreviousWeekReport(retention, progress, [], "2026-05-11");

    // 두 활동 주 모두 백필, 빈 주(2026-04-20)는 skip
    const starts = updated.weeklyReports.map((r) => r.weekStart);
    expect(starts).toEqual(["2026-04-27", "2026-04-13"]);
    expect(starts).not.toContain("2026-04-20");
    expect(starts).not.toContain("2026-05-04"); // 활동 없으므로 skip
  });
});

describe("RetentionEngine 추가 케이스 (웹 포팅 확장)", () => {
  it("checkInDates 는 420개 캡, 오래된 것부터 제거", () => {
    // "2026-05-18" 까지 연속 420일 체크인 상태를 구성
    const first = addDays("2026-05-18", -(MAX_STORED_CHECK_INS - 1))!;
    const dates: string[] = [];
    for (let i = 0; i < MAX_STORED_CHECK_INS; i++) {
      dates.push(addDays(first, i)!);
    }
    const state: RetentionState = {
      ...freshRetentionState("2026-05-18"),
      currentLightStreak: MAX_STORED_CHECK_INS,
      bestLightStreak: MAX_STORED_CHECK_INS,
      lastCheckInDate: "2026-05-18",
      checkInDates: dates,
    };

    const result = retentionCheckIn(state, "2026-05-19");

    expect(result.state.checkInDates.length).toBe(MAX_STORED_CHECK_INS);
    expect(result.state.checkInDates[0]).toBe(addDays(first, 1)!); // 가장 오래된 하루 탈락
    expect(result.state.checkInDates.at(-1)).toBe("2026-05-19");
    expect(result.state.currentLightStreak).toBe(MAX_STORED_CHECK_INS + 1);
  });

  it("weeklyReports 는 12개 캡, 최신주 우선", () => {
    // 직전 12주(2026-04-27 ~ 2026-02-09 시작)가 이미 채워진 상태
    const existing: WeeklyReportSummary[] = [];
    for (let offset = 2; offset <= MAX_WEEKLY_REPORTS + 1; offset++) {
      const weekStart = addDays("2026-05-11", -7 * offset)!;
      existing.push({
        weekStart,
        weekEnd: addDays(weekStart, 6)!,
        generatedAt: 1,
        checkInCount: 1,
        completedCardCount: 0,
        photoLogCount: 0,
        usedSaver: false,
      });
    }
    const retention: RetentionState = {
      ...freshRetentionState("2026-05-11"),
      checkInDates: ["2026-05-05"], // 직전 주(2026-05-04)에만 새 활동
      weeklyReports: existing,
    };

    const updated = generatePreviousWeekReport(retention, makeProgress({}), [], "2026-05-11");

    expect(updated.weeklyReports.length).toBe(MAX_WEEKLY_REPORTS);
    expect(updated.weeklyReports[0].weekStart).toBe("2026-05-04"); // 새 리포트가 맨 앞
    const starts = updated.weeklyReports.map((r) => r.weekStart);
    expect(starts).not.toContain("2026-02-09"); // 가장 오래된 주 탈락
  });

  it("월경계 체크인: 리필 먼저, 그 다음 방패 소비", () => {
    // 4월 말 방패 0개로 하루 결석 후 5월 2일 복귀:
    // 5월 리필(2개)이 먼저 적용된 뒤 gap 2 판정이 방패 1개를 소비해야 한다
    const state: RetentionState = {
      ...freshRetentionState("2026-04-30"),
      currentLightStreak: 5,
      bestLightStreak: 5,
      lastCheckInDate: "2026-04-30",
      streakSavers: 0,
      checkInDates: ["2026-04-30"],
    };

    const result = retentionCheckIn(state, "2026-05-02");

    expect(result.usedSaver).toBe(true);
    expect(result.state.currentLightStreak).toBe(6);
    expect(result.state.streakSavers).toBe(MAX_MONTHLY_SAVERS - 1);
    expect(result.state.usedSaverDates).toEqual(["2026-05-01"]);
    expect(result.state.saverRefreshMonth).toBe("2026-05");
  });
});

describe("normalizeRetentionState 관용 디코드", () => {
  it("객체가 아니면 fresh 상태", () => {
    expect(normalizeRetentionState(null, "2026-05-19")).toEqual(freshRetentionState("2026-05-19"));
    expect(normalizeRetentionState(undefined, "2026-05-19")).toEqual(freshRetentionState("2026-05-19"));
    expect(normalizeRetentionState("garbage", "2026-05-19")).toEqual(freshRetentionState("2026-05-19"));
    expect(normalizeRetentionState([1, 2], "2026-05-19")).toEqual(freshRetentionState("2026-05-19"));
  });

  it("깨진 필드만 기본값으로, 나머지는 살린다 (iOS per-field try? 와 동일)", () => {
    const state = normalizeRetentionState(
      {
        currentLightStreak: "5",          // 타입 불일치: 0
        bestLightStreak: 3,               // 유지
        lastCheckInDate: "2026-05-18",    // 유지
        streakSavers: 1.5,                // 비정수: 기본값 2
        // saverRefreshMonth 누락: monthKey(today)
        checkInDates: ["2026-05-01", 7],  // 원소 타입 불일치: 배열 전체 []
        usedSaverDates: ["2026-05-02"],   // 유지
        weeklyReports: "nope",            // 타입 불일치: []
      },
      "2026-05-19"
    );

    expect(state.currentLightStreak).toBe(0);
    expect(state.bestLightStreak).toBe(3);
    expect(state.lastCheckInDate).toBe("2026-05-18");
    expect(state.streakSavers).toBe(MAX_MONTHLY_SAVERS);
    expect(state.saverRefreshMonth).toBe("2026-05");
    expect(state.checkInDates).toEqual([]);
    expect(state.usedSaverDates).toEqual(["2026-05-02"]);
    expect(state.weeklyReports).toEqual([]);
  });

  it("weeklyReports 원소 하나라도 깨지면 배열 전체 기본값 (iOS 배열 디코드와 동일)", () => {
    const valid: WeeklyReportSummary = {
      weekStart: "2026-05-04",
      weekEnd: "2026-05-10",
      generatedAt: 1,
      checkInCount: 2,
      completedCardCount: 1,
      photoLogCount: 0,
      usedSaver: false,
    };
    const broken = normalizeRetentionState(
      { weeklyReports: [valid, { weekStart: "2026-04-27" }] }, // 두번째 원소 필수 필드 누락
      "2026-05-19"
    );
    expect(broken.weeklyReports).toEqual([]);

    // 전 원소가 유효하면 그대로 보존 (옵셔널 필드 부재 포함)
    const intact = normalizeRetentionState({ weeklyReports: [valid] }, "2026-05-19");
    expect(intact.weeklyReports).toEqual([valid]);

    // topCategory 가 유효하지 않은 문자열이면 해당 원소 실패: 배열 전체 기본값
    const badCategory = normalizeRetentionState(
      { weeklyReports: [{ ...valid, topCategory: "notACategory" }] },
      "2026-05-19"
    );
    expect(badCategory.weeklyReports).toEqual([]);
  });
});

describe("날짜 헬퍼 (Date.UTC 기반)", () => {
  it("addDays 는 월/연 경계를 넘는다", () => {
    expect(addDays("2026-04-30", 1)).toBe("2026-05-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29"); // 윤년
  });

  it("존재하지 않는 날짜는 거부한다", () => {
    expect(addDays("2026-02-30", 1)).toBeNull();
    expect(addDays("not-a-date", 1)).toBeNull();
    expect(dayGap("2026-13-01", "2026-05-19")).toBeNull();
  });

  it("dayGap / monthKey", () => {
    expect(dayGap("2026-05-19", "2026-05-21")).toBe(2);
    expect(dayGap("2026-05-21", "2026-05-19")).toBe(-2);
    expect(dayGap("2026-04-30", "2026-05-01")).toBe(1);
    expect(monthKey("2026-05-19")).toBe("2026-05");
  });

  it("weekStartOf 는 월요일 시작", () => {
    expect(weekStartOf("2026-05-11")).toBe("2026-05-11"); // 월요일 자기 자신
    expect(weekStartOf("2026-05-10")).toBe("2026-05-04"); // 일요일은 지난 월요일
    expect(weekStartOf("2026-05-13")).toBe("2026-05-11"); // 수요일
    expect(weekStartOf("bogus")).toBe("bogus");           // 파싱 실패 시 입력 그대로
  });
});

describe("stripUndefined (Firestore 와이어 포맷)", () => {
  it("undefined 키를 깊이 제거한다", () => {
    const state: RetentionState = {
      ...freshRetentionState("2026-05-19"),
      lastCheckInDate: undefined, // 명시적 undefined 도 제거돼야
      weeklyReports: [
        {
          weekStart: "2026-05-04",
          weekEnd: "2026-05-10",
          generatedAt: 1,
          checkInCount: 1,
          completedCardCount: 0,
          topCategory: undefined,
          highlightCardTitle: undefined,
          photoLogCount: 0,
          usedSaver: false,
        },
      ],
    };

    const wire = stripUndefined(state) as unknown as Record<string, unknown>;

    expect("lastCheckInDate" in wire).toBe(false);
    const report = (wire.weeklyReports as Record<string, unknown>[])[0];
    expect("topCategory" in report).toBe(false);
    expect("highlightCardTitle" in report).toBe(false);
    expect(report.weekStart).toBe("2026-05-04");
    // 배열/프리미티브는 그대로 보존
    expect(wire.checkInDates).toEqual([]);
    expect(wire.streakSavers).toBe(MAX_MONTHLY_SAVERS);
  });
});
