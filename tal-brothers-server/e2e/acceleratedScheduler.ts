import type { Scheduler } from '../src/room/scheduler'

/**
 * 가속 스케줄러 — 통합 테스트 전용 (m4-plan 11.3 M4-A).
 *
 * 엔진과 런타임은 시각을 `Scheduler`로만 받는다 (아키텍처 §2 원칙 1). 그래서 **주입한 시각만 빨리 흘리면**
 * 단계 시간·봇 대행 30초·자동 정지 한도가 모두 같은 비율로 줄어든다. 엔진 코드는 바뀌지 않는다.
 *
 * - `now()` = 시작 시각 + 실제 경과 × 배율
 * - `at(time)`은 서버 시각으로 남은 시간을 배율로 나눠 실제 지연으로 예약한다
 *
 * 클라이언트는 스냅샷의 `serverNow`로 오프셋을 잡으므로 서버 시각이 실제보다 앞서 있어도 된다.
 * 다만 다음 스냅샷까지 클라이언트 카운트다운은 실제 속도로 흐른다 — 표시만의 차이다.
 */
export function createAcceleratedScheduler(rate: number, origin: number = Date.now()): Scheduler {
  if (!(rate > 0)) throw new Error(`가속 배율은 0보다 커야 한다: ${rate}`)

  const now = (): number => origin + (Date.now() - origin) * rate

  return {
    now,
    at(time, fn) {
      const delay = Math.max(0, (time - now()) / rate)
      const handle = setTimeout(fn, delay)
      return {
        cancel: () => {
          clearTimeout(handle)
        },
      }
    },
  }
}
