/**
 * 명령 거절 사유.
 * `rejected` 메시지가 이 값을 그대로 싣고 클라이언트가 분기하므로 shared에 둔다 (M3 계획 10절 2번).
 * 값은 엔진이 M1부터 쓰던 것과 같다.
 */
export const REJECTION_REASON = {
  /** 알 수 없는 명령이거나 프레임 모양이 어긋남 */
  UNKNOWN_COMMAND: 'unknownCommand',
  /** 이 단계에서 받지 않는 명령 */
  WRONG_STEP: 'wrongStep',
  /** 이 명령을 보낼 수 있는 좌석·기기가 아님 */
  WRONG_SEAT: 'wrongSeat',
  /** 좌석·단계는 맞지만 조건을 만족하지 않음 (부적 없음, 능력 소모, 이미 찬 좌석 등) */
  NOT_ALLOWED: 'notAllowed',
  /** 늦게 도착한 타이머 — 단계나 상태 버전이 어긋남 */
  STALE_TIMER: 'staleTimer',
  /** 종료 단계 */
  GAME_FINISHED: 'gameFinished',
  /** 처리기가 없는 단계 */
  UNHANDLED_STEP: 'unhandledStep',
} as const

export type RejectionReason = (typeof REJECTION_REASON)[keyof typeof REJECTION_REASON]
