import { GAME_PHASE, GAME_STEP, PROTOCOL_VERSION } from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'
import { PHASE1_EVENTS } from '../../scenario/phase1Events'
import { enterStep, finishDispatch } from '../dispatch'
import { LOG_CODE, createStepOutput } from '../engineTypes'
import type { DispatchSuccess, EngineContext } from '../engineTypes'
import { SEAT_ORDER, connectedState } from './gameState'
import type { GameState, SeatState } from './gameState'

/**
 * 게임 생성.
 *
 * **`LOBBY` 단계에서 멈춘다** (M3 계획 8.3). 첫 이벤트 진입과 게임 시계 시작은 `lobby.start`가 한다.
 * 좌석 구성을 인자로 받는 경로는 로비 없이 상태를 만드는 시뮬레이터·테스트용이다.
 */

export const ENGINE_VERSION = 'm3'
export const SCENARIO_VERSION = 'rulebook-v3'

/** 좌석 1칸의 초기 구성 */
export type SeatSetupEntry = {
  isBot: boolean
  /** 좌석 주인 계정. 비어 있으면 아무도 고르지 않은 좌석이라 시작 시 봇이 된다 (룰북 §1) */
  userId?: string | null
  displayName?: string | null
}

export type SeatSetup = Record<BrotherRole, SeatSetupEntry>

export type CreateGameOptions = {
  roomCode: string
  /** 방을 만든 계정. Display 명령의 발신자 검증에 쓴다 (아키텍처 §1) */
  hostUserId?: string | null
  /** 생략하면 좌석 3칸이 모두 비어 있는 로비로 시작한다 (M3-5의 방 생성 경로) */
  seats?: SeatSetup
}

function createSeat(role: BrotherRole, entry: SeatSetupEntry): SeatState {
  return {
    role,
    isBot: entry.isBot,
    userId: entry.userId ?? null,
    displayName: entry.displayName ?? null,
    connection: connectedState(),
    botTakeover: false,
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

/** 좌석 3칸이 모두 비어 있는 구성. 로비에서 사람이 고르거나 시작 시 봇이 된다 */
export function emptySeatSetup(): SeatSetup {
  const setup = {} as SeatSetup
  for (const role of SEAT_ORDER) setup[role] = { isBot: false, userId: null }
  return setup
}

/**
 * 인간이 채운 좌석을 첫째 → 둘째 → 셋째 순으로 배정한다.
 * 봇 자동 대전을 위해 0명(전원 봇) 구성도 허용한다 (M2 계획 8절).
 *
 * 로비를 거치지 않으므로 인간 좌석에 **가상 계정**을 붙여 "이미 사람이 앉은 좌석"으로 만든다.
 * 그래야 `lobby.start`의 "빈 좌석은 봇" 규칙(룰북 §1)이 이 좌석들을 봇으로 돌리지 않는다.
 */
export function seatSetupForHumans(humanCount: number): SeatSetup {
  if (!Number.isInteger(humanCount) || humanCount < 0 || humanCount > SEAT_ORDER.length) {
    throw new Error(`인간 좌석 수는 0~${SEAT_ORDER.length} 사이여야 한다: ${humanCount}`)
  }

  const setup = {} as SeatSetup
  SEAT_ORDER.forEach((role, index) => {
    const isBot = index >= humanCount
    setup[role] = {
      isBot,
      userId: isBot ? null : `local-${role}`,
      displayName: isBot ? null : role,
    }
  })
  return setup
}

export function createGame(options: CreateGameOptions, context: EngineContext): DispatchSuccess {
  const setup = options.seats ?? emptySeatSetup()
  const seats = {} as Record<BrotherRole, SeatState>
  for (const role of SEAT_ORDER) {
    seats[role] = createSeat(role, setup[role])
  }

  const state: GameState = {
    meta: {
      roomCode: options.roomCode,
      engineVersion: ENGINE_VERSION,
      scenarioVersion: SCENARIO_VERSION,
      stateVersion: 0,
    },
    room: {
      hostUserId: options.hostUserId ?? null,
      displayConnected: false,
    },
    clock: {
      // 로비에서는 아직 시계가 흐르지 않는다. `lobby.start`가 이 값을 다시 잡는다 (룰북 §2.1)
      deadlineAt: context.now + GAME_CONFIG.gameClockMinutes * 60_000,
      expiredAt: null,
      pausedRemainingMs: null,
    },
    progress: {
      phase: GAME_PHASE.PHASE_1,
      eventOrder: PHASE1_EVENTS.map((event) => event.id),
      eventIndex: 0,
      step: GAME_STEP.LOBBY,
      stepDeadlineAt: null,
      pausedStepRemainingMs: null,
      stepTimerAt: null,
    },
    seats,
    currentEvent: null,
    currentJudgment: null,
    teamModifier: 0,
    pendingWhispers: [],
    notices: [],
    phase3: null,
    ending: null,
    pause: { active: null, autoAccumulatedMs: 0 },
  }

  const out = createStepOutput()
  out.logs.push({
    at: context.now,
    code: LOG_CODE.GAME_CREATED,
    message: `방 ${options.roomCode} 생성 — 프로토콜 v${PROTOCOL_VERSION}, 이벤트 ${state.progress.eventOrder.length}개`,
  })

  // 로비에서 멈춘다. 첫 이벤트 진입은 `lobby.start`가 한다 (M3 계획 8.3)
  return finishDispatch(state, out)
}

/**
 * 로비를 건너뛰고 첫 이벤트로 바로 들어간다 — **시뮬레이터·테스트 전용**.
 *
 * `lobby.start`는 사람이 앉은 좌석을 1칸 이상 요구한다 (룰북 §1). 봇 자동 대전의 인간 0명 구성은
 * 시계 소모 상한 참고치라 그 규칙 밖에 있다 (룰북 §20). 소켓도 로비도 없는 실행 경로를 위해 둔다.
 */
export function startWithoutLobby(state: GameState, context: EngineContext): DispatchSuccess {
  const out = createStepOutput()
  state.room.displayConnected = true
  enterStep(state, GAME_STEP.EVENT_INTRO, context, out)
  return finishDispatch(state, out)
}
