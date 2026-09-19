import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'

import { signInWithGoogle, signOut, supabase } from '@/services/supabase'

/**
 * 인증 스토어 (M3 계획 6.2, 아키텍처 §9.2).
 *
 * - `ready`는 **세션 복원 시도가 끝났는지**다. 라우터 가드가 이 값을 기다린다.
 *   새로고침 직후 복원 전에 판단하면 로그인한 사용자가 랜딩으로 튕긴다
 * - 토큰이 갱신돼도 열려 있는 ws는 그대로 둔다. 세션은 hello 시점에 한 번만 검증한다
 */

export type AuthUser = {
  id: string
  displayName: string | null
  avatarUrl: string | null
}

function toUser(session: Session | null): AuthUser | null {
  if (session === null) return null

  const metadata = session.user.user_metadata as Record<string, unknown>
  const name = metadata['full_name'] ?? metadata['name']
  const avatar = metadata['avatar_url'] ?? metadata['picture']

  return {
    id: session.user.id,
    displayName: typeof name === 'string' && name.length > 0 ? name : null,
    avatarUrl: typeof avatar === 'string' && avatar.length > 0 ? avatar : null,
  }
}

export const useAuthStore = defineStore('auth', () => {
  const ready = ref(false)
  const session = ref<Session | null>(null)
  const user = computed<AuthUser | null>(() => toUser(session.value))
  const isSignedIn = computed(() => session.value !== null)

  let initializing: Promise<void> | null = null

  /** 앱 시작 시 한 번 부른다. 여러 번 불러도 한 번만 실행된다 */
  function initialize(): Promise<void> {
    if (initializing !== null) return initializing

    initializing = (async () => {
      const { data } = await supabase.auth.getSession()
      session.value = data.session

      supabase.auth.onAuthStateChange((_event, next) => {
        session.value = next
      })

      ready.value = true
    })()

    return initializing
  }

  /** 가드가 쓰는 대기 지점 */
  async function waitUntilReady(): Promise<void> {
    await initialize()
  }

  async function signIn(): Promise<void> {
    await signInWithGoogle()
  }

  async function leave(): Promise<void> {
    await signOut()
    session.value = null
  }

  return { ready, session, user, isSignedIn, initialize, waitUntilReady, signIn, leave }
})
