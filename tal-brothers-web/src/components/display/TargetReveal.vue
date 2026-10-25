<script setup lang="ts">
import type { BrotherRole, Phase3View, SeatNameView } from 'tal-brothers-shared'

import { BROTHER_LABEL } from '@/constants/brotherLabel'
import { MOTION_TIMING } from '@/constants/motionTiming'

/**
 * Phase 3 타겟 공개 (룰북 §14.1, §17).
 *
 * `P3_TARGETING`은 서버가 머물지 않고 곧바로 다음 단계로 넘긴다. 그래서 단계 분기가 아니라
 * **스냅샷의 `phase3`**를 보고 Phase 3 내내 그린다 — 새로고침해도 같은 그림이다.
 *
 * 옥비녀 이동은 룰북 §14.1의 문장만 보여주고 **받은 사람은 적지 않는다.** 옥비녀 보유는 비공개이고(룰북 §9.3),
 * 공개 항목은 "이동했다"는 사실이다(룰북 §17). 받은 사람이 B-1을 굴리면 그때 판정자로 드러난다.
 */

const props = defineProps<{
  phase3: Phase3View
  seatNames: SeatNameView[]
}>()

const motion = { '--reveal': `${MOTION_TIMING.revealMs}ms` }

function nameOf(seat: BrotherRole): string {
  const found = props.seatNames.find((entry) => entry.seat === seat)
  return found?.displayName === null || found === undefined
    ? BROTHER_LABEL[seat]
    : `${BROTHER_LABEL[seat]} ${found.displayName}`
}
</script>

<template>
  <div class="target" data-testid="target-reveal" :style="motion">
    <p v-if="phase3.targetSeat !== null" class="target__seat">
      {{ nameOf(phase3.targetSeat) }}의 눈에서 피눈물이 흐른다
    </p>
    <p v-if="phase3.jadeHairpinMovedTo !== null" class="target__hairpin">
      옥비녀가 요기를 거부하며 손에서 튕겨 나간다
    </p>
  </div>
</template>

<style scoped>
.target {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.8cqh;
}

.target__seat {
  font-size: var(--stage-choice);
  font-weight: 600;
  color: #e7b4b4;
  animation: target-in var(--reveal) ease-out both;
}

/* 옥비녀 문장은 타겟 공개 다음에 튕겨 나가듯 들어온다 (룰북 §14.1의 순서) */
.target__hairpin {
  font-size: var(--stage-tag);
  color: rgba(245, 245, 245, 0.75);
  animation: hairpin-in var(--reveal) ease-out var(--reveal) both;
}

@keyframes target-in {
  from {
    opacity: 0;
    letter-spacing: 0.4em;
    filter: blur(0.4cqw);
  }
  to {
    opacity: 1;
    letter-spacing: normal;
    filter: blur(0);
  }
}

@keyframes hairpin-in {
  from {
    opacity: 0;
    transform: translateX(-4cqw);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .target__seat,
  .target__hairpin {
    animation: none;
  }
}
</style>
