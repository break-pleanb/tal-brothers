<script setup lang="ts">
import { computed, watch } from 'vue'
import { CUE_KIND } from 'tal-brothers-shared'

import { useCueQueue } from '@/composables/useCueQueue'

/**
 * 붉은 메시지 (룰북 §10.1, §17).
 *
 * **진짜(100% 전환)와 가짜(60% 티어)는 완전히 같아야 한다.** 둘은 서버에서 같은 cue로 온다
 * (`redMessageCue`, 아키텍처 §7.2). 이 컴포넌트는 **cue 하나만 입력으로 받는다** — 잠식도·배신자 여부 같은
 * 스냅샷 값을 읽지 않으므로 화면이 둘을 다르게 그릴 방법이 없다. 동일성은 `e2e/redMessage.spec.ts`가 고정한다.
 *
 * - 유지 시간은 cue가 실어 온 `durationSeconds`(룰북 §19의 3초)다
 * - 덮는 동안 아래 화면을 누를 수 없다
 * - Controller의 덮개 채널로 오는 것은 붉은 메시지뿐이다. 다른 종류가 오면 연출하지 않고 넘긴다
 */

const { current, dismiss } = useCueQueue('overlay')

watch(
  () => current.value?.id ?? null,
  () => {
    const queued = current.value
    if (queued !== null && queued.cue.kind !== CUE_KIND.RED_MESSAGE) dismiss()
  },
  { immediate: true },
)

const text = computed(() =>
  current.value?.cue.kind === CUE_KIND.RED_MESSAGE ? current.value.cue.text : null,
)
</script>

<template>
  <div v-if="text !== null" class="red-message" data-testid="red-message" role="alert">
    <p class="red-message__text">{{ text }}</p>
  </div>
</template>

<style scoped>
.red-message {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: #7a0f0f;
}

.red-message__text {
  max-width: 20rem;
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.6;
  color: #ffffff;
  text-align: center;
}
</style>
