/** 효과 대상 (룰북 §4.1, §5.3, §13.5) */
export const EFFECT_TARGET = {
  /** 판정자 1명 */
  ROLLER: 'roller',
  /** 봇과 배신자를 포함한 형제 전원 */
  ALL: 'all',
  /** 협동 판정의 보상 수령자 — 개입 후 최종 최고값 주사위의 주인 (룰북 §5.3) */
  COOP_TOP_ROLLER: 'coopTopRoller',
  /** 14A 부적 제출자 (룰북 §13.5) */
  SUBMITTER: 'submitter',
  /** 무작위 좌석 1명. 봇과 배신자를 포함한다 (룰북 §13.2, §13.5) */
  RANDOM_SEAT: 'randomSeat',
  /** 판정자를 제외한 전원 — 15B 성공 (룰북 §13.5) */
  ALL_EXCEPT_ROLLER: 'allExceptRoller',
} as const

export type EffectTarget = (typeof EFFECT_TARGET)[keyof typeof EFFECT_TARGET]
