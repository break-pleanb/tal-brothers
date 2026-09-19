import { JUDGMENT_KIND } from 'tal-brothers-shared'
import type { JudgmentKind } from 'tal-brothers-shared'

/** 판정 유형 표기 (룰북 §5.2) */
export const JUDGMENT_LABEL: Record<JudgmentKind, string> = {
  [JUDGMENT_KIND.SOLO]: '개인',
  [JUDGMENT_KIND.COOP]: '협동',
  [JUDGMENT_KIND.HIDDEN]: '비공개',
  [JUDGMENT_KIND.ITEM]: '아이템 사용',
  [JUDGMENT_KIND.CONTEST]: '대립',
}
