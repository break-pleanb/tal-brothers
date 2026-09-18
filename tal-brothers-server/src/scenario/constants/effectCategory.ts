/** 효과 분류 (아키텍처 §5.4). 이벤트마다 예외 코드를 두지 않고 이 분류만 보고 처리한다 */
export const EFFECT_CATEGORY = {
  /** 보상 — 강제 성공 시 제거(룰북 §3.2), 길 변이에서 +1단계(룰북 §6.2) */
  REWARD: 'reward',
  /** 성공에 따라오는 부작용 — 강제 성공 시 유지, 변이 영향 없음 */
  SIDE_EFFECT: 'sideEffect',
  /** 실패 페널티·우회 시간 비용 — 흉은 가산, 길은 감산 */
  PENALTY: 'penalty',
} as const

export type EffectCategory = (typeof EFFECT_CATEGORY)[keyof typeof EFFECT_CATEGORY]
