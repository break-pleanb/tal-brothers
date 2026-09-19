import type { BrotherRole, Command, CueKind, GameStep, RejectionReason } from 'tal-brothers-shared'

import type { Rng } from './random'
import type { GameState } from './state/gameState'

/**
 * 엔진 인터페이스 (아키텍처 §5.1).
 *
 * - 액션은 두 종류뿐이다: 플레이어 명령, 타이머 만료. 연결 변화(presence)는 M3-2에서 더한다
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

  /** Phase 진입 (룰북 §13.1) */
  PHASE_ENTERED: 'phaseEntered',
  /** 환경 잠식 전원 +5% (룰북 §4.2) */
  ENVIRONMENT_EROSION: 'environmentErosion',
  /** 이면의 형제 전환 (룰북 §10.1) */
  TRAITOR_TURNED: 'traitorTurned',
  /** 가짜 붉은 메시지 (룰북 §4.3). 진짜 전환과 cue가 같아 로그로만 구분된다 */
  FAKE_RED_MESSAGE: 'fakeRedMessage',
  /** 익명 표기의 실제 원인 (룰북 §5.5, §13.5). Display에는 출처 없이 나간다 */
  ANONYMOUS_NOTICE: 'anonymousNotice',
  /** 봇 100% 방해 (룰북 §11) */
  BOT_SABOTAGE: 'botSabotage',
  /** 부적 획득 (룰북 §9.1) */
  TALISMAN_GAINED: 'talismanGained',
  /** 부적 소모 — 판정 보정·회복·14A 제출 (룰북 §7.4, §9.1, §13.5) */
  TALISMAN_SPENT: 'talismanSpent',
  /** 보유 상한 초과분 정리 — 양도·버림·자동 폐기 (M2 계획 10.1) */
  TALISMAN_OVERFLOW: 'talismanOverflow',
  /** 14A 제출 창 결과 (룰북 §13.5) */
  TALISMAN_SUBMITTED: 'talismanSubmitted',
  /** 13번 발목 대상 지목 (룰북 §13.5) */
  SEAT_GRABBED: 'seatGrabbed',
  /** Phase 3 타겟 지정 (룰북 §14.1) */
  TARGET_SELECTED: 'targetSelected',
  /** 옥비녀 이동 (룰북 §14.1) */
  JADE_HAIRPIN_MOVED: 'jadeHairpinMoved',
  /** 대립 판정 결과 (룰북 §14.3, §14.4) */
  CONTEST_RESOLVED: 'contestResolved',
  /** 타임오버 — 시계 0 (룰북 §2.1) */
  CLOCK_TIMEOUT: 'clockTimeout',
  /** 엔딩 확정 (룰북 §15) */
  ENDING_DECIDED: 'endingDecided',
} as const

export type LogCode = (typeof LOG_CODE)[keyof typeof LOG_CODE]

export type LogEntry = {
  at: number
  code: LogCode
  message: string
  /** 문장을 다시 파싱하지 않고 읽을 수 있게 남기는 구조화된 값 */
  data?: Record<string, unknown>
}

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
