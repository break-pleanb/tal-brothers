<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { COMMAND_TYPE, DEVICE_ROLE, GAME_STEP } from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

import BotToggle from '@/components/lobby/BotToggle.vue'
import JoinQrPanel from '@/components/lobby/JoinQrPanel.vue'
import SeatBoard from '@/components/lobby/SeatBoard.vue'
import { Button } from '@/components/ui/button'
import { ROUTE_NAME } from '@/constants/routeName'
import { useRoomSocket } from '@/composables/useRoomSocket'
import { resolveDeviceRole } from '@/lib/deviceRole'
import { useLobbyStore } from '@/stores/lobby'

/**
 * 로비 (M3 계획 6.3, 10절 14번).
 *
 * 같은 라우트에서 **기기 역할**로 패널을 가른다. 화면 폭으로 가르지 않는다.
 * 시작하면 Display는 `/display/:code`, Controller는 `/play/:code`로 옮겨 간다.
 */

const route = useRoute()
const router = useRouter()
const lobby = useLobbyStore()

const roomCode = String(route.params.roomCode ?? '').toUpperCase()
const deviceRole = resolveDeviceRole(roomCode)
const socket = useRoomSocket(roomCode, deviceRole)

const seats = computed(() => lobby.lobby?.seats ?? [])
const canStart = computed(() => lobby.lobby?.canStart === true)
const statusLabel = computed(() => {
  switch (lobby.status) {
    case 'open':
      return '연결됨'
    case 'connecting':
      return '연결 중…'
    case 'closed':
      return '연결이 끊겼습니다. 다시 붙는 중…'
    default:
      return '대기'
  }
})

function pickSeat(seat: BrotherRole): void {
  socket.send({ type: COMMAND_TYPE.LOBBY_PICK_SEAT, seat })
}

function toggleBot(seat: BrotherRole, isBot: boolean): void {
  socket.send({ type: COMMAND_TYPE.LOBBY_TOGGLE_BOT, seat, isBot })
}

function start(): void {
  socket.send({ type: COMMAND_TYPE.LOBBY_START })
}

// 시작하면 기기 역할에 따라 갈라진다 (M3 계획 10절 15번)
watch(
  () => lobby.step,
  async (step) => {
    if (step === null || step === GAME_STEP.LOBBY) return
    const name = deviceRole === DEVICE_ROLE.DISPLAY ? ROUTE_NAME.DISPLAY : ROUTE_NAME.PLAY
    await router.replace({ name, params: { roomCode } })
  },
)
</script>

<template>
  <section class="flex flex-1 flex-col gap-6">
    <header class="flex items-baseline justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-widest">{{ roomCode }}</h1>
        <p class="text-xs text-neutral-400">
          {{ lobby.isDisplay ? '중계 화면' : '조작 기기' }} · {{ statusLabel }}
        </p>
      </div>
      <RouterLink class="text-sm text-neutral-400 underline" :to="{ name: ROUTE_NAME.MAIN_MENU }">
        메뉴
      </RouterLink>
    </header>

    <p v-if="lobby.snapshot === null" class="text-sm text-neutral-400">방 정보를 받는 중…</p>

    <template v-else-if="lobby.inLobby">
      <!-- Display: 방 코드, 초대 QR, 좌석 현황, 봇 토글, 시작 -->
      <template v-if="lobby.isDisplay">
        <JoinQrPanel :room-code="roomCode" />
        <SeatBoard
          :seats="seats"
          :connections="lobby.seatConnections"
          :my-seat="lobby.mySeat"
          :selectable="false"
        />
        <BotToggle :seats="seats" @toggle="toggleBot" />
        <Button size="lg" :disabled="!canStart" @click="start">
          {{ canStart ? '게임 시작' : '참가자를 기다리는 중' }}
        </Button>
      </template>

      <!-- Controller: 좌석 고르기 -->
      <template v-else>
        <p class="text-sm text-neutral-400">
          앉을 자리를 고릅니다. 고른 자리를 다시 누르면 일어섭니다.
        </p>
        <SeatBoard
          :seats="seats"
          :connections="null"
          :my-seat="lobby.mySeat"
          :selectable="true"
          @pick="pickSeat"
        />
        <p class="text-sm text-neutral-400">
          {{ lobby.mySeat === null ? '아직 자리를 고르지 않았습니다.' : '호스트가 시작하기를 기다립니다.' }}
        </p>
      </template>
    </template>

    <p v-else class="text-sm text-neutral-400">게임이 시작됐습니다. 화면을 옮기는 중…</p>

    <p v-if="lobby.message" class="text-sm text-amber-300">{{ lobby.message }}</p>
  </section>
</template>
