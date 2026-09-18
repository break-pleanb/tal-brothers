import type { BrotherRole } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'
import { pickOne, type Rng } from '../random'
import { SEAT_ORDER } from '../state/gameState'
import type { GameState, SeatState } from '../state/gameState'

/**
 * Phase 3 타겟 지정과 옥비녀 이동 (룰북 §14.1).
 *
 * 0. 후보 = 잠식도 30% 이상 좌석(봇 포함)
 * 1. 잠식도가 가장 높은 1명. 동점 우선순위는 **인간 배신자 > 봇 > 기타 인간**, 같은 순위 안에서만 무작위
 * 2. 타겟이 옥비녀를 보유하면 타겟을 제외한 좌석 중 잠식도가 가장 낮은 1명에게 옮긴다 (동점 무작위)
 */

/** 동점 우선순위. 숫자가 작을수록 먼저다 (룰북 §14.1) */
function tiePriority(seat: SeatState): number {
  if (!seat.isBot && seat.isTraitor) return 0
  if (seat.isBot) return 1
  return 2
}

/** 잠식도 30% 이상인 좌석 (룰북 §14.1) */
export function targetCandidates(state: GameState): BrotherRole[] {
  return SEAT_ORDER.filter(
    (role) => state.seats[role].erosionPercent >= GAME_CONFIG.phase3TargetThresholdPercent,
  )
}

/** 타겟 1명을 고른다. 후보가 없으면 null (무사귀환) */
export function selectPhase3Target(state: GameState, rng: Rng): BrotherRole | null {
  const candidates = targetCandidates(state)
  if (candidates.length === 0) return null

  const top = Math.max(...candidates.map((role) => state.seats[role].erosionPercent))
  const highest = candidates.filter((role) => state.seats[role].erosionPercent === top)

  const bestPriority = Math.min(...highest.map((role) => tiePriority(state.seats[role])))
  const finalists = highest.filter((role) => tiePriority(state.seats[role]) === bestPriority)

  return finalists.length === 1 ? (finalists[0] as BrotherRole) : pickOne(rng, finalists)
}

/**
 * 타겟이 옥비녀 보유자면 다른 좌석으로 옮긴다 (룰북 §14.1).
 * 옮긴 좌석을 돌려주고, 옮길 일이 없으면 null.
 */
export function moveJadeHairpinAwayFromTarget(
  draft: GameState,
  targetSeat: BrotherRole,
  rng: Rng,
): BrotherRole | null {
  if (!draft.seats[targetSeat].hasJadeHairpin) return null

  const others = SEAT_ORDER.filter((role) => role !== targetSeat)
  const lowest = Math.min(...others.map((role) => draft.seats[role].erosionPercent))
  const finalists = others.filter((role) => draft.seats[role].erosionPercent === lowest)
  const receiver = finalists.length === 1 ? (finalists[0] as BrotherRole) : pickOne(rng, finalists)

  draft.seats[targetSeat].hasJadeHairpin = false
  draft.seats[receiver].hasJadeHairpin = true
  return receiver
}

/** 옥비녀 보유 좌석 (룰북 §9.3). 없으면 null */
export function jadeHairpinHolder(state: GameState): BrotherRole | null {
  return SEAT_ORDER.find((role) => state.seats[role].hasJadeHairpin) ?? null
}
