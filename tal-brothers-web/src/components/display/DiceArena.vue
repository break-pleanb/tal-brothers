<script setup lang="ts">
import { computed } from 'vue'
import { GAME_STEP, JUDGMENT_KIND } from 'tal-brothers-shared'
import type { BrotherRole, GameStep, JudgmentView, SeatNameView } from 'tal-brothers-shared'

import { BROTHER_LABEL } from '@/constants/brotherLabel'
import { JUDGMENT_LABEL } from '@/constants/judgmentLabel'

/**
 * 주사위와 판정 결과 (룰북 §5.1, §5.4, §17).
 *
 * **비공개 판정은 주사위·기준·성패를 하나도 보여주지 않는다.** 서버가 애초에 보내지 않으므로
 * 여기서는 "판정 완료"만 남는다. 굴림을 기다리는 중이면 그 사실만 알린다.
 */

const props = defineProps<{
  judgment: JudgmentView | null
  step: GameStep | null
  /** 판정자. 협동 판정은 null이다 (룰북 §5.2) */
  rollerSeat: BrotherRole | null
  seatNames: SeatNameView[]
}>()

const isHidden = computed(() => props.judgment?.kind === JUDGMENT_KIND.HIDDEN)
const waiting = computed(() => props.step === GAME_STEP.ROLL_WAIT)

function nameOf(seat: BrotherRole): string {
  const found = props.seatNames.find((entry) => entry.seat === seat)
  return found?.displayName ?? BROTHER_LABEL[seat]
}

/** 성패 표기. 대립 판정은 기준이 아니라 상대값을 넘어야 한다 (룰북 §14.3) */
const resultLabel = computed(() => {
  const judgment = props.judgment
  if (judgment === null || judgment.succeeded === null) return null
  if (judgment.forcedSuccess) return '강제 성공'
  return judgment.succeeded ? '성공' : '실패'
})
</script>

<template>
  <div v-if="judgment !== null" class="dice-arena">
    <p class="dice-arena__kind">
      {{ JUDGMENT_LABEL[judgment.kind] }} 판정
      <span v-if="rollerSeat !== null">· 판정자 {{ nameOf(rollerSeat) }}</span>
      <span v-if="judgment.contest" class="dice-arena__tag">· 대립</span>
    </p>

    <!-- 비공개 판정은 중계하지 않는다 (룰북 §5.4) -->
    <template v-if="isHidden">
      <p class="dice-arena__hidden">{{ waiting ? '비공개 판정 진행 중' : '판정 완료' }}</p>
    </template>

    <template v-else>
      <ul class="dice-arena__dice">
        <li v-for="die in judgment.dice ?? []" :key="die.seat" class="dice-arena__die">
          <span class="dice-arena__seat">{{ nameOf(die.seat) }}</span>
          <span class="dice-arena__value">{{ die.value ?? '–' }}</span>
        </li>
      </ul>

      <p v-if="judgment.finalValue !== null" class="dice-arena__final">
        최종 {{ judgment.finalValue }}
        <span v-if="judgment.opponentValue !== null"> · 상대 {{ judgment.opponentValue }}</span>
        <span v-else-if="judgment.threshold !== null"> · 기준 {{ judgment.threshold }}</span>
      </p>

      <p v-if="resultLabel !== null" class="dice-arena__result">{{ resultLabel }}</p>
      <p v-else-if="waiting" class="dice-arena__waiting">주사위를 기다리는 중</p>
    </template>
  </div>
</template>

<style scoped>
.dice-arena {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1cqh;
}

.dice-arena__kind {
  font-size: var(--stage-tag);
  color: rgba(245, 245, 245, 0.6);
}

.dice-arena__tag {
  color: #d9a066;
}

.dice-arena__hidden,
.dice-arena__waiting {
  font-size: var(--stage-narration);
  color: rgba(245, 245, 245, 0.7);
}

.dice-arena__dice {
  display: flex;
  gap: 1.2cqw;
}

.dice-arena__die {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4cqh;
  min-width: 7cqw;
  padding: 1cqh 0.8cqw;
  border: 1px solid rgba(245, 245, 245, 0.2);
  border-radius: 0.6cqw;
  background: rgba(0, 0, 0, 0.4);
}

.dice-arena__seat {
  font-size: var(--stage-tag);
  color: rgba(245, 245, 245, 0.6);
}

.dice-arena__value {
  font-size: var(--stage-title);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.dice-arena__final {
  font-size: var(--stage-choice);
  font-variant-numeric: tabular-nums;
}

.dice-arena__result {
  font-size: var(--stage-title);
  font-weight: 700;
}
</style>
