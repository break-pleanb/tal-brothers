import { describe, expect, it } from 'vitest'
import { BROTHER_ROLE, GAME_STEP, JUDGMENT_KIND } from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../../src/scenario/gameConfig'
import { REJECTION_REASON } from '../../../src/engine/engineTypes'
import { judgmentFinalValue } from '../../../src/engine/steps/rollStep'
import {
  HIGH,
  LOW,
  judgment,
  roll,
  startGame as start,
  vote,
  voteAll,
} from '../../support/gameDriver'

describe('판정자 결정 (룰북 §3.1)', () => {
  const cases: { choiceId: string; roller: BrotherRole }[] = [
    { choiceId: 'chief-a', roller: BROTHER_ROLE.SECOND },
    { choiceId: 'chief-b', roller: BROTHER_ROLE.THIRD },
    { choiceId: 'chief-c', roller: BROTHER_ROLE.FIRST },
  ]

  for (const { choiceId, roller } of cases) {
    it(`${choiceId}의 판정자는 ${roller}다`, () => {
      const game = start(3, LOW)
      game.tickUntilEvent('villageChief', GAME_STEP.VOTING)
      voteAll(game, choiceId, [BROTHER_ROLE.FIRST, BROTHER_ROLE.SECOND, BROTHER_ROLE.THIRD])

      expect(game.state.currentEvent?.rollerSeat).toBe(roller)
      expect(judgment(game).dice.map((die) => die.seat)).toEqual([roller])
    })
  }

  it('판정자가 봇이어도 그 형제가 굴린다', () => {
    const game = start(1, LOW)
    game.tickUntilEvent('villageChief', GAME_STEP.VOTING)
    game.send(BROTHER_ROLE.FIRST, vote('chief-b'))

    expect(game.state.seats[BROTHER_ROLE.THIRD].isBot).toBe(true)
    expect(game.state.currentEvent?.rollerSeat).toBe(BROTHER_ROLE.THIRD)
    // 봇 주사위는 진입 즉시 굴러 곧바로 연출 단계로 넘어간다
    expect(game.state.progress.step).toBe(GAME_STEP.ROLL_REVEAL)
    expect(judgment(game).dice[0]?.value).not.toBeNull()
  })

  it('판정자가 아닌 좌석의 굴림 요청은 거절된다', () => {
    const game = start(3, LOW)
    game.tickUntil(GAME_STEP.VOTING)
    voteAll(game, 't1-a', [BROTHER_ROLE.FIRST, BROTHER_ROLE.SECOND, BROTHER_ROLE.THIRD])
    expect(game.state.progress.step).toBe(GAME_STEP.ROLL_WAIT)

    const result = game.send(BROTHER_ROLE.SECOND, roll)
    expect(result.rejected && result.reason).toBe(REJECTION_REASON.WRONG_SEAT)
  })

  it('이미 굴린 주사위를 다시 요청하면 거절된다', () => {
    const game = start(3, LOW)
    game.tickUntil(GAME_STEP.VOTING)
    voteAll(game, 't1-a', [BROTHER_ROLE.FIRST, BROTHER_ROLE.SECOND, BROTHER_ROLE.THIRD])

    expect(game.send(BROTHER_ROLE.FIRST, roll).rejected).toBe(false)
    expect(game.state.progress.step).toBe(GAME_STEP.ROLL_REVEAL)
  })
})

describe('자동 굴림 (아키 §8)', () => {
  it('10초가 지나면 서버가 대신 굴린다', () => {
    const game = start(3, LOW)
    game.tickUntil(GAME_STEP.VOTING)
    voteAll(game, 't1-a', [BROTHER_ROLE.FIRST, BROTHER_ROLE.SECOND, BROTHER_ROLE.THIRD])

    expect(game.state.progress.stepDeadlineAt).toBe(game.now + GAME_CONFIG.autoRollSeconds * 1000)
    expect(judgment(game).dice[0]?.value).toBeNull()

    game.tick()
    expect(game.state.progress.step).toBe(GAME_STEP.ROLL_REVEAL)
    expect(judgment(game).dice[0]?.value).not.toBeNull()
  })

  it('판정 연출은 3초 뒤에 넘어간다 (룰북 §19)', () => {
    const game = start(3, LOW)
    game.tickUntil(GAME_STEP.VOTING)
    voteAll(game, 't1-a', [BROTHER_ROLE.FIRST, BROTHER_ROLE.SECOND, BROTHER_ROLE.THIRD])
    game.send(BROTHER_ROLE.FIRST, roll)

    expect(game.state.progress.step).toBe(GAME_STEP.ROLL_REVEAL)
    expect(game.state.progress.stepDeadlineAt).toBe(
      game.now + GAME_CONFIG.rollRevealSeconds * 1000,
    )
  })
})

describe('협동 판정 (룰북 §5.2, §5.3)', () => {
  it('3좌석이 모두 굴리고 최고값을 쓰며 직업 보정이 없다', () => {
    const game = start(3, LOW)
    game.tickUntilEvent('t2-1', GAME_STEP.ROLL_WAIT)

    const state = judgment(game)
    expect(state.kind).toBe(JUDGMENT_KIND.COOP)
    expect(state.dice.map((die) => die.seat)).toEqual([
      BROTHER_ROLE.FIRST,
      BROTHER_ROLE.SECOND,
      BROTHER_ROLE.THIRD,
    ])
    expect(state.roleBonus).toBe(0)
    expect(state.threshold).toBe(GAME_CONFIG.coopThreshold)

    game.send(BROTHER_ROLE.FIRST, roll)
    game.setRng(HIGH)
    game.send(BROTHER_ROLE.SECOND, roll)
    game.setRng(LOW)
    game.send(BROTHER_ROLE.THIRD, roll)

    expect(game.state.progress.step).toBe(GAME_STEP.ROLL_REVEAL)
    const rolled = judgment(game)
    const values = rolled.dice.map((die) => die.value ?? 0)
    expect(values).toEqual([1, 6, 1])
    expect(judgmentFinalValue(rolled)).toBe(6)
    expect(rolled.succeeded).toBe(true)
  })

  it('봇 주사위는 진입 즉시, 인간 미입력분은 10초 후 자동으로 굴린다', () => {
    const game = start(1, LOW)
    game.tickUntilEvent('t2-1', GAME_STEP.ROLL_WAIT)

    const state = judgment(game)
    expect(state.dice.find((die) => die.seat === BROTHER_ROLE.FIRST)?.value).toBeNull()
    expect(state.dice.find((die) => die.seat === BROTHER_ROLE.SECOND)?.value).not.toBeNull()
    expect(state.dice.find((die) => die.seat === BROTHER_ROLE.THIRD)?.value).not.toBeNull()

    game.tick()
    expect(judgment(game).dice.every((die) => die.value !== null)).toBe(true)
  })
})

describe('비공개 판정 (룰북 §5.4, §7.1)', () => {
  it('개입 창 없이 결과로 직행한다', () => {
    const game = start(3, LOW)
    game.tickUntilEvent('t2-2', GAME_STEP.VOTING)
    voteAll(game, 't2-2-a', [BROTHER_ROLE.FIRST, BROTHER_ROLE.SECOND, BROTHER_ROLE.THIRD])

    game.send(BROTHER_ROLE.THIRD, roll)
    expect(game.state.progress.step).toBe(GAME_STEP.ROLL_REVEAL)
    expect(judgment(game).succeeded).toBe(false)

    game.tick()
    // RESOLUTION은 타이머 없이 다음 이벤트로 넘어간다
    expect(game.state.progress.step).toBe(GAME_STEP.EVENT_INTRO)
    expect(game.state.currentEvent?.eventId).toBe('villageChief')
  })

  it('대가 +10%는 성패와 무관하게 적용된다', () => {
    for (const [label, rng] of [
      ['실패', LOW],
      ['성공', HIGH],
    ] as const) {
      const game = start(3, LOW)
      game.tickUntilEvent('t2-2', GAME_STEP.VOTING)
      voteAll(game, 't2-2-a', [BROTHER_ROLE.FIRST, BROTHER_ROLE.SECOND, BROTHER_ROLE.THIRD])

      game.setRng(rng)
      game.send(BROTHER_ROLE.THIRD, roll)
      const succeeded = judgment(game).succeeded
      expect(succeeded, label).toBe(rng === HIGH)

      game.tick()
      expect(game.state.seats[BROTHER_ROLE.THIRD].erosionPercent, label).toBe(
        GAME_CONFIG.hiddenJudgmentCostPercent,
      )
    }
  })

  it('비공개 판정도 담당 속성 +1을 받는다 (룰북 §3.1)', () => {
    const game = start(3, LOW)
    game.tickUntilEvent('t2-2', GAME_STEP.VOTING)
    voteAll(game, 't2-2-a', [BROTHER_ROLE.FIRST, BROTHER_ROLE.SECOND, BROTHER_ROLE.THIRD])

    expect(judgment(game).kind).toBe(JUDGMENT_KIND.HIDDEN)
    expect(judgment(game).roleBonus).toBe(1)
  })
})
