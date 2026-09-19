import { ATTRIBUTE } from 'tal-brothers-shared'
import type { Attribute } from 'tal-brothers-shared'

/** 판정 속성 표기 (룰북 §3). 속성 ↔ 담당 형제 매핑은 룰 계산이라 서버에만 있다 */
export const ATTRIBUTE_LABEL: Record<Attribute, string> = {
  [ATTRIBUTE.STRENGTH]: '근력/보호',
  [ATTRIBUTE.AGILITY]: '민첩/눈치',
  [ATTRIBUTE.KNOWLEDGE]: '지식/도술',
}
