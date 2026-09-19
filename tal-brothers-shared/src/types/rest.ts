import type { ApiErrorCode } from '../constants/apiErrorCode'
import type { GameStep } from '../constants/gameStep'

/**
 * REST 요청·응답 (M3 계획 4.2).
 *
 * - 베이스는 `/api`, 응답은 모두 JSON이다
 * - 인증은 `Authorization: Bearer <access_token>` 헤더로만 한다
 * - **방 상태의 원본은 서버 메모리다.** `rooms` 테이블은 초대 코드 조회와 이력용이다 (아키텍처 §10)
 * - 좌석 선택은 여기에 없다. 좌석은 경쟁 자원이라 방당 직렬 큐를 지나야 한다 (ws `lobby.pickSeat`)
 */

/** `POST /api/rooms/:roomCode/join`은 본문이 없다 */
export type EmptyRequestBody = Record<string, never>

/**
 * `POST /api/rooms` 본문 (아키텍처 §8).
 * 개발용 항목뿐이라 모든 필드가 선택이다. **운영 환경의 서버는 이 본문을 통째로 무시한다.**
 */
export type CreateRoomRequest = {
  /**
   * 이 방의 게임 시계 길이(분). 타임오버·엔딩 화면을 짧은 판으로 확인하기 위한 **개발용**이다.
   * 룰북 §19의 100분은 그대로 두고 이 방 하나만 바꾼다. 개발 환경에서만 받는다
   */
  devClockMinutes?: number
}

export type CreateRoomResponse = {
  roomCode: string
  hostUserId: string
  /** epoch ms */
  createdAt: number
}

export type RoomInfoResponse = {
  roomCode: string
  /** 호스트 표시 이름. 프로필이 없으면 null */
  hostName: string | null
  step: GameStep
  /** 인간이 앉은 좌석 수 */
  seatCount: number
  /** 아직 로비이고 정원이 남았는지 */
  joinable: boolean
}

export type JoinRoomResponse = {
  roomCode: string
  /** 방 멤버 식별자 — 좌석이 아니라 참가 자격이다 */
  memberId: string
}

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode
    message: string
  }
}

export type HealthResponse = {
  ok: true
}
