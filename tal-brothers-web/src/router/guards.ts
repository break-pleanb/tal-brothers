import type { NavigationGuardWithThis, RouteLocationNormalized } from 'vue-router'

import { ROUTE_NAME } from '@/constants/routeName'
import { NEXT_QUERY_KEY } from '@/lib/nextPath'
import { useAuthStore } from '@/stores/auth'
import { usePlayStore } from '@/stores/play'

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

/** 같은 방을 쓰는 화면들. 이 사이를 오갈 때는 소켓을 그대로 이어 쓴다 (M4 계획 4.1) */
const ROOM_ROUTE_NAMES: string[] = [ROUTE_NAME.LOBBY, ROUTE_NAME.DISPLAY, ROUTE_NAME.PLAY]

/** 이 경로가 보는 방 코드. 방 화면이 아니면 null */
function roomCodeOf(route: RouteLocationNormalized): string | null {
  if (typeof route.name !== 'string' || !ROOM_ROUTE_NAMES.includes(route.name)) return null

  const value = route.params.roomCode
  const code = Array.isArray(value) ? value[0] : value
  return code === undefined || code === '' ? null : code.toUpperCase()
}

/**
 * 방을 벗어날 때 소켓을 닫는다 (M4 계획 4.1).
 *
 * **로비 → Display·Controller 이동에서는 닫지 않는다.** 같은 방의 같은 연결을 이어 써야
 * 서버가 그 이동을 연결 끊김으로 받지 않는다 (아키텍처 §8). 정리를 화면마다 두지 않고 여기 한 곳에 둔다.
 */
export const roomSocketGuard: NavigationGuardWithThis<undefined> = (to) => {
  const play = usePlayStore()
  const next = roomCodeOf(to)

  if (play.roomCode !== null && play.roomCode !== next) play.disconnect()
  return true
}
