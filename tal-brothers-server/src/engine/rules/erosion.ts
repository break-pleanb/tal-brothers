import { EROSION_TIER } from 'tal-brothers-shared'
import type { BrotherRole, ErosionTier } from 'tal-brothers-shared'

import { applyBotSabotage } from '../bots/botPolicy'
import type { EngineContext, StepOutput } from '../engineTypes'
import type { GameState } from '../state/gameState'
import { TRAITOR_EROSION_PERCENT, isSoloHumanGame, turnTraitor } from './traitor'

/**
 * 잠식도 (룰북 §4).
 * 개인값, 0~100%, 5% 단위. 100% 초과분은 버리고 0% 미만으로 내려가지 않는다.
 * 티어는 저장하지 않고 잠식도에서 파생한다 (§4.3).
 */

const EROSION_MIN = 0
const EROSION_MAX = 100
const EROSION_STEP = 5

/** 5% 단위인지 검사한다. 시나리오 데이터와 설정값은 모두 5의 배수여야 한다 */
export function isErosionStep(deltaPercent: number): boolean {
  return Number.isInteger(deltaPercent) && deltaPercent % EROSION_STEP === 0
}

/**
 * 잠식도를 증감한다. `+`는 상승, `-`는 회복.
 * 5의 배수가 아닌 값은 데이터 오류이므로 조용히 넘기지 않고 예외를 던진다.
 */
export function applyErosionDelta(currentPercent: number, deltaPercent: number): number {
  if (!isErosionStep(deltaPercent)) {
    throw new Error(`잠식도 증감은 5% 단위여야 한다: ${deltaPercent}`)
  }
  return clampErosion(currentPercent + deltaPercent)
}

/** 0~100 범위로 자른다. 초과분은 버린다 (룰북 §4.1) */
export function clampErosion(percent: number): number {
  if (percent < EROSION_MIN) return EROSION_MIN
  if (percent > EROSION_MAX) return EROSION_MAX
  return percent
}

/** 잠식 티어 (룰북 §4.3). 구간 경계는 29/30, 59/60, 99/100 */
export function tierOf(percent: number): ErosionTier {
  if (percent >= TRAITOR_EROSION_PERCENT) return EROSION_TIER.TRAITOR
  if (percent >= 60) return EROSION_TIER.TIER60
  if (percent >= 30) return EROSION_TIER.TIER30
  return EROSION_TIER.NORMAL
}

/**
 * 좌석 잠식도 변경의 **유일한 진입점** (룰북 §4.4, §10.1, §11).
 *
 * - 배신자는 모든 회복에서 제외한다. 게이지는 100%로 유지되고 로그에도 남기지 않는다
 * - 100%에 도달하면 그 자리에서 배신자 전환(인간)이나 봇 방해(봇)를 처리한다
 * - 1인 플레이의 인간은 전환하지 않고 방해 효과를 본인에게 적용한다
 */
export function applySeatErosion(
  draft: GameState,
  role: BrotherRole,
  deltaPercent: number,
  context: EngineContext,
  out: StepOutput,
): number {
  const seat = draft.seats[role]

  // 배신자는 회복 대상에서 제외한다. 제외 사실은 어디에도 표시하지 않는다 (룰북 §4.4)
  if (seat.isTraitor && deltaPercent < 0) return seat.erosionPercent

  const before = seat.erosionPercent
  seat.erosionPercent = applyErosionDelta(before, deltaPercent)

  if (before < TRAITOR_EROSION_PERCENT && seat.erosionPercent === TRAITOR_EROSION_PERCENT) {
    onReachedFull(draft, role, context, out)
  }
  return seat.erosionPercent
}

/** 100% 도달 처리 (룰북 §10.1, §11) */
function onReachedFull(
  draft: GameState,
  role: BrotherRole,
  context: EngineContext,
  out: StepOutput,
): void {
  const seat = draft.seats[role]

  if (seat.isBot) {
    applyBotSabotage(draft, role, context, out, { selfOnly: false })
    return
  }

  // 1인 플레이는 배신할 상대가 없으므로 전환하지 않고 방해 효과를 본인에게 적용한다 (룰북 §10.1)
  if (isSoloHumanGame(draft)) {
    applyBotSabotage(draft, role, context, out, { selfOnly: true })
    return
  }

  turnTraitor(draft, role, context, out)
}
