import type { NavigationGuardWithThis } from 'vue-router'

import { ROUTE_NAME } from '@/constants/routeName'
import { useAuthStore } from '@/stores/auth'

/**
 * 라우터 가드 (아키텍처 §9.2, M3 계획 6.1).
 *
 * - 인증 스토어의 **초기화 완료를 기다린 뒤** 판단한다. 새로고침 직후 세션 복원 전에 튕기지 않게 한다
 * - 미로그인으로 로그인 필요 경로에 들어오면 **그 경로를 기억했다가** 로그인 후 되돌아온다
 */

/** OAuth는 페이지를 떠났다 돌아오므로 메모리가 아니라 세션 저장소에 남긴다 */
const REDIRECT_KEY = 'tal:redirectAfterLogin'

export function rememberRedirect(fullPath: string): void {
  try {
    sessionStorage.setItem(REDIRECT_KEY, fullPath)
  } catch {
    // 시크릿 모드 등에서 저장소가 막혀 있어도 로그인 자체는 진행한다
  }
}

/** 기억해 둔 경로를 꺼내고 지운다. 없으면 null */
export function takeRedirect(): string | null {
  try {
    const value = sessionStorage.getItem(REDIRECT_KEY)
    sessionStorage.removeItem(REDIRECT_KEY)
    return value
  } catch {
    return null
  }
}

export const authGuard: NavigationGuardWithThis<undefined> = async (to) => {
  const auth = useAuthStore()
  await auth.waitUntilReady()

  if (to.meta.requiresAuth !== true) return true
  if (auth.isSignedIn) return true

  rememberRedirect(to.fullPath)
  return { name: ROUTE_NAME.LANDING }
}
