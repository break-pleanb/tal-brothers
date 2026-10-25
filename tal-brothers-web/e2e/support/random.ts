/**
 * 테스트 정책용 시드 난수 (mulberry32).
 * 같은 시드면 같은 선택을 해서, 실패한 판을 같은 입력으로 다시 돌려 볼 수 있다.
 */

export type TestRng = {
  /** [0, 1) */
  next(): number
  /** [0, max) 정수 */
  int(max: number): number
  chance(probability: number): boolean
}

export function createTestRng(seed: number): TestRng {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (max) => Math.floor(next() * max),
    chance: (probability) => next() < probability,
  }
}
