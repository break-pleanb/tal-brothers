import type { NavigationGuardWithThis } from 'vue-router'

import { ROUTE_NAME } from '@/constants/routeName'
import { NEXT_QUERY_KEY } from '@/lib/nextPath'
import { useAuthStore } from '@/stores/auth'

/**
 * 라우터 가드 (아키텍처 §9.2, M3 계획 6.1).
 *
 * - 인증 스토어의 **초기화 완료를 기다린 뒤** 판단한다. 새로고침 직후 세션 복원 전에 튕기지 않게 한다
 * - 미로그인으로 로그인 필요 경로에 들어오면 그 경로를 **쿼리에 실어** 랜딩으로 보낸다.
 *   저장소가 아니라 주소에 담아야 OAuth가 오리진을 넘나들어도 복귀 경로가 살아남는다
 */

export const authGuard: NavigationGuardWithThis<undefined> = async (to) => {
  const auth = useAuthStore()
  await auth.waitUntilReady()

  if (to.meta.requiresAuth !== true) return true
  if (auth.isSignedIn) return true

  return { name: ROUTE_NAME.LANDING, query: { [NEXT_QUERY_KEY]: to.fullPath } }
}
