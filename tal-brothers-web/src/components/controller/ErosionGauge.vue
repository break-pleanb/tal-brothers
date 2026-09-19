<script setup lang="ts">
import { computed } from 'vue'

/**
 * 잠식도 게이지 — **본인 것만** (룰북 §4.3, §17).
 *
 * 다른 좌석의 잠식도는 이 기기에 오지 않는다. props도 숫자 하나만 받는다 (M4 계획 6.1).
 * 30·60·100 눈금을 함께 그려 티어 경계를 보이게 한다. 티어별 효과는 서버가 판단한다.
 */

const props = defineProps<{ percent: number }>()

/** 0~100으로 자른다. 서버 값이 그 범위지만 화면이 깨지지 않게 한 번 더 막는다 */
const clamped = computed(() => Math.min(100, Math.max(0, props.percent)))

/** 눈금 — 30%·60%는 티어 경계, 100%는 끝 (룰북 §4.3) */
const TICKS = [30, 60]
</script>

<template>
  <div class="erosion">
    <div class="erosion__head">
      <span class="erosion__label">잠식도</span>
      <span class="erosion__value">{{ clamped }}%</span>
    </div>

    <div class="erosion__track">
      <div class="erosion__fill" :style="{ width: `${clamped}%` }" />
      <span v-for="tick in TICKS" :key="tick" class="erosion__tick" :style="{ left: `${tick}%` }" />
    </div>
  </div>
</template>

<style scoped>
.erosion__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 0.35rem;
}

.erosion__label {
  font-size: 0.75rem;
  color: rgba(245, 245, 245, 0.55);
}

.erosion__value {
  font-size: 1.125rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.erosion__track {
  position: relative;
  height: 0.5rem;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(245, 245, 245, 0.12);
}

.erosion__fill {
  height: 100%;
  border-radius: 999px;
  /* 강조 적색은 채도를 낮춘다. 붉은 메시지와 혼동되면 안 된다 (M4 계획 9절 13번) */
  background: #9e4c4c;
  transition: width 240ms ease-out;
}

.erosion__tick {
  position: absolute;
  top: 0;
  width: 1px;
  height: 100%;
  background: rgba(10, 10, 10, 0.8);
}
</style>
