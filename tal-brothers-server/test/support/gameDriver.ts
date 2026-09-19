import { COMMAND_TYPE, SEAT_CONNECTION } from 'tal-brothers-shared'
import type { BrotherRole, Command, GameStep, SeatConnection } from 'tal-brothers-shared'

import { dispatch, enterStep, finishDispatch } from '../../src/engine/dispatch'
import {
  ACTION_KIND,
  createStepOutput,
  displayActor,
  seatActor,
} from '../../src/engine/engineTypes'
import type {
  ActionActor,
  DispatchResult,
  DispatchSuccess,
} from '../../src/engine/engineTypes'
import type { Rng } from '../../src/engine/random'
import { createGame, seatSetupForHumans } from '../../src/engine/state/createGame'
import type { SeatSetup } from '../../src/engine/state/createGame'
import { SEAT_ORDER } from '../../src/engine/state/gameState'
import type { GameState, JudgmentState } from '../../src/engine/state/gameState'

/**
 * 단계 테스트의 공용 드라이버.
 *
 * 엔진은 순수 함수라 테스트가 **가상 시계와 액션 큐를 직접 돌린다.** 단계 테스트마다
 * 같은 루프를 복제하고 있었으므로 여기 한 곳에 모은다 (M2 노트의 승인된 제안).
 *
 * - `startGame`: 새 게임을 만들어 Phase 1 첫 이벤트부터 돌린다
 * - `startAt`: 게임 생성 직후 상태를 손보고 원하는 단계부터 돌린다 (Phase 2·3 테스트)
 */

export const START = 1_700_000_000_000

/** 항상 최솟값 — 주사위 1, `pickOne`은 첫 항목, 변이는 흉 */
export const LOW: Rng = { nextInt: () => 0 }

/** 항상 최댓값 — 주사위 6, `pickOne`은 마지막 항목, 변이는 길 */
export const HIGH: Rng = { nextInt: (bound) => bound - 1 }

/** 주사위를 `value`로 고정한다 */
export const diceRng = (value: number): Rng => ({ nextInt: (bound) => (value - 1) % bound })

/** 주사위 값을 순서대로 내주고 소진되면 1을 낸다. 값은 눈금 그대로 적는다 */
export function seqDiceRng(values: number[]): Rng {
  let index = 0
  return {
    nextInt(bound) {
      const value = index < values.length ? (values[index] as number) : 1
      index += 1
      return (value - 1) % bound
    },
  }
}

/** 정해진 `nextInt` 수열을 그대로 돌려준다. 주사위 값 v는 v-1로 적는다 */
export function scriptRng(values: number[]): Rng {
  let index = 0
  return {
    nextInt(bound: number): number {
      const value = values[index] ?? 0
      index += 1
      return value % bound
    },
  }
}

export const ALL_SEATS: BrotherRole[] = [...SEAT_ORDER]

// ── 명령 ─────────────────────────────────────────────────────────────

export const vote = (choiceId: string): Command => ({
  type: COMMAND_TYPE.VOTE_SUBMIT,
  choiceId,
})
export const roll: Command = { type: COMMAND_TYPE.ROLL_REQUEST }
export const reroll: Command = { type: COMMAND_TYPE.INTERVENTION_REROLL }
export const useTalisman: Command = { type: COMMAND_TYPE.INTERVENTION_TALISMAN }
export const forceSuccess: Command = { type: COMMAND_TYPE.INTERVENTION_FORCE_SUCCESS }
export const trueSight: Command = { type: COMMAND_TYPE.ABILITY_TRUE_SIGHT }
export const heal: Command = { type: COMMAND_TYPE.TALISMAN_HEAL }
export const submitTalisman: Command = { type: COMMAND_TYPE.TALISMAN_SUBMIT }
export const lobbyStart: Command = { type: COMMAND_TYPE.LOBBY_START }
export const hostPause: Command = { type: COMMAND_TYPE.HOST_PAUSE }
export const hostResume: Command = { type: COMMAND_TYPE.HOST_RESUME }
export const pickSeat = (seat: BrotherRole): Command => ({
  type: COMMAND_TYPE.LOBBY_PICK_SEAT,
  seat,
})
export const toggleBot = (seat: BrotherRole, isBot: boolean): Command => ({
  type: COMMAND_TYPE.LOBBY_TOGGLE_BOT,
  seat,
  isBot,
})

/** 테스트가 쓰는 호스트 계정. `startGame`이 만드는 방의 주인이다 */
export const HOST_USER_ID = 'host-user'

export const host: ActionActor = displayActor(HOST_USER_ID)

// ── 드라이버 ─────────────────────────────────────────────────────────

export type Game = {
  readonly state: GameState
  readonly last: DispatchSuccess
  readonly now: number
  /** 이후 액션에 쓸 난수를 바꾼다. 생성 시 난수와 판정용 난수를 나눌 때 쓴다 */
  setRng(next: Rng): void
  /** 다음 마감 시각으로 시계를 옮기고 타이머 만료 액션을 넣는다 */
  tick(): void
  send(seat: BrotherRole, command: Command): DispatchResult
  /** 좌석이 아닌 주체(호스트 Display, 좌석 미선택 Controller)로 명령을 보낸다 */
  sendAs(actor: ActionActor, command: Command): DispatchResult
  /** 연결 변화를 넣는다 (M3 계획 5.1) */
  presence(target: ActionActor, status: SeatConnection): DispatchResult
  /** 좌석을 끊고 `ms`만큼 시계를 민다. 봇 대행 전환 타이머는 따로 `tick`으로 발화시킨다 */
  disconnectSeat(seat: BrotherRole): DispatchResult
  connectSeat(seat: BrotherRole): DispatchResult
  /** 시계만 옮긴다. 타이머를 발화시키지 않는다 */
  advance(ms: number): void
  /** 단계를 직접 다시 밟는다 (테스트가 특정 이벤트부터 시작할 때) */
  enter(step: GameStep): void
  tickUntil(step: GameStep, limit?: number): void
  tickUntilEvent(eventId: string, step: GameStep, limit?: number): void
}

function driver(first: DispatchSuccess, startedAt: number, rng: Rng): Game {
  let last = first
  let now = startedAt
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
      if (result.rejected) {
        throw new Error(`타이머 거절: ${result.reason} ${result.detail ?? ''}`)
      }
      last = result
    },
    send(seat: BrotherRole, command: Command): DispatchResult {
      return this.sendAs(seatActor(seat, last.state.seats[seat].userId), command)
    },
    sendAs(actor: ActionActor, command: Command): DispatchResult {
      const result = dispatch(
        last.state,
        { kind: ACTION_KIND.COMMAND, actor, command },
        { now, rng: current },
      )
      if (!result.rejected) last = result
      return result
    },
    presence(target: ActionActor, status: SeatConnection): DispatchResult {
      const result = dispatch(
        last.state,
        { kind: ACTION_KIND.PRESENCE, target, status },
        { now, rng: current },
      )
      if (!result.rejected) last = result
      return result
    },
    disconnectSeat(seat: BrotherRole): DispatchResult {
      return this.presence(
        seatActor(seat, last.state.seats[seat].userId),
        SEAT_CONNECTION.DISCONNECTED,
      )
    },
    connectSeat(seat: BrotherRole): DispatchResult {
      return this.presence(
        seatActor(seat, last.state.seats[seat].userId),
        SEAT_CONNECTION.CONNECTED,
      )
    },
    advance(ms: number): void {
      now += ms
    },
    enter(step: GameStep): void {
      const out = createStepOutput()
      enterStep(last.state, step, { now, rng: current }, out)
      last = finishDispatch(last.state, out)
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

/**
 * 새 게임을 만들어 Phase 1 첫 이벤트(T1 상황 제시)부터 돌린다.
 * `createGame`이 로비에서 멈추므로(M3 계획 8.3) 호스트 Display로 `lobby.start`를 한 번 보낸다.
 */
export function startGame(seats: number | SeatSetup, rng: Rng = LOW): Game {
  const setup = withTestUsers(typeof seats === 'number' ? seatSetupForHumans(seats) : seats)
  const created = createGame(
    { roomCode: 'TEST', hostUserId: HOST_USER_ID, seats: setup },
    { now: START, rng },
  )
  const game = driver(created, START, rng)
  // Display가 연결된 상태에서 시작한다. 그래야 자동 일시정지 조건에 걸리지 않는다 (아키텍처 §8)
  game.presence(host, SEAT_CONNECTION.CONNECTED)
  const started = game.sendAs(host, lobbyStart)
  if (started.rejected) throw new Error(`시작 거절: ${started.reason} ${started.detail ?? ''}`)
  return game
}

/**
 * 계정이 없는 인간 좌석에 테스트용 계정을 붙인다.
 * 단계 테스트는 `{ isBot: false }`만 적어 좌석을 구성하는데, 그대로 두면
 * 아무도 앉지 않은 좌석이라 `lobby.start`가 봇으로 돌려 버린다 (룰북 §1)
 */
function withTestUsers(setup: SeatSetup): SeatSetup {
  const filled = {} as SeatSetup
  for (const role of SEAT_ORDER) {
    const entry = setup[role]
    filled[role] =
      entry.isBot || entry.userId != null ? entry : { ...entry, userId: `local-${role}` }
  }
  return filled
}

/** 로비에서 멈춘 상태로 새 게임을 만든다 (로비 테스트용) */
export function startLobby(seats?: number | SeatSetup, rng: Rng = LOW): Game {
  const setup =
    seats === undefined ? undefined : typeof seats === 'number' ? seatSetupForHumans(seats) : seats
  const created = createGame(
    { roomCode: 'TEST', hostUserId: HOST_USER_ID, seats: setup },
    { now: START, rng },
  )
  return driver(created, START, rng)
}

export type StartAtOptions = {
  /** 진입할 단계 */
  step: GameStep
  seats?: number | SeatSetup
  /** 진입 이후에 쓸 난수 */
  rng?: Rng
  /**
   * 게임 생성 직후, 단계 진입 전에 상태를 손본다.
   * `currentEvent`·`currentJudgment`는 이미 비워져 있다.
   */
  before?: (state: GameState) => void
}

/**
 * 게임을 만든 뒤 Phase 1을 건너뛰고 원하는 단계부터 돌린다.
 * 게임 생성은 첫 이벤트 진입까지 난수를 쓰므로 **항상 `LOW`로 만들고**,
 * 지정한 난수는 단계 진입부터 쓴다. 그래야 `rng`를 바꿔도 좌석 구성이 흔들리지 않는다.
 */
export function startAt(options: StartAtOptions): Game {
  const rng = options.rng ?? LOW
  const setup = withTestUsers(
    typeof options.seats === 'number' || options.seats === undefined
      ? seatSetupForHumans(options.seats ?? 3)
      : options.seats,
  )
  const created = createGame(
    { roomCode: 'TEST', hostUserId: HOST_USER_ID, seats: setup },
    { now: START, rng: LOW },
  )

  const state = created.state
  state.room.displayConnected = true
  state.currentEvent = null
  state.currentJudgment = null
  options.before?.(state)

  const out = createStepOutput()
  enterStep(state, options.step, { now: START, rng }, out)
  return driver(finishDispatch(state, out), START, rng)
}

// ── 공용 헬퍼 ────────────────────────────────────────────────────────

/** 튜토리얼 부적은 T1 종료 시 소멸한다 (룰북 §9.2). Phase 2·3부터 시작할 때 지워 둔다 */
export function clearTutorialTalismans(state: GameState): void {
  for (const role of SEAT_ORDER) state.seats[role].tutorialTalismanCount = 0
}

/** 지정한 좌석(기본값: 봇이 아닌 좌석 전부)이 같은 선택지에 투표한다 */
export function voteAll(game: Game, choiceId: string, seats?: BrotherRole[]): void {
  const targets = seats ?? SEAT_ORDER.filter((role) => !game.state.seats[role].isBot)
  for (const seat of targets) game.send(seat, vote(choiceId))
}

export function judgment(game: Game): JudgmentState {
  const value = game.state.currentJudgment
  if (value === null) throw new Error('진행 중인 판정이 없다')
  return value
}
