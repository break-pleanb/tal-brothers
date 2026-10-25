import { describe, expect, it } from 'vitest'
import { VARIANT_DETAIL_KEYS, VARIANT_KIND } from 'tal-brothers-shared'

import { variantDetailOf, variantDetailsFor } from '../../../src/engine/rules/variantDetail'
import { findPhase2Event } from '../../../src/scenario/phase2Events'
import type { ScenarioEvent } from '../../../src/scenario/scenarioTypes'

/** 변이 열람의 최종 적용값 (룰북 §6.2, §6.4) */

function event(id: string): ScenarioEvent {
  const found = findPhase2Event(id)
  if (found === undefined) throw new Error(`없는 이벤트: ${id}`)
  return found
}

function choice(eventId: string, choiceId: string) {
  const found = event(eventId).choices.find((entry) => entry.id === choiceId)
  if (found === undefined) throw new Error(`없는 선택지: ${choiceId}`)
  return found
}

describe('최종 적용값 (룰북 §6.4)', () => {
  it('룰북 예시: 07A 성황당 정화(기준 5, 실패 +25%)에 흉이면 성공 6 이상 · 실패 시 +35%', () => {
    const detail = variantDetailOf(choice('p2-07', 'p2-07-a'), VARIANT_KIND.ILL, true)
    expect(detail.threshold).toBe(6)
    expect(detail.failureErosionPercent).toBe(35)
    // 07A의 보상은 전원 회복 15% — 흉은 보상을 바꾸지 않는다
    expect(detail.rewardHealPercent).toBe(15)
  })

  it('평은 기본값 그대로, 길은 보상 +1단계 (부적 +1개, 회복 +5%p)', () => {
    const plain = variantDetailOf(choice('p2-07', 'p2-07-a'), VARIANT_KIND.PLAIN, true)
    expect(plain.threshold).toBe(5)
    expect(plain.failureErosionPercent).toBe(25)

    const bless = variantDetailOf(choice('p2-07', 'p2-07-a'), VARIANT_KIND.BLESS, true)
    expect(bless.threshold).toBe(5)
    expect(bless.rewardHealPercent).toBe(20)

    const talisman = variantDetailOf(choice('p2-01', 'p2-01-a'), VARIANT_KIND.BLESS, true)
    expect(talisman.rewardTalismans).toBe(2)
  })

  it('비공개 판정은 대가가 고정이라 성공 기준만 싣는다 (룰북 §6.2)', () => {
    const ill = variantDetailOf(choice('p2-02', 'p2-02-a'), VARIANT_KIND.ILL, true)
    expect(ill.threshold).toBe(5)
    expect(ill.failureErosionPercent).toBeNull()
    expect(ill.rewardTalismans).toBeNull()
    expect(ill.rewardHealPercent).toBeNull()

    // 길은 기준 -1 (하한 2)
    expect(variantDetailOf(choice('p2-02', 'p2-02-a'), VARIANT_KIND.BLESS, true).threshold).toBe(3)
  })

  it('판정 없는 선택지는 시간 비용만 — 흉 +5분, 길 -5분 (최소 0분)', () => {
    expect(variantDetailOf(choice('p2-01', 'p2-01-c'), VARIANT_KIND.PLAIN, true).timeCostMinutes).toBe(5)
    expect(variantDetailOf(choice('p2-01', 'p2-01-c'), VARIANT_KIND.ILL, true).timeCostMinutes).toBe(10)
    expect(variantDetailOf(choice('p2-01', 'p2-01-c'), VARIANT_KIND.BLESS, true).timeCostMinutes).toBe(0)
    expect(variantDetailOf(choice('p2-01', 'p2-01-c'), VARIANT_KIND.ILL, true).threshold).toBeNull()
  })

  it('변이를 적용하지 않는 선택지(14A)는 라벨과 무관하게 기본값이다 (룰북 §6.3)', () => {
    const exempt = choice('p2-14', 'p2-14-a')
    expect(variantDetailOf(exempt, VARIANT_KIND.ILL, false)).toEqual(variantDetailOf(exempt, VARIANT_KIND.PLAIN, false))
  })

  it('키는 언제나 VARIANT_DETAIL_KEYS 전부다 — 선택지 종류가 달라도 구조가 같다', () => {
    const expected = [...VARIANT_DETAIL_KEYS].sort()
    for (const [eventId, choiceId] of [
      ['p2-07', 'p2-07-a'],
      ['p2-02', 'p2-02-a'],
      ['p2-01', 'p2-01-c'],
      ['p2-14', 'p2-14-a'],
    ] as const) {
      for (const variant of Object.values(VARIANT_KIND)) {
        expect(Object.keys(variantDetailOf(choice(eventId, choiceId), variant, true)).sort()).toEqual(expected)
      }
    }
  })

  it('라벨이 없으면 null, 있으면 라벨이 붙은 선택지마다 만든다', () => {
    const target = event('p2-01')
    expect(variantDetailsFor(target, null)).toBeNull()
    const labels = { 'p2-01-a': VARIANT_KIND.ILL, 'p2-01-b': VARIANT_KIND.PLAIN, 'p2-01-c': VARIANT_KIND.BLESS }
    expect(Object.keys(variantDetailsFor(target, labels) ?? {}).sort()).toEqual(Object.keys(labels).sort())
  })
})
