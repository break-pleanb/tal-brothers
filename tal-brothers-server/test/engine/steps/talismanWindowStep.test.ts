import { describe, expect, it } from 'vitest'
import { BROTHER_ROLE, COMMAND_TYPE, GAME_PHASE, GAME_STEP } from 'tal-brothers-shared'
import type { BrotherRole, Command, GameStep } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../../src/scenario/gameConfig'
import { findPhase2Event } from '../../../src/scenario/phase2Events'
import { hasJudgment } from '../../../src/scenario/scenarioTypes'
import { dispatch, enterStep, finishDispatch } from '../../../src/engine/dispatch'
import { ACTION_KIND, createStepOutput } from '../../../src/engine/engineTypes'
import type { DispatchResult, DispatchSuccess } from '../../../src/engine/engineTypes'
import type { Rng } from '../../../src/engine/random'
import { createGame, seatSetupForHumans } from '../../../src/engine/state/createGame'
import { SEAT_ORDER } from '../../../src/engine/state/gameState'
import type { GameState } from '../../../src/engine/state/gameState'

/** 14A 부적 제출 창 (룰북 §13.5) */

const START = 1_700_000_000_000
const LOW: Rng = { nextInt: () => 0 }

const submit: Command = { type: COMMAND_TYPE.TALISMAN_SUBMIT }
const vote = (choiceId: string): Command => ({ type: COMMAND_TYPE.VOTE_SUBMIT, choiceId })

function start(before?: (state: GameState) => void) {
  let now = START
  const rng = LOW
  const created = createGame(
    { roomCode: 'TEST', seats: seatSetupForHumans(3) },
    { now, rng },
  )

  const state = created.state
  state.progress.phase = GAME_PHASE.PHASE_2
  state.progress.eventOrder = ['p2-14', 'p2-02']
  state.progress.eventIndex = 0
  state.currentEvent = null
  state.currentJudgment = null
  before?.(state)

  const out = createStepOutput()
  enterStep(state, GAME_STEP.EVENT_INTRO, { now, rng }, out)
  let last: DispatchSuccess = finishDispatch(state, out)

  return {
    get state(): GameState {
      return last.state
    },
    get last(): DispatchSuccess {
      return last
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
        { now, rng },
      )
      if (result.rejected) throw new Error(`타이머 거절: ${result.reason}`)
      last = result
    },
    send(seat: BrotherRole, command: Command): DispatchResult {
      const result = dispatch(
        last.state,
        { kind: ACTION_KIND.COMMAND, seat, command },
        { now, rng },
      )
      if (!result.rejected) last = result
      return result
    },
    tickUntil(step: GameStep, limit = 20): void {
      let count = 0
      while (last.state.progress.step !== step) {
        this.tick()
        count += 1
        if (count > limit) throw new Error(`${step}에 도달하지 못했다`)
      }
    },
    get now(): number {
      return now
    },
  }
}

type Game = ReturnType<typeof start>

/** 14A를 채택해 제출 창까지 간다 */
function toWindow(game: Game): void {
  game.tickUntil(GAME_STEP.VOTING)
  for (const role of SEAT_ORDER) {
    if (game.state.seats[role].isBot) continue
    game.send(role, vote('p2-14-a'))
  }
}

describe('14A 선택지 (룰북 §13.5)', () => {
  it('부적 보유자가 없어도 선택지에 표시된다', () => {
    const event = findPhase2Event('p2-14')
    expect(event?.choices.map((choice) => choice.id)).toContain('p2-14-a')

    const game = start()
    game.tickUntil(GAME_STEP.VOTING)
    // 아무도 부적이 없어도 투표할 수 있다
    expect(SEAT_ORDER.every((role) => game.state.seats[role].talismanCount === 0)).toBe(true)
    expect(game.send(BROTHER_ROLE.FIRST, vote('p2-14-a')).rejected).toBe(false)
  })

  it('채택되면 굴림 없이 제출 창 8초로 간다', () => {
    const game = start()
    toWindow(game)

    expect(game.state.progress.step).toBe(GAME_STEP.TALISMAN_WINDOW)
    expect((game.state.progress.stepDeadlineAt ?? 0) - game.now).toBe(
      GAME_CONFIG.talismanWindowSeconds * 1000,
    )
    expect(game.state.currentJudgment?.dice).toEqual([])
  })

  it('제출하면 즉시 종료되고 제출자만 -15%다', () => {
    const game = start((state) => {
      state.seats[BROTHER_ROLE.SECOND].talismanCount = 1
      state.seats[BROTHER_ROLE.SECOND].erosionPercent = 40
    })
    toWindow(game)

    expect(game.send(BROTHER_ROLE.SECOND, submit).rejected).toBe(false)

    // 결과 적용까지 한 번에 진행돼 다음 이벤트로 넘어간다
    expect(game.state.progress.eventIndex).toBe(1)
    expect(game.state.seats[BROTHER_ROLE.SECOND].erosionPercent).toBe(
      40 - 15 + GAME_CONFIG.environmentErosionPercent,
    )
    expect(game.state.seats[BROTHER_ROLE.SECOND].talismanCount).toBe(0)
  })

  it('선착순 1개만 적용하고 나머지 부적은 소모되지 않는다', () => {
    const game = start((state) => {
      state.seats[BROTHER_ROLE.FIRST].talismanCount = 1
      state.seats[BROTHER_ROLE.SECOND].talismanCount = 1
    })
    toWindow(game)

    expect(game.send(BROTHER_ROLE.FIRST, submit).rejected).toBe(false)
    const late = game.send(BROTHER_ROLE.SECOND, submit)
    expect(late.rejected).toBe(true)
    expect(game.state.seats[BROTHER_ROLE.SECOND].talismanCount).toBe(1)
  })

  it('보류함 부적으로는 제출할 수 없다 (M2 계획 10.1)', () => {
    const game = start((state) => {
      state.seats[BROTHER_ROLE.THIRD].talismanOverflow = 2
    })
    toWindow(game)

    expect(game.send(BROTHER_ROLE.THIRD, submit).rejected).toBe(true)
  })

  it('미제출이면 8초를 모두 기다린 뒤 무작위 1명이 +10%를 받는다', () => {
    const game = start()
    toWindow(game)
    const before = SEAT_ORDER.map((role) => game.state.seats[role].erosionPercent)

    game.tick()

    // 봇 포함 좌석 전원이 모집단이다 (M2 계획 10절 3번)
    const cursed = SEAT_ORDER.filter(
      (role, index) =>
        game.state.seats[role].erosionPercent - (before[index] ?? 0) >
        GAME_CONFIG.environmentErosionPercent,
    )
    expect(cursed).toHaveLength(1)
    // Display에는 익명으로만 남는다
    expect(game.state.notices.some((notice) => notice.kind === 'anonymousCurse')).toBe(true)
  })

  it('개입 창이 없고 변이가 적용되지 않는다 (룰북 §6.3)', () => {
    const game = start()
    toWindow(game)

    const choice = findPhase2Event('p2-14')?.choices.find((candidate) => candidate.id === 'p2-14-a')
    expect(choice !== undefined && hasJudgment(choice) && choice.variantExempt).toBe(true)

    game.tick()
    // 제출 창 다음은 곧바로 결과 적용이라 개입 단계를 지나지 않는다
    expect(game.state.progress.step).toBe(GAME_STEP.EVENT_INTRO)
    expect(game.state.currentEvent?.eventId).toBe('p2-02')
  })

  it('버프·디버프를 소비하지 않고 다음 판정으로 이월한다 (룰북 §5.5)', () => {
    const game = start((state) => {
      state.teamModifier = -1
    })
    toWindow(game)

    expect(game.state.currentJudgment?.teamModifierApplied).toBe(0)
    game.tick()
    expect(game.state.teamModifier).toBe(-1)
  })
})
