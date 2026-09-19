import { DEVICE_ROLE } from 'tal-brothers-shared'
import type { BrotherRole, SeatConnection } from 'tal-brothers-shared'

import type { ActionActor, PresenceAction } from '../engine/engineTypes'
import { ACTION_KIND } from '../engine/engineTypes'
import { seatOfUser } from '../engine/rules/seatControl'
import type { GameState } from '../engine/state/gameState'
import type { RoomConnection } from './roomTypes'

/**
 * 유저 ↔ 좌석, 소켓 ↔ 좌석 (아키텍처 §10, M3 계획 5.1).
 *
 * **좌석의 주인은 계정이다.** 소켓이 아니라 `userId`로 붙이므로, 같은 계정이 다른 기기로 접속해도
 * 좌석은 그대로 유지된다 (M3 계획 10절 12번). 좌석 자체를 고르고 바꾸는 일은 엔진의 로비 단계가 한다.
 */

/** 이 접속이 지금 조작하는 좌석. Display와 좌석 미선택 Controller는 null */
export function seatOfConnection(
  state: GameState,
  connection: RoomConnection,
): BrotherRole | null {
  if (connection.deviceRole !== DEVICE_ROLE.CONTROLLER) return null
  return seatOfUser(state, connection.userId)
}

/** 엔진에 넘길 주체. ws 세션이 아는 값을 그대로 옮긴다 */
export function actorOf(state: GameState, connection: RoomConnection): ActionActor {
  return {
    device: connection.deviceRole,
    userId: connection.userId,
    displayName: connection.displayName,
    seat: seatOfConnection(state, connection),
  }
}

/** 연결 변화 액션 (M3 계획 5.1) */
export function presenceActionFor(
  state: GameState,
  connection: RoomConnection,
  status: SeatConnection,
): PresenceAction {
  return {
    kind: ACTION_KIND.PRESENCE,
    target: actorOf(state, connection),
    status,
  }
}
