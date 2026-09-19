import { describe, expect, it } from 'vitest'
import {
  BROTHER_ROLE,
  COMMAND_TYPE,
  CUE_KIND,
  ENDING_ID,
  GAME_PHASE,
  GAME_STEP,
  REJECTION_REASON,
} from 'tal-brothers-shared'
import type { EndingId } from 'tal-brothers-shared'

import { ENDINGS } from '../../../src/scenario/endings'
import { dispatch, enterStep, finishDispatch } from '../../../src/engine/dispatch'
import { ACTION_KIND, createStepOutput } from '../../../src/engine/engineTypes'
import { requestEnding } from '../../../src/engine/steps/endingStep'
import { createGame, seatSetupForHumans } from '../../../src/engine/state/createGame'
import type { GameState } from '../../../src/engine/state/gameState'
import { LOW, START, clearTutorialTalismans, startAt, vote } from '../../support/gameDriver'
import type { Game } from '../../support/gameDriver'

/** 엔딩과 타임오버 (룰북 §2.1, §14.2, §15) */

function newGame(humans = 3): GameState {
  const created = createGame(
    { roomCode: 'TEST', seats: seatSetupForHumans(humans) },
    { now: START, rng: LOW },
  )
  return created.state
}

/** 상태를 Phase 2의 특정 이벤트 상황 제시부터 돌린다 */
function startPhase2Event(eventIds: string[], before?: (state: GameState) => void): Game {
  return startAt({
    step: GAME_STEP.EVENT_INTRO,
    before: (state) => {
      state.progress.phase = GAME_PHASE.PHASE_2
      state.progress.eventOrder = eventIds
      state.progress.eventIndex = 0
      clearTutorialTalismans(state)
      before?.(state)
    },
  })
}

describe('엔딩 확정 (룰북 §15)', () => {
  it('배신자가 있는 판은 엔딩 7종의 승패가 엔딩표와 일치한다', () => {
    for (const id of Object.values(ENDING_ID)) {
      const state = newGame()
      state.seats[BROTHER_ROLE.SECOND].erosionPercent = 100
      state.seats[BROTHER_ROLE.SECOND].isTraitor = true
      const out = createStepOutput()

      requestEnding(state, id as EndingId)
      enterStep(state, GAME_STEP.ENDING, { now: START, rng: LOW }, out)

      expect(state.ending?.id, id).toBe(id)
      expect(state.ending?.traitorWon, id).toBe(ENDINGS[id as EndingId].traitorWon)
      expect(state.progress.step, id).toBe(GAME_STEP.ENDING)
      // 종료 상태라 타이머가 없다
      expect(state.progress.stepDeadlineAt, id).toBeNull()
      expect(out.cues.some((cue) => cue.kind === CUE_KIND.ENDING), id).toBe(true)
      expect(
        out.logs.some((log) => log.code === 'endingDecided' && log.data?.endingId === id),
        id,
      ).toBe(true)
    }
  })

  it('배신자가 한 명도 없으면 승패를 판정하지 않는다 (룰북 §15)', () => {
    for (const id of Object.values(ENDING_ID)) {
      const state = newGame()
      const out = createStepOutput()

      requestEnding(state, id as EndingId)
      enterStep(state, GAME_STEP.ENDING, { now: START, rng: LOW }, out)

      // 엔딩표의 배신자 열은 배신자라는 주체가 있어야 성립한다 (룰북 §10.3, §15)
      expect(state.ending?.traitorWon, id).toBeNull()
      expect(
        out.logs.some(
          (log) => log.code === 'endingDecided' && log.message.includes('해당 없음'),
        ),
        id,
      ).toBe(true)
    }
  })

  it('강제 잠식은 노이즈 잠금 cue를 함께 낸다 (룰북 §2.1)', () => {
    const state = newGame()
    const out = createStepOutput()

    requestEnding(state, ENDING_ID.FORCED_EROSION)
    enterStep(state, GAME_STEP.ENDING, { now: START, rng: LOW }, out)

    expect(out.cues.some((cue) => cue.kind === CUE_KIND.NOISE_LOCK)).toBe(true)
  })

  it('엔딩 단계에서는 모든 액션을 거절한다', () => {
    const state = newGame()
    const out = createStepOutput()
    requestEnding(state, ENDING_ID.SAFE_RETURN)
    enterStep(state, GAME_STEP.ENDING, { now: START, rng: LOW }, out)
    const finished = finishDispatch(state, out)

    const command = dispatch(
      finished.state,
      {
        kind: ACTION_KIND.COMMAND,
        seat: BROTHER_ROLE.FIRST,
        command: { type: COMMAND_TYPE.ROLL_REQUEST },
      },
      { now: START, rng: LOW },
    )
    expect(command.rejected && command.reason).toBe(REJECTION_REASON.GAME_FINISHED)
    expect(finished.nextDeadline).toBeNull()
  })
})

describe('타임오버 (룰북 §2.1, §14.2)', () => {
  it('Phase 2에서 시계가 0이 되면 진행 중인 판정을 중단하고 강제 잠식으로 끝난다', () => {
    const game = startPhase2Event(['p2-01', 'p2-02'])

    game.tick() // 상황 제시 마감 → 투표
    game.send(BROTHER_ROLE.FIRST, vote('p2-01-a'))
    game.send(BROTHER_ROLE.SECOND, vote('p2-01-a'))
    game.send(BROTHER_ROLE.THIRD, vote('p2-01-a'))
    expect(game.state.progress.step).toBe(GAME_STEP.ROLL_WAIT)

    // 판정 도중 시계를 0으로 민다
    game.state.clock.deadlineAt = START
    game.tick()

    expect(game.state.progress.step).toBe(GAME_STEP.ENDING)
    expect(game.state.ending?.id).toBe(ENDING_ID.FORCED_EROSION)
    // 이 판에는 배신자가 없으므로 승패를 판정하지 않는다 (룰북 §15)
    expect(game.state.ending?.traitorWon).toBeNull()
    expect(game.state.clock.expiredAt).not.toBeNull()
    expect(game.last.logs.some((log) => log.code === 'clockTimeout')).toBe(true)
  })

  it('시간 페널티로 시계가 0 아래가 되면 그 자리에서 타임오버다', () => {
    // 우회 선택지는 시간 -5분이다 (룰북 §13.5의 01C)
    const game = startPhase2Event(['p2-01', 'p2-02'], (state) => {
      state.clock.deadlineAt = START + 3 * 60_000
    })

    game.tick()
    game.send(BROTHER_ROLE.FIRST, vote('p2-01-c'))
    game.send(BROTHER_ROLE.SECOND, vote('p2-01-c'))
    game.send(BROTHER_ROLE.THIRD, vote('p2-01-c'))

    expect(game.state.progress.step).toBe(GAME_STEP.ENDING)
    expect(game.state.ending?.id).toBe(ENDING_ID.FORCED_EROSION)
  })

  it('Phase 3는 시계가 0을 지나도 판정을 끝까지 진행한다 (룰북 §14.2)', () => {
    let now = START
    const state = newGame(1)
    state.progress.phase = GAME_PHASE.PHASE_2
    // 시계가 이미 지난 상태로 Phase 3에 들어간다
    state.clock.deadlineAt = START - 60_000
    state.seats[BROTHER_ROLE.THIRD].erosionPercent = 70
    state.currentEvent = null

    const out = createStepOutput()
    enterStep(state, GAME_STEP.P3_TARGETING, { now, rng: LOW }, out)
    let last = finishDispatch(state, out)

    // A 루트 투표로 들어갔고, 마감 시각이 이미 지났다
    expect(last.state.progress.step).toBe(GAME_STEP.P3_VOTING)

    const voted = dispatch(
      last.state,
      {
        kind: ACTION_KIND.COMMAND,
        seat: BROTHER_ROLE.FIRST,
        command: vote('p3-a2'),
      },
      { now, rng: LOW },
    )
    expect(voted.rejected).toBe(false)
    if (voted.rejected) return
    last = voted

    // 판정과 개입 창이 시계 0 뒤에도 끝까지 진행된다
    let guard = 0
    while (last.state.progress.step !== GAME_STEP.ENDING) {
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
        { now, rng: LOW },
      )
      if (result.rejected) throw new Error(`타이머 거절: ${result.reason}`)
      last = result
      guard += 1
      if (guard > 20) throw new Error('엔딩에 도달하지 못했다')
    }

    // 강제 잠식이 아니라 A-2 판정 결과로 끝났다
    expect(last.state.ending?.id).not.toBe(ENDING_ID.FORCED_EROSION)
    expect([ENDING_ID.ESCAPE_PARTING, ENDING_ID.ANNIHILATION]).toContain(last.state.ending?.id)
  })
})
