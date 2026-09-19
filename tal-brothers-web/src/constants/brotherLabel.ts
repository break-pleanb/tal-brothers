import { BROTHER_ROLE } from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

/** 형제 좌석 표기 (룰북 §3). 좌석 주인의 이름이 없을 때 이 이름으로 부른다 */
export const BROTHER_LABEL: Record<BrotherRole, string> = {
  [BROTHER_ROLE.FIRST]: '첫째',
  [BROTHER_ROLE.SECOND]: '둘째',
  [BROTHER_ROLE.THIRD]: '셋째',
}
