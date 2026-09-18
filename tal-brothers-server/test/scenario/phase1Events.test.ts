import { describe, expect, it } from 'vitest'
import { ASSET_KEY, ATTRIBUTE, GAME_PHASE, JUDGMENT_KIND } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../src/scenario/gameConfig'
import { PHASE1_EVENTS, findPhase1Event } from '../../src/scenario/phase1Events'
import { EFFECT_CATEGORY } from '../../src/scenario/constants/effectCategory'
import { EFFECT_KIND } from '../../src/scenario/constants/effectKind'
import { hasJudgment } from '../../src/scenario/scenarioTypes'
import type { Choice, Effect, ScenarioEvent } from '../../src/scenario/scenarioTypes'

const ASSET_KEY_VALUES: string[] = Object.values(ASSET_KEY)

function allChoices(): { event: ScenarioEvent; choice: Choice }[] {
  return PHASE1_EVENTS.flatMap((event) => event.choices.map((choice) => ({ event, choice })))
}

function allEffects(choice: Choice): Effect[] {
  return hasJudgment(choice) ? [...choice.success, ...choice.failure] : choice.resolve
}

describe('PHASE1_EVENTS 무결성', () => {
  it('이벤트 4개가 룰북 §12 고정 순서로 들어 있고 id가 중복되지 않는다', () => {
    expect(PHASE1_EVENTS.map((event) => event.id)).toEqual(['t1', 't2-1', 't2-2', 'villageChief'])
    expect(new Set(PHASE1_EVENTS.map((event) => event.id)).size).toBe(PHASE1_EVENTS.length)
    expect(PHASE1_EVENTS.every((event) => event.phase === GAME_PHASE.PHASE_1)).toBe(true)
  })

  it('이벤트 안에서 선택지 id가 중복되지 않는다', () => {
    for (const event of PHASE1_EVENTS) {
      const ids = event.choices.map((choice) => choice.id)
      expect(new Set(ids).size, `${event.id}의 선택지 id 중복`).toBe(ids.length)
    }
  })

  it('개인·비공개 판정에는 속성 태그가 있고 협동 판정에는 없다 (룰북 §5.2)', () => {
    for (const { event, choice } of allChoices()) {
      if (!hasJudgment(choice)) continue
      const judgment = choice.judgment
      const label = `${event.id}/${choice.id}`
      if (judgment.kind === JUDGMENT_KIND.COOP) {
        expect(judgment, label).not.toHaveProperty('attribute')
      } else {
        expect(Object.values(ATTRIBUTE), label).toContain(judgment.attribute)
      }
    }
  })

  it('원본 성공 기준이 4~6 범위 안에 있다 (룰북 §19)', () => {
    for (const { event, choice } of allChoices()) {
      if (!hasJudgment(choice)) continue
      const label = `${event.id}/${choice.id}`
      expect(choice.judgment.threshold, label).toBeGreaterThanOrEqual(GAME_CONFIG.thresholdBase)
      expect(choice.judgment.threshold, label).toBeLessThanOrEqual(GAME_CONFIG.thresholdMax)
    }
  })

  it('변이는 이장 이벤트에만 적용된다 (룰북 §6.3)', () => {
    const applied = PHASE1_EVENTS.filter((event) => event.variantApplied).map((event) => event.id)
    expect(applied).toEqual(['villageChief'])
  })

  it('튜토리얼 이벤트에는 잠식 페널티 효과가 없다 (룰북 §12)', () => {
    const tutorialIds = PHASE1_EVENTS.filter((event) => event.isTutorial).map((event) => event.id)
    expect(tutorialIds).toEqual(['t1', 't2-1', 't2-2'])

    for (const { event, choice } of allChoices()) {
      if (!event.isTutorial) continue
      const erosionPenalties = allEffects(choice).filter(
        (effect) =>
          effect.category === EFFECT_CATEGORY.PENALTY && effect.kind === EFFECT_KIND.EROSION,
      )
      expect(erosionPenalties, `${event.id}/${choice.id}`).toEqual([])
    }
  })

  it('튜토리얼 이벤트에는 시간 페널티 효과도 없다 (룰북 §12)', () => {
    for (const { event, choice } of allChoices()) {
      if (!event.isTutorial) continue
      const timePenalties = allEffects(choice).filter(
        (effect) => effect.kind === EFFECT_KIND.TIME_DELTA,
      )
      expect(timePenalties, `${event.id}/${choice.id}`).toEqual([])
    }
  })

  it('모든 효과에 분류가 있고 teamModifier는 reward/penalty만 가진다 (아키 §5.4)', () => {
    const categories: string[] = Object.values(EFFECT_CATEGORY)
    const teamModifierCategories: string[] = [EFFECT_CATEGORY.REWARD, EFFECT_CATEGORY.PENALTY]

    for (const { event, choice } of allChoices()) {
      for (const effect of allEffects(choice)) {
        const label = `${event.id}/${choice.id}/${effect.kind}`
        expect(categories, label).toContain(effect.category)
        if (effect.kind === EFFECT_KIND.TEAM_MODIFIER) {
          expect(teamModifierCategories, label).toContain(effect.category)
        }
      }
    }
  })

  it('투표를 생략하는 이벤트는 선택지가 정확히 1개다 (룰북 §12)', () => {
    for (const event of PHASE1_EVENTS) {
      if (event.skipVoting) {
        expect(event.choices.length, event.id).toBe(1)
      } else {
        expect(event.choices.length, event.id).toBeGreaterThan(1)
      }
    }
  })

  it('에셋 키가 ASSET_KEY 값이고 Phase 1 배경은 초가 마을, 이장 탈은 광대탈이다 (룰북 §18)', () => {
    for (const event of PHASE1_EVENTS) {
      expect(ASSET_KEY_VALUES, event.id).toContain(event.backgroundAsset)
      expect(event.backgroundAsset, event.id).toBe(ASSET_KEY.BG_THATCHED_VILLAGE)
      if (event.maskAsset !== undefined) {
        expect(ASSET_KEY_VALUES, event.id).toContain(event.maskAsset)
      }
    }

    expect(findPhase1Event('villageChief')?.maskAsset).toBe(ASSET_KEY.MASK_CLOWN)

    const withoutMask = PHASE1_EVENTS.filter((event) => event.maskAsset === undefined).map(
      (event) => event.id,
    )
    expect(withoutMask).toEqual(['t1', 't2-1', 't2-2'])
  })

  it('튜토리얼 부적은 T1에서만 지급한다 (룰북 §9.2)', () => {
    const granting = PHASE1_EVENTS.filter((event) => event.grantsTutorialTalisman).map(
      (event) => event.id,
    )
    expect(granting).toEqual(['t1'])
  })

  it('이장 B·C의 강제 성공 결과가 룰북 §3.2 표와 일치한다', () => {
    const chief = findPhase1Event('villageChief')
    expect(chief).toBeDefined()

    // 강제 성공: 성공 결과에서 reward를 제거하고 sideEffect만 남긴다 (룰북 §3.2, 아키 §5.4)
    const forcedSuccessEffects = (choiceId: string): Effect[] => {
      const choice = chief?.choices.find((candidate) => candidate.id === choiceId)
      if (choice === undefined || !hasJudgment(choice)) {
        throw new Error(`판정 선택지를 찾지 못했다: ${choiceId}`)
      }
      return choice.success.filter((effect) => effect.category !== EFFECT_CATEGORY.REWARD)
    }

    // 이장 B: 부적 없음, 판정자 +5% 적용
    expect(forcedSuccessEffects('chief-b')).toEqual([
      {
        category: EFFECT_CATEGORY.SIDE_EFFECT,
        kind: EFFECT_KIND.EROSION,
        target: 'roller',
        deltaPercent: 5,
      },
    ])

    // 이장 C: 버프 없음, 전원 +10% 적용
    expect(forcedSuccessEffects('chief-c')).toEqual([
      {
        category: EFFECT_CATEGORY.SIDE_EFFECT,
        kind: EFFECT_KIND.EROSION,
        target: 'all',
        deltaPercent: 10,
      },
    ])
  })

  it('잠식도 효과는 모두 5% 단위다 (룰북 §4.1)', () => {
    for (const { event, choice } of allChoices()) {
      for (const effect of allEffects(choice)) {
        if (effect.kind !== EFFECT_KIND.EROSION) continue
        expect(effect.deltaPercent % 5, `${event.id}/${choice.id}`).toBe(0)
      }
    }
  })
})

describe('GAME_CONFIG', () => {
  it('룰북 §19 설정값 전 항목을 룰북과 같은 값으로 보유한다', () => {
    expect(GAME_CONFIG.gameClockMinutes).toBe(100)
    expect(GAME_CONFIG.endingBufferMinutes).toBe(20)
    expect(GAME_CONFIG.eventIntroSeconds).toBe(30)
    expect(GAME_CONFIG.votingSeconds).toBe(180)
    expect(GAME_CONFIG.rollRevealSeconds).toBe(3)
    expect(GAME_CONFIG.practiceInterventionSeconds).toBe(12)
    expect(GAME_CONFIG.interventionRerollSeconds).toBe(4)
    expect(GAME_CONFIG.interventionTalismanSeconds).toBe(4)
    expect(GAME_CONFIG.interventionForceSeconds).toBe(4)
    expect(GAME_CONFIG.inputGraceMs).toBe(300)
    expect(GAME_CONFIG.talismanWindowSeconds).toBe(8)
    expect(GAME_CONFIG.redMessageSeconds).toBe(3)
    expect(GAME_CONFIG.phase3TruncateMinutes).toBe(10)

    expect(GAME_CONFIG.environmentErosionPercent).toBe(5)
    expect(GAME_CONFIG.phase2EntryNoTalismanPercent).toBe(20)
    expect(GAME_CONFIG.hiddenJudgmentCostPercent).toBe(10)
    expect(GAME_CONFIG.forceSuccessCostPercent).toBe(15)
    expect(GAME_CONFIG.talismanHealPercent).toBe(10)
    expect(GAME_CONFIG.phase3TargetThresholdPercent).toBe(30)

    expect(GAME_CONFIG.thresholdBase).toBe(4)
    expect(GAME_CONFIG.thresholdHard).toBe(5)
    expect(GAME_CONFIG.coopThreshold).toBe(5)
    expect(GAME_CONFIG.coopBossThreshold).toBe(6)
    expect(GAME_CONFIG.debuffFloor).toBe(-2)

    expect(GAME_CONFIG.talismanLimit).toBe(2)

    expect(GAME_CONFIG.variantWeights).toEqual({ ill: 30, plain: 50, bless: 20 })
    expect(GAME_CONFIG.illThresholdDelta).toBe(1)
    expect(GAME_CONFIG.illPenaltyDeltaPercent).toBe(10)
    expect(GAME_CONFIG.illTimeDeltaMinutes).toBe(5)
    expect(GAME_CONFIG.blessPenaltyDeltaPercent).toBe(-10)
    expect(GAME_CONFIG.blessTimeDeltaMinutes).toBe(-5)
    expect(GAME_CONFIG.blessTalismanStep).toBe(1)
    expect(GAME_CONFIG.blessHealStepPercent).toBe(5)
    expect(GAME_CONFIG.thresholdMax).toBe(6)
    expect(GAME_CONFIG.hiddenThresholdMin).toBe(2)

    expect(GAME_CONFIG.tier30HallucinationChance).toBe(50)
    expect(GAME_CONFIG.tier30TruthRatio).toBe(30)
    expect(GAME_CONFIG.tier60FakeLabelChance).toBe(30)
    expect(GAME_CONFIG.fakeRedMessageChance).toBe(20)
  })

  it('아키텍처 §8 운영 설정값 3항목과 봇 부적 판단 지연을 보유한다', () => {
    expect(GAME_CONFIG.autoRollSeconds).toBe(10)
    expect(GAME_CONFIG.botTakeoverSeconds).toBe(30)
    expect(GAME_CONFIG.autoPauseLimitMinutes).toBe(5)
    // 룰북 §11 (확정): 봇은 부적 단계 마감 1초 전에 판단한다
    expect(GAME_CONFIG.botTalismanDelaySeconds).toBe(1)
  })

  it('변이 발생 비율 합이 100이다 (룰북 §6.1)', () => {
    const { ill, plain, bless } = GAME_CONFIG.variantWeights
    expect(ill + plain + bless).toBe(100)
  })
})
