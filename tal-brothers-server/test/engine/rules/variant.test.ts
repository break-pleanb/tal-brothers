import { describe, expect, it } from 'vitest'
import { ATTRIBUTE, JUDGMENT_KIND, VARIANT_KIND } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../../src/scenario/gameConfig'
import { findPhase1Event } from '../../../src/scenario/phase1Events'
import { EFFECT_CATEGORY } from '../../../src/scenario/constants/effectCategory'
import { EFFECT_KIND } from '../../../src/scenario/constants/effectKind'
import { EFFECT_TARGET } from '../../../src/scenario/constants/effectTarget'
import { hasJudgment } from '../../../src/scenario/scenarioTypes'
import type { Choice, Effect, JudgmentChoice, PlainChoice } from '../../../src/scenario/scenarioTypes'
import { createSeededRng } from '../../../src/engine/random'
import {
  applyVariantToChoice,
  isBoostableReward,
  rollEventVariants,
  variantOf,
} from '../../../src/engine/rules/variant'

function chiefChoice(choiceId: string): JudgmentChoice {
  const choice = findPhase1Event('villageChief')?.choices.find(
    (candidate) => candidate.id === choiceId,
  )
  if (choice === undefined || !hasJudgment(choice)) {
    throw new Error(`판정 선택지를 찾지 못했다: ${choiceId}`)
  }
  return choice
}

function thresholdOf(choice: Choice): number {
  if (!hasJudgment(choice)) throw new Error('판정 없는 선택지다')
  return choice.judgment.threshold
}

function erosionOf(effects: Effect[], category: string): number | undefined {
  const found = effects.find(
    (effect) => effect.kind === EFFECT_KIND.EROSION && effect.category === category,
  )
  return found?.kind === EFFECT_KIND.EROSION ? found.deltaPercent : undefined
}

function judgmentFixture(overrides: Partial<JudgmentChoice> = {}): JudgmentChoice {
  return {
    id: 'fx-solo',
    text: '픽스처 판정 선택지',
    judgment: { kind: JUDGMENT_KIND.SOLO, attribute: ATTRIBUTE.STRENGTH, threshold: 4 },
    success: [],
    failure: [],
    ...overrides,
  }
}

function hiddenFixture(threshold: number): JudgmentChoice {
  return {
    id: 'fx-hidden',
    text: '픽스처 비공개 판정',
    judgment: { kind: JUDGMENT_KIND.HIDDEN, attribute: ATTRIBUTE.KNOWLEDGE, threshold },
    success: [],
    failure: [],
  }
}

function plainFixture(costMinutes: number): PlainChoice {
  return {
    id: 'fx-plain',
    text: '픽스처 우회 선택지',
    judgment: null,
    resolve: [
      {
        category: EFFECT_CATEGORY.PENALTY,
        kind: EFFECT_KIND.TIME_DELTA,
        minutes: -costMinutes,
      },
    ],
  }
}

function timeMinutesOf(choice: Choice): number {
  if (hasJudgment(choice)) throw new Error('판정 있는 선택지다')
  const effect = choice.resolve.find((candidate) => candidate.kind === EFFECT_KIND.TIME_DELTA)
  if (effect === undefined || effect.kind !== EFFECT_KIND.TIME_DELTA) {
    throw new Error('시간 효과가 없다')
  }
  return effect.minutes
}

describe('흉 변이 (룰북 §6.2)', () => {
  it('성공 기준 +1, 실패 잠식 페널티 +10%p', () => {
    const applied = applyVariantToChoice(chiefChoice('chief-a'), VARIANT_KIND.ILL)
    expect(thresholdOf(applied)).toBe(5)
    if (!hasJudgment(applied)) throw new Error('판정 선택지여야 한다')
    expect(erosionOf(applied.failure, EFFECT_CATEGORY.PENALTY)).toBe(25)
  })

  it('성공 기준이 이미 6이면 페널티만 가산한다', () => {
    const fixture = judgmentFixture({
      judgment: { kind: JUDGMENT_KIND.SOLO, attribute: ATTRIBUTE.STRENGTH, threshold: 6 },
      failure: [
        {
          category: EFFECT_CATEGORY.PENALTY,
          kind: EFFECT_KIND.EROSION,
          target: EFFECT_TARGET.ROLLER,
          deltaPercent: 20,
        },
      ],
    })

    const applied = applyVariantToChoice(fixture, VARIANT_KIND.ILL)
    expect(thresholdOf(applied)).toBe(GAME_CONFIG.thresholdMax)
    if (!hasJudgment(applied)) throw new Error('판정 선택지여야 한다')
    expect(erosionOf(applied.failure, EFFECT_CATEGORY.PENALTY)).toBe(30)
  })
})

describe('길 변이 (룰북 §6.2)', () => {
  it('부적 보상은 +1개', () => {
    const applied = applyVariantToChoice(chiefChoice('chief-b'), VARIANT_KIND.BLESS)
    if (!hasJudgment(applied)) throw new Error('판정 선택지여야 한다')

    const talisman = applied.success.find((effect) => effect.kind === EFFECT_KIND.TALISMAN)
    expect(talisman?.kind === EFFECT_KIND.TALISMAN ? talisman.count : 0).toBe(2)
    // 성공 부작용과 실패 페널티는 그대로
    expect(erosionOf(applied.success, EFFECT_CATEGORY.SIDE_EFFECT)).toBe(5)
    expect(erosionOf(applied.failure, EFFECT_CATEGORY.PENALTY)).toBe(20)
    expect(thresholdOf(applied)).toBe(4)
  })

  it('회복 보상은 +5%p', () => {
    const fixture = judgmentFixture({
      success: [
        {
          category: EFFECT_CATEGORY.REWARD,
          kind: EFFECT_KIND.EROSION,
          target: EFFECT_TARGET.ROLLER,
          deltaPercent: -10,
        },
      ],
    })

    const applied = applyVariantToChoice(fixture, VARIANT_KIND.BLESS)
    if (!hasJudgment(applied)) throw new Error('판정 선택지여야 한다')
    expect(erosionOf(applied.success, EFFECT_CATEGORY.REWARD)).toBe(-15)
  })

  it('증가 가능한 보상이 없으면 실패 잠식 페널티 -10%p', () => {
    const applied = applyVariantToChoice(chiefChoice('chief-a'), VARIANT_KIND.BLESS)
    if (!hasJudgment(applied)) throw new Error('판정 선택지여야 한다')
    expect(erosionOf(applied.failure, EFFECT_CATEGORY.PENALTY)).toBe(5)
    expect(thresholdOf(applied)).toBe(4)
  })

  it('감산 결과는 0%보다 내려가지 않는다', () => {
    const fixture = judgmentFixture({
      failure: [
        {
          category: EFFECT_CATEGORY.PENALTY,
          kind: EFFECT_KIND.EROSION,
          target: EFFECT_TARGET.ROLLER,
          deltaPercent: 5,
        },
      ],
    })

    const applied = applyVariantToChoice(fixture, VARIANT_KIND.BLESS)
    if (!hasJudgment(applied)) throw new Error('판정 선택지여야 한다')
    expect(erosionOf(applied.failure, EFFECT_CATEGORY.PENALTY)).toBe(0)
  })

  it('보상이 버프뿐인 이장 C는 페널티 -10%p, 버프는 +1 유지', () => {
    const applied = applyVariantToChoice(chiefChoice('chief-c'), VARIANT_KIND.BLESS)
    if (!hasJudgment(applied)) throw new Error('판정 선택지여야 한다')

    const buff = applied.success.find((effect) => effect.kind === EFFECT_KIND.TEAM_MODIFIER)
    expect(buff?.kind === EFFECT_KIND.TEAM_MODIFIER ? buff.delta : 0).toBe(1)
    expect(erosionOf(applied.success, EFFECT_CATEGORY.SIDE_EFFECT)).toBe(10)
    expect(erosionOf(applied.failure, EFFECT_CATEGORY.PENALTY)).toBe(15)
  })

  it.todo('옥비녀 보상은 증가하지 않고 페널티 -10%p — jadeHairpin 효과는 M2 범위')

  it('버프는 증가 가능한 보상이 아니다', () => {
    expect(
      isBoostableReward({
        category: EFFECT_CATEGORY.REWARD,
        kind: EFFECT_KIND.TEAM_MODIFIER,
        delta: 1,
      }),
    ).toBe(false)
    expect(
      isBoostableReward({
        category: EFFECT_CATEGORY.REWARD,
        kind: EFFECT_KIND.TALISMAN,
        target: EFFECT_TARGET.ROLLER,
        count: 1,
      }),
    ).toBe(true)
  })
})

describe('비공개 판정 변이 (룰북 §6.2)', () => {
  it('흉은 기준 +1(상한 6), 길은 기준 -1(하한 2)', () => {
    expect(thresholdOf(applyVariantToChoice(hiddenFixture(4), VARIANT_KIND.ILL))).toBe(5)
    expect(thresholdOf(applyVariantToChoice(hiddenFixture(6), VARIANT_KIND.ILL))).toBe(6)
    expect(thresholdOf(applyVariantToChoice(hiddenFixture(4), VARIANT_KIND.BLESS))).toBe(3)
    expect(thresholdOf(applyVariantToChoice(hiddenFixture(2), VARIANT_KIND.BLESS))).toBe(
      GAME_CONFIG.hiddenThresholdMin,
    )
  })

  it('대가 +10%는 변이와 무관하게 고정이라 효과 목록이 바뀌지 않는다', () => {
    const fixture = hiddenFixture(4)
    for (const variant of [VARIANT_KIND.ILL, VARIANT_KIND.PLAIN, VARIANT_KIND.BLESS]) {
      const applied = applyVariantToChoice(fixture, variant)
      if (!hasJudgment(applied)) throw new Error('판정 선택지여야 한다')
      expect(applied.success).toEqual(fixture.success)
      expect(applied.failure).toEqual(fixture.failure)
    }
    expect(GAME_CONFIG.hiddenJudgmentCostPercent).toBe(10)
  })
})

describe('판정 없는 선택지 변이 (룰북 §6.2)', () => {
  it('흉은 시간 페널티 +5분, 길은 -5분(최소 0분)', () => {
    expect(timeMinutesOf(applyVariantToChoice(plainFixture(5), VARIANT_KIND.ILL))).toBe(-10)
    expect(timeMinutesOf(applyVariantToChoice(plainFixture(5), VARIANT_KIND.BLESS))).toBe(0)
    expect(timeMinutesOf(applyVariantToChoice(plainFixture(10), VARIANT_KIND.BLESS))).toBe(-5)
    expect(timeMinutesOf(applyVariantToChoice(plainFixture(5), VARIANT_KIND.PLAIN))).toBe(-5)
  })
})

describe('페널티 가감 범위 (룰북 §6.2)', () => {
  it('팀 플래그 페널티는 흉·길에서 변하지 않는다', () => {
    const teamDelta = (choice: Choice): number | undefined => {
      if (!hasJudgment(choice)) return undefined
      const effect = choice.failure.find(
        (candidate) => candidate.kind === EFFECT_KIND.TEAM_MODIFIER,
      )
      return effect?.kind === EFFECT_KIND.TEAM_MODIFIER ? effect.delta : undefined
    }

    expect(teamDelta(applyVariantToChoice(chiefChoice('chief-a'), VARIANT_KIND.ILL))).toBe(-1)
    expect(teamDelta(applyVariantToChoice(chiefChoice('chief-a'), VARIANT_KIND.BLESS))).toBe(-1)
  })
})

describe('변이 적용 범위 (룰북 §6.3)', () => {
  it('variantApplied가 false인 이벤트는 변이를 굴리지 않는다', () => {
    const rng = createSeededRng(1)
    for (const eventId of ['t1', 't2-1', 't2-2']) {
      const event = findPhase1Event(eventId)
      if (event === undefined) throw new Error(eventId)
      expect(rollEventVariants(event, rng)).toEqual({})
    }
  })

  it('이장 이벤트는 선택지마다 변이를 굴려 저장한다', () => {
    const event = findPhase1Event('villageChief')
    if (event === undefined) throw new Error('villageChief')

    const variants = rollEventVariants(event, createSeededRng(99))
    expect(Object.keys(variants).sort()).toEqual(['chief-a', 'chief-b', 'chief-c'])
    for (const choice of event.choices) {
      expect(Object.values(VARIANT_KIND)).toContain(variants[choice.id])
    }
  })

  it('변이 표에 없는 선택지는 평으로 취급한다', () => {
    expect(variantOf({}, 't1-a')).toBe(VARIANT_KIND.PLAIN)
  })
})
