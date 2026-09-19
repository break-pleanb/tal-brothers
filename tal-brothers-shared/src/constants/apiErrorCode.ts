/** REST 실패 응답의 코드 (M3 계획 4.2). 본문은 항상 `{ error: { code, message } }` 모양이다 */
export const API_ERROR_CODE = {
  /** 401 — 토큰 없음·만료 */
  UNAUTHENTICATED: 'unauthenticated',
  /** 403 — 권한 없음 (호스트가 아님) */
  FORBIDDEN: 'forbidden',
  /** 404 — 없는 방 코드 */
  ROOM_NOT_FOUND: 'roomNotFound',
  /** 409 — 이미 시작한 방에 참가 */
  ROOM_NOT_JOINABLE: 'roomNotJoinable',
  /** 400 — 요청 모양이 어긋남 */
  BAD_REQUEST: 'badRequest',
  /** 500 */
  INTERNAL: 'internal',
} as const

export type ApiErrorCode = (typeof API_ERROR_CODE)[keyof typeof API_ERROR_CODE]
