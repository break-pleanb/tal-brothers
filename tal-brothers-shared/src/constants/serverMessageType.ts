/** 서버 → 클라이언트 메시지 종류 (아키텍처 §7.2, M3 계획 3.1) */
export const SERVER_MESSAGE_TYPE = {
  /** hello 성공 직후 1회 — 방 코드, 기기 역할, 붙은 좌석 */
  WELCOME: 'welcome',
  /** 대상별 투영 전체 + 상태 버전 */
  SNAPSHOT: 'snapshot',
  /** 일회성 연출 신호. 스냅샷 뒤에 이어서 보내고 다시 보내지 않는다 */
  CUE: 'cue',
  /** 명령 거절 — 명령을 보낸 소켓에만 */
  REJECTED: 'rejected',
  /** 프레임을 못 읽었거나 인증 전 명령이 온 경우 */
  ERROR: 'error',
} as const

export type ServerMessageType = (typeof SERVER_MESSAGE_TYPE)[keyof typeof SERVER_MESSAGE_TYPE]
