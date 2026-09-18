/** 판정 유형 (룰북 §5.2). M1 사용은 solo / coop / hidden */
export const JUDGMENT_KIND = {
  /** 개인 판정 — 판정자 1명, 담당 +1, 공개, 개입 창 O */
  SOLO: 'solo',
  /** 협동 판정 — 전원 굴림, 보정 없음, 최고값, 개입 창 O */
  COOP: 'coop',
  /** 비공개 판정 — 판정자 1명, 담당 +1, 결과 비공개, 개입 창 X */
  HIDDEN: 'hidden',
  /** 아이템 사용 판정 — 14A. M2 */
  ITEM: 'item',
  /** 대립 판정 — Phase 3. M2 */
  CONTEST: 'contest',
} as const

export type JudgmentKind = (typeof JUDGMENT_KIND)[keyof typeof JUDGMENT_KIND]
