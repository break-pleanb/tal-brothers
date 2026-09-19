import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'

import { usePlayStore } from '@/stores/play'

/**
 * 마감 시각 → 남은 시간 (M4 계획 4.4).
 *
 * **화면에서 하는 유일한 계산이다** (아키텍처 §9.3). 그 밖의 룰은 전부 서버가 계산한다.
 *
 * - 마감 시각은 서버 기준이라 스토어의 시계 오프셋으로 보정한다
 * - 250ms마다 갱신하고 1초 단위로 표시한다. 음수는 0으로 자른다
 * - **일시정지 중에는 멈춘다.** 정지 중 서버의 마감 시각은 남은 시간으로 옮겨져 있어
 *   그대로 두면 화면만 계속 줄어든다. 재개하면 서버가 새 마감 시각을 실은 스냅샷을 보낸다 (아키텍처 §8)
 */

/** 갱신 간격. 1초 표시가 한 칸씩 건너뛰지 않을 만큼 촘촘하면 된다 */
const TICK_MS = 250

export type Countdown = {
  /** 남은 밀리초. 마감이 없으면 null */
  remainingMs: ComputedRef<number | null>
  /** 남은 초 (올림). 마감이 없으면 null */
  remainingSeconds: ComputedRef<number | null>
  /** `12:34` 또는 `0:07`. 마감이 없으면 빈 문자열 */
  label: ComputedRef<string>
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function useCountdown(deadlineAt: Ref<number | null>): Countdown {
  const play = usePlayStore()
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | null = null

  function start(): void {
    if (timer !== null) return
    now.value = Date.now()
    timer = setInterval(() => {
      now.value = Date.now()
    }, TICK_MS)
  }

  function stop(): void {
    if (timer === null) return
    clearInterval(timer)
    timer = null
  }

  onMounted(start)
  onBeforeUnmount(stop)

  // 정지 중에는 마지막으로 그린 값에서 멈춘다
  watch(
    () => play.isPaused,
    (paused) => {
      if (paused) stop()
      else start()
    },
  )

  const remainingMs = computed<number | null>(() => {
    const deadline = deadlineAt.value
    if (deadline === null) return null
    return Math.max(0, deadline - (now.value + play.clockOffsetMs))
  })

  const remainingSeconds = computed<number | null>(() =>
    remainingMs.value === null ? null : Math.ceil(remainingMs.value / 1000),
  )

  const label = computed<string>(() =>
    remainingSeconds.value === null ? '' : formatClock(remainingSeconds.value),
  )

  return { remainingMs, remainingSeconds, label }
}
