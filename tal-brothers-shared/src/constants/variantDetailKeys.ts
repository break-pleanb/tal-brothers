import type { VariantDetailView } from '../types/projection'

/**
 * 변이 최종 적용값의 키 목록 (룰북 §6.4, 아키텍처 §7.3).
 *
 * 진짜 라벨(배신자·절대 시야)과 가짜 라벨(60% 이상)이 **같은 키 구조**로 나가야 한다.
 * 서버 투영은 이 키를 모두 채우고(해당 없으면 null), 은닉 테스트와 e2e가 이 목록으로 구조를 비교한다.
 */
export const VARIANT_DETAIL_KEYS = [
  'threshold',
  'failureErosionPercent',
  'failureTimeMinutes',
  'rewardTalismans',
  'rewardHealPercent',
  'timeCostMinutes',
] as const satisfies readonly (keyof VariantDetailView)[]
