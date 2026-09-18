import { BROTHER_ROLE } from 'tal-brothers-shared'
import type { BrotherRole, GamePhase, GameStep, JudgmentKind, VariantKind } from 'tal-brothers-shared'

import type { WhisperKind } from '../../scenario/scenarioTypes'

/**
 * 게임 상태 (아키텍처 §5.2 중 M1 범위).
 * 모든 시간은 epoch ms 절대 시각으로 들고 있고, 틱을 돌리지 않는다.
 * M2·M3 확장 지점은 주석으로만 표시하고 필드를 미리 만들지 않는다.
 */

/** 개입 수단 (룰북 §7.2) */
export const INTERVENTION_KIND = {
  /** 둘째 재굴림 */
  REROLL: 'reroll',
  /** 낡은 부적 +1 */
  TALISMAN: 'talisman',
  /** 첫째 강제 성공 */
  FORCE_SUCCESS: 'forceSuccess',
} as const

export type InterventionKind = (typeof INTERVENTION_KIND)[keyof typeof INTERVENTION_KIND]

/** Display 공개 알림 종류 (룰북 §17) */
export const PUBLIC_NOTICE_KIND = {
  /** 고유 능력 사용 — 형제 이름과 함께 공개 (룰북 §3.5) */
  ABILITY_USED: 'abilityUsed',
  /** 부적 사용 — 이름과 함께 공개 (룰북 §7.4) */
  TALISMAN_USED: 'talismanUsed',
  /** 익명 디버프 — 출처 없이 표시 (룰북 §5.5) */
  ANONYMOUS_MODIFIER: 'anonymousModifier',
  /** 귓속말 발송 알림 — 대상은 밝히지 않는다 (룰북 §16) */
  WHISPER_SENT: 'whisperSent',
  /** 마감 후 득표 수 공개 (룰북 §8) */
  VOTE_TALLY: 'voteTally',
} as const

export type PublicNoticeKind = (typeof PUBLIC_NOTICE_KIND)[keyof typeof PUBLIC_NOTICE_KIND]

/** T2 귓속말이 실어 보내는 내용 — 이장 선택지 1개와 그 변이 주장값 (룰북 §12) */
export type T2VariantWhisperPayload = {
  choiceId: string
  /** 귓속말이 주장하는 변이. 거짓 귓속말이면 실제 변이와 다르다 */
  variant: VariantKind
}

/**
 * 수신 좌석에 저장되는 귓속말.
 * 진실 여부는 서버만 아는 정보이므로 여기에 두지 않는다 (룰북 §17).
 */
export type ReceivedWhisper = {
  kind: WhisperKind
  text: string
  receivedAtEventId: string
  t2Variant?: T2VariantWhisperPayload
}

/** 발송이 예약된 귓속말. 진실 여부는 발생 시점에 확정해 여기에 저장한다 (룰북 §12) */
export type PendingWhisper = {
  kind: WhisperKind
  targetSeat: BrotherRole
  truthful: boolean
  /** 이 이벤트에 진입해 변이가 결정된 직후 발송한다 */
  deliverAtEventId: string
}

export type PublicNotice = {
  kind: PublicNoticeKind
  text: string
}

export type SeatState = {
  role: BrotherRole
  isBot: boolean
  /** 0~100, 5% 단위 (룰북 §4.1) */
  erosionPercent: number
  /** 낡은 부적 보유 수. 보유 상한 검사는 M2 (룰북 §9.1) */
  talismanCount: number
  /** 튜토리얼 부적. 판정 보정 전용이고 T1 종료 시 소멸 (룰북 §9.2) */
  tutorialTalismanCount: number
  /** 고유 능력 게임당 1회 (룰북 §3.5). 튜토리얼 사용은 소모하지 않는다 */
  abilityUsed: boolean
  whispers: ReceivedWhisper[]
}
// M2 확장 지점: isTraitor, fakeLabels, botSabotageUsed
// M3 확장 지점: userId, connected, disconnectedAt, botProxy

export type CurrentEventState = {
  eventId: string
  /** 선택지별 실제 변이. 진입 시 확정 저장 (룰북 §6.1) */
  variants: Record<string, VariantKind>
  /** 셋째 절대 시야를 이 이벤트에서 썼는지 (룰북 §3.4) */
  trueSightUsed: boolean
  votes: Partial<Record<BrotherRole, string>>
  adoptedChoiceId: string | null
  /** 협동 판정은 판정자가 없어 null (룰북 §5.2) */
  rollerSeat: BrotherRole | null
}

/** 주사위 1개. `value`가 null이면 아직 굴리지 않은 상태 */
export type DiceRoll = {
  seat: BrotherRole
  value: number | null
}

export type InterventionRecord = {
  step: GameStep
  seat: BrotherRole
  kind: InterventionKind
}

export type JudgmentState = {
  kind: JudgmentKind
  /** 변이 적용 후 최종 성공 기준 (룰북 §6.2) */
  threshold: number
  /** 개인·비공개는 1개, 협동은 3개 (룰북 §5.2) */
  dice: DiceRoll[]
  /** 직업 보정. 협동 판정은 0 (룰북 §3.1) */
  roleBonus: number
  /** 이 판정에 적용된 팀 플래그. 적용 후 소멸한다 (룰북 §5.5) */
  teamModifierApplied: number
  /** 부적 보정 (룰북 §7.4) */
  talismanBonus: number
  succeeded: boolean | null
  forcedSuccess: boolean
  /** 연습 개입 창 여부. true면 상태를 바꾸지 않는다 (룰북 §12) */
  isPractice: boolean
  /** 판정당 부적 1개 (룰북 §7.4) */
  talismanUsedThisJudgment: boolean
  /** 봇 부적 판단(마감 1초 전)을 이미 했는지 (룰북 §11) */
  botTalismanDecided: boolean
  interventions: InterventionRecord[]
}

export type GameState = {
  meta: {
    roomCode: string
    engineVersion: string
    scenarioVersion: string
    /** 액션이 적용될 때마다 1 오른다 (아키텍처 §5.1) */
    stateVersion: number
  }
  clock: {
    /** 게임 시계 마감 시각 (룰북 §2.1) */
    deadlineAt: number
  }
  progress: {
    phase: GamePhase
    /** 이벤트 순서표. Phase 1은 고정 순서 (룰북 §12) */
    eventOrder: string[]
    eventIndex: number
    step: GameStep
    stepDeadlineAt: number | null
  }
  seats: Record<BrotherRole, SeatState>
  currentEvent: CurrentEventState | null
  currentJudgment: JudgmentState | null
  /** 대기 중인 버프/디버프 합계 (룰북 §5.5) */
  teamModifier: number
  pendingWhispers: PendingWhisper[]
  /** Display용 공개 알림 (룰북 §17) */
  notices: PublicNotice[]
}
// M2 확장 지점: phase3, ending
// M3 확장 지점: pause

/** 좌석 순서 — 첫째 → 둘째 → 셋째. 순회 순서를 상태의 키 순서에 의존하지 않게 고정한다 */
export const SEAT_ORDER: readonly BrotherRole[] = [
  BROTHER_ROLE.FIRST,
  BROTHER_ROLE.SECOND,
  BROTHER_ROLE.THIRD,
]

export function seatOrder(state: GameState): SeatState[] {
  return SEAT_ORDER.map((role) => state.seats[role])
}

/** 상태를 깊게 복제한다. 거절 시 원본이 오염되지 않게 한다 (아키텍처 §5.1) */
export function cloneState(state: GameState): GameState {
  return structuredClone(state)
}
