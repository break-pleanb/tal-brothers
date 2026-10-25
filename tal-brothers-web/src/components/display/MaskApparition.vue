<script setup lang="ts">
import { computed } from 'vue'
import type { AssetKey } from 'tal-brothers-shared'

import { ASSET_URL } from '@/constants/assetUrl'
import { MOTION_TIMING } from '@/constants/motionTiming'

/**
 * 탈 잔상 레이어 (m4-plan 2.3 레이어 2, m5-plan M5-1).
 *
 * 탈 이미지는 검정 바탕 JPG라 `screen`으로 섞어 검정을 지운다. 본문 글자 아래 층이므로
 * 글자를 가리지 않도록 흐리게 둔다.
 *
 * 탈이 바뀌면 크게 떠올랐다가 **잔상**으로 가라앉고, 이후 느리게 숨을 쉰다 (m5-plan M5-3).
 * 등장은 상황 제시(30초) 안에서 끝난다. 탈 키는 서버가 이벤트마다 보낸다.
 */

const props = defineProps<{ mask: AssetKey | null }>()

const imageUrl = computed(() => (props.mask === null ? null : ASSET_URL[props.mask]))

const motion = { '--mask-enter': `${MOTION_TIMING.maskEnterMs}ms` }
</script>

<template>
  <div v-if="imageUrl !== null" class="stage-layer stage-layer--mask mask-apparition" :style="motion">
    <img :key="imageUrl" :src="imageUrl" alt="" class="mask-apparition__image" data-testid="mask-image" />
  </div>
</template>

<style scoped>
.mask-apparition {
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.mask-apparition__image {
  width: 40cqw;
  height: auto;
  mix-blend-mode: screen;
  opacity: 0.4;
  /* 사각 테두리가 보이지 않게 가장자리를 둥글게 지운다 */
  mask-image: radial-gradient(closest-side, #000 60%, transparent 100%);
  animation:
    mask-enter var(--mask-enter) ease-out,
    mask-breathe 7s ease-in-out var(--mask-enter) infinite;
}

/* 크게 떠올랐다가 잔상으로 가라앉는다 */
@keyframes mask-enter {
  0% {
    opacity: 0;
    transform: scale(1.18);
    filter: blur(0.6cqw);
  }
  35% {
    opacity: 0.85;
    transform: scale(1.04);
    filter: blur(0);
  }
  100% {
    opacity: 0.4;
    transform: scale(1);
  }
}

@keyframes mask-breathe {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 0.3;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mask-apparition__image {
    animation: none;
  }
}
</style>
