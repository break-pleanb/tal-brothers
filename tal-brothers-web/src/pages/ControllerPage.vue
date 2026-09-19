<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useRoute } from 'vue-router'

import { useCountdown } from '@/composables/useCountdown'
import { useRoomSocket } from '@/composables/useRoomSocket'
import { BROTHER_LABEL } from '@/constants/brotherLabel'
import { PHASE_LABEL } from '@/constants/phaseLabel'
import { STEP_LABEL } from '@/constants/stepLabel'
import { resolveDeviceRole } from '@/lib/deviceRole'
import { usePlayStore } from '@/stores/play'

/**
 * Controller 자리표시자 (M4-1).
 *
 * 세이프에어리어·게이지·액션바는 M4-3에서 만든다. 지금은 **본인 정보와 남은 시간**만 보여준다.
 * 다른 좌석의 잠식도·인벤토리는 이 기기에 오지 않는다 (룰북 §17).
 */

const route = useRoute()
const play = usePlayStore()

const roomCode = String(route.params.roomCode ?? '').toUpperCase()
useRoomSocket(roomCode, resolveDeviceRole(roomCode))

const { label: gameClockLabel } = useCountdown(toRef(play, 'clockDeadlineAt'))
const { label: stepClockLabel } = useCountdown(toRef(play, 'stepDeadlineAt'))

const phaseLabel = computed(() => (play.phase === null ? '' : PHASE_LABEL[play.phase]))
const stepLabel = computed(() => (play.step === null ? '' : STEP_LABEL[play.step]))
const seatLabel = computed(() => (play.mySeat === null ? '자리 없음' : BROTHER_LABEL[play.mySeat]))
</script>

<template>
  <section class="flex flex-1 flex-col items-center justify-center gap-4 text-center">
    <h1 class="text-2xl font-semibold tracking-widest">{{ roomCode }}</h1>

    <p v-if="play.snapshot === null" class="text-sm text-neutral-400">방 정보를 받는 중…</p>

    <template v-else>
      <p class="text-sm text-neutral-400">{{ phaseLabel }} · {{ seatLabel }}</p>
      <p class="text-4xl font-semibold">{{ stepLabel }}</p>

      <dl class="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
        <dt class="text-neutral-400">게임 시계</dt>
        <dd class="text-right tabular-nums">{{ gameClockLabel || '—' }}</dd>
        <dt class="text-neutral-400">이 단계</dt>
        <dd class="text-right tabular-nums">{{ stepClockLabel || '—' }}</dd>
        <template v-if="play.privateView !== null">
          <dt class="text-neutral-400">잠식도</dt>
          <dd class="text-right tabular-nums">{{ play.privateView.erosionPercent }}%</dd>
          <dt class="text-neutral-400">부적</dt>
          <dd class="text-right tabular-nums">{{ play.privateView.talismanCount }}개</dd>
        </template>
      </dl>

      <p class="text-xs text-neutral-500">조작 화면은 M4-3에서 만듭니다.</p>
    </template>

    <p v-if="play.message" class="text-sm text-amber-300">{{ play.message }}</p>
  </section>
</template>
