/** 판정 속성 (룰북 §3). 속성 ↔ 담당 형제 매핑은 룰 계산이므로 server가 가진다 */
export const ATTRIBUTE = {
  /** 근력/보호 — 첫째 담당 */
  STRENGTH: 'strength',
  /** 민첩/눈치 — 둘째 담당 */
  AGILITY: 'agility',
  /** 지식/도술 — 셋째 담당 */
  KNOWLEDGE: 'knowledge',
} as const

export type Attribute = (typeof ATTRIBUTE)[keyof typeof ATTRIBUTE]
