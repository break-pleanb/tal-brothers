<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { ROUTE_NAME } from '@/constants/routeName'
import { takeRedirect } from '@/router/guards'
import { useAuthStore } from '@/stores/auth'

/**
 * OAuth 복귀 (M3 계획 6.3).
 * 세션 교환은 supabase-js가 URL에서 알아서 한다. 여기서는 준비를 기다렸다 복귀 경로로 보낸다.
 */

const auth = useAuthStore()
const router = useRouter()
const failed = ref(false)

onMounted(async () => {
  await auth.waitUntilReady()

  if (!auth.isSignedIn) {
    failed.value = true
    return
  }

  const back = takeRedirect()
  await (back === null ? router.replace({ name: ROUTE_NAME.MAIN_MENU }) : router.replace(back))
})
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center bg-neutral-950 px-6 text-neutral-100">
    <p v-if="!failed" class="text-sm text-neutral-400">로그인 정보를 확인하는 중…</p>
    <div v-else class="space-y-4 text-center">
      <p class="text-sm text-red-400">로그인을 마치지 못했습니다.</p>
      <RouterLink class="text-sm underline" :to="{ name: ROUTE_NAME.LANDING }">
        처음으로 돌아가기
      </RouterLink>
    </div>
  </div>
</template>
