import type { AssetKey } from '../constants/assetKey'
import type { Attribute } from '../constants/attribute'
import type { BrotherRole } from '../constants/brotherRole'
import type { EndingId } from '../constants/endingId'
import type { GamePhase } from '../constants/gamePhase'
import type { GameStep } from '../constants/gameStep'
import type { JudgmentKind } from '../constants/judgmentKind'
import type { PauseReason } from '../constants/pauseReason'
import type { Phase3Route } from '../constants/phase3Route'
import type { PublicNoticeKind } from '../constants/publicNoticeKind'
import type { SeatConnection } from '../constants/seatConnection'
import type { WhisperKind } from '../constants/whisperKind'
import type { VariantKind } from '../constants/variantKind'

/**
 * 대상별 투영 스냅샷 (아키텍처 §7.3, 룰북 §17).
 *
 * - 서버는 상태를 복사해 지우지 않고 **필요한 필드만 골라 새 객체를 만든다**
 * - 시나리오 수치(성공 기준·보상·페널티)는 채택 전 선택지에 실리지 않는다. 비공개 판정의 대가만 예외다
 * - `isTraitor`는 어떤 스냅샷에도 넣지 않는다. 전환은 붉은 메시지 cue로만 알린다
 * - 배신자 좌석과 일반 좌석의 스냅샷은 **키 목록이 같아야** 한다
 */

/** 투표 화면의 선택지 — 문장과 판정 유형·속성 태그까지만 (룰북 §6.4) */
export type ChoiceView = {
  id: string
  text: string
  /** 판정이 없는 선택지는 null */
  judgmentKind: JudgmentKind | null
  /** 협동·아이템·대립 판정은 속성 태그가 없다 */
  attribute: Attribute | null
  /** 비공개 판정의 대가 표기 — 수치 비공개 원칙의 유일한 예외 (룰북 §5.4) */
  hiddenCostPercent: number | null
}

export type DiceView = {
  seat: BrotherRole
  value: number | null
}

/** 개입 창 중계 — 누가 어떤 수단을 썼는지는 공개 정보다 (룰북 §7.4, §17) */
export type InterventionView = {
  seat: BrotherRole
  kind: string
  finalValueAfter: number
}

/**
 * 판정 중계 (룰북 §17).
 * 비공개 판정은 주사위·기준·성패를 모두 null로 두고 "판정 완료"만 알린다 (룰북 §5.4).
 */
export type JudgmentView = {
  kind: JudgmentKind
  /**
   * 상대 주사위와 겨루는 대립 판정인지 (룰북 §14.3, §14.4).
   * Phase 3 판정(`kind: 'contest'`)은 타겟이 인간 배신자일 때만 대립이고,
   * 그 밖에는 `false`로 나가 **고정 기준 판정**임을 알린다.
   * 투표 화면의 `ChoiceView`에는 넣지 않는다. 굴림 전에 알리면 배신자 여부가 새기 때문이다 (룰북 §17)
   */
  contest: boolean
  dice: DiceView[] | null
  /** 대립 판정 상대 측 주사위 (룰북 §14.3) */
  opponentValue: number | null
  finalValue: number | null
  threshold: number | null
  succeeded: boolean | null
  forcedSuccess: boolean
  interventions: InterventionView[]
}

/** 투표 중에는 참여 인원 수만, 마감 후에는 득표 수만 (룰북 §8, 아키텍처 §8) */
export type VoteView =
  | { closed: false; participantCount: number; counts: null }
  | { closed: true; participantCount: number; counts: Record<string, number> }

/** 출처를 밝히지 않는 Display 알림 (룰북 §5.5, §16, §17) */
export type NoticeView = {
  kind: PublicNoticeKind
  text: string
}

/** 받은 귓속말 — 수신 좌석에만 나간다 (룰북 §16) */
export type WhisperView = {
  kind: WhisperKind
  text: string
}

/** Phase 3 공개 정보 (룰북 §17) */
export type Phase3View = {
  targetSeat: BrotherRole | null
  jadeHairpinMovedTo: BrotherRole | null
  route: Phase3Route | null
}

export type EndingView = {
  id: EndingId
  /** 1인 플레이 전용 내레이션 분기 (룰북 §14.5) */
  narrationKey: string | null
}

/** 로비 좌석 1칸. 잠식도·인벤토리는 아직 없고 점유 여부만 보인다 */
export type LobbySeatView = {
  seat: BrotherRole
  isBot: boolean
  /** 사람이 이 좌석을 잡고 있는지 */
  occupied: boolean
  /** 좌석 주인의 표시 이름. 비어 있으면 null. `userId`는 어떤 투영에도 넣지 않는다 */
  displayName: string | null
}

/** 로비 현황 (M3 계획 8.4). `LOBBY` 단계에서만 값이 있다 */
export type LobbyView = {
  seats: LobbySeatView[]
  /**
   * 시작 가능 여부 — 인간이 1명 이상 앉아야 한다 (룰북 §1).
   * 시작 시점의 빈 좌석은 봇이 된다 (M3 계획 10절 8번)
   */
  canStart: boolean
}

/** 일시정지 표시 (아키텍처 §8). 자동 정지 누적 시간은 운영 수치라 보내지 않는다 */
export type PauseView = {
  reason: PauseReason
  pausedAt: number
  /** 정지 전에 머물던 단계. 재개하면 이 단계로 돌아간다 */
  resumeStep: GameStep
}

/**
 * Display에만 나가는 좌석별 연결 상태 (룰북 §17, 아키텍처 §7.3).
 * 표기는 "연결 끊김"으로 통일하고 봇 대행 여부는 싣지 않는다.
 */
export type SeatConnectionView = {
  seat: BrotherRole
  connection: SeatConnection
}

/** Display와 좌석이 함께 받는 공개 항목 */
export type PublicView = {
  stateVersion: number
  phase: GamePhase
  step: GameStep
  stepDeadlineAt: number | null
  clockDeadlineAt: number
  background: AssetKey | null
  mask: AssetKey | null
  eventTitle: string | null
  narration: string | null
  choices: ChoiceView[]
  adoptedChoiceId: string | null
  vote: VoteView | null
  judgment: JudgmentView | null
  notices: NoticeView[]
  /** 13번 발목 대상 — Display에 공개한다 (룰북 §13.5) */
  grabbedSeat: BrotherRole | null
  phase3: Phase3View | null
  ending: EndingView | null
  /** `LOBBY` 단계에서만 값이 있다 */
  lobby: LobbyView | null
  /** `PAUSED` 단계에서만 값이 있다 */
  pause: PauseView | null
}

/** 본인 폰에만 나가는 항목 (룰북 §17) */
export type SeatPrivateView = {
  seat: BrotherRole
  erosionPercent: number
  talismanCount: number
  /** 상한 초과 보류함. 판정 보정·회복에 쓸 수 없다 (M2 계획 10.1) */
  talismanOverflow: number
  tutorialTalismanCount: number
  hasJadeHairpin: boolean
  abilityUsed: boolean
  whispers: WhisperView[]
  myVote: string | null
  /**
   * 선택지별 변이 라벨.
   * 배신자와 절대 시야를 쓴 셋째는 진짜, 60~99%는 확정 저장된 가짜, 그 외에는 null (룰북 §6.4)
   */
  variantLabels: Record<string, VariantKind> | null
  /** **본인 좌석의** 연결 상태. 다른 좌석의 연결 상태는 Controller에 보내지 않는다 (룰북 §17) */
  connection: SeatConnection
  /** 지금 서버가 대신 조작하고 있는지 (아키텍처 §8). 본인에게만 알린다 */
  botTakeover: boolean
}

/**
 * 아직 좌석을 고르지 않은 Controller가 받는 스냅샷 — 공개 항목만.
 * 로비에서 좌석을 고르기 전까지 쓰고, 좌석이 생기면 `SeatSnapshot`으로 바뀐다.
 */
export type PublicSnapshot = PublicView

export type DisplaySnapshot = PublicView & {
  /** 좌석별 연결 상태 — Display 전용 (룰북 §17) */
  seatConnections: SeatConnectionView[]
}

export type SeatSnapshot = PublicView & SeatPrivateView
