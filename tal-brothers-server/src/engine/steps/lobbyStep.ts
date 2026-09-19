import { COMMAND_TYPE, DEVICE_ROLE, GAME_STEP, REJECTION_REASON } from 'tal-brothers-shared'
import type { BrotherRole, Command } from 'tal-brothers-shared'

import { LOG_CODE, reject } from '../engineTypes'
import type { ActionActor, EngineContext, Rejection, StepOutput } from '../engineTypes'
import { isHumanSeat, isSeatOccupied, seatOfUser } from '../rules/seatControl'
import { SEAT_ORDER } from '../state/gameState'
import type { GameState } from '../state/gameState'

/**
 * 로비 (M3 계획 10절 8번·9번, 룰북 §1).
 *
 * - 좌석 선택·해제·이동은 시작 전에는 자유롭다. 이미 찬 좌석은 고를 수 없다
 * - 봇 토글과 시작은 **호스트 Display만** 보낸다 (아키텍처 §7.1)
 * - 시작 시점에 비어 있는 좌석은 봇이 된다 (룰북 §1)
 * - 게임 시계는 로비가 아니라 **시작 시점부터** 흐른다 (룰북 §2.1)
 */

/** 이 주체가 호스트 Display인지 (아키텍처 §1) */
export function isHostDisplay(state: GameState, actor: ActionActor): boolean {
  if (actor.device !== DEVICE_ROLE.DISPLAY) return false
  if (state.room.hostUserId === null) return actor.userId === null
  return actor.userId === state.room.hostUserId
}

/** 시작할 수 있는지 — 사람이 앉은 좌석이 1칸 이상이어야 한다 (룰북 §1 "인간 플레이어 1~3명") */
export function canStartGame(state: GameState): boolean {
  return SEAT_ORDER.some((role) => {
    const seat = state.seats[role]
    return isHumanSeat(seat) && isSeatOccupied(seat)
  })
}

function clearSeat(state: GameState, role: BrotherRole): void {
  const seat = state.seats[role]
  seat.userId = null
  seat.displayName = null
}

/** 좌석 선택·이동·해제 (M3 계획 10절 9번) */
function pickSeat(
  draft: GameState,
  context: EngineContext,
  out: StepOutput,
  actor: ActionActor,
  target: BrotherRole,
): Rejection | undefined {
  if (actor.device !== DEVICE_ROLE.CONTROLLER) {
    return reject(REJECTION_REASON.WRONG_SEAT, '좌석은 Controller만 고른다')
  }
  if (actor.userId === null) {
    return reject(REJECTION_REASON.NOT_ALLOWED, '좌석을 고르려면 계정이 필요하다')
  }

  const seat = draft.seats[target]
  if (seat === undefined) return reject(REJECTION_REASON.WRONG_SEAT, target)

  const previous = seatOfUser(draft, actor.userId)

  // 지금 앉은 좌석을 다시 고르면 일어선다
  if (previous === target) {
    clearSeat(draft, target)
    out.logs.push({
      at: context.now,
      code: LOG_CODE.LOBBY_SEAT_CHANGED,
      message: `${target} 좌석 해제`,
      data: { seat: target, occupied: false },
    })
    return undefined
  }

  if (seat.isBot) {
    return reject(REJECTION_REASON.NOT_ALLOWED, '봇으로 지정된 좌석이다')
  }
  if (isSeatOccupied(seat)) {
    return reject(REJECTION_REASON.NOT_ALLOWED, '이미 찬 좌석이다')
  }

  if (previous !== null) clearSeat(draft, previous)
  seat.userId = actor.userId
  // 표시 이름은 게임 중 좌석 줄·공개 알림에도 쓴다 (룰북 §17, §21)
  seat.displayName = actor.displayName ?? null

  out.logs.push({
    at: context.now,
    code: LOG_CODE.LOBBY_SEAT_CHANGED,
    message: `${target} 좌석 선택${previous === null ? '' : ` (${previous}에서 이동)`}`,
    data: { seat: target, occupied: true, from: previous },
  })
  return undefined
}

/** 봇 토글 — 사람이 앉은 좌석은 봇으로 돌릴 수 없다 */
function toggleBot(
  draft: GameState,
  context: EngineContext,
  out: StepOutput,
  actor: ActionActor,
  target: BrotherRole,
  isBot: boolean,
): Rejection | undefined {
  if (!isHostDisplay(draft, actor)) {
    return reject(REJECTION_REASON.WRONG_SEAT, '봇 토글은 호스트 Display만 보낸다')
  }

  const seat = draft.seats[target]
  if (seat === undefined) return reject(REJECTION_REASON.WRONG_SEAT, target)
  if (isBot && isSeatOccupied(seat)) {
    return reject(REJECTION_REASON.NOT_ALLOWED, '사람이 앉은 좌석이다')
  }

  seat.isBot = isBot
  out.logs.push({
    at: context.now,
    code: LOG_CODE.LOBBY_SEAT_CHANGED,
    message: `${target} ${isBot ? '봇' : '사람 자리'}로 변경`,
    data: { seat: target, isBot },
  })
  return undefined
}

/** 시작 — 빈 좌석을 봇으로 채우고 게임 시계를 건다 (룰북 §1, §2.1) */
function startGame(
  draft: GameState,
  context: EngineContext,
  out: StepOutput,
  actor: ActionActor,
): Rejection | undefined {
  if (!isHostDisplay(draft, actor)) {
    return reject(REJECTION_REASON.WRONG_SEAT, '시작은 호스트 Display만 보낸다')
  }
  if (!canStartGame(draft)) {
    return reject(REJECTION_REASON.NOT_ALLOWED, '사람이 앉은 좌석이 없다')
  }

  const filled: BrotherRole[] = []
  for (const role of SEAT_ORDER) {
    const seat = draft.seats[role]
    if (isSeatOccupied(seat)) continue
    if (seat.isBot) continue
    seat.isBot = true
    filled.push(role)
  }

  // 게임 시계는 로비가 아니라 시작 시점부터 흐른다 (룰북 §2.1).
  // 길이는 방을 만들 때 정해진 값이다 — 기본은 룰북 §19의 100분이다 (아키텍처 §8)
  draft.clock.deadlineAt = context.now + draft.clock.durationMs

  out.logs.push({
    at: context.now,
    code: LOG_CODE.LOBBY_STARTED,
    message: `게임 시작 — 빈 좌석 ${filled.length}칸을 봇으로 채움`,
    data: {
      botFilled: filled,
      humanSeats: SEAT_ORDER.filter((role) => isHumanSeat(draft.seats[role])),
    },
  })

  out.next = GAME_STEP.EVENT_INTRO
  return undefined
}

/**
 * 로비 단계 처리기.
 * 주체(계정·기기 역할)를 봐야 하므로 좌석 전용 `command`가 아니라 `actorCommand`를 쓴다.
 */
export const LOBBY_HANDLER = {
  actorCommand(
    draft: GameState,
    context: EngineContext,
    out: StepOutput,
    actor: ActionActor,
    command: Command,
  ): Rejection | undefined {
    switch (command.type) {
      case COMMAND_TYPE.LOBBY_PICK_SEAT:
        return pickSeat(draft, context, out, actor, command.seat)
      case COMMAND_TYPE.LOBBY_TOGGLE_BOT:
        return toggleBot(draft, context, out, actor, command.seat, command.isBot)
      case COMMAND_TYPE.LOBBY_START:
        return startGame(draft, context, out, actor)
      default:
        return reject(REJECTION_REASON.WRONG_STEP, command.type)
    }
  },
}
