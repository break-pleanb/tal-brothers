import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Ref } from 'vue'

/**
 * 화면 꺼짐 방지 (M4 계획 3.3, 아키텍처 §9.4).
 *
 * - 좌석 화면에 들어오면 요청하고, 탭이 다시 보이면 다시 요청한다 (잠금 화면을 지나면 해제되기 때문이다)
 * - **실패해도 게임은 그대로 진행한다.** 미지원·거부면 한 줄 안내만 띄운다
 * - 방을 떠날 때 해제한다
 */

/** 표준 타입이 없는 브라우저도 있어 필요한 모양만 직접 적는다 */
type WakeLockSentinelLike = {
  released: boolean
  release(): Promise<void>
}

type WakeLockLike = {
  request(type: 'screen'): Promise<WakeLockSentinelLike>
}

const UNSUPPORTED_NOTICE = '화면 자동 꺼짐을 꺼 두세요'

function wakeLockOf(): WakeLockLike | null {
  if (typeof navigator === 'undefined') return null
  const candidate = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock
  return candidate ?? null
}

export type UseWakeLock = {
  /** 잠금을 잡지 못했을 때의 안내 문구. 잘 잡혔으면 null */
  notice: Ref<string | null>
}

export function useWakeLock(): UseWakeLock {
  const notice = ref<string | null>(null)
  let sentinel: WakeLockSentinelLike | null = null

  async function acquire(): Promise<void> {
    const api = wakeLockOf()
    if (api === null) {
      notice.value = UNSUPPORTED_NOTICE
      return
    }
    if (sentinel !== null && !sentinel.released) return

    try {
      sentinel = await api.request('screen')
      notice.value = null
    } catch {
      // 사용자가 거부했거나 탭이 보이지 않는 상태다. 게임 진행에는 영향이 없다
      sentinel = null
      notice.value = UNSUPPORTED_NOTICE
    }
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'visible') void acquire()
  }

  onMounted(() => {
    void acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    void sentinel?.release().catch(() => undefined)
    sentinel = null
  })

  return { notice }
}
