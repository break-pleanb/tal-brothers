/** 일시정지 사유 (아키텍처 §8) */
export const PAUSE_REASON = {
  /** 호스트 수동 정지 — 이벤트 사이에만. 자동 누적 한도와 무관하다 */
  HOST: 'host',
  /** Display 연결 끊김 — 자동 */
  DISPLAY_GONE: 'displayGone',
  /** 연결된 인간 Controller 0명 — 자동 */
  NO_HUMAN_CONTROLLER: 'noHumanController',
} as const

export type PauseReason = (typeof PAUSE_REASON)[keyof typeof PAUSE_REASON]
