<script setup lang="ts">
import { useCueQueue } from '@/composables/useCueQueue'

/**
 * 토스트 자리 — 겹치지 않게 **순차로 하나씩** (M4 계획 4.3).
 *
 * 받은 귓속말(룰북 §16), 튜토리얼 부적 지급(룰북 §9.2), 개입 수단 사용(룰북 §7.4),
 * 연습 개입 창의 설명(룰북 §12)이 모두 이 한 자리를 쓴다.
 *
 * - **문장은 서버가 cue에 실어 보낸 것을 그대로 쓴다.** 종류에 따라 모양을 바꾸지 않는다 —
 *   귓속말만 달라 보이면 "저 사람이 귓속말을 받았다"가 화면 밖으로 새어 나간다 (룰북 §17)
 * - 대상은 서버가 정한다. 남의 귓속말은 애초에 이 기기로 오지 않는다
 */

/** 화면 전용 시간이다. 룰북에 없어 실기 확인에서 조정한다 (M4 계획 9절 9번) */
const TOAST_HOLD_MS = 4000

const { current, dismiss } = useCueQueue('toast', TOAST_HOLD_MS)
</script>

<template>
  <div v-if="current !== null" class="cue-toast" @click="dismiss">
    <p class="cue-toast__text">{{ current.cue.text }}</p>
  </div>
</template>

<style scoped>
.cue-toast {
  position: fixed;
  top: calc(0.75rem + env(safe-area-inset-top, 0px));
  left: 50%;
  z-index: 40;
  width: min(92vw, 30rem);
  padding: 0.75rem 1rem;
  border: 1px solid rgba(245, 245, 245, 0.2);
  border-radius: 0.75rem;
  background: rgba(20, 20, 20, 0.96);
  transform: translateX(-50%);
  animation: cue-toast-in 200ms ease-out;
}

.cue-toast__text {
  font-size: 0.875rem;
  line-height: 1.5;
  text-align: center;
}

@keyframes cue-toast-in {
  from {
    opacity: 0;
    transform: translate(-50%, -0.5rem);
  }
  to {
    opacity: 1;
    transform: translateX(-50%);
  }
}
</style>
