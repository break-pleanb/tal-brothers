import { VARIANT_KIND } from 'tal-brothers-shared'
import type { VariantKind } from 'tal-brothers-shared'

/**
 * 흉/평/길 변이 표기 (룰북 §6.4).
 * **진짜 라벨과 가짜 라벨의 표기가 같아야 한다.** "확실함" 같은 꼬리표를 붙이면 은닉이 깨진다 (룰북 §17)
 */
export const VARIANT_LABEL: Record<VariantKind, string> = {
  [VARIANT_KIND.ILL]: '흉',
  [VARIANT_KIND.PLAIN]: '평',
  [VARIANT_KIND.BLESS]: '길',
}
