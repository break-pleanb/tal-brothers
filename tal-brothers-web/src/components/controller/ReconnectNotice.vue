<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

import { MOTION_TIMING } from '@/constants/motionTiming'
import type { SocketStatus } from '@/services/roomSocket'

/**
 * 다시 연결됐을 때의 안내 (아키텍처 §8, m4-plan 5절).
 *
 * 연결이 끊긴 동안 필요한 입력은 서버가 기권·자동 굴림·미사용으로 처리하고, 30초가 넘으면 봇이 대신한다.
 * 계획은 본인의 `botTakeover`가 풀릴 때 알리려 했지만, **서버는 다시 연결되는 순간 대행을 푼다** —
 * 이 기기가 받는 첫 스냅샷에 이미 `false`라 화면은 대행이 있었는지 알 수 없다 (m4-notes 계획 변경).
 * 그래서 대행 여부를 말하지 않고, 끊겼다 붙었다는 사실만 알린다. "봇 대행"이라는 말도 쓰지 않는다 (룰북 §17).
 */

const props = defineProps<{ status: SocketStatus }>()

const visible = ref(false)
let wasClosed = false
let timer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.status,
  (status) => {
    if (status === 'closed') wasClosed = true
    if (status === 'open' && wasClosed) {
      wasClosed = false
      visible.value = true
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        visible.value = false
      }, MOTION_TIMING.toastMs)
    }
  },
)

onBeforeUnmount(() => {
  if (timer !== null) clearTimeout(timer)
})
</script>

<template>
  <p v-if="visible" class="reconnect-notice" data-testid="reconnect-notice">
    다시 연결됐습니다. 끊긴 동안 필요한 입력은 서버가 처리했습니다.
  </p>
</template>

<style scoped>
.reconnect-notice {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #d9a066;
}
</style>
