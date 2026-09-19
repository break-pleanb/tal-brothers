import { describe, expect, it } from 'vitest'
import { BROTHER_ROLE, CUE_KIND } from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../../src/scenario/gameConfig'
import { createStepOutput } from '../../../src/engine/engineTypes'
import type { EngineContext, StepOutput } from '../../../src/engine/engineTypes'
import { createSeededRng } from '../../../src/engine/random'
import type { Rng } from '../../../src/engine/random'
import { applySeatErosion } from '../../../src/engine/rules/erosion'
import { humanSeats, isSoloHumanGame } from '../../../src/engine/rules/seatControl'
import {
  RED_MESSAGE_TEXT,
  allHumansTurned,
  redMessageCue,
  traitorWonFor,
} from '../../../src/engine/rules/traitor'
import { createGame, seatSetupForHumans } from '../../../src/engine/state/createGame'
import type { GameState } from '../../../src/engine/state/gameState'

const NOW = 1_700_000_000_000

/** 항상 최솟값 — `pickOne`은 첫 항목을 고른다 */
const LOW: Rng = { nextInt: () => 0 }

function makeState(humanCount: number): GameState {
  const result = createGame(
    { roomCode: 'TEST', seats: seatSetupForHumans(humanCount) },
    { now: NOW, rng: createSeededRng(1) },
  )
  if (result.rejected) throw new Error('게임 생성 실패')
  return result.state
}

function context(rng: Rng = LOW): EngineContext {
  return { now: NOW, rng }
}

/** 잠식도를 100%까지 올린다 */
function raiseToFull(state: GameState, role: BrotherRole, rng: Rng = LOW): StepOutput {
  const out = createStepOutput()
  applySeatErosion(state, role, 100 - state.seats[role].erosionPercent, context(rng), out)
  return out
}

describe('배신자 전환 (룰북 §10.1)', () => {
  it('인간이 100%에 도달하면 즉시 배신자가 된다', () => {
    const state = makeState(3)
    const out = raiseToFull(state, BROTHER_ROLE.SECOND)

    expect(state.seats[BROTHER_ROLE.SECOND].isTraitor).toBe(true)
    expect(state.seats[BROTHER_ROLE.SECOND].erosionPercent).toBe(100)
    expect(state.seats[BROTHER_ROLE.FIRST].isTraitor).toBe(false)
    expect(out.cues.filter((cue) => cue.kind === CUE_KIND.RED_MESSAGE)).toHaveLength(1)
  })

  it('전환 cue는 가짜 붉은 메시지와 형식·문장·표시 시간이 같다 (룰북 §10.1, 아키 §7.2)', () => {
    const state = makeState(3)
    const out = raiseToFull(state, BROTHER_ROLE.FIRST)
    const real = out.cues.find((cue) => cue.kind === CUE_KIND.RED_MESSAGE)
    const fake = redMessageCue(BROTHER_ROLE.FIRST)

    expect(real).toEqual(fake)
    expect(real?.text).toBe(RED_MESSAGE_TEXT)
    expect(real?.data).toEqual({ durationSeconds: GAME_CONFIG.redMessageSeconds })
  })

  it('봇은 100%여도 배신자가 되지 않고 방해를 1회 쓴다 (룰북 §11)', () => {
    const state = makeState(1)
    const bot = BROTHER_ROLE.THIRD
    expect(state.seats[bot].isBot).toBe(true)

    raiseToFull(state, bot)

    expect(state.seats[bot].isTraitor).toBe(false)
    expect(state.seats[bot].botSabotageUsed).toBe(true)
  })

  it('1인 플레이의 인간은 전환하지 않고 방해 효과를 본인에게 적용한다 (룰북 §10.1)', () => {
    const state = makeState(1)
    const human = BROTHER_ROLE.FIRST
    state.seats[human].talismanCount = 2

    // 부적 소멸 수단이 걸리도록 두 번째 항목을 고르는 난수를 쓴다
    const out = raiseToFull(state, human, { nextInt: (bound) => bound - 1 })

    expect(isSoloHumanGame(state)).toBe(true)
    expect(state.seats[human].isTraitor).toBe(false)
    expect(state.seats[human].botSabotageUsed).toBe(true)
    // 방해 대상은 본인으로 한정된다
    expect(state.seats[human].talismanCount).toBe(1)
    expect(out.cues.filter((cue) => cue.kind === CUE_KIND.RED_MESSAGE)).toHaveLength(0)
  })

  it('전환은 능력·부적·잠식 게이지 외의 권한을 건드리지 않는다 (룰북 §10.2)', () => {
    const state = makeState(3)
    state.seats[BROTHER_ROLE.SECOND].talismanCount = 2
    raiseToFull(state, BROTHER_ROLE.SECOND)

    expect(state.seats[BROTHER_ROLE.SECOND].talismanCount).toBe(2)
    expect(state.seats[BROTHER_ROLE.SECOND].abilityUsed).toBe(false)
  })
})

describe('배신자와 회복 (룰북 §4.4)', () => {
  it('배신자는 회복이 적용되지 않고 100%로 고정된다', () => {
    const state = makeState(3)
    raiseToFull(state, BROTHER_ROLE.FIRST)

    const out = createStepOutput()
    applySeatErosion(state, BROTHER_ROLE.FIRST, -15, context(), out)

    expect(state.seats[BROTHER_ROLE.FIRST].erosionPercent).toBe(100)
    expect(out.logs).toHaveLength(0)
  })

  it('배신자에게도 상승은 적용되지만 100%를 넘지 않는다 (룰북 §4.1)', () => {
    const state = makeState(3)
    raiseToFull(state, BROTHER_ROLE.FIRST)

    applySeatErosion(state, BROTHER_ROLE.FIRST, 25, context(), createStepOutput())
    expect(state.seats[BROTHER_ROLE.FIRST].erosionPercent).toBe(100)
  })
})

describe('전원 배신자 검사 (룰북 §10.3)', () => {
  it('인간 2명 이상이 전원 배신자면 참이다', () => {
    const state = makeState(2)
    expect(humanSeats(state)).toHaveLength(2)

    raiseToFull(state, BROTHER_ROLE.FIRST)
    expect(allHumansTurned(state)).toBe(false)

    raiseToFull(state, BROTHER_ROLE.SECOND)
    expect(allHumansTurned(state)).toBe(true)
  })

  it('1인 플레이는 전원 배신자 검사를 하지 않는다 (M2 계획 10절 11번)', () => {
    const state = makeState(1)
    raiseToFull(state, BROTHER_ROLE.FIRST)

    expect(allHumansTurned(state)).toBe(false)
  })
})

describe('배신자 승패 (룰북 §15)', () => {
  it('엔딩표의 승패를 그대로 읽는다', () => {
    expect(traitorWonFor('annihilation')).toBe(true)
    expect(traitorWonFor('eternalMaze')).toBe(true)
    expect(traitorWonFor('forcedErosion')).toBe(true)
    expect(traitorWonFor('purify')).toBe(false)
    expect(traitorWonFor('safeReturn')).toBe(false)
    expect(traitorWonFor('escapeParting')).toBe(false)
    expect(traitorWonFor('tragicEscape')).toBe(false)
  })
})
