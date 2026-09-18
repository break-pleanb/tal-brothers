import { GAME_PHASE } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'
import type { GameState } from '../state/gameState'

/**
 * 게임 시계 (룰북 §2.1, §14.2, §14.4).
 *
 * - Phase 1~2에서 시계가 0이 되면 즉시 강제 잠식 엔딩이고, 진행 중인 판정·개입 창은 중단된다
 * - Phase 3는 예외다. 시계가 0을 지나도 판정과 개입 창을 끝까지 진행한다
 * - 시간 페널티로 0 아래로 내려갈 수 있으므로 효과 적용 직후에도 검사한다
 */

export function isClockExpired(state: GameState, now: number): boolean {
  return now >= state.clock.deadlineAt
}

/** 시계가 0을 지난 시각을 한 번만 남긴다. Phase 3는 이 값을 지나서도 진행한다 */
export function markClockExpired(draft: GameState, now: number): void {
  if (draft.clock.expiredAt === null) {
    draft.clock.expiredAt = now
  }
}

/** 타임오버가 게임을 끝내는 Phase인지 (룰북 §2.1, §14.2) */
export function timeoutEndsGame(state: GameState): boolean {
  return state.progress.phase !== GAME_PHASE.PHASE_3
}

/** 남은 시간 (밀리초). 음수면 이미 지난 것이다 */
export function remainingMs(state: GameState, now: number): number {
  return state.clock.deadlineAt - now
}

/**
 * Phase 3 진입 시 시계 절삭 (룰북 §14.4).
 * 남은 시간이 10분을 넘으면 10분으로 자르고, 그보다 적으면 그대로 둔다.
 */
export function truncateClockForPhase3(draft: GameState, now: number): void {
  const limit = GAME_CONFIG.phase3TruncateMinutes * 60_000
  if (remainingMs(draft, now) > limit) {
    draft.clock.deadlineAt = now + limit
  }
}
