import { DEVICE_ROLE } from 'tal-brothers-shared'
import type {
  BrotherRole,
  Command,
  CueKind,
  DeviceRole,
  GameStep,
  RejectionReason,
  SeatConnection,
} from 'tal-brothers-shared'

import type { Rng } from './random'
import type { GameState } from './state/gameState'

/**
 * 엔진 인터페이스 (아키텍처 §5.1).
 *
 * - 액션은 세 종류뿐이다: 플레이어 명령, 타이머 만료, 연결 변화(presence)
 * - 봇 입력은 별도 액션을 만들지 않고, 봇이 행동해야 하는 단계에서 엔진이 처리한다
 * - 현재 시각과 난수는 컨텍스트로 주입받는다. 엔진은 `Date.now`·`Math.random`을 쓰지 않는다
 */

export const ACTION_KIND = {
  COMMAND: 'command',
  TIMER_EXPIRY: 'timerExpiry',
  /** 연결 변화 — 런타임이 소켓 open/close를 이 액션으로 옮겨 넣는다 (M3 계획 5.1) */
  PRESENCE: 'presence',
} as const

export type ActionKind = (typeof ACTION_KIND)[keyof typeof ACTION_KIND]

/**
 * 액션을 보낸 주체 (아키텍처 §1, §7.1).
 *
 * ws 세션이 아는 것을 그대로 옮긴 모양이다. 좌석 바인딩은 전송 계층의 일이고(M3 계획 3.3 2겹),
 * 엔진은 여기 실린 좌석을 믿되 **단계·좌석 규칙은 직접 판정한다**(3겹).
 */
export type ActionActor = {
  device: DeviceRole
  /** 로그인 계정. 좌석을 고르지 않은 Controller도 이 값으로 구분한다. 시뮬·단위 테스트는 null */
  userId: string | null
  /** 이 소켓에 붙은 좌석. Display와 좌석 미선택 Controller는 null */
  seat: BrotherRole | null
}

/** 좌석에 앉아 있는 Controller. 시뮬·테스트가 쓰는 기본 형태다 */
export function seatActor(seat: BrotherRole, userId: string | null = null): ActionActor {
  return { device: DEVICE_ROLE.CONTROLLER, userId, seat }
}

/** 호스트 PC의 Display */
export function displayActor(userId: string | null = null): ActionActor {
  return { device: DEVICE_ROLE.DISPLAY, userId, seat: null }
}

/** 아직 좌석을 고르지 않은 Controller */
export function lobbyActor(userId: string): ActionActor {
  return { device: DEVICE_ROLE.CONTROLLER, userId, seat: null }
}

/** 플레이어 명령 — 보낸 주체와 명령 내용 */
export type CommandAction = {
  kind: typeof ACTION_KIND.COMMAND
  actor: ActionActor
  command: Command
}

/** 타이머 만료 — 현재 단계·버전과 다르면 무시한다 */
export type TimerExpiryAction = {
  kind: typeof ACTION_KIND.TIMER_EXPIRY
  step: GameStep
  stateVersion: number
}

/** 연결 변화 — 대상(좌석 또는 Display)과 연결 상태 (M3 계획 5.1) */
export type PresenceAction = {
  kind: typeof ACTION_KIND.PRESENCE
  target: ActionActor
  status: SeatConnection
}

export type EngineAction = CommandAction | TimerExpiryAction | PresenceAction

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

  /** 로비 좌석 변경 (M3 계획 10절 9번) */
  LOBBY_SEAT_CHANGED: 'lobbySeatChanged',
  /** 로비 시작 — 빈 좌석은 봇이 된다 (룰북 §1) */
  LOBBY_STARTED: 'lobbyStarted',
  /** 연결 변화 (아키텍처 §8) */
  PRESENCE_CHANGED: 'presenceChanged',
  /** 봇 대행 시작 (아키텍처 §8) */
  BOT_TAKEOVER_STARTED: 'botTakeoverStarted',
  /** 일시정지 (아키텍처 §8) */
  GAME_PAUSED: 'gamePaused',
  /** 재개 (아키텍처 §8) */
  GAME_RESUMED: 'gameResumed',
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
