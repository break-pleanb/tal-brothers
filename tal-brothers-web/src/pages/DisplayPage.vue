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
 * Display 자리표시자 (M4-1).
 *
 * 스테이지·레이어·HUD는 M4-2에서 만든다. 지금은 **스냅샷이 도착하고 남은 시간이 흐르는지**만 보여준다.
 * 이 화면에는 게임 조작이 없다 (룰북 §1).
 */

const route = useRoute()
const play = usePlayStore()

const roomCode = String(route.params.roomCode ?? '').toUpperCase()
useRoomSocket(roomCode, resolveDeviceRole(roomCode))

const { label: gameClockLabel } = useCountdown(toRef(play, 'clockDeadlineAt'))
const { label: stepClockLabel } = useCountdown(toRef(play, 'stepDeadlineAt'))

const phaseLabel = computed(() => (play.phase === null ? '' : PHASE_LABEL[play.phase]))
const stepLabel = computed(() => (play.step === null ? '' : STEP_LABEL[play.step]))

/** 좌석 이름 — 이름이 없는 좌석은 형제 이름으로 부른다 (룰북 §17) */
const seats = computed(() =>
  play.seatNames.map((entry) => ({
    seat: entry.seat,
    label: entry.displayName ?? BROTHER_LABEL[entry.seat],
  })),
)
</script>

<template>
  <section class="flex flex-1 flex-col items-center justify-center gap-4 text-center">
    <h1 class="text-2xl font-semibold tracking-widest">{{ roomCode }}</h1>

    <p v-if="play.snapshot === null" class="text-sm text-neutral-400">방 정보를 받는 중…</p>

    <template v-else>
      <p class="text-sm text-neutral-400">{{ phaseLabel }}</p>
      <p class="text-4xl font-semibold">{{ stepLabel }}</p>

      <dl class="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
        <dt class="text-neutral-400">게임 시계</dt>
        <dd class="text-right tabular-nums">{{ gameClockLabel || '—' }}</dd>
        <dt class="text-neutral-400">이 단계</dt>
        <dd class="text-right tabular-nums">{{ stepClockLabel || '—' }}</dd>
        <dt class="text-neutral-400">진행</dt>
        <dd class="text-right tabular-nums">{{ play.snapshot.eventNumber ?? '—' }}</dd>
      </dl>

      <p class="text-sm text-neutral-300">
        {{ seats.map((entry) => entry.label).join(' · ') }}
      </p>

      <p class="text-xs text-neutral-500">중계 화면은 M4-2에서 만듭니다.</p>
    </template>
  </section>
</template>
