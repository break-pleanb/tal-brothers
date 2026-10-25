import type { VariantDetailView, VariantKind } from 'tal-brothers-shared'

import { VARIANT_LABEL } from '@/constants/variantLabel'

/**
 * 변이 열람 표기 (룰북 §6.4).
 *
 * 룰북의 예시 형식 `[흉] 성공 6 이상 · 실패 시 +35%`를 따른다. 수치는 서버가 라벨의 변이를 적용해 계산해 보낸
 * 최종 적용값이다 — 화면은 글자로 옮기기만 한다(아키텍처 §9.3). 진짜·가짜 라벨이 같은 모양이어야 하므로
 * 출처에 따라 표기를 바꾸지 않는다 (룰북 §17).
 */
export function variantDetailText(label: VariantKind, detail: VariantDetailView | null): string {
  const parts: string[] = []
  if (detail !== null) {
    // 룰북 예시의 순서(성공 기준 → 실패 페널티)를 앞에 두고, 보상은 그 뒤에 붙인다
    if (detail.threshold !== null) parts.push(`성공 ${detail.threshold} 이상`)
    if (detail.failureErosionPercent !== null) parts.push(`실패 시 +${detail.failureErosionPercent}%`)
    if (detail.failureTimeMinutes !== null) parts.push(`실패 시 시간 -${detail.failureTimeMinutes}분`)
    if (detail.rewardTalismans !== null) parts.push(`성공 시 부적 ${detail.rewardTalismans}개`)
    if (detail.rewardHealPercent !== null) parts.push(`성공 시 잠식 -${detail.rewardHealPercent}%`)
    if (detail.timeCostMinutes !== null) {
      parts.push(detail.timeCostMinutes === 0 ? '시간 소모 없음' : `시간 -${detail.timeCostMinutes}분`)
    }
  }
  const head = `[${VARIANT_LABEL[label]}]`
  return parts.length === 0 ? head : `${head} ${parts.join(' · ')}`
}
