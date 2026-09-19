import { randomInt } from 'node:crypto'

/**
 * 난수 (아키텍처 §5.5).
 * 엔진은 `Math.random`을 직접 쓰지 않고 이 인터페이스만 주입받는다.
 * 테스트·시뮬레이션은 시드 고정 난수를 쓰고, 같은 시드면 같은 수열이 재현된다.
 */
export type Rng = {
  /** 0 이상 `boundExclusive` 미만의 정수 */
  nextInt(boundExclusive: number): number
}

/**
 * 운영용 난수 (아키텍처 §5.5).
 * 방마다 1개를 만들어 들고 있는다. 엔진은 이 구현을 알지 못하고 인터페이스만 받는다.
 */
export function createCryptoRng(): Rng {
  return {
    nextInt(boundExclusive: number): number {
      if (!Number.isInteger(boundExclusive) || boundExclusive <= 0) {
        throw new Error(`nextInt의 상한은 1 이상의 정수여야 한다: ${boundExclusive}`)
      }
      return randomInt(boundExclusive)
    },
  }
}

/** 주사위 면 수 (룰북 §5.1) */
const DICE_FACES = 6

/**
 * mulberry32 — 외부 의존성 없는 32비트 정수 PRNG.
 * 상태가 32비트 정수 1개뿐이라 시드와 호출 횟수만으로 수열을 되살릴 수 있다.
 */
export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0

  const nextUint32 = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }

  return {
    nextInt(boundExclusive: number): number {
      if (!Number.isInteger(boundExclusive) || boundExclusive <= 0) {
        throw new Error(`nextInt의 상한은 1 이상의 정수여야 한다: ${boundExclusive}`)
      }
      return nextUint32() % boundExclusive
    },
  }
}

/** D6 굴림 — 1~6 (룰북 §5.1) */
export function rollD6(rng: Rng): number {
  return rng.nextInt(DICE_FACES) + 1
}

/** 균등 확률로 1개 고른다. 빈 배열은 호출 자체가 버그이므로 예외를 던진다 */
export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error('pickOne에 빈 배열이 들어왔다')
  }
  return items[rng.nextInt(items.length)] as T
}

export type WeightedEntry<T> = {
  value: T
  /** 1 이상의 정수 가중치 */
  weight: number
}

/** 가중치대로 1개 고른다 (룰북 §6.1의 흉 30 / 평 50 / 길 20) */
export function pickWeighted<T>(rng: Rng, entries: readonly WeightedEntry<T>[]): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0)
  if (entries.length === 0 || total <= 0) {
    throw new Error('pickWeighted의 가중치 합이 0 이하다')
  }

  let roll = rng.nextInt(total)
  for (const entry of entries) {
    roll -= entry.weight
    if (roll < 0) return entry.value
  }
  // 가중치 합 계산과 루프가 어긋나지 않는 한 도달하지 않는다
  return (entries[entries.length - 1] as WeightedEntry<T>).value
}

/** 백분율 확률 판정. `chancePercent`가 0이면 항상 false, 100이면 항상 true */
export function rollChance(rng: Rng, chancePercent: number): boolean {
  return rng.nextInt(100) < chancePercent
}
