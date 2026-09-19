<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ROUTE_NAME } from '@/constants/routeName'
import { NEXT_QUERY_KEY, safeNextPath } from '@/lib/nextPath'
import { useAuthStore } from '@/stores/auth'

/**
 * OAuth 복귀 (M3 계획 6.3).
 * 세션 교환은 supabase-js가 URL에서 알아서 한다. 여기서는 준비를 기다렸다 복귀 경로로 보낸다.
 */

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const failed = ref(false)

/** 되돌아온 주소. 여기가 로그인을 시작한 주소와 다르면 Supabase 설정 문제다 */
const origin = window.location.origin

// supabase-js가 주소에서 자기 파라미터를 지우기 전에 읽어 둔다
const next = safeNextPath(route.query[NEXT_QUERY_KEY])

onMounted(async () => {
  await auth.waitUntilReady()

  if (!auth.isSignedIn) {
    failed.value = true
    return
  }

  await (next === null ? router.replace({ name: ROUTE_NAME.MAIN_MENU }) : router.replace(next))
})
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center bg-neutral-950 px-6 text-neutral-100">
    <p v-if="!failed" class="text-sm text-neutral-400">로그인 정보를 확인하는 중…</p>
    <div v-else class="max-w-sm space-y-4 text-center">
      <p class="text-sm text-red-400">로그인을 마치지 못했습니다.</p>
      <p class="text-xs text-neutral-400">
        Supabase 대시보드의 Additional Redirect URLs에
        <code class="break-all">{{ origin }}/**</code>
        이(가) 등록돼 있는지 확인해 주세요.
      </p>
      <RouterLink class="text-sm underline" :to="{ name: ROUTE_NAME.LANDING }">
        처음으로 돌아가기
      </RouterLink>
    </div>
  </div>
</template>
