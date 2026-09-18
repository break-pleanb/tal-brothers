/** 게임 Phase (룰북 §2.1) */
export const GAME_PHASE = {
  /** 안개 속의 진입 — T1, T2, 이장 */
  PHASE_1: 'phase1',
  /** 당산나무 숲의 미로 — 진입 환청, 분기, 랜덤 8개 */
  PHASE_2: 'phase2',
  /** 장승 앞의 결전 */
  PHASE_3: 'phase3',
} as const

export type GamePhase = (typeof GAME_PHASE)[keyof typeof GAME_PHASE]
