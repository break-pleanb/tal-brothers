import { ATTRIBUTE, BROTHER_ROLE, JUDGMENT_KIND } from 'tal-brothers-shared'
import type { Attribute, BrotherRole, JudgmentKind } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'

/**
 * 보정값 (룰북 §3.1, §5.5).
 * 속성 ↔ 담당 형제 매핑은 룰 계산이므로 shared가 아니라 서버에 둔다 (아키텍처 §3).
 */

/** 속성을 담당하는 형제 (룰북 §3) */
export const ATTRIBUTE_OWNER: Record<Attribute, BrotherRole> = {
  [ATTRIBUTE.STRENGTH]: BROTHER_ROLE.FIRST,
  [ATTRIBUTE.AGILITY]: BROTHER_ROLE.SECOND,
  [ATTRIBUTE.KNOWLEDGE]: BROTHER_ROLE.THIRD,
}

/** 담당 판정 보정 +1 (룰북 §3) */
const ROLE_BONUS = 1

/** 채택된 선택지의 속성 담당 형제가 굴린다. 봇이어도 배신자여도 그 형제다 (룰북 §3.1) */
export function rollerSeatFor(attribute: Attribute): BrotherRole {
  return ATTRIBUTE_OWNER[attribute]
}

/**
 * 직업 보정 (룰북 §3.1).
 * 담당 속성의 개인 판정과 비공개 판정에만 +1. 협동 판정과 대립 판정에는 없다.
 */
export function roleBonusFor(
  judgmentKind: JudgmentKind,
  attribute: Attribute | null,
  seat: BrotherRole | null,
): number {
  if (judgmentKind !== JUDGMENT_KIND.SOLO && judgmentKind !== JUDGMENT_KIND.HIDDEN) return 0
  if (attribute === null || seat === null) return 0
  return ATTRIBUTE_OWNER[attribute] === seat ? ROLE_BONUS : 0
}

/**
 * 팀 플래그 합산 (룰북 §5.5).
 * 버프와 디버프는 합산하고, 디버프 합계에는 하한 -2를 적용한다. 버프에는 상한이 없다.
 */
export function addTeamModifier(current: number, delta: number): number {
  return clampTeamModifier(current + delta)
}

export function clampTeamModifier(total: number): number {
  return total < GAME_CONFIG.debuffFloor ? GAME_CONFIG.debuffFloor : total
}
