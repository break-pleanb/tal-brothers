import { computed, onBeforeUnmount, watch } from 'vue'
import type { ComputedRef } from 'vue'

import type { CueChannel } from '@/constants/cueChannel'
import { usePlayStore } from '@/stores/play'
import type { QueuedCue } from '@/stores/play'

/**
 * cue 한 자리를 순차로 소비한다 (M4 계획 4.3).
 *
 * **스냅샷이 진실이고 cue는 장식이다.** 연출이 밀려도 스냅샷 렌더를 막지 않는다.
 * 큐에 쌓고 버리는 일은 스토어가 하고, 여기서는 **한 번에 하나씩 꺼내 보여주고 끝나면 비운다.**
 *
 * - 유지 시간은 cue가 실어 온 `data.durationSeconds`를 먼저 쓴다.
 *   붉은 메시지 3초(룰북 §10.1)처럼 룰북에 있는 값은 서버가 정한다
 * - `holdMs`를 주지 않으면 자동으로 닫지 않는다. 본인이 닫는 모달(`trueSightResult`)이 그렇다
 */

export type UseCueQueue = {
  /** 지금 연출할 cue. 없으면 null */
  current: ComputedRef<QueuedCue | null>
  /** 연출을 끝내고 다음 cue로 넘어간다 */
  dismiss(): void
}

/** cue가 실어 온 유지 시간(초). 없으면 null */
function durationMsOf(queued: QueuedCue): number | null {
  const seconds = queued.cue.data?.durationSeconds
  return typeof seconds === 'number' ? seconds * 1000 : null
}

export function useCueQueue(channel: CueChannel, holdMs?: number): UseCueQueue {
  const play = usePlayStore()
  let timer: ReturnType<typeof setTimeout> | null = null

  const current = computed<QueuedCue | null>(() => play.nextCue(channel))

  function clearTimer(): void {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  function dismiss(): void {
    clearTimer()
    const queued = current.value
    if (queued !== null) play.consumeCue(queued.id)
  }

  // 새 cue가 올라올 때마다 유지 시간을 다시 건다
  watch(
    () => current.value?.id ?? null,
    (id) => {
      clearTimer()
      if (id === null) return

      const queued = current.value
      if (queued === null) return

      const hold = durationMsOf(queued) ?? holdMs ?? null
      if (hold === null) return
      timer = setTimeout(dismiss, hold)
    },
    { immediate: true },
  )

  onBeforeUnmount(clearTimer)

  return { current, dismiss }
}
