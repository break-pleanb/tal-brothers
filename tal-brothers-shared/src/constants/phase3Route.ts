/** Phase 3 루트 (룰북 §14). 타겟 지정 뒤 어느 판정으로 갈지 */
export const PHASE3_ROUTE = {
  /** B-1 — 옥비녀 정화. 투표 없이 즉시 판정 (룰북 §14.3) */
  PURIFY: 'purify',
  /** A-1 — 미끼로 두고 도망친다. 판정 없음 (룰북 §14.4) */
  BAIT: 'bait',
  /** A-2 — 형제를 물리치고 탈출한다. 협동·대립 판정 (룰북 §14.4) */
  BREAK: 'break',
} as const

export type Phase3Route = (typeof PHASE3_ROUTE)[keyof typeof PHASE3_ROUTE]
