<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useRoute } from 'vue-router'

import ClockHud from '@/components/display/ClockHud.vue'
import MaskApparition from '@/components/display/MaskApparition.vue'
import SeatStrip from '@/components/display/SeatStrip.vue'
import StageBackground from '@/components/display/StageBackground.vue'
import { useCountdown } from '@/composables/useCountdown'
import { useRoomSocket } from '@/composables/useRoomSocket'
import { resolveDeviceRole } from '@/lib/deviceRole'
import { usePlayStore } from '@/stores/play'

/**
 * Display 화면 (M4 계획 2절, 5절).
 *
 * **이 화면에는 게임 조작이 없다** (룰북 §1). 스냅샷을 받아 그리기만 한다.
 * 좌석 스냅샷을 들고 있지 않으므로 잠식도·인벤토리·변이·귓속말은 여기 올 수 없다 (M4 계획 6.1).
 *
 * 본문 레이어(내레이션·선택지·주사위·개입 창)는 M4-4부터 채운다.
 */

const route = useRoute()
const play = usePlayStore()

const roomCode = String(route.params.roomCode ?? '').toUpperCase()
useRoomSocket(roomCode, resolveDeviceRole(roomCode))

const { label: gameClockLabel } = useCountdown(toRef(play, 'clockDeadlineAt'))
const { label: stepClockLabel } = useCountdown(toRef(play, 'stepDeadlineAt'))

/** Display가 받는 공개 항목. 좌석 전용 값은 이 스냅샷에 아예 없다 */
const view = computed(() => play.snapshot)
</script>

<template>
  <StageBackground :background="view?.background ?? null" :phase="view?.phase ?? null" />

  <MaskApparition :mask="view?.mask ?? null" />

  <div class="stage-layer stage-layer--hud">
    <div class="stage-safe display-hud">
      <ClockHud
        :phase="view?.phase ?? null"
        :step="view?.step ?? null"
        :event-number="view?.eventNumber ?? null"
        :game-clock="gameClockLabel"
        :step-clock="stepClockLabel"
      />

      <div class="display-hud__bottom">
        <SeatStrip :seat-names="play.seatNames" :connections="play.seatConnections" />
      </div>
    </div>

    <!-- 방송 캠 오버레이 자리. 글자를 놓지 않는다 (M4 계획 2.4) -->
    <div class="stage-cam-reserved" />
  </div>

  <div class="stage-layer stage-layer--body">
    <div class="stage-safe display-body">
      <p v-if="view === null" class="display-body__waiting">방 정보를 받는 중…</p>
      <template v-else>
        <p v-if="view.eventTitle !== null" class="display-body__title">{{ view.eventTitle }}</p>
        <p class="display-body__todo">본문은 M4-4부터 채웁니다.</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.display-hud {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.display-hud__bottom {
  display: flex;
  justify-content: flex-start;
}

.display-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5cqh;
  text-align: center;
  pointer-events: none;
}

.display-body__waiting,
.display-body__todo {
  font-size: var(--stage-tag);
  color: rgba(245, 245, 245, 0.45);
}

.display-body__title {
  font-size: var(--stage-title);
  font-weight: 700;
}
</style>
