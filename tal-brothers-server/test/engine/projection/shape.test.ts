import { describe, expect, it } from 'vitest'
import { BROTHER_ROLE, GAME_PHASE, GAME_STEP } from 'tal-brothers-shared'

import { enterStep, finishDispatch } from '../../../src/engine/dispatch'
import { createStepOutput } from '../../../src/engine/engineTypes'
import type { Rng } from '../../../src/engine/random'
import { projectDisplay } from '../../../src/engine/projection/projectDisplay'
import { projectSeat } from '../../../src/engine/projection/projectSeat'
import { createGame, seatSetupForHumans } from '../../../src/engine/state/createGame'
import { SEAT_ORDER } from '../../../src/engine/state/gameState'
import type { GameState } from '../../../src/engine/state/gameState'

/**
 * 투영 구조 고정 (아키텍처 §2 원칙 3, §7.3).
 * 상태에 필드를 더해도 투영이 자동으로 커지면 안 되므로 최상위 키 목록을 테스트로 고정한다.
 */

const START = 1_700_000_000_000
const LOW: Rng = { nextInt: () => 0 }

/** Display와 좌석이 함께 받는 공개 항목 */
const PUBLIC_KEYS = [
  'adoptedChoiceId',
  'background',
  'choices',
  'clockDeadlineAt',
  'ending',
  'eventNumber',
  'eventTitle',
  'grabbedSeat',
  'judgment',
  'lobby',
  'mask',
  'narration',
  'notices',
  'pause',
  'phase',
  'phase3',
  'seatNames',
  'stateVersion',
  'step',
  'stepDeadlineAt',
  'vote',
]

/** 좌석별 연결 상태는 Display에만 나간다 (룰북 §17) */
const DISPLAY_ONLY_KEYS = ['seatConnections']

const DISPLAY_KEYS = [...PUBLIC_KEYS, ...DISPLAY_ONLY_KEYS].sort()

const SEAT_ONLY_KEYS = [
  'abilityUsed',
  'botTakeover',
  'connection',
  'erosionPercent',
  'hasJadeHairpin',
  'myVote',
  'seat',
  'talismanCount',
  'talismanOverflow',
  'tutorialTalismanCount',
  'variantLabels',
  'whispers',
]

function phase2State(before?: (state: GameState) => void): GameState {
  const created = createGame(
    { roomCode: 'TEST', seats: seatSetupForHumans(3) },
    { now: START, rng: LOW },
  )
  const state = created.state
  state.progress.phase = GAME_PHASE.PHASE_2
  state.progress.eventOrder = ['p2-01', 'p2-02']
  state.progress.eventIndex = 0
  state.currentEvent = null
  state.currentJudgment = null
  before?.(state)

  const out = createStepOutput()
  enterStep(state, GAME_STEP.EVENT_INTRO, { now: START, rng: LOW }, out)
  finishDispatch(state, out)
  return state
}

describe('투영 키 목록', () => {
  it('Display 투영의 최상위 키가 고정돼 있다', () => {
    expect(Object.keys(projectDisplay(phase2State())).sort()).toEqual(DISPLAY_KEYS)
  })

  it('좌석 투영은 공개 항목 + 본인 항목으로만 이루어진다', () => {
    const state = phase2State()
    expect(Object.keys(projectSeat(state, BROTHER_ROLE.FIRST)).sort()).toEqual(
      [...PUBLIC_KEYS, ...SEAT_ONLY_KEYS].sort(),
    )
  })

  it('배신자 좌석과 일반 좌석 투영의 키 목록이 완전히 같다 (아키 §7.3)', () => {
    const state = phase2State((draft) => {
      draft.seats[BROTHER_ROLE.FIRST].isTraitor = true
      draft.seats[BROTHER_ROLE.FIRST].erosionPercent = 100
      draft.seats[BROTHER_ROLE.SECOND].erosionPercent = 20
    })

    const traitor = projectSeat(state, BROTHER_ROLE.FIRST)
    const normal = projectSeat(state, BROTHER_ROLE.SECOND)
    expect(Object.keys(traitor).sort()).toEqual(Object.keys(normal).sort())

    // 하위 구조의 키 목록도 같아야 한다
    expect(Object.keys(traitor.choices[0] ?? {})).toEqual(Object.keys(normal.choices[0] ?? {}))
  })

  it('상태에 필드를 더해도 투영이 자동으로 커지지 않는다', () => {
    const state = phase2State()
    // 화이트리스트 투영이므로 상태에 낯선 필드가 생겨도 스냅샷은 그대로다
    const extended = { ...state, secretField: 'MARKER-SECRET' } as unknown as GameState

    const snapshot = projectDisplay(extended)
    expect(Object.keys(snapshot).sort()).toEqual(DISPLAY_KEYS)
    expect(JSON.stringify(snapshot)).not.toContain('MARKER-SECRET')

    for (const role of SEAT_ORDER) {
      expect(JSON.stringify(projectSeat(extended, role))).not.toContain('MARKER-SECRET')
    }
  })
})
