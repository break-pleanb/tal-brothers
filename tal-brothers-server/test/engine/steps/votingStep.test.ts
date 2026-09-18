import { describe, expect, it } from 'vitest'
import { BROTHER_ROLE, COMMAND_TYPE, GAME_STEP } from 'tal-brothers-shared'
import type { BrotherRole, Command, GameStep } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../../src/scenario/gameConfig'
import { dispatch } from '../../../src/engine/dispatch'
import { ACTION_KIND, REJECTION_REASON } from '../../../src/engine/engineTypes'
import type { DispatchResult, DispatchSuccess } from '../../../src/engine/engineTypes'
import type { Rng } from '../../../src/engine/random'
import { createGame, seatSetupForHumans } from '../../../src/engine/state/createGame'
import type { GameState } from '../../../src/engine/state/gameState'

const START = 1_700_000_000_000

/** 항상 최솟값 — 주사위 1, `pickOne`은 첫 항목, 변이는 흉 */
const LOW: Rng = { nextInt: () => 0 }
/** 항상 최댓값 — 주사위 6, `pickOne`은 마지막 항목, 변이는 길 */
const HIGH: Rng = { nextInt: (bound) => bound - 1 }

function start(humans: number, rng: Rng) {
  let now = START
  let last: DispatchSuccess = createGame(
    { roomCode: 'TEST', seats: seatSetupForHumans(humans) },
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
      while (
        last.state.currentEvent?.eventId !== eventId ||
        last.state.progress.step !== step
      ) {
        this.tick()
        count += 1
        if (count > limit) throw new Error(`${eventId}/${step}에 도달하지 못했다`)
      }
    },
  }
}

const vote = (choiceId: string): Command => ({ type: COMMAND_TYPE.VOTE_SUBMIT, choiceId })
const trueSight: Command = { type: COMMAND_TYPE.ABILITY_TRUE_SIGHT }
const heal: Command = { type: COMMAND_TYPE.TALISMAN_HEAL }

describe('투표 (룰북 §8)', () => {
  it('마감 전 재전송으로 선택을 바꾼다 (아키 §8)', () => {
    const game = start(3, LOW)
    game.tickUntil(GAME_STEP.VOTING)

    expect(game.send(BROTHER_ROLE.FIRST, vote('t1-a')).rejected).toBe(false)
    expect(game.state.currentEvent?.votes[BROTHER_ROLE.FIRST]).toBe('t1-a')

    expect(game.send(BROTHER_ROLE.FIRST, vote('t1-b')).rejected).toBe(false)
    expect(game.state.currentEvent?.votes[BROTHER_ROLE.FIRST]).toBe('t1-b')
    expect(game.state.progress.step).toBe(GAME_STEP.VOTING)
  })

  it('없는 선택지는 거절한다', () => {
    const game = start(3, LOW)
    game.tickUntil(GAME_STEP.VOTING)

    const result = game.send(BROTHER_ROLE.FIRST, vote('없는-선택지'))
    expect(result.rejected && result.reason).toBe(REJECTION_REASON.NOT_ALLOWED)
  })

  it('인간 전원이 투표하면 조기 마감되고, 봇은 판정에서 제외된다 (룰북 §11)', () => {
    const game = start(2, LOW)
    game.tickUntil(GAME_STEP.VOTING)
    expect(game.state.seats[BROTHER_ROLE.THIRD].isBot).toBe(true)

    game.send(BROTHER_ROLE.FIRST, vote('t1-a'))
    expect(game.state.progress.step).toBe(GAME_STEP.VOTING)

    // 인간 2명이 모두 투표 → 봇(셋째)을 기다리지 않고 마감
    game.send(BROTHER_ROLE.SECOND, vote('t1-a'))
    expect(game.state.progress.step).not.toBe(GAME_STEP.VOTING)
    expect(game.state.currentEvent?.adoptedChoiceId).toBe('t1-a')
  })

  it('인간 3명 중 2명만 투표하면 조기 마감되지 않는다', () => {
    const game = start(3, LOW)
    game.tickUntil(GAME_STEP.VOTING)

    game.send(BROTHER_ROLE.FIRST, vote('t1-a'))
    game.send(BROTHER_ROLE.SECOND, vote('t1-a'))
    expect(game.state.progress.step).toBe(GAME_STEP.VOTING)
  })

  it('미투표자는 기권 처리한다', () => {
    const game = start(3, LOW)
    game.tickUntil(GAME_STEP.VOTING)

    game.send(BROTHER_ROLE.FIRST, vote('t1-b'))
    game.tick()

    expect(game.state.currentEvent?.adoptedChoiceId).toBe('t1-b')
    expect(game.state.currentEvent?.votes[BROTHER_ROLE.SECOND]).toBeUndefined()
  })

  it('동률이면 동률 선택지 중에서 무작위로 고른다', () => {
    const low = start(2, LOW)
    low.tickUntil(GAME_STEP.VOTING)
    low.send(BROTHER_ROLE.FIRST, vote('t1-a'))
    low.send(BROTHER_ROLE.SECOND, vote('t1-b'))
    expect(low.state.currentEvent?.adoptedChoiceId).toBe('t1-a')

    const high = start(2, HIGH)
    high.tickUntil(GAME_STEP.VOTING)
    high.send(BROTHER_ROLE.FIRST, vote('t1-a'))
    high.send(BROTHER_ROLE.SECOND, vote('t1-b'))
    expect(high.state.currentEvent?.adoptedChoiceId).toBe('t1-b')
  })

  it('전원 기권이면 전체 선택지 중에서 무작위로 고른다', () => {
    const low = start(1, LOW)
    low.tickUntil(GAME_STEP.VOTING)
    low.tick()
    expect(low.state.currentEvent?.adoptedChoiceId).toBe('t1-a')

    const high = start(1, HIGH)
    high.tickUntil(GAME_STEP.VOTING)
    high.tick()
    expect(high.state.currentEvent?.adoptedChoiceId).toBe('t1-b')
  })

  it('1인 플레이는 본인 선택이 곧 결정이다', () => {
    const game = start(1, LOW)
    game.tickUntil(GAME_STEP.VOTING)

    game.send(BROTHER_ROLE.FIRST, vote('t1-b'))
    expect(game.state.currentEvent?.adoptedChoiceId).toBe('t1-b')
  })

  it('봇 좌석의 투표는 거절되고 상태 버전도 오르지 않는다 (룰북 §11)', () => {
    const game = start(1, LOW)
    game.tickUntil(GAME_STEP.VOTING)
    const before = game.state.meta.stateVersion

    const result = game.send(BROTHER_ROLE.SECOND, vote('t1-a'))
    expect(result.rejected && result.reason).toBe(REJECTION_REASON.WRONG_SEAT)
    expect(game.state.meta.stateVersion).toBe(before)
    expect(game.state.currentEvent?.votes[BROTHER_ROLE.SECOND]).toBeUndefined()
  })
})

describe('투표 집계 로그와 게임 시계 (룰북 §2.1, §8)', () => {
  /** 마지막에 처리된 `VOTE_TALLIED` 로그의 구조화된 값 */
  function tallyData(logs: readonly { code: string; data?: Record<string, unknown> }[]) {
    return logs.find((log) => log.code === 'voteTallied')?.data
  }

  it('만료 마감이면 판정 없는 선택지에서도 소개 30초 + 투표 3분이 흐른다', () => {
    const game = start(3, LOW)
    game.tickUntilEvent('t2-2', GAME_STEP.EVENT_INTRO)

    const enteredAt = game.now
    const remainingBefore = game.state.clock.deadlineAt - game.now

    game.tick()
    expect(game.state.progress.step).toBe(GAME_STEP.VOTING)

    // 인간 3명 중 2명만 투표 → 조기 마감 조건이 아니다
    game.send(BROTHER_ROLE.FIRST, vote('t2-2-b'))
    game.send(BROTHER_ROLE.SECOND, vote('t2-2-b'))
    expect(game.state.progress.step).toBe(GAME_STEP.VOTING)

    // 투표 마감 → 판정 없는 선택지라 RESOLUTION을 거쳐 다음 이벤트로 간다
    game.tick()
    expect(game.state.currentEvent?.eventId).toBe('villageChief')

    const elapsed = game.now - enteredAt
    const introAndVoting = (GAME_CONFIG.eventIntroSeconds + GAME_CONFIG.votingSeconds) * 1000
    expect(elapsed).toBe(introAndVoting + GAME_CONFIG.inputGraceMs * 2)

    // 시간 페널티가 없으므로 게임 시계는 흐른 시간만큼만 줄어든다
    expect(remainingBefore - (game.state.clock.deadlineAt - game.now)).toBe(elapsed)
    expect(tallyData(game.last.logs)).toMatchObject({ eventId: 't2-2', earlyClosed: false })
  })

  it('조기 마감이면 마지막 표까지 집계 로그에 담기고 투표 시간은 흐르지 않는다', () => {
    const game = start(3, LOW)
    game.tickUntilEvent('t2-2', GAME_STEP.VOTING)
    const votingStartedAt = game.now

    game.send(BROTHER_ROLE.FIRST, vote('t2-2-b'))
    game.send(BROTHER_ROLE.SECOND, vote('t2-2-b'))
    // 마지막 표는 집계·채택·다음 이벤트 진입이 한 처리 안에서 끝나 상태로는 남지 않는다
    game.send(BROTHER_ROLE.THIRD, vote('t2-2-a'))

    expect(game.state.currentEvent?.eventId).toBe('villageChief')
    expect(tallyData(game.last.logs)).toEqual({
      eventId: 't2-2',
      adoptedChoiceId: 't2-2-b',
      counts: { 't2-2-b': 2, 't2-2-a': 1 },
      earlyClosed: true,
    })
    expect(game.now).toBe(votingStartedAt)
  })

  it('기권이 있으면 집계 로그에 던진 표만 담긴다', () => {
    const game = start(3, LOW)
    game.tickUntilEvent('t2-2', GAME_STEP.VOTING)

    game.send(BROTHER_ROLE.FIRST, vote('t2-2-b'))
    game.tick()

    expect(tallyData(game.last.logs)).toEqual({
      eventId: 't2-2',
      adoptedChoiceId: 't2-2-b',
      counts: { 't2-2-b': 1 },
      earlyClosed: false,
    })
  })
})

describe('절대 시야 (룰북 §3.4, §3.5)', () => {
  it('셋째만 쓸 수 있다', () => {
    const game = start(3, LOW)
    game.tickUntil(GAME_STEP.VOTING)

    const result = game.send(BROTHER_ROLE.FIRST, trueSight)
    expect(result.rejected && result.reason).toBe(REJECTION_REASON.WRONG_SEAT)
  })

  it('이벤트당 1회만 쓸 수 있다', () => {
    const game = start(3, LOW)
    game.tickUntil(GAME_STEP.VOTING)

    expect(game.send(BROTHER_ROLE.THIRD, trueSight).rejected).toBe(false)
    expect(game.state.currentEvent?.trueSightUsed).toBe(true)

    const again = game.send(BROTHER_ROLE.THIRD, trueSight)
    expect(again.rejected && again.reason).toBe(REJECTION_REASON.NOT_ALLOWED)
  })

  it('투표 단계 밖에서는 거절된다', () => {
    const game = start(3, LOW)
    expect(game.state.progress.step).toBe(GAME_STEP.EVENT_INTRO)

    const result = game.send(BROTHER_ROLE.THIRD, trueSight)
    expect(result.rejected && result.reason).toBe(REJECTION_REASON.WRONG_STEP)
  })

  it('튜토리얼에서는 횟수를 소모하지 않고, 본게임에서는 소모한다', () => {
    const game = start(3, LOW)
    game.tickUntil(GAME_STEP.VOTING)
    game.send(BROTHER_ROLE.THIRD, trueSight)
    expect(game.state.seats[BROTHER_ROLE.THIRD].abilityUsed).toBe(false)

    game.tickUntilEvent('villageChief', GAME_STEP.VOTING)
    game.send(BROTHER_ROLE.THIRD, trueSight)
    expect(game.state.seats[BROTHER_ROLE.THIRD].abilityUsed).toBe(true)
  })

  it('열람 cue에 실제 변이가 담긴다', () => {
    const game = start(3, LOW)
    game.tickUntilEvent('villageChief', GAME_STEP.VOTING)

    game.send(BROTHER_ROLE.THIRD, trueSight)
    const cue = game.last.cues.find((candidate) => candidate.kind === 'trueSightResult')
    expect(cue?.audience).toBe(BROTHER_ROLE.THIRD)
    expect(cue?.data?.variants).toEqual(game.state.currentEvent?.variants)
  })
})

describe('부적 잠식도 회복 (룰북 §9.1, §9.2)', () => {
  it('보유자만, 투표 시간 중에만, -10%와 부적 1개 소모', () => {
    const game = start(3, LOW)
    game.tickUntil(GAME_STEP.VOTING)
    game.state.seats[BROTHER_ROLE.FIRST].talismanCount = 1
    game.state.seats[BROTHER_ROLE.FIRST].erosionPercent = 20

    expect(game.send(BROTHER_ROLE.FIRST, heal).rejected).toBe(false)
    expect(game.state.seats[BROTHER_ROLE.FIRST].erosionPercent).toBe(10)
    expect(game.state.seats[BROTHER_ROLE.FIRST].talismanCount).toBe(0)

    const again = game.send(BROTHER_ROLE.FIRST, heal)
    expect(again.rejected && again.reason).toBe(REJECTION_REASON.NOT_ALLOWED)
  })

  it('투표 단계 밖에서는 거절된다', () => {
    const game = start(3, LOW)
    game.state.seats[BROTHER_ROLE.FIRST].talismanCount = 1

    const result = game.send(BROTHER_ROLE.FIRST, heal)
    expect(result.rejected && result.reason).toBe(REJECTION_REASON.WRONG_STEP)
  })

  it('튜토리얼 부적만 가진 좌석은 회복에 쓸 수 없고 부적도 소모되지 않는다 (룰북 §9.2)', () => {
    const game = start(3, LOW)
    game.tickUntil(GAME_STEP.VOTING)

    const holder = [BROTHER_ROLE.FIRST, BROTHER_ROLE.SECOND, BROTHER_ROLE.THIRD].find(
      (role) => game.state.seats[role].tutorialTalismanCount > 0,
    )
    expect(holder).toBeDefined()
    if (holder === undefined) return

    game.state.seats[holder].erosionPercent = 20
    const result = game.send(holder, heal)

    expect(result.rejected && result.reason).toBe(REJECTION_REASON.NOT_ALLOWED)
    expect(game.state.seats[holder].tutorialTalismanCount).toBe(1)
    expect(game.state.seats[holder].erosionPercent).toBe(20)
  })

  it('둘 다 가진 좌석은 낡은 부적만 소모한다 (룰북 §9.2)', () => {
    const game = start(3, LOW)
    game.tickUntil(GAME_STEP.VOTING)

    const holder = [BROTHER_ROLE.FIRST, BROTHER_ROLE.SECOND, BROTHER_ROLE.THIRD].find(
      (role) => game.state.seats[role].tutorialTalismanCount > 0,
    )
    if (holder === undefined) throw new Error('튜토리얼 부적 보유자가 없다')

    game.state.seats[holder].talismanCount = 1
    game.state.seats[holder].erosionPercent = 20

    expect(game.send(holder, heal).rejected).toBe(false)
    expect(game.state.seats[holder].talismanCount).toBe(0)
    expect(game.state.seats[holder].tutorialTalismanCount).toBe(1)
    expect(game.state.seats[holder].erosionPercent).toBe(10)
  })
})
