import { DEVICE_ROLE, GAME_STEP, SEAT_CONNECTION } from 'tal-brothers-shared'
import type { BrotherRole, SeatConnection } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'
import { LOG_CODE } from '../engineTypes'
import type { ActionActor, EngineContext, StepOutput } from '../engineTypes'
import { SEAT_ORDER } from '../state/gameState'
import type { GameState } from '../state/gameState'
import { syncAutoPause } from './pause'
import { isHumanSeat, isSeatOccupied } from './seatControl'

/**
 * 연결 변화 (M3 계획 5.1·5.2, 아키텍처 §8).
 *
 * 런타임은 소켓 open/close를 `presence` 액션으로 옮겨 넣기만 하고,
 * 봇 대행 전환과 자동 일시정지 판단은 여기서 한다. 연결 상태가 상태에 남아
 * 세이브·재현·테스트가 명령·타이머와 같은 방식이 된다.
 */

function botTakeoverMs(): number {
  return GAME_CONFIG.botTakeoverSeconds * 1000
}

/** 봇 대행 전환이 예정된 가장 이른 시각. 없으면 null (M3 계획 5.2) */
export function nextBotTakeoverAt(state: GameState): number | null {
  let earliest: number | null = null
  for (const role of SEAT_ORDER) {
    const seat = state.seats[role]
    if (seat.botTakeover) continue
    if (!isHumanSeat(seat) || !isSeatOccupied(seat)) continue
    if (seat.connection.disconnectedAt === null) continue

    const at = seat.connection.disconnectedAt + botTakeoverMs()
    if (earliest === null || at < earliest) earliest = at
  }
  return earliest
}

/**
 * 끊긴 지 30초가 지난 좌석을 봇 대행으로 돌린다 (아키텍처 §8).
 * 30초 안에 필요했던 입력은 기권·자동 굴림·미사용으로 이미 처리된다 (룰북 §8, §11).
 */
export function applyDueBotTakeovers(
  draft: GameState,
  context: EngineContext,
  out: StepOutput,
): BrotherRole[] {
  const turned: BrotherRole[] = []

  for (const role of SEAT_ORDER) {
    const seat = draft.seats[role]
    if (seat.botTakeover) continue
    if (!isHumanSeat(seat) || !isSeatOccupied(seat)) continue
    if (seat.connection.disconnectedAt === null) continue
    if (context.now < seat.connection.disconnectedAt + botTakeoverMs()) continue

    seat.botTakeover = true
    turned.push(role)
    out.logs.push({
      at: context.now,
      code: LOG_CODE.BOT_TAKEOVER_STARTED,
      message: `${role} 봇 대행 시작 (끊긴 지 ${GAME_CONFIG.botTakeoverSeconds}초)`,
      data: { seat: role },
    })
  }
  return turned
}

/**
 * 연결 변화를 상태에 적용한다.
 *
 * - Display: `room.displayConnected`
 * - 좌석: `connection`과 봇 대행 해제
 * - 두 경우 모두 자동 일시정지 조건을 다시 본다
 */
export function applyPresence(
  draft: GameState,
  target: ActionActor,
  status: SeatConnection,
  context: EngineContext,
  out: StepOutput,
): void {
  const connected = status === SEAT_CONNECTION.CONNECTED

  if (target.device === DEVICE_ROLE.DISPLAY) {
    draft.room.displayConnected = connected
    out.logs.push({
      at: context.now,
      code: LOG_CODE.PRESENCE_CHANGED,
      message: `Display ${connected ? '연결' : '끊김'}`,
      data: { target: DEVICE_ROLE.DISPLAY, status },
    })
  } else if (target.seat !== null) {
    const seat = draft.seats[target.seat]
    seat.connection = {
      status,
      disconnectedAt: connected ? null : context.now,
    }
    // 재접속하면 봇 대행을 즉시 해제한다. 예약돼 있던 전환은 끊긴 시각이 지워져 더 이상 오지 않는다
    if (connected) seat.botTakeover = false

    out.logs.push({
      at: context.now,
      code: LOG_CODE.PRESENCE_CHANGED,
      message: `${target.seat} ${connected ? '연결' : '끊김'}`,
      data: { target: target.seat, status },
    })
  }

  // 로비에서는 정지하지 않는다. 시작 전에는 기다리면 된다
  if (draft.progress.step === GAME_STEP.LOBBY) return
  syncAutoPause(draft, context, out)
}
