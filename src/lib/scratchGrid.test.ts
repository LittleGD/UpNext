import { describe, it, expect } from "vitest";
import {
  ALMOST_RATIO,
  NEAR_TICK_RATIO,
  PEEL_MS,
  REVEAL_RATIO,
  SCRATCH_COLS,
  SCRATCH_ROWS,
  SCRATCH_TOTAL,
  TICK_MIN_DIST,
  TICK_MIN_MS,
  cellIndexAt,
  cellsAlongSegment,
  isNearTick,
  isRevealed,
  revealGoal,
} from "./scratchGrid";

const W = 280;
const H = 400;

function rowOf(index: number): number {
  return Math.floor(index / SCRATCH_COLS);
}
function colOf(index: number): number {
  return index % SCRATCH_COLS;
}

describe("scratchGrid — 상수 픽스처 (iOS AuraRitualCover 와 같은 튜플)", () => {
  it("cols 7 / rows 5 / reveal 0.45 / almost 0.28 / near 0.8 / tick 40ms·24px / peel 260", () => {
    // AuraReadingView.swift AuraRitualCover: cols 7, rows 5, threshold 0.45,
    // progress >= 0.28 → "조금만 더", nearTickRatio 0.8, tickMinInterval 0.04,
    // tickMinDistance 24, finish delay 0.26. 한쪽을 바꾸면 다른 쪽도 함께.
    expect({
      cols: SCRATCH_COLS,
      rows: SCRATCH_ROWS,
      reveal: REVEAL_RATIO,
      almost: ALMOST_RATIO,
      near: NEAR_TICK_RATIO,
      tickMs: TICK_MIN_MS,
      tickDist: TICK_MIN_DIST,
      peelMs: PEEL_MS,
    }).toEqual({
      cols: 7,
      rows: 5,
      reveal: 0.45,
      almost: 0.28,
      near: 0.8,
      tickMs: 40,
      tickDist: 24,
      peelMs: 260,
    });
    expect(SCRATCH_TOTAL).toBe(35);
    expect(revealGoal()).toBeCloseTo(15.75);
  });
});

describe("cellIndexAt", () => {
  it("격자 밖 좌표는 가장자리 셀로 클램프한다", () => {
    expect(colOf(cellIndexAt(-5, 10, W, H))).toBe(0);
    expect(colOf(cellIndexAt(W + 5, 10, W, H))).toBe(SCRATCH_COLS - 1);
    expect(rowOf(cellIndexAt(10, -5, W, H))).toBe(0);
    expect(rowOf(cellIndexAt(10, H + 5, W, H))).toBe(SCRATCH_ROWS - 1);
  });

  it("셀 경계 안의 좌표는 해당 (row, col) 인덱스로 간다", () => {
    // 셀 40×80. (100, 250) → col 2, row 3 → 3*7+2 = 23
    expect(cellIndexAt(100, 250, W, H)).toBe(23);
    expect(cellIndexAt(0, 0, W, H)).toBe(0);
    expect(cellIndexAt(W - 1, H - 1, W, H)).toBe(SCRATCH_TOTAL - 1);
  });
});

describe("cellsAlongSegment", () => {
  it("가로 세그먼트는 그 행의 7칸을 정확히 채운다", () => {
    const out = new Set<number>();
    cellsAlongSegment(1, H * 0.5, W - 1, H * 0.5, W, H, out);
    expect(out.size).toBe(7);
    for (const index of out) expect(rowOf(index)).toBe(2);
    expect([...out].map(colOf).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it.each([
    [248, 360],
    [340, 520],
  ])("대각선 (0,0)→(w,h) 경로에 빈 칸이 없다 (w=%i, h=%i)", (w, h) => {
    const out = new Set<number>();
    cellsAlongSegment(0, 0, w, h, w, h, out);
    // Set 은 삽입 순서를 보존하므로 연속 쌍이 곧 경로의 이웃이다.
    const path = [...out];
    expect(path[0]).toBe(0);
    expect(path[path.length - 1]).toBe(SCRATCH_TOTAL - 1);
    for (let i = 1; i < path.length; i++) {
      expect(Math.abs(rowOf(path[i]) - rowOf(path[i - 1]))).toBeLessThanOrEqual(1);
      expect(Math.abs(colOf(path[i]) - colOf(path[i - 1]))).toBeLessThanOrEqual(1);
    }
  });

  it("샘플이 두 개뿐인 아주 빠른 스와이프(모서리→모서리)도 7칸 이상 채운다", () => {
    const out = new Set<number>();
    cellsAlongSegment(0, 0, W, H, W, H, out);
    expect(out.size).toBeGreaterThanOrEqual(7);
  });

  it("같은 점을 두 번 주면 한 칸만 넣고, 0 크기 격자는 아무것도 하지 않는다", () => {
    const out = new Set<number>();
    cellsAlongSegment(50, 50, 50, 50, W, H, out);
    expect(out.size).toBe(1);
    const empty = new Set<number>();
    cellsAlongSegment(0, 0, W, H, 0, H, empty);
    expect(empty.size).toBe(0);
  });
});

describe("임계치", () => {
  it("16칸부터 공개, 13~15칸이 임박", () => {
    expect(isRevealed(15)).toBe(false);
    expect(isRevealed(16)).toBe(true);
    expect(isNearTick(12)).toBe(false);
    expect(isNearTick(13)).toBe(true);
    expect(isNearTick(15)).toBe(true);
    expect(isNearTick(16)).toBe(false);
  });
});
