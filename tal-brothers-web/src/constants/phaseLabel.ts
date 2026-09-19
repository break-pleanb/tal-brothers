import { GAME_PHASE } from 'tal-brothers-shared'
import type { GamePhase } from 'tal-brothers-shared'

/** Phase 표기 (룰북 §2.1) */
export const PHASE_LABEL: Record<GamePhase, string> = {
  [GAME_PHASE.PHASE_1]: '1장 · 안개 속의 진입',
  [GAME_PHASE.PHASE_2]: '2장 · 당산나무 숲의 미로',
  [GAME_PHASE.PHASE_3]: '3장 · 장승 앞의 결전',
}
