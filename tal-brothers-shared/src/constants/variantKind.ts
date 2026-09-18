/** 선택지 변이 (룰북 §6). 흉 30% / 평 50% / 길 20% */
export const VARIANT_KIND = {
  /** 흉 — 성공 기준 +1, 실패 잠식 페널티 +10%p */
  ILL: 'ill',
  /** 평 — 변화 없음 */
  PLAIN: 'plain',
  /** 길 — 보상 +1단계, 없으면 실패 잠식 페널티 -10%p */
  BLESS: 'bless',
} as const

export type VariantKind = (typeof VARIANT_KIND)[keyof typeof VARIANT_KIND]
