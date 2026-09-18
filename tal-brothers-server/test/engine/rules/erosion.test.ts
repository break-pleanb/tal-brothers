import { describe, expect, it } from 'vitest'

import {
  applyErosionDelta,
  clampErosion,
  isErosionStep,
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
