/** 클라이언트 → 서버 프레임 종류 (M3 계획 3.1) */
export const CLIENT_FRAME_TYPE = {
  /** 연결 직후 1회 인증. 토큰은 URL에 싣지 않고 이 본문에 담는다 (아키텍처 §10) */
  HELLO: 'hello',
  /** 게임 명령 */
  COMMAND: 'command',
  /** 상태 버전이 건너뛰었을 때의 전체 스냅샷 재요청 */
  RESYNC: 'resync',
} as const

export type ClientFrameType = (typeof CLIENT_FRAME_TYPE)[keyof typeof CLIENT_FRAME_TYPE]
