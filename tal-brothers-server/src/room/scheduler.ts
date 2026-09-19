/**
 * 시각 주입 지점 (M3 계획 2.2·9절).
 *
 * 런타임 코드가 `setTimeout`·`Date.now`를 직접 부르지 않는다.
 * 그래야 테스트가 시간을 손으로 돌려 "예약 → 취소 → 늦은 발화" 순서를 재현할 수 있다.
 */

export type ScheduledTimer = {
  cancel(): void
}

export type Scheduler = {
  /** epoch ms */
  now(): number
  /** `at` 시각에 `fn`을 한 번 부른다. 이미 지난 시각이면 다음 틱에 부른다 */
  at(time: number, fn: () => void): ScheduledTimer
}

/** 운영용 스케줄러 */
export function createRealScheduler(): Scheduler {
  return {
    now: () => Date.now(),
    at(time, fn) {
      const delay = Math.max(0, time - Date.now())
      const handle = setTimeout(fn, delay)
      return {
        cancel: () => {
          clearTimeout(handle)
        },
      }
    },
  }
}
