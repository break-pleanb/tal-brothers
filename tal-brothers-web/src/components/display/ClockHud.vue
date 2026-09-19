<script setup lang="ts">
import { computed } from 'vue'
import type { GamePhase, GameStep } from 'tal-brothers-shared'

import { PHASE_LABEL } from '@/constants/phaseLabel'
import { STEP_LABEL } from '@/constants/stepLabel'

/**
 * 게임 시계와 단계 표시 (M4 계획 2.3 레이어 3).
 *
 * - **총 이벤트 개수는 표시하지 않는다.** 진행 번호만 보여준다 (룰북 §17, §21)
 * - 남은 시간 계산은 `useCountdown`이 하고, 여기서는 받은 문자열을 그리기만 한다
 */

const props = defineProps<{
  phase: GamePhase | null
  step: GameStep | null
  /** 현재 Phase에서 몇 번째 이벤트인지. 이벤트가 없는 단계는 null */
  eventNumber: number | null
  /** 게임 시계 남은 시간 */
  gameClock: string
  /** 이 단계 남은 시간. 마감이 없는 단계는 빈 문자열 */
  stepClock: string
}>()

const phaseLabel = computed(() => (props.phase === null ? '' : PHASE_LABEL[props.phase]))
const stepLabel = computed(() => (props.step === null ? '' : STEP_LABEL[props.step]))
</script>

<template>
  <div class="clock-hud">
    <div class="clock-hud__left">
      <p class="clock-hud__phase">{{ phaseLabel }}</p>
      <p class="clock-hud__step">
        {{ stepLabel }}
        <span v-if="eventNumber !== null" class="clock-hud__number">· {{ eventNumber }}번째</span>
      </p>
    </div>

    <div class="clock-hud__right">
      <p class="clock-hud__game">{{ gameClock }}</p>
      <p v-if="stepClock !== ''" class="clock-hud__step-clock">{{ stepClock }}</p>
    </div>
  </div>
</template>

<style scoped>
.clock-hud {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  font-variant-numeric: tabular-nums;
}

.clock-hud__phase {
  font-size: var(--stage-tag);
  color: rgba(245, 245, 245, 0.6);
  letter-spacing: 0.08em;
}

.clock-hud__step {
  font-size: var(--stage-narration);
  font-weight: 600;
}

.clock-hud__number {
  font-size: var(--stage-tag);
  color: rgba(245, 245, 245, 0.55);
}

.clock-hud__right {
  text-align: right;
}

.clock-hud__game {
  font-size: var(--stage-hud);
  font-weight: 600;
}

.clock-hud__step-clock {
  font-size: var(--stage-tag);
  color: rgba(245, 245, 245, 0.7);
}
</style>
