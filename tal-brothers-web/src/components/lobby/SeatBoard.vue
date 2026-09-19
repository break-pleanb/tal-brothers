<script setup lang="ts">
import { BROTHER_ROLE, SEAT_CONNECTION } from 'tal-brothers-shared'
import type { BrotherRole, LobbySeatView, SeatConnectionView } from 'tal-brothers-shared'

/**
 * 좌석 3칸 현황 (아키텍처 §9.1).
 *
 * 좌석별 연결 상태는 **Display에만** 온다. Controller에서는 `connections`가 비어 있어
 * 아무 표기도 하지 않는다 (룰북 §17). 표기는 "연결 끊김"으로만 한다 — "봇 대행"은 쓰지 않는다.
 */

const props = defineProps<{
  seats: LobbySeatView[]
  connections: SeatConnectionView[] | null
  /** 내 좌석. 없으면 null */
  mySeat: BrotherRole | null
  /** 좌석을 고를 수 있는 기기인지 */
  selectable: boolean
}>()

const emit = defineEmits<{ pick: [seat: BrotherRole] }>()

const SEAT_LABEL: Record<BrotherRole, string> = {
  [BROTHER_ROLE.FIRST]: '첫째 · 근력/보호',
  [BROTHER_ROLE.SECOND]: '둘째 · 민첩/눈치',
  [BROTHER_ROLE.THIRD]: '셋째 · 지식/도술',
}

function isDisconnected(seat: BrotherRole): boolean {
  const found = props.connections?.find((entry) => entry.seat === seat)
  return found?.connection === SEAT_CONNECTION.DISCONNECTED
}

function stateLabel(seat: LobbySeatView): string {
  if (seat.isBot) return '봇'
  if (!seat.occupied) return '빈자리'
  return seat.displayName ?? '참가자'
}
</script>

<template>
  <ul class="grid gap-3">
    <li v-for="seat in seats" :key="seat.seat">
      <button
        type="button"
        class="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors"
        :class="[
          seat.seat === mySeat
            ? 'border-neutral-100 bg-neutral-100/10'
            : 'border-neutral-700 hover:border-neutral-500',
          selectable ? 'cursor-pointer' : 'cursor-default',
        ]"
        :disabled="!selectable"
        @click="emit('pick', seat.seat)"
      >
        <span class="space-y-1">
          <span class="block text-sm font-medium">{{ SEAT_LABEL[seat.seat] }}</span>
          <span class="block text-xs text-neutral-400">{{ stateLabel(seat) }}</span>
        </span>

        <span class="flex items-center gap-2 text-xs">
          <span v-if="seat.seat === mySeat" class="text-neutral-200">내 자리</span>
          <span v-if="isDisconnected(seat.seat)" class="text-amber-400">연결 끊김</span>
        </span>
      </button>
    </li>
  </ul>
</template>
