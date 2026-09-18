import { BROTHER_ROLE } from 'tal-brothers-shared'
import type {
  BrotherRole,
  EndingId,
  ErosionTier,
  GamePhase,
  GameStep,
  JudgmentKind,
  Phase3Route,
  VariantKind,
} from 'tal-brothers-shared'

import type { WhisperKind } from '../../scenario/constants/whisperKind'

/**
 * 게임 상태 (아키텍처 §5.2).
 * 모든 시간은 epoch ms 절대 시각으로 들고 있고, 틱을 돌리지 않는다.
 * 가짜 정보는 발생 시점에 확정해 여기에 저장한다 (아키텍처 §2 원칙 4).
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
  /** 익명 저주 — 14A 미제출 (룰북 §13.5) */
  ANONYMOUS_CURSE: 'anonymousCurse',
  /** 귓속말 발송 알림 — 대상은 밝히지 않는다 (룰북 §16) */
  WHISPER_SENT: 'whisperSent',
  /** 마감 후 득표 수 공개 (룰북 §8) */
  VOTE_TALLY: 'voteTally',
  /** 13번 발목 대상 공개 (룰북 §13.5) */
  SEAT_GRABBED: 'seatGrabbed',
  /** Phase 3 타겟 공개 (룰북 §14.1) */
  PHASE3_TARGET: 'phase3Target',
  /** 옥비녀 이동 공개 (룰북 §14.1) */
  JADE_HAIRPIN_MOVED: 'jadeHairpinMoved',
  /** 엔딩 (룰북 §15) */
  ENDING: 'ending',
} as const

export type PublicNoticeKind = (typeof PUBLIC_NOTICE_KIND)[keyof typeof PUBLIC_NOTICE_KIND]

/** T2 귓속말이 실어 보내는 내용 — 이장 선택지 1개와 그 변이 주장값 (룰북 §12) */
export type T2VariantWhisperPayload = {
  choiceId: string
  /** 귓속말이 주장하는 변이. 거짓 귓속말이면 실제 변이와 다르다 */
  variant: VariantKind
}

/** 잠식 구간을 알려주는 귓속말의 내용 (룰북 §13.4, §16) */
export type TierWhisperPayload = {
  aboutSeat: BrotherRole
  /** 귓속말이 주장하는 구간. 거짓이면 실제 구간과 다르다 */
  tier: ErosionTier
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
  tier?: TierWhisperPayload
}

/** 발송이 예약된 귓속말. 진실 여부는 발생 시점에 확정해 여기에 저장한다 (룰북 §12, §13.2) */
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
  /** 낡은 부적 보유 수. 상한 2 (룰북 §9.1) */
  talismanCount: number
  /**
   * 보유 상한을 넘겨 받은 초과분(보류함).
   * 판정 보정·회복 어느 용도로도 쓸 수 없고, 투표 시간 중 양도·버림으로만 정리한다 (M2 계획 10.1)
   */
  talismanOverflow: number
  /** 튜토리얼 부적. 판정 보정 전용이고 T1 종료 시 소멸 (룰북 §9.2) */
  tutorialTalismanCount: number
  /** 어머니의 옥비녀 — 비소모성이라 개수가 아니라 보유 여부다 (룰북 §9.3) */
  hasJadeHairpin: boolean
  /** 고유 능력 게임당 1회 (룰북 §3.5). 튜토리얼 사용은 소모하지 않는다 */
  abilityUsed: boolean
  /** 이면의 형제 — 잠식도 100% 도달 시 전환 (룰북 §10.1). 어떤 투영에도 넣지 않는다 */
  isTraitor: boolean
  /** 봇 100% 방해를 이미 썼는지. 게임당 1회 (룰북 §11) */
  botSabotageUsed: boolean
  whispers: ReceivedWhisper[]
}
// M3 확장 지점: userId, connected, disconnectedAt, botProxy

export type CurrentEventState = {
  eventId: string
  /** 선택지별 실제 변이. 진입 시 확정 저장 (룰북 §6.1) */
  variants: Record<string, VariantKind>
  /**
   * 좌석별 가짜 변이 라벨 (룰북 §4.3, M2 계획 10.2).
   * 이벤트 진입 시 좌석마다 1회 굴려 확정 저장한다. 전송마다 새로 굴리지 않는다
   */
  fakeLabels: Partial<Record<BrotherRole, Record<string, VariantKind>>>
  /** 셋째 절대 시야를 이 이벤트에서 썼는지 (룰북 §3.4) */
  trueSightUsed: boolean
  votes: Partial<Record<BrotherRole, string>>
  adoptedChoiceId: string | null
  /** 협동 판정은 판정자가 없어 null (룰북 §5.2) */
  rollerSeat: BrotherRole | null
  /** 13번 발목 대상 — 연출 전용 (룰북 §13.5) */
  grabbedSeat: BrotherRole | null
  /** 14A 부적 제출자 — 선착순 1명 (룰북 §13.5) */
  talismanSubmittedBy: BrotherRole | null
  /** 환경 잠식을 이미 적용했는지. 이벤트당 1회 (룰북 §4.2) */
  environmentErosionApplied: boolean
}

/** 주사위 1개. `value`가 null이면 아직 굴리지 않은 상태 */
export type DiceRoll = {
  seat: BrotherRole
  value: number | null
}

export type InterventionRecord = {
  step: GameStep
  /** 수단을 쓴 좌석 */
  seat: BrotherRole
  kind: InterventionKind
  /** 재굴림이 바꾼 주사위의 주인. 주사위를 바꾸지 않는 수단은 null */
  dieSeat: BrotherRole | null
  /** 적용 전 주사위 값. 재굴림만 값을 가진다 */
  diceBefore: number | null
  /** 적용 후 주사위 값 */
  diceAfter: number | null
  /** 개입 직전 최종값 (룰북 §5.1) */
  finalValueBefore: number
  /** 재판정 최종값 (룰북 §7.2) */
  finalValueAfter: number
  /** 재판정 성패 */
  succeeded: boolean
}

export type JudgmentState = {
  kind: JudgmentKind
  /** 변이 적용 후 최종 성공 기준. 대립 판정에서는 고정 기준 경로에만 쓴다 (룰북 §6.2, §14.3) */
  threshold: number
  /** 개인·비공개는 1개, 협동은 3개, 대립은 팀 측 좌석 수만큼 (룰북 §5.2, §14) */
  dice: DiceRoll[]
  /** 대립 판정에서 배신자 측이 굴린 주사위. 개입 대상이 아니다 (룰북 §14.2) */
  opponentDie: DiceRoll | null
  /** 상대 주사위와 겨루는 판정인지. 동점은 배신자 승이라 팀 최종값 > 상대값이어야 한다 (룰북 §14.3) */
  contest: boolean
  /** 팀 측 좌석 구성. A-2의 "타겟 제외 전원" 등을 고정 저장한다 (룰북 §14.4) */
  teamSeats: BrotherRole[]
  /** 직업 보정. 협동·대립 판정은 0 (룰북 §3.1, §14.2) */
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

/** Phase 3 진행 상태 (룰북 §14) */
export type Phase3State = {
  /** 잠식도 30% 이상 중 가장 높은 1명. 없으면 무사귀환 (룰북 §14.1) */
  targetSeat: BrotherRole | null
  route: Phase3Route | null
  /** 타겟이 옥비녀 보유자여서 옮겨간 좌석 (룰북 §14.1) */
  jadeHairpinMovedTo: BrotherRole | null
  /** 1인 플레이에서 본인이 타겟인 경우 (룰북 §14.5) */
  soloPlayTargetIsSelf: boolean
}

export type EndingState = {
  id: EndingId
  /**
   * 배신자 승패 (룰북 §15).
   * 배신자가 한 명도 없는 판에서는 승패를 판정하지 않으므로 `null`(해당 없음)이다.
   */
  traitorWon: boolean | null
  /** 전용 내레이션 키. 기본 내레이션이면 null (룰북 §14.5) */
  narrationKey: string | null
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
    /** 시계가 0을 지난 시각. Phase 3는 0을 지나도 진행하므로 지난 사실만 남긴다 (룰북 §14.2) */
    expiredAt: number | null
  }
  progress: {
    phase: GamePhase
    /** 이벤트 순서표. Phase마다 교체한다 (룰북 §12, §13.3) */
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
  phase3: Phase3State | null
  ending: EndingState | null
}
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
