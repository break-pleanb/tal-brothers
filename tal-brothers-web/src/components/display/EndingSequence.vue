<script setup lang="ts">
import { computed } from 'vue'
import type { EndingView, SeatNameView } from 'tal-brothers-shared'

import { BROTHER_LABEL } from '@/constants/brotherLabel'
import { ENDING_LABEL } from '@/constants/endingLabel'

/**
 * 엔딩 (룰북 §15, §17).
 *
 * 엔딩 이름 → 내레이션 → 배신자 공개 순으로 보여준다. 문장은 **스냅샷의 `ending.narration`**이다 —
 * cue로만 오던 때는 새로고침하면 사라졌다 (m4-plan 11.1 2번). 1인 플레이 분기 내레이션도 서버가 골라 보낸다.
 *
 * - 배신자의 승패와 정체는 엔딩 화면에서 공개한다. 배신자가 없으면 "배신자 없음" (룰북 §15, §21)
 * - 엔딩 연출은 게임 시계 밖이다. 이 화면은 스스로 닫히지 않는다 (m4-plan 11.1 d)
 */

const props = defineProps<{
  ending: EndingView
  seatNames: SeatNameView[]
}>()

const traitorLine = computed(() => {
  if (props.ending.traitorSeats.length === 0) return '배신자 없음'
  const names = props.ending.traitorSeats.map((seat) => {
    const found = props.seatNames.find((entry) => entry.seat === seat)
    return found?.displayName ? `${BROTHER_LABEL[seat]} ${found.displayName}` : BROTHER_LABEL[seat]
  })
  const outcome = props.ending.traitorWon === null ? '' : props.ending.traitorWon ? ' — 승리' : ' — 패배'
  return `이면의 형제: ${names.join(', ')}${outcome}`
})
</script>

<template>
  <div class="ending" data-testid="ending-sequence">
    <p class="ending__title">{{ ENDING_LABEL[ending.id] }}</p>
    <p class="ending__narration">{{ ending.narration }}</p>
    <p class="ending__traitor">{{ traitorLine }}</p>
  </div>
</template>

<style scoped>
.ending {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3cqh;
  padding: 0 12cqw;
  text-align: center;
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.88));
}

.ending__title {
  font-size: var(--stage-title);
  font-weight: 700;
  letter-spacing: 0.08em;
}

.ending__narration {
  font-size: var(--stage-narration);
  line-height: 1.7;
  color: rgba(245, 245, 245, 0.88);
}

.ending__traitor {
  font-size: var(--stage-choice);
  color: #d9a0a0;
}
</style>
