import { GAME_PHASE, GAME_STEP, PROTOCOL_VERSION } from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'
import { PHASE1_EVENTS } from '../../scenario/phase1Events'
import { enterStep, finishDispatch } from '../dispatch'
import { LOG_CODE, createStepOutput } from '../engineTypes'
import type { DispatchSuccess, EngineContext } from '../engineTypes'
import { SEAT_ORDER } from './gameState'
import type { GameState, SeatState } from './gameState'

/**
 * 게임 생성 (로드맵 M1 범위).
 * 좌석 3개를 구성하고 이벤트 순서표와 게임 시계를 고정한 뒤 첫 이벤트로 진입한다.
 * 로비 단계 처리기는 M3이므로 좌석 구성을 인자로 받는다 (계획 7절 1번).
 */

export const ENGINE_VERSION = 'm2'
export const SCENARIO_VERSION = 'rulebook-v3'

/** 좌석별 봇 여부 */
export type SeatSetup = Record<BrotherRole, { isBot: boolean }>

export type CreateGameOptions = {
  roomCode: string
  seats: SeatSetup
}

function createSeat(role: BrotherRole, isBot: boolean): SeatState {
  return {
    role,
    isBot,
    erosionPercent: 0,
    talismanCount: 0,
    talismanOverflow: 0,
    tutorialTalismanCount: 0,
    hasJadeHairpin: false,
    abilityUsed: false,
    isTraitor: false,
    botSabotageUsed: false,
    whispers: [],
  }
}

/**
 * 인간이 채운 좌석을 첫째 → 둘째 → 셋째 순으로 배정한다.
 * 봇 자동 대전을 위해 0명(전원 봇) 구성도 허용한다 (M2 계획 8절).
 */
export function seatSetupForHumans(humanCount: number): SeatSetup {
  if (!Number.isInteger(humanCount) || humanCount < 0 || humanCount > SEAT_ORDER.length) {
    throw new Error(`인간 좌석 수는 0~${SEAT_ORDER.length} 사이여야 한다: ${humanCount}`)
  }

  const setup = {} as SeatSetup
  SEAT_ORDER.forEach((role, index) => {
    setup[role] = { isBot: index >= humanCount }
  })
  return setup
}

export function createGame(
  options: CreateGameOptions,
  context: EngineContext,
): DispatchSuccess {
  const seats = {} as Record<BrotherRole, SeatState>
  for (const role of SEAT_ORDER) {
    seats[role] = createSeat(role, options.seats[role].isBot)
  }

  const state: GameState = {
    meta: {
      roomCode: options.roomCode,
      engineVersion: ENGINE_VERSION,
      scenarioVersion: SCENARIO_VERSION,
      stateVersion: 0,
    },
    clock: {
      // 게임 시계 100분 (룰북 §2.1). 엔딩 연출 20분은 시계 밖이다
      deadlineAt: context.now + GAME_CONFIG.gameClockMinutes * 60_000,
      expiredAt: null,
    },
    progress: {
      phase: GAME_PHASE.PHASE_1,
      eventOrder: PHASE1_EVENTS.map((event) => event.id),
      eventIndex: 0,
      step: GAME_STEP.LOBBY,
      stepDeadlineAt: null,
    },
    seats,
    currentEvent: null,
    currentJudgment: null,
    teamModifier: 0,
    pendingWhispers: [],
    notices: [],
    phase3: null,
    ending: null,
  }

  const out = createStepOutput()
  out.logs.push({
    at: context.now,
    code: LOG_CODE.GAME_CREATED,
    message: `방 ${options.roomCode} 생성 — 프로토콜 v${PROTOCOL_VERSION}, 이벤트 ${state.progress.eventOrder.length}개`,
  })

  // 첫 이벤트 진입 처리(튜토리얼 부적 지급·변이 결정)는 EVENT_INTRO 처리기가 담당한다
  enterStep(state, GAME_STEP.EVENT_INTRO, context, out)

  return finishDispatch(state, out)
}
