import { COMMAND_TYPE } from '../constants/commandType'
import type { BrotherRole } from '../constants/brotherRole'

/**
 * 클라이언트 → 서버 명령 (M2 범위 10종).
 * 좌석 식별은 명령 본문이 아니라 엔진 액션 봉투가 담으므로 여기에 좌석 필드를 두지 않는다 (아키텍처 §5.1).
 */

/** 투표 — 마감 전 재전송으로 변경 (룰북 §8). Phase 3 A 루트 투표도 같은 명령 (룰북 §14.4) */
export type VoteSubmitCommand = {
  type: typeof COMMAND_TYPE.VOTE_SUBMIT
  choiceId: string
}

/** 주사위 굴림 — 개인·비공개는 판정자, 협동·대립은 발신 좌석의 본인 주사위 (룰북 §5.2) */
export type RollRequestCommand = {
  type: typeof COMMAND_TYPE.ROLL_REQUEST
}

/** 셋째 절대 시야 — 투표 시간 중 게임당 1회 (룰북 §3.4) */
export type AbilityTrueSightCommand = {
  type: typeof COMMAND_TYPE.ABILITY_TRUE_SIGHT
}

/** 둘째 재굴림 — 개인은 유일 주사위, 협동·대립은 팀 측 주사위 (룰북 §3.3) */
export type InterventionRerollCommand = {
  type: typeof COMMAND_TYPE.INTERVENTION_REROLL
}

/** 부적 판정 보정 — 판정당 1개, 서버 도달 선착순 (룰북 §7.4) */
export type InterventionTalismanCommand = {
  type: typeof COMMAND_TYPE.INTERVENTION_TALISMAN
}

/** 첫째 강제 성공 — 본인 잠식도 +15%. Phase 3에서는 쓸 수 없다 (룰북 §3.2, §14.2) */
export type InterventionForceSuccessCommand = {
  type: typeof COMMAND_TYPE.INTERVENTION_FORCE_SUCCESS
}

/** 부적 잠식도 회복 — 투표 시간 중 -10%. 튜토리얼 부적과 보류함은 쓸 수 없다 (룰북 §9.1, §9.2) */
export type TalismanHealCommand = {
  type: typeof COMMAND_TYPE.TALISMAN_HEAL
}

/** 14A 부적 제출 — 제출 창 8초, 선착순 1개 (룰북 §13.5) */
export type TalismanSubmitCommand = {
  type: typeof COMMAND_TYPE.TALISMAN_SUBMIT
}

/** 보유 상한 초과분 양도 — 받는 좌석이 상한 미만일 때만 (룰북 §9.1, M2 계획 10.1) */
export type TalismanTransferCommand = {
  type: typeof COMMAND_TYPE.TALISMAN_TRANSFER
  toSeat: BrotherRole
}

/** 보유 상한 초과분 버림 (룰북 §9.1, M2 계획 10.1) */
export type TalismanDiscardCommand = {
  type: typeof COMMAND_TYPE.TALISMAN_DISCARD
}

export type Command =
  | VoteSubmitCommand
  | RollRequestCommand
  | AbilityTrueSightCommand
  | InterventionRerollCommand
  | InterventionTalismanCommand
  | InterventionForceSuccessCommand
  | TalismanHealCommand
  | TalismanSubmitCommand
  | TalismanTransferCommand
  | TalismanDiscardCommand
