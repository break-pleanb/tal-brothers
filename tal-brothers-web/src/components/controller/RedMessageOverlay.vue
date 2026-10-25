<script setup lang="ts">
import { computed, watch } from 'vue'
import { ASSET_KEY, CUE_KIND } from 'tal-brothers-shared'

import { useCueQueue } from '@/composables/useCueQueue'
import { ASSET_URL } from '@/constants/assetUrl'

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
 * - 요괴화 탈(룰북 §18 "붉은 메시지 연출(진짜·가짜)")을 얹는다. 등장 움직임은 한 번뿐이고 반복하지 않는다 —
 *   반복 움직임이 있으면 같은 cue라도 보는 순간마다 그림이 달라 동일성 검사(픽셀 비교)가 흔들린다
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

const MASK_URL = ASSET_URL[ASSET_KEY.MASK_CORRUPTED]

const text = computed(() =>
  current.value?.cue.kind === CUE_KIND.RED_MESSAGE ? current.value.cue.text : null,
)
</script>

<template>
  <div v-if="text !== null" class="red-message" data-testid="red-message" role="alert">
    <img :src="MASK_URL" alt="" class="red-message__mask" />
    <p class="red-message__text">{{ text }}</p>
  </div>
</template>

<style scoped>
.red-message {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  padding: 2rem;
  background: #7a0f0f;
  animation: red-flash 360ms ease-out;
}

/* 요괴화 탈은 검정 바탕 JPG라 붉은 바탕 위에 screen으로 섞는다 */
.red-message__mask {
  width: min(70vw, 18rem);
  mix-blend-mode: screen;
  opacity: 0.8;
  mask-image: radial-gradient(closest-side, #000 55%, transparent 100%);
  animation: red-mask-in 700ms ease-out;
}

.red-message__text {
  max-width: 20rem;
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.6;
  color: #ffffff;
  text-align: center;
}

@keyframes red-flash {
  from {
    background: #e01b1b;
  }
}

@keyframes red-mask-in {
  from {
    opacity: 0;
    transform: scale(1.25);
  }
}

@media (prefers-reduced-motion: reduce) {
  .red-message,
  .red-message__mask {
    animation: none;
  }
}
</style>
