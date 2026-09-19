<script setup lang="ts">
import { computed } from 'vue'

import type { SocketStatus } from '@/services/roomSocket'

/**
 * 연결 상태 표시 (M4 실기 2차).
 *
 * 실기에서 **Display가 조용히 멈춘 채 폰만 진행하는** 상황이 나왔다.
 * 화면에 아무 표시가 없으면 "서버가 안 보낸 것"과 "화면이 못 받은 것"을 가릴 수 없다.
 *
 * 연결이 정상일 때는 **아무것도 그리지 않는다.** 방송 화면에 상시 표시를 두지 않는다.
 */

const props = defineProps<{
  status: SocketStatus
  /** 단계 마감이 지났는데 새 스냅샷이 오지 않는 상태 */
  stale: boolean
}>()

const label = computed<string | null>(() => {
  if (props.status === 'connecting') return '연결 중…'
  if (props.status === 'closed') return '연결이 끊겼습니다. 다시 붙는 중…'
  if (props.status === 'idle') return '연결 대기'
  return props.stale ? '중계가 밀렸습니다. 다시 붙는 중…' : null
})
</script>

<template>
  <p v-if="label !== null" class="link-status">{{ label }}</p>
</template>

<style scoped>
.link-status {
  padding: 0.5cqh 1cqw;
  border: 1px solid rgba(217, 160, 102, 0.5);
  border-radius: 0.5cqw;
  background: rgba(0, 0, 0, 0.55);
  font-size: var(--stage-tag);
  color: #d9a066;
}
</style>
