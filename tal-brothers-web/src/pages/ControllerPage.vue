<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useRoute } from 'vue-router'

import ActionBar from '@/components/controller/ActionBar.vue'
import DesktopNotice from '@/components/controller/DesktopNotice.vue'
import ErosionGauge from '@/components/controller/ErosionGauge.vue'
import LockOverlay from '@/components/controller/LockOverlay.vue'
import { useCountdown } from '@/composables/useCountdown'
import { useRoomSocket } from '@/composables/useRoomSocket'
import { useWakeLock } from '@/composables/useWakeLock'
import { BROTHER_LABEL } from '@/constants/brotherLabel'
import { STEP_LABEL } from '@/constants/stepLabel'
import { looksLikePhone, resolveDeviceRole } from '@/lib/deviceRole'
import { usePlayStore } from '@/stores/play'

/**
 * Controller 화면 (M4 계획 3절, 5절).
 *
 * **본인 것만 보인다.** 다른 좌석의 잠식도·인벤토리·연결 상태는 이 기기에 오지 않는다 (룰북 §17).
 * 단계별 조작(투표·굴림·개입·부적·능력)은 M4-4부터 채우고, 여기서는 **자리와 잠금**만 잡는다.
 */

const route = useRoute()
const play = usePlayStore()

const roomCode = String(route.params.roomCode ?? '').toUpperCase()
useRoomSocket(roomCode, resolveDeviceRole(roomCode))

const { notice: wakeLockNotice } = useWakeLock()
const { label: stepClockLabel } = useCountdown(toRef(play, 'stepDeadlineAt'))

/** PC로 열었으면 안내를 띄우되 막지는 않는다 (9절 6번) */
const dismissedDesktopNotice = ref(false)
const showDesktopNotice = computed(() => !looksLikePhone() && !dismissedDesktopNotice.value)

const seatLabel = computed(() =>
  play.mySeat === null ? '자리 없음' : BROTHER_LABEL[play.mySeat],
)
const stepLabel = computed(() => (play.step === null ? '' : STEP_LABEL[play.step]))

/** 일시정지 중에는 전 화면을 덮고 조작을 막는다 (아키텍처 §8) */
const pauseView = computed(() => play.snapshot?.pause ?? null)
</script>

<template>
  <template v-if="showDesktopNotice">
    <div class="controller-body">
      <DesktopNotice :room-code="roomCode" @dismiss="dismissedDesktopNotice = true" />
    </div>
  </template>

  <template v-else>
    <header class="controller-top">
      <div class="controller-head">
        <div>
          <p class="controller-head__seat">{{ seatLabel }}</p>
          <p class="controller-head__step">{{ stepLabel }}</p>
        </div>
        <p v-if="stepClockLabel !== ''" class="controller-head__clock">{{ stepClockLabel }}</p>
      </div>

      <ErosionGauge
        v-if="play.privateView !== null"
        :percent="play.privateView.erosionPercent"
        class="controller-head__gauge"
      />

      <p v-if="wakeLockNotice" class="controller-head__notice">{{ wakeLockNotice }}</p>
    </header>

    <main class="controller-body">
      <p v-if="play.snapshot === null" class="controller-body__waiting">방 정보를 받는 중…</p>
      <template v-else>
        <p v-if="play.snapshot.narration !== null" class="controller-body__narration">
          {{ play.snapshot.narration }}
        </p>
        <p class="controller-body__todo">단계별 조작은 M4-4부터 채웁니다.</p>
      </template>

      <p v-if="play.message" class="controller-body__message">{{ play.message }}</p>
    </main>

    <ActionBar :label="null" hint="잠시 기다리세요" />

    <LockOverlay
      :visible="pauseView !== null"
      title="일시정지"
      detail="호스트가 다시 시작할 때까지 기다려 주세요."
    />
  </template>
</template>

<style scoped>
.controller-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.controller-head__seat {
  font-size: 1rem;
  font-weight: 600;
}

.controller-head__step {
  font-size: 0.75rem;
  color: rgba(245, 245, 245, 0.55);
}

.controller-head__clock {
  font-size: 1.25rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.controller-head__gauge {
  margin-top: 0.75rem;
}

.controller-head__notice {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #d9a066;
}

.controller-body__waiting,
.controller-body__todo {
  font-size: 0.8125rem;
  color: rgba(245, 245, 245, 0.45);
}

.controller-body__narration {
  margin-bottom: 0.75rem;
  font-size: 0.9375rem;
  line-height: 1.6;
}

.controller-body__message {
  margin-top: 1rem;
  font-size: 0.8125rem;
  color: #d9a066;
}
</style>
