import type { BrotherRole } from 'tal-brothers-shared'
import { SEAT_CONNECTION } from 'tal-brothers-shared'

import { SEAT_ORDER } from '../state/gameState'
import type { GameState, SeatState } from '../state/gameState'

/**
 * 좌석 판정의 단일 진입점 (M3 계획 5.3).
 *
 * M2까지는 `isBot` 하나로 세 가지를 판정했다. 봇 대행이 생기면서 셋이 갈라진다.
 *
 * | 서술어 | 뜻 | 쓰는 곳 |
 * |---|---|---|
 * | `isHumanSeat` | 좌석 **구성**이 인간인가 | 배신자 전환(룰북 §10.1), 전원 배신자 검사(§10.3), 1인 플레이 판정, Phase 3 타겟 우선순위(§14.1) |
 * | `isBotControlled` | 지금 **서버가 대신 조작**하는가 | 봇 굴림·부적 자동 사용·재굴림·강제 성공(§11), 좌석 명령 거절 |
 * | `connectedHumanSeats` | 지금 **연결된** 인간 좌석 | 투표 조기 마감(아키텍처 §8), 인간 Controller 0명 검사 |
 *
 * **봇 대행 중인 인간 좌석은 여전히 인간이다.** 100%에 도달하면 배신자로 전환하고(룰북 §10.1),
 * 봇 대행은 조작만 대신한다(§11).
 */

/** 좌석 구성이 인간인가 */
export function isHumanSeat(seat: SeatState): boolean {
  return !seat.isBot
}

/** 사람이 앉은 좌석인가. 로비에서 아무도 고르지 않은 좌석은 false다 */
export function isSeatOccupied(seat: SeatState): boolean {
  return seat.userId !== null
}

/** 지금 서버가 대신 조작하는가 (봇 좌석이거나 봇 대행 중) */
export function isBotControlled(seat: SeatState): boolean {
  return seat.isBot || seat.botTakeover
}

export function isSeatConnected(seat: SeatState): boolean {
  return seat.connection.status === SEAT_CONNECTION.CONNECTED
}

/** 좌석 구성이 인간인 좌석 (룰북 §8, §10). 연결 여부는 보지 않는다 */
export function humanSeats(state: GameState): BrotherRole[] {
  return SEAT_ORDER.filter((role) => isHumanSeat(state.seats[role]))
}

/** 사람이 앉아 있는 인간 좌석 */
export function occupiedHumanSeats(state: GameState): BrotherRole[] {
  return humanSeats(state).filter((role) => isSeatOccupied(state.seats[role]))
}

/** 지금 연결돼 있는 인간 좌석 (아키텍처 §8) */
export function connectedHumanSeats(state: GameState): BrotherRole[] {
  return occupiedHumanSeats(state).filter((role) => isSeatConnected(state.seats[role]))
}

/** 1인 플레이 — 배신자 모드가 없다 (룰북 §10.1). 좌석 **구성** 기준이다 */
export function isSoloHumanGame(state: GameState): boolean {
  return humanSeats(state).length === 1
}

/** 이 계정이 앉은 좌석. 재접속 시 같은 좌석으로 복귀시킬 때 쓴다 (아키텍처 §10) */
export function seatOfUser(state: GameState, userId: string): BrotherRole | null {
  return SEAT_ORDER.find((role) => state.seats[role].userId === userId) ?? null
}
