<script setup lang="ts">
import { computed } from 'vue'
import { GAME_PHASE } from 'tal-brothers-shared'
import type { AssetKey, GamePhase } from 'tal-brothers-shared'

import { ASSET_PLACEHOLDER } from '@/constants/assetPlaceholder'

/**
 * 배경과 비네트 (M4 계획 2.3, 7절).
 *
 * M4는 배경 키마다 다른 색·그라데이션만 깔고, 이미지는 M5에서 같은 자리에 갈아끼운다.
 *
 * **비네트 짙기를 잠식도에 연동하지 않는다.** 평균값이라도 관전자가 역산할 수 있어
 * 룰북 §17을 깬다. 짙기는 Phase로만 결정한다.
 */

const props = defineProps<{
  background: AssetKey | null
  phase: GamePhase | null
}>()

const colors = computed(() => {
  const placeholder = props.background === null ? null : ASSET_PLACEHOLDER[props.background]
  return placeholder ?? { label: '', base: '#121212', edge: '#050505' }
})

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
  <div
    class="stage-layer stage-layer--background"
    :style="{
      background: `radial-gradient(120% 90% at 50% 35%, ${colors.base} 0%, ${colors.edge} 100%)`,
    }"
  />
  <div
    class="stage-layer stage-layer--vignette"
    :style="{
      background: `radial-gradient(100% 75% at 50% 50%, rgba(0, 0, 0, 0) 45%, rgba(0, 0, 0, ${vignetteAlpha}) 100%)`,
    }"
  />
</template>
