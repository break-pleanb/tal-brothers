<script setup lang="ts">
import { computed } from 'vue'
import { GAME_STEP } from 'tal-brothers-shared'
import type { GameStep, InterventionView, SeatNameView } from 'tal-brothers-shared'

import { BROTHER_LABEL } from '@/constants/brotherLabel'

/**
 * 개입 창 3단계 진행 표시 (룰북 §7.2, §7.4, §17).
 *
 * **누가 어떤 수단을 썼는지는 공개 정보다.** 서버가 `interventions`에 실어 보낸 것만 그린다.
 * 연습 개입 창(룰북 §12)은 단일 단계라 "연습"으로만 표기한다.
 */

const props = defineProps<{
  step: GameStep | null
  interventions: InterventionView[]
  seatNames: SeatNameView[]
}>()

/** 개입 수단의 한국어 표기. 서버의 `InterventionView.kind`는 문자열이다 */
const KIND_LABEL: Record<string, string> = {
  reroll: '재굴림',
  talisman: '부적 +1',
  forceSuccess: '강제 성공',
}

const STAGES = [
  { step: GAME_STEP.INTERVENTION_REROLL, label: '둘째 재굴림' },
  { step: GAME_STEP.INTERVENTION_TALISMAN, label: '낡은 부적' },
  { step: GAME_STEP.INTERVENTION_FORCE, label: '첫째 강제 성공' },
] as const

const isPractice = computed(() => props.step === GAME_STEP.PRACTICE_INTERVENTION)

/** 지금 몇 번째 칸인지. 지나간 칸까지 점등한다 */
const activeIndex = computed(() =>
  STAGES.findIndex((stage) => stage.step === props.step),
)

function nameOf(seat: SeatNameView['seat']): string {
  const found = props.seatNames.find((entry) => entry.seat === seat)
  return found?.displayName ?? BROTHER_LABEL[seat]
}
</script>

<template>
  <div class="track">
    <p v-if="isPractice" class="track__practice">연습 — 눌러 보아도 아무 일도 일어나지 않습니다</p>

    <ol v-else class="track__stages">
      <li
        v-for="(stage, index) in STAGES"
        :key="stage.step"
        class="track__stage"
        :class="{
          'track__stage--lit': activeIndex >= 0 && index <= activeIndex,
          'track__stage--now': index === activeIndex,
        }"
      >
        {{ stage.label }}
      </li>
    </ol>

    <ul v-if="interventions.length > 0" class="track__used">
      <li v-for="(record, index) in interventions" :key="index">
        {{ nameOf(record.seat) }} — {{ KIND_LABEL[record.kind] ?? record.kind }} → 최종
        {{ record.finalValueAfter }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.track {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1cqh;
}

.track__practice {
  font-size: var(--stage-narration);
  color: #d9a066;
}

.track__stages {
  display: flex;
  gap: 0.8cqw;
}

.track__stage {
  padding: 0.6cqh 1cqw;
  border: 1px solid rgba(245, 245, 245, 0.16);
  border-radius: 0.5cqw;
  font-size: var(--stage-tag);
  color: rgba(245, 245, 245, 0.4);
}

.track__stage--lit {
  color: rgba(245, 245, 245, 0.8);
  border-color: rgba(245, 245, 245, 0.35);
}

.track__stage--now {
  color: #f5f5f5;
  border-color: #9e4c4c;
  background: rgba(158, 76, 76, 0.2);
}

.track__used {
  font-size: var(--stage-tag);
  color: rgba(245, 245, 245, 0.75);
  text-align: center;
}
</style>
