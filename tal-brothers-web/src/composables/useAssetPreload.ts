import { computed, ref } from 'vue'
import type { ComputedRef } from 'vue'
import { ASSET_KEY } from 'tal-brothers-shared'
import type { AssetKey } from 'tal-brothers-shared'

import { ASSET_URL } from '@/constants/assetUrl'

/**
 * 에셋 미리 받기 (아키텍처 §9.1, m5-plan M5-2).
 *
 * 게임 중에 처음 보는 이미지를 받으면 화면이 끊긴다. 로비에서 **한꺼번에** 받아 디코드까지 마친다.
 *
 * - Display는 11종 전부, Controller는 아이템 2종 + 요괴화 탈(붉은 메시지)만 받는다
 * - **이벤트 순서를 따라 받지 않는다.** 요청 순서로 다음 탈을 알 수 있기 때문이다 (m5-plan 2절)
 * - 실패해도 게임은 그대로 진행한다. 시작을 막지 않는다 (m4-plan 11.1 c)
 * - 받은 `Image`를 모듈에 붙잡아 둔다. 라우트가 바뀌어도 디코드한 결과가 버려지지 않게
 */

export const DISPLAY_ASSETS: AssetKey[] = Object.values(ASSET_KEY)

export const CONTROLLER_ASSETS: AssetKey[] = [
  ASSET_KEY.ITEM_TALISMAN,
  ASSET_KEY.ITEM_JADE_HAIRPIN,
  ASSET_KEY.MASK_CORRUPTED,
]

type Entry = { promise: Promise<boolean>; ok: boolean | null }

const cache = new Map<string, Entry>()
/** 디코드한 이미지를 붙잡아 둔다. GC가 치우면 다시 받게 된다 */
const keep: HTMLImageElement[] = []

function load(url: string): Entry {
  const found = cache.get(url)
  if (found !== undefined) return found

  const image = new Image()
  image.decoding = 'async'
  const entry: Entry = { ok: null, promise: Promise.resolve(false) }
  entry.promise = new Promise<boolean>((resolve) => {
    image.onload = () => {
      image
        .decode()
        .catch(() => undefined)
        .finally(() => resolve(true))
    }
    image.onerror = () => resolve(false)
    image.src = url
  }).then((ok) => {
    entry.ok = ok
    return ok
  })
  keep.push(image)
  cache.set(url, entry)
  return entry
}

export type AssetPreload = {
  total: number
  loaded: ComputedRef<number>
  failed: ComputedRef<number>
  done: ComputedRef<boolean>
}

export function useAssetPreload(keys: AssetKey[]): AssetPreload {
  const urls = [...new Set(keys.map((key) => ASSET_URL[key]))]
  const settled = ref(0)
  const failures = ref(0)

  for (const url of urls) {
    const entry = load(url)
    if (entry.ok !== null) {
      settled.value += 1
      if (!entry.ok) failures.value += 1
      continue
    }
    void entry.promise.then((ok) => {
      settled.value += 1
      if (!ok) failures.value += 1
    })
  }

  return {
    total: urls.length,
    loaded: computed(() => settled.value - failures.value),
    failed: computed(() => failures.value),
    done: computed(() => settled.value === urls.length),
  }
}
