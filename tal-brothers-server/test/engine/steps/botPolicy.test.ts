import { describe, expect, it } from 'vitest'
import { BROTHER_ROLE, COMMAND_TYPE, GAME_STEP } from 'tal-brothers-shared'
import type { BrotherRole, Command, GameStep } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../../src/scenario/gameConfig'
import { shouldBotForceSuccess } from '../../../src/engine/bots/botPolicy'
import { dispatch } from '../../../src/engine/dispatch'
import { ACTION_KIND } from '../../../src/engine/engineTypes'
import type { DispatchResult, DispatchSuccess } from '../../../src/engine/engineTypes'
import type { Rng } from '../../../src/engine/random'
import { createGame, seatSetupForHumans } from '../../../src/engine/state/createGame'
import type { GameState, JudgmentState, SeatState } from '../../../src/engine/state/gameState'

const START = 1_700_000_000_000

const LOW: Rng = { nextInt: () => 0 }
/** 주사위를 `value`로 고정한다 */
const diceRng = (value: number): Rng => ({ nextInt: (bound) => (value - 1) % bound })
/** 주사위 값을 순서대로 내주고 소진되면 1을 낸다 */
function seqDiceRng(values: number[]): Rng {
  let index = 0
  return {
    nextInt(bound) {
      const value = index < values.length ? (values[index] as number) : 1
      index += 1
      return (value - 1) % bound
    },
  }
}

type SeatSetup = Record<BrotherRole, { isBot: boolean }>

function start(seats: number | SeatSetup, rng: Rng) {
  let now = START
  let last: DispatchSuccess = createGame(
    {
      roomCode: 'TEST',
      seats: typeof seats === 'number' ? seatSetupForHumans(seats) : seats,
    },
    { now, rng },
  )
  let current = rng

  return {
    get state(): GameState {
      return last.state
    },
    get last(): DispatchSuccess {
      return last
    },
    get now(): number {
      return now
    },
    setRng(next: Rng): void {
      current = next
    },
    tick(): void {
      const deadline = last.nextDeadline
      if (deadline === null) throw new Error(`타이머가 없다: ${last.state.progress.step}`)
      now = deadline.at
      const result = dispatch(
        last.state,
        {
          kind: ACTION_KIND.TIMER_EXPIRY,
          step: deadline.step,
          stateVersion: deadline.stateVersion,
        },
        { now, rng: current },
      )
      if (result.rejected) throw new Error(`타이머 거절: ${result.reason}`)
      last = result
    },
    send(seat: BrotherRole, command: Command): DispatchResult {
      const result = dispatch(
        last.state,
        { kind: ACTION_KIND.COMMAND, seat, command },
        { now, rng: current },
      )
      if (!result.rejected) last = result
      return result
    },
    tickUntil(step: GameStep, limit = 60): void {
      let count = 0
      while (last.state.progress.step !== step) {
        this.tick()
        count += 1
        if (count > limit) throw new Error(`${step}에 도달하지 못했다`)
      }
    },
    tickUntilEvent(eventId: string, step: GameStep, limit = 60): void {
      let count = 0
      while (last.state.currentEvent?.eventId !== eventId || last.state.progress.step !== step) {
        this.tick()
        count += 1
        if (count > limit) throw new Error(`${eventId}/${step}에 도달하지 못했다`)
      }
    },
  }
}

type Game = ReturnType<typeof start>

const vote = (choiceId: string): Command => ({ type: COMMAND_TYPE.VOTE_SUBMIT, choiceId })
const roll: Command = { type: COMMAND_TYPE.ROLL_REQUEST }
const useTalisman: Command = { type: COMMAND_TYPE.INTERVENTION_TALISMAN }

const ALL_SEATS: BrotherRole[] = [BROTHER_ROLE.FIRST, BROTHER_ROLE.SECOND, BROTHER_ROLE.THIRD]

function judgment(game: Game): JudgmentState {
  const value = game.state.currentJudgment
  if (value === null) throw new Error('진행 중인 판정이 없다')
  return value
}

function seat(game: Game, role: BrotherRole): SeatState {
  return game.state.seats[role]
}

describe('봇의 기본 행동 (룰북 §11)', () => {
  it('투표하지 않고 굴림만 담당한다', () => {
    const game = start(1, LOW)
    game.tickUntil(GAME_STEP.VOTING)
    // 인간 1명이 투표하면 곧바로 마감된다. 봇 표는 끝까지 들어오지 않는다
    game.send(BROTHER_ROLE.FIRST, vote('t1-b'))

    const votes = game.state.currentEvent?.votes ?? {}
    expect(votes[BROTHER_ROLE.FIRST]).toBe('t1-b')
    expect(votes[BROTHER_ROLE.SECOND]).toBeUndefined()
    expect(votes[BROTHER_ROLE.THIRD]).toBeUndefined()

    // 판정자가 봇(둘째)이라 주사위는 진입 즉시 굴러 있다
    expect(game.state.currentEvent?.rollerSeat).toBe(BROTHER_ROLE.SECOND)
    expect(judgment(game).dice.every((die) => die.value !== null)).toBe(true)
  })

  it('셋째 봇은 절대 시야를 쓰지 않는다', () => {
    const game = start(2, LOW)
    expect(seat(game, BROTHER_ROLE.THIRD).isBot).toBe(true)

    game.tickUntil(GAME_STEP.VOTING)
    game.tick()

    expect(game.state.currentEvent?.trueSightUsed).toBe(false)
    expect(seat(game, BROTHER_ROLE.THIRD).abilityUsed).toBe(false)
  })

  it('봇 잠식도는 인간과 동일하게 증감한다', () => {
    const game = start(1, LOW)
    game.tickUntilEvent('villageChief', GAME_STEP.VOTING)
    game.send(BROTHER_ROLE.FIRST, vote('chief-b'))
    expect(game.state.currentEvent?.rollerSeat).toBe(BROTHER_ROLE.THIRD)
    expect(seat(game, BROTHER_ROLE.THIRD).isBot).toBe(true)

    const before = seat(game, BROTHER_ROLE.THIRD).erosionPercent
    game.tickUntil(GAME_STEP.PHASE1_COMPLETE, 10)
    // 흉 변이가 걸린 이장 B 실패 → 판정자 +30% (앞선 비공개 판정 대가와 별개)
    expect(seat(game, BROTHER_ROLE.THIRD).erosionPercent - before).toBe(30)
  })
})

describe('둘째 봇 재굴림 (룰북 §11)', () => {
  it('개인 판정 실패 시 1단계에서 자동 재굴림한다', () => {
    const game = start(1, LOW)
    game.tickUntil(GAME_STEP.VOTING)
    game.send(BROTHER_ROLE.FIRST, vote('t1-b'))
    expect(game.state.progress.step).toBe(GAME_STEP.ROLL_REVEAL)
    expect(judgment(game).succeeded).toBe(false)

    game.tick()
    expect(
      judgment(game).interventions.filter((record) => record.kind === 'reroll'),
    ).toHaveLength(1)
  })

  it('협동 판정에서 본인 주사위가 최고값일 때만 재굴림한다', () => {
    // 둘째 4 · 셋째 2 · 첫째 1 → 기준 5에 못 미치는 실패이고 최고값이 둘째 주사위
    const topIsSecond = start(1, LOW)
    topIsSecond.tickUntilEvent('t2-1', GAME_STEP.EVENT_INTRO)
    topIsSecond.setRng(seqDiceRng([4, 2]))
    topIsSecond.tick()
    topIsSecond.setRng(diceRng(1))
    topIsSecond.send(BROTHER_ROLE.FIRST, roll)
    expect(judgment(topIsSecond).dice.map((die) => die.value)).toEqual([1, 4, 2])
    expect(judgment(topIsSecond).succeeded).toBe(false)

    topIsSecond.setRng(diceRng(3))
    topIsSecond.tick()
    expect(judgment(topIsSecond).dice.map((die) => die.value)).toEqual([1, 3, 2])
    expect(
      judgment(topIsSecond).interventions.filter((record) => record.kind === 'reroll'),
    ).toHaveLength(1)

    // 둘째 2 · 셋째 4 · 첫째 1 → 최고값이 셋째 주사위라 쓰지 않는다
    const topIsThird = start(1, LOW)
    topIsThird.tickUntilEvent('t2-1', GAME_STEP.EVENT_INTRO)
    topIsThird.setRng(seqDiceRng([2, 4]))
    topIsThird.tick()
    topIsThird.setRng(diceRng(1))
    topIsThird.send(BROTHER_ROLE.FIRST, roll)
    expect(judgment(topIsThird).dice.map((die) => die.value)).toEqual([1, 2, 4])

    topIsThird.setRng(diceRng(6))
    topIsThird.tick()
    expect(judgment(topIsThird).dice.map((die) => die.value)).toEqual([1, 2, 4])
    expect(judgment(topIsThird).interventions).toEqual([])
  })
})

describe('봇 부적 자동 사용 (룰북 §11 확정)', () => {
  /** 이장 B(흉, 기준 5)를 판정자 봇 셋째가 실패한 상태로 부적 단계까지 간다 */
  function toTalismanStep(game: Game, diceValue: number): void {
    game.tickUntilEvent('villageChief', GAME_STEP.VOTING)
    // 둘째 봇의 재굴림은 이 테스트의 관심사가 아니므로 미리 소모시킨다
    game.state.seats[BROTHER_ROLE.SECOND].abilityUsed = true

    game.setRng(diceRng(diceValue))
    game.send(BROTHER_ROLE.FIRST, vote('chief-b'))
    expect(judgment(game).threshold).toBe(5)
    expect(judgment(game).succeeded).toBe(false)

    game.tickUntil(GAME_STEP.INTERVENTION_TALISMAN, 6)
  }

  it('부적 단계 진입 즉시에는 쓰지 않는다', () => {
    const game = start(1, LOW)
    toTalismanStep(game, 3)
    game.state.seats[BROTHER_ROLE.THIRD].talismanCount = 1

    // 진입 시점에는 아직 판단하지 않았다
    expect(judgment(game).botTalismanDecided).toBe(false)
    expect(judgment(game).talismanUsedThisJudgment).toBe(false)
    expect(seat(game, BROTHER_ROLE.THIRD).talismanCount).toBe(1)
    expect(game.last.nextDeadline?.at).toBe(
      (game.state.progress.stepDeadlineAt ?? 0) - GAME_CONFIG.botTalismanDelaySeconds * 1000,
    )
  })

  it('마감 1초 전에 판단해 +1로 성공이 되면 쓴다', () => {
    const game = start(1, LOW)
    // 주사위 3 + 직업 보정 1 = 4, 기준 5 → +1이면 성공
    toTalismanStep(game, 3)
    game.state.seats[BROTHER_ROLE.THIRD].talismanCount = 1

    const erosionBefore = seat(game, BROTHER_ROLE.THIRD).erosionPercent
    game.tick()

    expect(
      game.last.logs.some((log) => log.code === 'interventionUsed' && log.message.includes('봇')),
    ).toBe(true)
    expect(
      judgment(game).interventions.filter((record) => record.kind === 'talisman'),
    ).toEqual([
      { step: GAME_STEP.INTERVENTION_TALISMAN, seat: BROTHER_ROLE.THIRD, kind: 'talisman' },
    ])

    // 성공으로 바뀌어 결과까지 진행된다 (이장 B 성공 → 판정자 +5%, 부적 1개)
    expect(game.state.progress.step).toBe(GAME_STEP.PHASE1_COMPLETE)
    expect(seat(game, BROTHER_ROLE.THIRD).erosionPercent - erosionBefore).toBe(5)
    // 부적 1개를 쓰고 보상으로 1개를 받았다
    expect(seat(game, BROTHER_ROLE.THIRD).talismanCount).toBe(1)
  })

  it('+1로도 성공이 안 되면 쓰지 않는다', () => {
    const game = start(1, LOW)
    // 주사위 2 + 직업 보정 1 = 3, 기준 5 → +1로도 실패
    toTalismanStep(game, 2)
    game.state.seats[BROTHER_ROLE.THIRD].talismanCount = 1

    game.tick()
    expect(judgment(game).botTalismanDecided).toBe(true)
    expect(judgment(game).talismanUsedThisJudgment).toBe(false)
    expect(seat(game, BROTHER_ROLE.THIRD).talismanCount).toBe(1)
    expect(game.state.progress.step).toBe(GAME_STEP.INTERVENTION_TALISMAN)
  })

  it('부적이 없으면 쓰지 않는다', () => {
    const game = start(1, LOW)
    toTalismanStep(game, 3)

    game.tick()
    expect(judgment(game).talismanUsedThisJudgment).toBe(false)
    expect(game.state.progress.step).toBe(GAME_STEP.INTERVENTION_TALISMAN)
  })

  it('이미 인간이 부적을 썼으면 봇은 쓰지 않는다 (룰북 §7.4)', () => {
    const game = start(1, LOW)
    toTalismanStep(game, 3)
    game.state.seats[BROTHER_ROLE.THIRD].talismanCount = 1
    // 인간 보유자가 먼저 도달해 적용된 상태
    judgment(game).talismanUsedThisJudgment = true

    game.tick()
    expect(seat(game, BROTHER_ROLE.THIRD).talismanCount).toBe(1)
    expect(judgment(game).talismanBonus).toBe(0)
  })

  it('인간 보유자가 봇보다 먼저 쓸 기회를 얻는다', () => {
    const game = start(2, LOW)
    game.tickUntilEvent('villageChief', GAME_STEP.VOTING)
    game.state.seats[BROTHER_ROLE.SECOND].abilityUsed = true

    game.setRng(diceRng(3))
    game.send(BROTHER_ROLE.FIRST, vote('chief-b'))
    game.send(BROTHER_ROLE.SECOND, vote('chief-b'))
    game.tickUntil(GAME_STEP.INTERVENTION_TALISMAN, 6)

    game.state.seats[BROTHER_ROLE.FIRST].talismanCount = 1
    game.state.seats[BROTHER_ROLE.THIRD].talismanCount = 1

    // 봇 판단 시각(마감 1초 전) 전에는 인간이 쓸 수 있다
    expect(game.send(BROTHER_ROLE.FIRST, useTalisman).rejected).toBe(false)
    expect(seat(game, BROTHER_ROLE.FIRST).talismanCount).toBe(0)
    expect(
      judgment(game).interventions.filter((record) => record.kind === 'talisman'),
    ).toEqual([
      { step: GAME_STEP.INTERVENTION_TALISMAN, seat: BROTHER_ROLE.FIRST, kind: 'talisman' },
    ])
  })
})

describe('첫째 봇 강제 성공 (룰북 §11)', () => {
  it('Phase 1에서는 쓰지 않는다', () => {
    expect(shouldBotForceSuccess()).toBe(false)

    const seats: SeatSetup = {
      [BROTHER_ROLE.FIRST]: { isBot: true },
      [BROTHER_ROLE.SECOND]: { isBot: false },
      [BROTHER_ROLE.THIRD]: { isBot: true },
    }
    const game = start(seats, LOW)
    game.tickUntilEvent('villageChief', GAME_STEP.VOTING)
    game.send(BROTHER_ROLE.SECOND, vote('chief-a'))
    expect(game.state.currentEvent?.rollerSeat).toBe(BROTHER_ROLE.SECOND)

    game.tickUntil(GAME_STEP.INTERVENTION_FORCE, 8)
    expect(seat(game, BROTHER_ROLE.FIRST).isBot).toBe(true)
    expect(judgment(game).forcedSuccess).toBe(false)

    game.tick()
    expect(game.state.progress.step).toBe(GAME_STEP.PHASE1_COMPLETE)
    expect(seat(game, BROTHER_ROLE.FIRST).erosionPercent).toBe(0)
    expect(ALL_SEATS.every((role) => !seat(game, role).abilityUsed || role === BROTHER_ROLE.SECOND)).toBe(
      true,
    )
  })
})
