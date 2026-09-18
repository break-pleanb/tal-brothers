/** 세 형제 좌석 (룰북 §3) */
export const BROTHER_ROLE = {
  /** 첫째 — 근력/보호, 강제 성공 */
  FIRST: 'first',
  /** 둘째 — 민첩/눈치, 재굴림 */
  SECOND: 'second',
  /** 셋째 — 지식/도술, 절대 시야 */
  THIRD: 'third',
} as const

export type BrotherRole = (typeof BROTHER_ROLE)[keyof typeof BROTHER_ROLE]
