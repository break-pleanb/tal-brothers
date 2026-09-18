import { describe, expect, it } from 'vitest'
import { ASSET_KEY, ATTRIBUTE, GAME_PHASE, JUDGMENT_KIND } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../src/scenario/gameConfig'
import { EFFECT_CATEGORY } from '../../src/scenario/constants/effectCategory'
import { EFFECT_KIND } from '../../src/scenario/constants/effectKind'
import { EFFECT_TARGET } from '../../src/scenario/constants/effectTarget'
import {
  PHASE2_BOSS,
  PHASE2_BRANCH,
  PHASE2_EVENTS,
  PHASE2_POOL,
  findPhase2Event,
} from '../../src/scenario/phase2Events'
import {
  hasAttribute,
  hasJudgment,
  isRollJudgment,
  variantApplies,
} from '../../src/scenario/scenarioTypes'
import type { Choice, Effect, ScenarioEvent } from '../../src/scenario/scenarioTypes'
import { isBoostableReward } from '../../src/engine/rules/variant'
import { stripRewards } from '../../src/engine/rules/effects'

/** 룰북 §13의 Phase 2 데이터 무결성 (M2 계획 9절) */

function allChoices(): { event: ScenarioEvent; choice: Choice }[] {
  return PHASE2_EVENTS.flatMap((event) => event.choices.map((choice) => ({ event, choice })))
}

function effectsOf(choice: Choice): Effect[] {
  return hasJudgment(choice) ? [...choice.success, ...choice.failure] : choice.resolve
}

describe('Phase 2 이벤트 구성 (룰북 §13.3, §13.5)', () => {
  it('풀 14개, 보스 1개, 분기 1개로 이루어지고 id가 중복되지 않는다', () => {
    expect(PHASE2_POOL).toHaveLength(14)
    expect(PHASE2_BOSS.isBoss).toBe(true)
    expect(PHASE2_BRANCH.id).toBe('branch')

    const ids = PHASE2_EVENTS.map((event) => event.id)
    expect(ids).toHaveLength(16)
    expect(new Set(ids).size).toBe(ids.length)
    for (const event of PHASE2_EVENTS) {
      expect(event.phase).toBe(GAME_PHASE.PHASE_2)
      expect(findPhase2Event(event.id)).toBe(event)
    }
  })

  it('풀의 이벤트 id가 p2-01 ~ p2-14다', () => {
    expect(PHASE2_POOL.map((event) => event.id)).toEqual([
      'p2-01',
      'p2-02',
      'p2-03',
      'p2-04',
      'p2-05',
      'p2-06',
      'p2-07',
      'p2-08',
      'p2-09',
      'p2-10',
      'p2-11',
      'p2-12',
      'p2-13',
      'p2-14',
    ])
  })

  it('이벤트 안에서 선택지 id가 중복되지 않고 모든 효과에 분류가 있다 (아키 §5.4)', () => {
    const categories: string[] = Object.values(EFFECT_CATEGORY)

    for (const event of PHASE2_EVENTS) {
      const ids = event.choices.map((choice) => choice.id)
      expect(new Set(ids).size, `${event.id} 선택지 id 중복`).toBe(ids.length)

      for (const choice of event.choices) {
        for (const effect of effectsOf(choice)) {
          expect(categories, `${event.id}/${choice.id}`).toContain(effect.category)
        }
      }
    }
  })
})

describe('판정 사양 (룰북 §5.2, §5.3, §19)', () => {
  it('개인·비공개 판정에는 속성 태그가 있고 협동·아이템 판정에는 없다', () => {
    for (const { event, choice } of allChoices()) {
      if (!hasJudgment(choice)) continue
      const label = `${event.id}/${choice.id}`
      const judgment = choice.judgment

      if (judgment.kind === JUDGMENT_KIND.SOLO || judgment.kind === JUDGMENT_KIND.HIDDEN) {
        expect(hasAttribute(judgment), label).toBe(true)
        expect(Object.values(ATTRIBUTE), label).toContain(
          hasAttribute(judgment) ? judgment.attribute : null,
        )
      } else {
        expect(judgment, label).not.toHaveProperty('attribute')
      }
    }
  })

  it('협동 판정 기준이 일반 5, 보스 6이다 (룰북 §5.3)', () => {
    for (const { event, choice } of allChoices()) {
      if (!hasJudgment(choice)) continue
      if (choice.judgment.kind !== JUDGMENT_KIND.COOP) continue

      expect(choice.judgment.threshold, `${event.id}/${choice.id}`).toBe(
        event.isBoss ? GAME_CONFIG.coopBossThreshold : GAME_CONFIG.coopThreshold,
      )
    }
  })

  it('개인·비공개 판정 기준이 4 또는 5다 (룰북 §19)', () => {
    for (const { event, choice } of allChoices()) {
      if (!hasJudgment(choice)) continue
      if (!isRollJudgment(choice.judgment)) continue
      if (choice.judgment.kind === JUDGMENT_KIND.COOP) continue

      expect(
        [GAME_CONFIG.thresholdBase, GAME_CONFIG.thresholdHard],
        `${event.id}/${choice.id}`,
      ).toContain(choice.judgment.threshold)
    }
  })

  it('14A만 아이템 판정이고 변이 적용에서 빠진다 (룰북 §6.3, §13.5)', () => {
    const itemChoices = allChoices().filter(
      ({ choice }) => hasJudgment(choice) && choice.judgment.kind === JUDGMENT_KIND.ITEM,
    )

    expect(itemChoices).toHaveLength(1)
    const only = itemChoices[0]
    expect(only?.event.id).toBe('p2-14')
    expect(only?.choice.id).toBe('p2-14-a')
    expect(only?.choice.variantExempt).toBe(true)
    if (only !== undefined) {
      expect(variantApplies(only.event, only.choice)).toBe(false)
    }
  })

  it('14A를 뺀 모든 선택지에 변이가 적용된다 (룰북 §6.3)', () => {
    for (const { event, choice } of allChoices()) {
      const exempt = event.id === 'p2-14' && choice.id === 'p2-14-a'
      expect(variantApplies(event, choice), `${event.id}/${choice.id}`).toBe(!exempt)
    }
  })
})

describe('환경 잠식 대상 (룰북 §4.2)', () => {
  it('풀과 보스는 환경 잠식 대상이고 분기는 아니다', () => {
    for (const event of PHASE2_POOL) {
      expect(event.environmentErosion, event.id).toBe(true)
    }
    expect(PHASE2_BOSS.environmentErosion).toBe(true)
    expect(PHASE2_BRANCH.environmentErosion).toBe(false)
  })
})

describe('보상과 페널티 수치 (룰북 §4.1, §6.2, §9.3)', () => {
  it('잠식 효과 값이 모두 5% 단위다', () => {
    for (const { event, choice } of allChoices()) {
      for (const effect of effectsOf(choice)) {
        if (effect.kind !== EFFECT_KIND.EROSION) continue
        // 음수 회복은 -0이 나오므로 나머지 비교를 불리언으로 본다
        expect(effect.deltaPercent % 5 === 0, `${event.id}/${choice.id}`).toBe(true)
      }
    }
  })

  it('옥비녀 보상은 분기 B 성공에만 있고 길 변이로 증가하지 않는다', () => {
    const jadeEffects = allChoices().flatMap(({ event, choice }) =>
      effectsOf(choice)
        .filter((effect) => effect.kind === EFFECT_KIND.JADE_HAIRPIN)
        .map((effect) => ({ event, choice, effect })),
    )

    expect(jadeEffects).toHaveLength(1)
    expect(jadeEffects[0]?.event.id).toBe('branch')
    expect(jadeEffects[0]?.choice.id).toBe('branch-b')
    expect(jadeEffects[0]?.effect.category).toBe(EFFECT_CATEGORY.REWARD)
    // 증가 대상이 아니므로 길 변이는 실패 페널티 감소로 대체된다 (룰북 §6.2)
    const jade = jadeEffects[0]?.effect
    expect(jade === undefined ? true : isBoostableReward(jade)).toBe(false)
  })

  it('보스 A의 강제 성공은 부적 보상만 사라진다 (룰북 §3.2)', () => {
    const choice = PHASE2_BOSS.choices.find((candidate) => candidate.id === 'p2-15-a')
    if (choice === undefined || !hasJudgment(choice)) throw new Error('보스 A를 찾지 못했다')

    expect(choice.success.some((effect) => effect.kind === EFFECT_KIND.TALISMAN)).toBe(true)
    expect(stripRewards(choice.success)).toEqual([])
  })

  it('분기 B의 강제 성공은 옥비녀만 사라지고 전원 +10%는 남는다 (룰북 §3.2)', () => {
    const choice = PHASE2_BRANCH.choices.find((candidate) => candidate.id === 'branch-b')
    if (choice === undefined || !hasJudgment(choice)) throw new Error('분기 B를 찾지 못했다')

    const kept = stripRewards(choice.success)
    expect(kept).toHaveLength(1)
    expect(kept[0]).toEqual({
      category: EFFECT_CATEGORY.SIDE_EFFECT,
      kind: EFFECT_KIND.EROSION,
      target: EFFECT_TARGET.ALL,
      deltaPercent: 10,
    })
  })

  it('15B 성공은 판정자를 제외한 전원을 회복시킨다 (룰북 §13.5)', () => {
    const choice = PHASE2_BOSS.choices.find((candidate) => candidate.id === 'p2-15-b')
    if (choice === undefined || !hasJudgment(choice)) throw new Error('보스 B를 찾지 못했다')

    expect(choice.success).toEqual([
      {
        category: EFFECT_CATEGORY.REWARD,
        kind: EFFECT_KIND.EROSION,
        target: EFFECT_TARGET.ALL_EXCEPT_ROLLER,
        deltaPercent: -10,
      },
    ])
  })

  it('14A는 제출자 회복과 무작위 좌석 페널티를 가진다 (룰북 §13.5)', () => {
    const event = findPhase2Event('p2-14')
    const choice = event?.choices.find((candidate) => candidate.id === 'p2-14-a')
    if (choice === undefined || !hasJudgment(choice)) throw new Error('14A를 찾지 못했다')

    expect(choice.success).toEqual([
      {
        category: EFFECT_CATEGORY.REWARD,
        kind: EFFECT_KIND.EROSION,
        target: EFFECT_TARGET.SUBMITTER,
        deltaPercent: -15,
      },
    ])
    expect(choice.failure).toEqual([
      {
        category: EFFECT_CATEGORY.PENALTY,
        kind: EFFECT_KIND.EROSION,
        target: EFFECT_TARGET.RANDOM_SEAT,
        deltaPercent: 10,
      },
    ])
  })
})

describe('에셋 매핑 (룰북 §18)', () => {
  it('모든 배경·탈 키가 ASSET_KEY 값이다', () => {
    const keys: string[] = Object.values(ASSET_KEY)
    for (const event of PHASE2_EVENTS) {
      expect(keys, event.id).toContain(event.backgroundAsset)
      if (event.maskAsset !== undefined) {
        expect(keys, event.id).toContain(event.maskAsset)
      }
    }
  })

  it('탈과 배경이 §18 매핑과 일치한다', () => {
    const masks = new Map(
      PHASE2_EVENTS.filter((event) => event.maskAsset !== undefined).map((event) => [
        event.id,
        event.maskAsset,
      ]),
    )

    expect(masks.get('p2-01')).toBe(ASSET_KEY.MASK_COMMON_A)
    expect(masks.get('p2-03')).toBe(ASSET_KEY.MASK_CLOWN)
    expect(masks.get('p2-10')).toBe(ASSET_KEY.MASK_COMMON_B)
    expect(masks.get('p2-15')).toBe(ASSET_KEY.MASK_BOSS)
    expect(masks.size).toBe(4)

    // 요괴화 탈은 붉은 메시지와 엔딩 전용이라 이벤트에 쓰지 않는다 (룰북 §18)
    for (const event of PHASE2_EVENTS) {
      expect(event.maskAsset, event.id).not.toBe(ASSET_KEY.MASK_CORRUPTED)
    }

    expect(findPhase2Event('p2-07')?.backgroundAsset).toBe(ASSET_KEY.BG_BLOODY_SHRINE)
    for (const event of PHASE2_POOL) {
      if (event.id === 'p2-07') continue
      expect(event.backgroundAsset, event.id).toBe(ASSET_KEY.BG_DANGSAN_FOREST)
    }
  })
})
