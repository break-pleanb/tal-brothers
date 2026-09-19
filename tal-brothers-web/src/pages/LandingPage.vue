<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import introMask from '@/assets/images/masks/introMask.png'
import { Button } from '@/components/ui/button'
import { ROUTE_NAME } from '@/constants/routeName'
import { NEXT_QUERY_KEY, safeNextPath } from '@/lib/nextPath'
import { useAuthStore } from '@/stores/auth'

/**
 * 랜딩 (M3 계획 6.3).
 * 브랜드 이미지는 `introMask.png`만 쓴다. 인게임 에셋 11종은 M4까지 노출하지 않는다.
 */

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const pending = ref(false)
const message = ref<string | null>(null)

/** 가드가 실어 보낸 복귀 경로. 로그인 뒤 여기로 돌아간다 */
const next = safeNextPath(route.query[NEXT_QUERY_KEY])

onMounted(async () => {
  await auth.waitUntilReady()
  if (!auth.isSignedIn) return
  await (next === null ? router.replace({ name: ROUTE_NAME.MAIN_MENU }) : router.replace(next))
})

async function signIn(): Promise<void> {
  pending.value = true
  message.value = null
  try {
    await auth.signIn(next)
  } catch (error) {
    pending.value = false
    message.value = error instanceof Error ? error.message : '로그인을 시작하지 못했다'
  }
}
</script>

<template>
  <section class="flex flex-1 flex-col items-center justify-center gap-8 text-center">
    <img
      :src="introMask"
      alt=""
      class="w-48 max-w-full drop-shadow-[0_0_40px_rgba(180,30,30,0.35)]"
    />

    <div class="space-y-2">
      <h1 class="text-3xl font-semibold tracking-tight">탈: 이면의 형제들</h1>
      <p class="text-sm text-neutral-400">K-다크 판타지 심리 생존 TRPG</p>
    </div>

    <Button size="lg" :disabled="pending" @click="signIn">
      {{ pending ? '이동 중…' : 'Google로 시작하기' }}
    </Button>

    <p v-if="message" class="text-sm text-red-400">{{ message }}</p>
    <p class="text-xs text-neutral-500">
      호스트 PC는 중계 화면이 되고, 조작은 각자의 폰으로 합니다.
    </p>
  </section>
</template>
