import { BROTHER_ROLE } from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

/**
 * 화면으로 나가는 문장에 쓰는 형제 이름 (룰북 §3.5, §7.4, §17).
 *
 * 공개 알림·cue·귓속말의 문장에 좌석 값(`first` 등)을 그대로 넣지 않는다.
 * 사용 사실은 **형제 이름과 함께** 공개한다 (룰북 §3.5, §7.4).
 */
export const SEAT_LABEL: Record<BrotherRole, string> = {
  [BROTHER_ROLE.FIRST]: '첫째',
  [BROTHER_ROLE.SECOND]: '둘째',
  [BROTHER_ROLE.THIRD]: '셋째',
}
