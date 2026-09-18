import { describe, expect, it } from 'vitest'
import { VARIANT_KIND } from 'tal-brothers-shared'
import type { VariantKind } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../../src/scenario/gameConfig'
import { createSeededRng, pickOne, pickWeighted, rollChance, rollD6 } from '../../../src/engine/random'

function sequence(seed: number, length: number): number[] {
  const rng = createSeededRng(seed)
  return Array.from({ length }, () => rng.nextInt(1000))
}

describe('시드 난수 (아키 §5.5)', () => {
  it('같은 시드는 같은 수열을 낸다', () => {
    expect(sequence(42, 50)).toEqual(sequence(42, 50))
  })

  it('다른 시드는 다른 수열을 낸다', () => {
    expect(sequence(42, 50)).not.toEqual(sequence(43, 50))
  })

  it('상한이 0 이하이면 예외를 던진다', () => {
    const rng = createSeededRng(1)
    expect(() => rng.nextInt(0)).toThrow()
    expect(() => rng.nextInt(-3)).toThrow()
  })
})

describe('rollD6 (룰북 §5.1)', () => {
  it('1~6만 반환하고 충분한 표본에서 6면이 모두 나온다', () => {
    const rng = createSeededRng(7)
    const seen = new Set<number>()

    for (let i = 0; i < 600; i += 1) {
      const value = rollD6(rng)
      expect(value).toBeGreaterThanOrEqual(1)
      expect(value).toBeLessThanOrEqual(6)
      expect(Number.isInteger(value)).toBe(true)
      seen.add(value)
    }

    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('pickOne', () => {
  it('배열 안의 값만 고른다', () => {
    const rng = createSeededRng(11)
    const items = ['가', '나', '다']
    for (let i = 0; i < 50; i += 1) {
      expect(items).toContain(pickOne(rng, items))
    }
  })

  it('빈 배열은 예외를 던진다', () => {
    expect(() => pickOne(createSeededRng(1), [])).toThrow()
  })
})

describe('pickWeighted (룰북 §6.1)', () => {
  it('흉 30 / 평 50 / 길 20 가중치를 따른다', () => {
    const rng = createSeededRng(2026)
    const entries = [
      { value: VARIANT_KIND.ILL, weight: GAME_CONFIG.variantWeights.ill },
      { value: VARIANT_KIND.PLAIN, weight: GAME_CONFIG.variantWeights.plain },
      { value: VARIANT_KIND.BLESS, weight: GAME_CONFIG.variantWeights.bless },
    ]

    const samples = 20_000
    const counts: Record<VariantKind, number> = {
      [VARIANT_KIND.ILL]: 0,
      [VARIANT_KIND.PLAIN]: 0,
      [VARIANT_KIND.BLESS]: 0,
    }
    for (let i = 0; i < samples; i += 1) {
      counts[pickWeighted(rng, entries)] += 1
    }

    const tolerance = 0.02
    expect(counts[VARIANT_KIND.ILL] / samples).toBeCloseTo(0.3, 1)
    expect(counts[VARIANT_KIND.PLAIN] / samples).toBeCloseTo(0.5, 1)
    expect(counts[VARIANT_KIND.BLESS] / samples).toBeCloseTo(0.2, 1)
    expect(Math.abs(counts[VARIANT_KIND.ILL] / samples - 0.3)).toBeLessThan(tolerance)
    expect(Math.abs(counts[VARIANT_KIND.PLAIN] / samples - 0.5)).toBeLessThan(tolerance)
    expect(Math.abs(counts[VARIANT_KIND.BLESS] / samples - 0.2)).toBeLessThan(tolerance)
  })
})

describe('rollChance', () => {
  it('0%는 항상 false, 100%는 항상 true', () => {
    const rng = createSeededRng(5)
    for (let i = 0; i < 100; i += 1) {
      expect(rollChance(rng, 0)).toBe(false)
      expect(rollChance(rng, 100)).toBe(true)
    }
  })
})
