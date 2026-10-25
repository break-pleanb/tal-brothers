<script setup lang="ts">
import type { PauseView } from 'tal-brothers-shared'

import { PAUSE_REASON_LABEL } from '@/constants/pauseReasonLabel'

/**
 * 일시정지 덮개 (아키텍처 §8, m4-plan 2.3 레이어 5).
 *
 * 게임 시계와 단계 마감은 서버가 남은 시간으로 바꿔 멈춰 둔다. 화면은 사유만 알리고,
 * 남은 시간 표시는 `useCountdown`이 정지 중에 멈춘다.
 */

defineProps<{ pause: PauseView }>()
</script>

<template>
  <div class="pause-curtain" data-testid="pause-curtain" :data-reason="pause.reason">
    <p class="pause-curtain__title">{{ PAUSE_REASON_LABEL[pause.reason].title }}</p>
    <p class="pause-curtain__detail">{{ PAUSE_REASON_LABEL[pause.reason].detail }}</p>
  </div>
</template>

<style scoped>
.pause-curtain {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2cqh;
  background: rgba(5, 5, 5, 0.86);
  text-align: center;
}

.pause-curtain__title {
  font-size: var(--stage-title);
  font-weight: 700;
}

.pause-curtain__detail {
  font-size: var(--stage-narration);
  color: rgba(245, 245, 245, 0.75);
}
</style>
