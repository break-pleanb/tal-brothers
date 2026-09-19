<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { RoomInfoResponse } from 'tal-brothers-shared'

import { Button } from '@/components/ui/button'
import { ROUTE_NAME } from '@/constants/routeName'
import { detectInAppBrowser } from '@/lib/inAppBrowser'
import { ApiError, fetchRoom, joinRoom } from '@/services/apiClient'

/**
 * 초대 페이지 (M3 계획 6.3, 아키텍처 §10).
 *
 * 카카오톡 등 인앱 브라우저로 열면 Google이 로그인을 막는다. 먼저 외부 브라우저로 열도록 안내한다.
 */

const route = useRoute()
const router = useRouter()

const roomCode = String(route.params.roomCode ?? '').toUpperCase()
const inApp = detectInAppBrowser()
const room = ref<RoomInfoResponse | null>(null)
const message = ref<string | null>(null)
const joining = ref(false)

onMounted(async () => {
  try {
    room.value = await fetchRoom(roomCode)
  } catch (error) {
    message.value = error instanceof ApiError ? error.message : '방을 찾지 못했다'
  }
})

async function join(): Promise<void> {
  joining.value = true
  message.value = null
  try {
    await joinRoom(roomCode)
    await router.replace({ name: ROUTE_NAME.LOBBY, params: { roomCode } })
  } catch (error) {
    message.value = error instanceof ApiError ? error.message : '참가하지 못했다'
  } finally {
    joining.value = false
  }
}

async function copyLink(): Promise<void> {
  await navigator.clipboard.writeText(window.location.href)
  message.value = '주소를 복사했습니다. 외부 브라우저에 붙여 넣어 주세요'
}
</script>

<template>
  <section class="flex flex-1 flex-col gap-6">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold">방 {{ roomCode }}</h1>
      <p v-if="room" class="text-sm text-neutral-400">
        {{ room.hostName ?? '호스트' }}님의 방 · 앉은 사람 {{ room.seatCount }}명
      </p>
    </header>

    <div
      v-if="inApp"
      class="space-y-3 rounded-lg border border-amber-600/50 bg-amber-950/30 p-4 text-sm"
    >
      <p class="font-medium text-amber-300">{{ inApp.label }} 안에서는 로그인할 수 없습니다</p>
      <p class="text-neutral-300">
        오른쪽 위 메뉴에서 <strong>다른 브라우저로 열기</strong>를 선택하거나, 주소를 복사해
        Chrome·Safari에 붙여 넣어 주세요.
      </p>
      <Button size="sm" variant="outline" @click="copyLink">주소 복사</Button>
    </div>

    <div v-if="room && !room.joinable" class="rounded-lg border border-neutral-700 p-4 text-sm">
      이미 시작했거나 자리가 찬 방입니다.
    </div>

    <Button
      v-else-if="room"
      size="lg"
      :disabled="joining || inApp !== null"
      @click="join"
    >
      {{ joining ? '참가하는 중…' : '이 방에 참가하기' }}
    </Button>

    <p v-if="message" class="text-sm text-amber-300">{{ message }}</p>

    <RouterLink class="mt-auto text-sm text-neutral-400 underline" :to="{ name: ROUTE_NAME.MAIN_MENU }">
      메뉴로
    </RouterLink>
  </section>
</template>
