/**
 * Phase 14 code-review High #7 — Up Hero 전투는 18+ 개 Math.random() 사이트에
 *   의존하고 있어 (a) 재현성 있는 시뮬레이션 / regression test 가 불가능, (b) 주간
 *   리더보드에서 같은 세션을 공정하게 비교 불가. seedable PRNG 를 도입해 선택적
 *   결정론 확보. 기본 동작은 Math.random 으로 유지 (프로덕션 체감 변화 없음).
 *
 *   테스트 / dev 경로에서 `setRngSeed(seed)` 호출 시 mulberry32 기반 deterministic
 *   sequence 로 전환. 세션 끝나거나 명시 `resetRng()` 시 Math.random 복귀.
 *
 *   TODO(Phase 15): session.rngSeed 필드 persist → cloud replay 지원.
 */

type RngFn = () => number;

let activeRng: RngFn | null = null;

/**
 * mulberry32 — 32-bit state, period 2^32, 균등 분포 정합성 충분.
 *   seed 0 은 degenerate (항상 동일 값) 이라 내부에서 nonzero 로 정규화.
 */
export function createRng(seed: number): RngFn {
  let s = (seed | 0) || 0x9e3779b9; // 0 → golden ratio 로 정규화.
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 전역 RNG seed 설정. 이 호출 이후 `rng()` 는 deterministic sequence 반환.
 *   `null` / `undefined` seed 는 Math.random 로 복귀시킴 (resetRng 과 동등).
 */
export function setRngSeed(seed: number | null | undefined): void {
  activeRng = seed == null ? null : createRng(seed);
}

export function resetRng(): void {
  activeRng = null;
}

/**
 * 현재 활성 RNG 로부터 [0, 1) 숫자 추출. 미설정 시 Math.random 로 위임.
 *   upHeroCombat 의 모든 확률 분기는 이 함수로 일원화돼 결정론 전환이 가능.
 */
export function rng(): number {
  return activeRng ? activeRng() : Math.random();
}
