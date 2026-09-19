<script setup lang="ts">
import { computed } from 'vue'
import { SEAT_CONNECTION } from 'tal-brothers-shared'
import type { BrotherRole, SeatConnectionView, SeatNameView } from 'tal-brothers-shared'

import { BROTHER_LABEL } from '@/constants/brotherLabel'

/**
 * 좌석 3칸 요약 — **Display 전용** (M4 계획 2.3 레이어 3).
 *
 * - 좌석 이름과 **"연결 끊김"만** 표기한다. "봇 대행"이라는 말은 화면 어디에도 쓰지 않는다 (룰북 §17)
 * - **봇 좌석은 이름 자리에 "봇"을 쓴다.** 봇 구성은 로비에서 이미 공개된 정보다.
 *   서버가 보내는 `isBot`은 좌석 구성이라, 연결이 끊겨 대행 중인 인간 좌석은 여기서 봇이 아니다
 * - **잠식도·인벤토리·변이는 이 컴포넌트에 들어오지 않는다.** props 타입이 그것을 막는다 (M4 계획 6.1)
 */

const props = defineProps<{
  seatNames: SeatNameView[]
  /** 좌석별 연결 상태. Display에만 온다 */
  connections: SeatConnectionView[] | null
}>()

function isDisconnected(seat: BrotherRole): boolean {
  const found = props.connections?.find((entry) => entry.seat === seat)
  return found?.connection === SEAT_CONNECTION.DISCONNECTED
}

/** 이름 자리에 쓸 말. 봇은 "봇", 이름 없는 사람은 형제 이름으로 대신한다 */
function nameOf(entry: SeatNameView): string {
  if (entry.isBot) return '봇'
  return entry.displayName ?? BROTHER_LABEL[entry.seat]
}

const seats = computed(() =>
  props.seatNames.map((entry) => ({
    seat: entry.seat,
    name: nameOf(entry),
    role: BROTHER_LABEL[entry.seat],
    disconnected: isDisconnected(entry.seat),
  })),
)
</script>

<template>
  <ul class="seat-strip">
    <li v-for="entry in seats" :key="entry.seat" class="seat-strip__seat">
      <span class="seat-strip__role">{{ entry.role }}</span>
      <span class="seat-strip__name">{{ entry.name }}</span>
      <span v-if="entry.disconnected" class="seat-strip__off">연결 끊김</span>
    </li>
  </ul>
</template>

<style scoped>
.seat-strip {
  display: flex;
  gap: 1.5cqw;
}

.seat-strip__seat {
  display: flex;
  align-items: baseline;
  gap: 0.6cqw;
  padding: 0.5cqh 1cqw;
  border: 1px solid rgba(245, 245, 245, 0.16);
  border-radius: 0.6cqw;
  background: rgba(0, 0, 0, 0.35);
}

.seat-strip__role {
  font-size: var(--stage-tag);
  color: rgba(245, 245, 245, 0.55);
}

.seat-strip__name {
  font-size: var(--stage-choice);
}

.seat-strip__off {
  font-size: var(--stage-tag);
  color: #d9a066;
}
</style>
