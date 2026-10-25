<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

import { MOTION_TIMING } from '@/constants/motionTiming'

/**
 * 주사위 한 개의 눈 (m5-plan M5-3).
 *
 * 값이 정해지거나 바뀌면(재굴림·부적) 1부터 그 값까지 **카운트업**한 뒤 멈춘다 (m4-plan 9절 9번).
 * 값은 서버가 정한 것이고 화면은 보여주는 순서만 바꾼다 — 굴림을 화면이 계산하지 않는다 (아키텍처 §9.3).
 * 카운트업은 판정 연출 3초(룰북 §19) 안에서 끝난다. 놓쳐도 마지막 그림은 스냅샷 값 그대로다.
 */

const props = defineProps<{ value: number | null }>()

const shown = ref<number | null>(props.value)
const rolling = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

function stop(): void {
  if (timer !== null) clearInterval(timer)
  timer = null
  rolling.value = false
}

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

watch(
  () => props.value,
  (next, previous) => {
    stop()
    if (next === null || next === previous || reducedMotion()) {
      shown.value = next
      return
    }
    // 1 → 값까지 같은 간격으로 올린다. 6이면 여섯 칸, 1이면 바로 멈춘다
    const steps = Math.max(1, next)
    const interval = MOTION_TIMING.diceRollMs / steps
    let current = 1
    shown.value = current
    rolling.value = true
    timer = setInterval(() => {
      current += 1
      if (current >= next) {
        shown.value = next
        stop()
        return
      }
      shown.value = current
    }, interval)
  },
)

onBeforeUnmount(stop)
</script>

<template>
  <span
    class="die-face"
    :class="{ 'die-face--rolling': rolling }"
    :style="{ '--roll': `${MOTION_TIMING.diceRollMs}ms` }"
  >
    {{ shown ?? '–' }}
  </span>
</template>

<style scoped>
.die-face {
  display: inline-block;
  font-size: var(--stage-title);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.die-face--rolling {
  animation: die-shake var(--roll) ease-out;
}

@keyframes die-shake {
  0% {
    transform: rotate(-12deg) scale(0.9);
    opacity: 0.6;
  }
  60% {
    transform: rotate(6deg) scale(1.05);
  }
  100% {
    transform: rotate(0) scale(1);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .die-face--rolling {
    animation: none;
  }
}
</style>
