import { REJECTION_REASON } from 'tal-brothers-shared'

import { reject } from '../engineTypes'
import type { Rejection } from '../engineTypes'

/**
 * 일시정지 (아키텍처 §8).
 *
 * 정지 중에는 좌석 명령을 모두 거절한다. Controller에는 잠금 화면이 뜬다.
 * `host.resume`과 연결 변화는 단계 처리기보다 앞에서 처리하므로 여기에 오지 않는다 (dispatch).
 * 단계 타이머도 없다. 게임 시계는 남은 시간으로 바뀌어 멈춰 있다.
 */
export const PAUSED_HANDLER = {
  command(): Rejection {
    return reject(REJECTION_REASON.WRONG_STEP, '일시정지 중이다')
  },
}
