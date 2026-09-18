import type { BrotherRole, Command, GameStep } from 'tal-brothers-shared'

import type { Rng } from './random'
import type { GameState } from './state/gameState'

/**
 * 엔진 인터페이스 (아키텍처 §5.1).
 *
 * - 액션은 두 종류뿐이다: 플레이어 명령, 타이머 만료
 * - 봇 입력은 별도 액션을 만들지 않고, 봇이 행동해야 하는 단계에서 엔진이 처리한다
 * - 현재 시각과 난수는 컨텍스트로 주입받는다. 엔진은 `Date.now`·`Math.random`을 쓰지 않는다
 */

export const ACTION_KIND = {
  COMMAND: 'command',
  TIMER_EXPIRY: 'timerExpiry',
} as const

export type ActionKind = (typeof ACTION_KIND)[keyof typeof ACTION_KIND]

/** 플레이어 명령 — 좌석과 명령 내용 */
export type CommandAction = {
  kind: typeof ACTION_KIND.COMMAND
  seat: BrotherRole
  command: Command
}

/** 타이머 만료 — 현재 단계·버전과 다르면 무시한다 */
export type TimerExpiryAction = {
  kind: typeof ACTION_KIND.TIMER_EXPIRY
  step: GameStep
  stateVersion: number
}

export type EngineAction = CommandAction | TimerExpiryAction

export type EngineContext = {
  /** epoch ms */
  now: number
  rng: Rng
}

/** 일회성 연출 신호 (아키텍처 §7.2) */
export const CUE_KIND = {
  /** 이벤트 진입 */
  EVENT_INTRO: 'eventIntro',
  /** 튜토리얼 부적 지급 (룰북 §9.2) */
  TUTORIAL_TALISMAN_GRANTED: 'tutorialTalismanGranted',
  /** 귓속말 수신 — 수신 좌석에만 (룰북 §16) */
  WHISPER_RECEIVED: 'whisperReceived',
  /** 절대 시야 열람 결과 — 셋째에게만 (룰북 §3.4) */
  TRUE_SIGHT_RESULT: 'trueSightResult',
  /** 주사위 굴림 연출 */
  DICE_ROLLED: 'diceRolled',
  /** 공개 판정 결과 */
  JUDGMENT_RESULT: 'judgmentResult',
  /** 비공개 판정 — "판정 완료"만 표시 (룰북 §5.4) */
  HIDDEN_JUDGMENT_DONE: 'hiddenJudgmentDone',
  /** 개입 수단 사용 (룰북 §7.2) */
  INTERVENTION_USED: 'interventionUsed',
  /** 연습 개입 창의 설명 팝업 — 상태 변화 없음 (룰북 §12) */
  PRACTICE_EXPLAIN: 'practiceExplain',
  /** 튜토리얼에서 첫째가 본인 판정이라 강제 성공을 쓸 수 없을 때의 설명 (룰북 §12) */
  FORCE_SUCCESS_EXPLAIN: 'forceSuccessExplain',
  /** 결과 적용 */
  RESOLUTION: 'resolution',
  /** Phase 1 종료 — M2에서 Phase 2 진입으로 교체 */
  PHASE1_COMPLETE: 'phase1Complete',
} as const

export type CueKind = (typeof CUE_KIND)[keyof typeof CUE_KIND]

export const CUE_AUDIENCE = {
  DISPLAY: 'display',
  ALL_SEATS: 'allSeats',
} as const

/** cue 수신 대상 — Display, 전체 좌석, 또는 특정 좌석 */
export type CueAudience = (typeof CUE_AUDIENCE)[keyof typeof CUE_AUDIENCE] | BrotherRole

export type Cue = {
  kind: CueKind
  audience: CueAudience
  text: string
  data?: Record<string, unknown>
}

/** 진행 로그 — 감사·시뮬레이션용. 화면 문구가 아니다 */
export const LOG_CODE = {
  GAME_CREATED: 'gameCreated',
  EVENT_ENTERED: 'eventEntered',
  TUTORIAL_TALISMAN_GRANTED: 'tutorialTalismanGranted',
  TUTORIAL_TALISMAN_EXPIRED: 'tutorialTalismanExpired',
  VARIANTS_DECIDED: 'variantsDecided',
  WHISPER_DELIVERED: 'whisperDelivered',
  VOTE_SUBMITTED: 'voteSubmitted',
  VOTE_TALLIED: 'voteTallied',
  ABILITY_USED: 'abilityUsed',
  TALISMAN_HEALED: 'talismanHealed',
  DICE_ROLLED: 'diceRolled',
  JUDGMENT_RESOLVED: 'judgmentResolved',
  INTERVENTION_USED: 'interventionUsed',
  INTERVENTION_SKIPPED: 'interventionSkipped',
  HIDDEN_JUDGMENT_COST: 'hiddenJudgmentCost',
  EFFECTS_APPLIED: 'effectsApplied',
  CLOCK_EXPIRED: 'clockExpired',
  PHASE_COMPLETE: 'phaseComplete',
} as const

export type LogCode = (typeof LOG_CODE)[keyof typeof LOG_CODE]

export type LogEntry = {
  at: number
  code: LogCode
  message: string
  /** 문장을 다시 파싱하지 않고 읽을 수 있게 남기는 구조화된 값 */
  data?: Record<string, unknown>
}

export const REJECTION_REASON = {
  /** M1 범위 밖 명령이거나 알 수 없는 명령 */
  UNKNOWN_COMMAND: 'unknownCommand',
  /** 이 단계에서 받지 않는 명령 */
  WRONG_STEP: 'wrongStep',
  /** 이 명령을 보낼 수 있는 좌석이 아님 */
  WRONG_SEAT: 'wrongSeat',
  /** 좌석·단계는 맞지만 조건을 만족하지 않음 (부적 없음, 능력 소모 등) */
  NOT_ALLOWED: 'notAllowed',
  /** 늦게 도착한 타이머 — 단계나 상태 버전이 어긋남 */
  STALE_TIMER: 'staleTimer',
  /** 종료 단계 */
  GAME_FINISHED: 'gameFinished',
  /** 처리기가 아직 없는 단계 (M2·M3 범위) */
  UNHANDLED_STEP: 'unhandledStep',
} as const

export type RejectionReason = (typeof REJECTION_REASON)[keyof typeof REJECTION_REASON]

export type Rejection = {
  rejected: true
  reason: RejectionReason
  detail?: string
}

/** 예약할 타이머. 늦은 타이머를 걸러내기 위해 단계와 상태 버전을 함께 담는다 */
export type TimerDeadline = {
  at: number
  step: GameStep
  stateVersion: number
}

export type DispatchSuccess = {
  rejected: false
  state: GameState
  cues: Cue[]
  logs: LogEntry[]
  nextDeadline: TimerDeadline | null
}

export type DispatchResult = DispatchSuccess | Rejection

/** 단계 처리기가 쌓는 출력 */
export type StepOutput = {
  cues: Cue[]
  logs: LogEntry[]
  /** 이 처리의 결과로 이동할 단계. 비어 있으면 현재 단계에 머문다 */
  next?: GameStep
  /**
   * 다음 타이머 발화 시각을 직접 지정한다.
   * 비어 있으면 `progress.stepDeadlineAt + 입력 유예`가 쓰인다.
   * 단계 마감보다 이른 중간 타이머(봇 부적 판단 등)에 쓴다.
   */
  timerAt?: number
}

export function reject(reason: RejectionReason, detail?: string): Rejection {
  return { rejected: true, reason, detail }
}

export function createStepOutput(): StepOutput {
  return { cues: [], logs: [] }
}
