<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { DEVICE_ROLE } from 'tal-brothers-shared'

import { Button } from '@/components/ui/button'
import { rememberDeviceRole } from '@/lib/deviceRole'
import { ROUTE_NAME } from '@/constants/routeName'
import { ApiError, createRoom } from '@/services/apiClient'
import { useAuthStore } from '@/stores/auth'

/**
 * 메인 메뉴 (M3 계획 6.3).
 * 방 만들기 / 코드로 참가 / 로그아웃. 세이브 목록은 M5라 비활성이다.
 */

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

/**
 * 개발용 시계 단축 — `/menu?clock=3`으로 3분짜리 방을 만든다 (아키텍처 §8).
 * 화면에 버튼을 두지 않는 이유는 **운영에서 쓰는 기능이 아니기** 때문이다.
 * 서버가 개발 환경이 아니면 이 값을 무시한다
 */
const devClockMinutes = computed<number | undefined>(() => {
  const raw = route.query.clock
  const value = Number(Array.isArray(raw) ? raw[0] : raw)
  return Number.isInteger(value) && value > 0 ? value : undefined
})

const creating = ref(false)
const joinCode = ref('')
const message = ref<string | null>(null)

async function makeRoom(): Promise<void> {
  creating.value = true
  message.value = null
  try {
    const room = await createRoom(
      devClockMinutes.value === undefined ? {} : { devClockMinutes: devClockMinutes.value },
    )
    // 방을 만든 이 기기가 중계 화면이다 (아키텍처 §1)
    rememberDeviceRole(room.roomCode, DEVICE_ROLE.DISPLAY)
    await router.push({ name: ROUTE_NAME.LOBBY, params: { roomCode: room.roomCode } })
  } catch (error) {
    message.value =
      error instanceof ApiError ? error.message : '방을 만들지 못했다. 서버를 확인한다'
  } finally {
    creating.value = false
  }
}

async function goJoin(): Promise<void> {
  const code = joinCode.value.trim().toUpperCase()
  if (code.length === 0) {
    message.value = '방 코드를 입력한다'
    return
  }
  await router.push({ name: ROUTE_NAME.JOIN, params: { roomCode: code } })
}

async function signOut(): Promise<void> {
  await auth.leave()
  await router.replace({ name: ROUTE_NAME.LANDING })
}
</script>

<template>
  <section class="flex flex-1 flex-col gap-8">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold">메뉴</h1>
      <p class="text-sm text-neutral-400">
        {{ auth.user?.displayName ?? '이름 없는 형제' }}님으로 접속했습니다.
      </p>
    </header>

    <div class="space-y-4">
      <Button class="w-full" size="lg" :disabled="creating" @click="makeRoom">
        {{ creating ? '방을 만드는 중…' : '방 만들기 (이 PC가 중계 화면)' }}
      </Button>

      <form class="flex gap-2" @submit.prevent="goJoin">
        <input
          v-model="joinCode"
          class="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm uppercase tracking-widest outline-none focus:border-neutral-400"
          placeholder="방 코드"
          maxlength="8"
          autocomplete="off"
        />
        <Button type="submit" variant="outline">코드로 참가</Button>
      </form>

      <Button class="w-full" variant="ghost" disabled>불러오기 (M5 예정)</Button>
    </div>

    <p v-if="message" class="text-sm text-red-400">{{ message }}</p>

    <footer class="mt-auto pt-6">
      <Button variant="ghost" size="sm" @click="signOut">로그아웃</Button>
    </footer>
  </section>
</template>
