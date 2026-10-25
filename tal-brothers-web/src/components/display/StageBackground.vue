<script setup lang="ts">
import { computed } from 'vue'
import { GAME_PHASE } from 'tal-brothers-shared'
import type { AssetKey, GamePhase } from 'tal-brothers-shared'

import { ASSET_URL } from '@/constants/assetUrl'
import { MOTION_TIMING } from '@/constants/motionTiming'

/**
 * 배경과 비네트 (m4-plan 2.3, m5-plan M5-1).
 *
 * - 배경 이미지는 3:2 원본이라 `cover`로 16:9 스테이지를 채운다 (위아래가 조금 잘린다)
 * - 글자가 읽히도록 배경 위에 어둡게 한 겹을 깐다
 * - 배경이 바뀌면 교차 전환한다 (m5-plan M5-3). 비네트는 Phase로만 천천히 짙어진다
 * - **비네트 짙기를 잠식도에 연동하지 않는다.** 평균값이라도 관전자가 역산할 수 있어
 *   룰북 §17을 깬다. 짙기는 Phase로만 결정한다
 */

const props = defineProps<{
  background: AssetKey | null
  phase: GamePhase | null
}>()

const imageUrl = computed(() => (props.background === null ? null : ASSET_URL[props.background]))

const motion = { '--bg-fade': `${MOTION_TIMING.backgroundFadeMs}ms` }

/** Phase가 깊어질수록 가장자리가 짙어진다. 좌석 잠식도와는 무관하다 */
const vignetteAlpha = computed(() => {
  switch (props.phase) {
    case GAME_PHASE.PHASE_2:
      return 0.6
    case GAME_PHASE.PHASE_3:
      return 0.78
    case GAME_PHASE.PHASE_1:
      return 0.42
    default:
      return 0.3
  }
})
</script>

<template>
  <div class="stage-layer stage-layer--background stage-background" :style="motion">
    <Transition name="bg-fade">
      <div
        v-if="imageUrl !== null"
        :key="imageUrl"
        class="stage-background__image"
        data-testid="stage-background"
        :style="{ backgroundImage: `url(${imageUrl})` }"
      />
    </Transition>
    <div class="stage-background__dim" />
  </div>
  <div
    class="stage-layer stage-layer--vignette stage-vignette"
    :style="{
      ...motion,
      background: `radial-gradient(100% 75% at 50% 50%, rgba(0, 0, 0, 0) 45%, rgba(0, 0, 0, ${vignetteAlpha}) 100%)`,
    }"
  />
</template>

<style scoped>
.stage-background {
  background: #0a0a0a;
}

.stage-background__image {
  position: absolute;
  inset: 0;
  background-position: center;
  background-size: cover;
}

/* 새 배경이 위에서 나타나고 옛 배경은 아래에서 사라진다 */
.bg-fade-enter-active,
.bg-fade-leave-active {
  transition: opacity var(--bg-fade) ease;
}

.bg-fade-enter-from,
.bg-fade-leave-to {
  opacity: 0;
}

.stage-vignette {
  transition: background var(--bg-fade) ease;
}

@media (prefers-reduced-motion: reduce) {
  .bg-fade-enter-active,
  .bg-fade-leave-active,
  .stage-vignette {
    transition: none;
  }
}

/* 본문 글자가 배경 위에서 읽히도록 전체를 한 단계 어둡게 한다 */
.stage-background__dim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
}
</style>
