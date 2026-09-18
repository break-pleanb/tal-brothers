import { describe, expect, it } from 'vitest'
import { BROTHER_ROLE } from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

import { findPhase1Event } from '../../../src/scenario/phase1Events'
import { EFFECT_CATEGORY } from '../../../src/scenario/constants/effectCategory'
import { EFFECT_KIND } from '../../../src/scenario/constants/effectKind'
import { EFFECT_TARGET } from '../../../src/scenario/constants/effectTarget'
import { hasJudgment } from '../../../src/scenario/scenarioTypes'
import type { Effect, JudgmentChoice } from '../../../src/scenario/scenarioTypes'
import { createStepOutput } from '../../../src/engine/engineTypes'
import type { EngineContext, StepOutput } from '../../../src/engine/engineTypes'
import { createSeededRng } from '../../../src/engine/random'
import { applyEffects, resolveTargetSeats, stripRewards } from '../../../src/engine/rules/effects'
import type { EffectContext } from '../../../src/engine/rules/effects'
import { createGame, seatSetupForHumans } from '../../../src/engine/state/createGame'
import type { GameState } from '../../../src/engine/state/gameState'

const NOW = 1_700_000_000_000

function makeState(humanCount = 3): GameState {
  const result = createGame(
    { roomCode: 'TEST', seats: seatSetupForHumans(humanCount) },
    { now: NOW, rng: createSeededRng(1) },
  )
  if (result.rejected) throw new Error('게임 생성 실패')
  return result.state
}

function chiefChoice(choiceId: string): JudgmentChoice {
  const choice = findPhase1Event('villageChief')?.choices.find(
    (candidate) => candidate.id === choiceId,
  )
  if (choice === undefined || !hasJudgment(choice)) {
    throw new Error(`판정 선택지를 찾지 못했다: ${choiceId}`)
  }
  return choice
}

function contextFor(roller: BrotherRole = BROTHER_ROLE.THIRD): EffectContext {
  return {
    rollerSeat: roller,
    coopTopSeat: null,
    submitterSeat: null,
    eventId: 'villageChief',
    nextEventId: null,
  }
}

/** 효과 적용에 필요한 엔진 컨텍스트와 출력 (M2에서 인자가 늘었다) */
function engineContext(): EngineContext {
  return { now: NOW, rng: createSeededRng(7) }
}

function apply(state: GameState, effects: Effect[], context: EffectContext): StepOutput {
  const out = createStepOutput()
  applyEffects(state, effects, context, engineContext(), out)
  return out
}

describe('강제 성공 (룰북 §3.2)', () => {
  it('이장 B — 부적 없음, 판정자 +5% 적용', () => {
    const state = makeState()
    const effects = stripRewards(chiefChoice('chief-b').success)
    apply(state, effects, contextFor(BROTHER_ROLE.THIRD))

    expect(state.seats[BROTHER_ROLE.THIRD].talismanCount).toBe(0)
    expect(state.seats[BROTHER_ROLE.THIRD].erosionPercent).toBe(5)
    expect(state.seats[BROTHER_ROLE.FIRST].erosionPercent).toBe(0)
  })

  it('이장 C — 버프 없음, 전원 +10% 적용', () => {
    const state = makeState()
    const effects = stripRewards(chiefChoice('chief-c').success)
    apply(state, effects, contextFor(BROTHER_ROLE.FIRST))

    expect(state.teamModifier).toBe(0)
    expect(state.seats[BROTHER_ROLE.FIRST].erosionPercent).toBe(10)
    expect(state.seats[BROTHER_ROLE.SECOND].erosionPercent).toBe(10)
    expect(state.seats[BROTHER_ROLE.THIRD].erosionPercent).toBe(10)
  })

  it('강제 성공이 아니면 보상이 그대로 적용된다', () => {
    const state = makeState()
    apply(state, chiefChoice('chief-b').success, contextFor(BROTHER_ROLE.THIRD))

    expect(state.seats[BROTHER_ROLE.THIRD].talismanCount).toBe(1)
    expect(state.seats[BROTHER_ROLE.THIRD].erosionPercent).toBe(5)
  })
})

describe('효과 대상 (룰북 §4.1, §5.3)', () => {
  it('roller는 판정자 1명에게만 적용된다', () => {
    expect(resolveTargetSeats(EFFECT_TARGET.ROLLER, contextFor(BROTHER_ROLE.SECOND), engineContext())).toEqual([
      BROTHER_ROLE.SECOND,
    ])
  })

  it('all은 봇을 포함한 3좌석 전원이다', () => {
    const state = makeState(1)
    const effect: Effect = {
      category: EFFECT_CATEGORY.SIDE_EFFECT,
      kind: EFFECT_KIND.EROSION,
      target: EFFECT_TARGET.ALL,
      deltaPercent: 10,
    }
    apply(state, [effect], contextFor(BROTHER_ROLE.FIRST))

    expect(state.seats[BROTHER_ROLE.SECOND].isBot).toBe(true)
    expect(state.seats[BROTHER_ROLE.THIRD].isBot).toBe(true)
    for (const role of [BROTHER_ROLE.FIRST, BROTHER_ROLE.SECOND, BROTHER_ROLE.THIRD]) {
      expect(state.seats[role].erosionPercent).toBe(10)
    }
  })

  it('coopTopRoller는 협동 판정의 보상 수령자에게 적용된다', () => {
    const state = makeState()
    const effect: Effect = {
      category: EFFECT_CATEGORY.REWARD,
      kind: EFFECT_KIND.TALISMAN,
      target: EFFECT_TARGET.COOP_TOP_ROLLER,
      count: 1,
    }
    apply(state, [effect], {
      rollerSeat: null,
      coopTopSeat: BROTHER_ROLE.SECOND,
      submitterSeat: null,
      eventId: 't2-1',
      nextEventId: null,
    })

    expect(state.seats[BROTHER_ROLE.SECOND].talismanCount).toBe(1)
    expect(state.seats[BROTHER_ROLE.FIRST].talismanCount).toBe(0)
  })

  it('해석할 좌석이 없으면 예외를 던진다', () => {
    expect(() =>
      resolveTargetSeats(
        EFFECT_TARGET.ROLLER,
        {
          rollerSeat: null,
          coopTopSeat: null,
          submitterSeat: null,
          eventId: 't2-1',
          nextEventId: null,
        },
        engineContext(),
      ),
    ).toThrow()
  })
})

describe('팀 플래그와 시간 (룰북 §2.1, §5.5)', () => {
  it('teamModifier 효과가 합산되고 하한 -2를 넘지 않는다', () => {
    const state = makeState()
    const debuff: Effect = {
      category: EFFECT_CATEGORY.PENALTY,
      kind: EFFECT_KIND.TEAM_MODIFIER,
      delta: -1,
    }
    apply(state, [debuff, debuff, debuff], contextFor())

    expect(state.teamModifier).toBe(-2)
    expect(state.notices.filter((notice) => notice.kind === 'anonymousModifier')).toHaveLength(3)
  })

  it('timeDelta가 게임 시계 마감 시각에 반영된다', () => {
    const state = makeState()
    const before = state.clock.deadlineAt

    apply(
      state,
      [
        {
          category: EFFECT_CATEGORY.PENALTY,
          kind: EFFECT_KIND.TIME_DELTA,
          minutes: -5,
        },
      ],
      contextFor(),
    )

    expect(state.clock.deadlineAt).toBe(before - 5 * 60_000)
  })
})
