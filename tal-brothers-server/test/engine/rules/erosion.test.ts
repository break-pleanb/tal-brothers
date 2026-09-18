import { describe, expect, it } from 'vitest'

import { EROSION_TIER } from 'tal-brothers-shared'

import {
  applyErosionDelta,
  clampErosion,
  isErosionStep,
  tierOf,
} from '../../../src/engine/rules/erosion'

describe('잠식도 (룰북 §4.1)', () => {
  it('5% 단위로 증감한다', () => {
    expect(applyErosionDelta(0, 5)).toBe(5)
    expect(applyErosionDelta(5, 10)).toBe(15)
    expect(applyErosionDelta(20, -10)).toBe(10)
    expect(applyErosionDelta(35, 15)).toBe(50)
  })

  it('5의 배수가 아닌 증감은 예외를 던진다', () => {
    expect(() => applyErosionDelta(0, 3)).toThrow()
    expect(() => applyErosionDelta(0, 0.5)).toThrow()
    expect(isErosionStep(3)).toBe(false)
    expect(isErosionStep(-10)).toBe(true)
  })

  it('0% 미만으로 내려가지 않는다', () => {
    expect(applyErosionDelta(5, -10)).toBe(0)
    expect(applyErosionDelta(0, -25)).toBe(0)
  })

  it('100% 초과분은 버린다', () => {
    expect(applyErosionDelta(95, 10)).toBe(100)
    expect(applyErosionDelta(100, 25)).toBe(100)
  })

  it('clampErosion은 0~100으로 자른다', () => {
    expect(clampErosion(-5)).toBe(0)
    expect(clampErosion(50)).toBe(50)
    expect(clampErosion(120)).toBe(100)
  })
})

describe('잠식 티어 (룰북 §4.3)', () => {
  it('구간 경계가 29/30, 59/60, 99/100에서 갈린다', () => {
    expect(tierOf(0)).toBe(EROSION_TIER.NORMAL)
    expect(tierOf(29)).toBe(EROSION_TIER.NORMAL)
    expect(tierOf(30)).toBe(EROSION_TIER.TIER30)
    expect(tierOf(59)).toBe(EROSION_TIER.TIER30)
    expect(tierOf(60)).toBe(EROSION_TIER.TIER60)
    expect(tierOf(99)).toBe(EROSION_TIER.TIER60)
    expect(tierOf(100)).toBe(EROSION_TIER.TRAITOR)
  })

  it('티어는 저장하지 않고 잠식도에서 파생한다', () => {
    // 같은 값이면 언제 물어도 같은 티어가 나온다
    for (const percent of [0, 5, 30, 55, 60, 95, 100]) {
      expect(tierOf(percent)).toBe(tierOf(percent))
    }
  })
})
