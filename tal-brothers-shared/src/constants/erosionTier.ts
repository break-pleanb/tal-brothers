/**
 * 잠식 티어 (룰북 §4.3).
 * 티어는 상태에 저장하지 않고 잠식도에서 파생한다. 티어가 만들어낸 결과물만 저장한다.
 */
export const EROSION_TIER = {
  /** 0~29% — 정상 */
  NORMAL: 'normal',
  /** 30~59% — 랜덤 이벤트 시작 시 50% 확률로 티어 환청 */
  TIER30: 'tier30',
  /** 60~99% — 티어 환청 100%, 가짜 라벨, 가짜 붉은 메시지 */
  TIER60: 'tier60',
  /** 100% — 이면의 형제(배신자) 전환, 봇은 방해 효과 */
  TRAITOR: 'traitor',
} as const

export type ErosionTier = (typeof EROSION_TIER)[keyof typeof EROSION_TIER]
