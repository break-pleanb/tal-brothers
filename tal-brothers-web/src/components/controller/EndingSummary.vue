<script setup lang="ts">
import { computed } from 'vue'
import type { EndingView, SeatNameView } from 'tal-brothers-shared'

import { BROTHER_LABEL } from '@/constants/brotherLabel'
import { ENDING_LABEL } from '@/constants/endingLabel'
import { ROUTE_NAME } from '@/constants/routeName'

/**
 * 폰의 엔딩 요약 (룰북 §15, m4-plan 11.1 d).
 *
 * 조작은 끝났다. 엔딩 이름·내레이션·배신자 공개를 Display와 같은 내용으로 보여주고 메뉴로 돌아갈 길만 둔다.
 * 배신자 정체는 이 단계의 스냅샷에만 들어 있다 (룰북 §17, 아키텍처 §7.3).
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
  <section class="ending-summary" data-testid="ending-summary">
    <p class="ending-summary__title">{{ ENDING_LABEL[ending.id] }}</p>
    <p class="ending-summary__narration">{{ ending.narration }}</p>
    <p class="ending-summary__traitor">{{ traitorLine }}</p>
    <RouterLink class="ending-summary__menu" :to="{ name: ROUTE_NAME.MAIN_MENU }">메뉴로</RouterLink>
  </section>
</template>

<style scoped>
.ending-summary {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.ending-summary__title {
  font-size: 1.25rem;
  font-weight: 700;
}

.ending-summary__narration {
  font-size: 0.9375rem;
  line-height: 1.6;
  color: rgba(245, 245, 245, 0.85);
}

.ending-summary__traitor {
  font-size: 0.875rem;
  color: #d9a0a0;
}

.ending-summary__menu {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: rgba(245, 245, 245, 0.6);
  text-decoration: underline;
}
</style>
