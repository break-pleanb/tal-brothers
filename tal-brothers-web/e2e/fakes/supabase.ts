import type { Session } from '@supabase/supabase-js'

/**
 * `src/services/supabase.ts`의 통합 테스트용 대역 (m4-plan 11.1 1번).
 *
 * `vite.e2e.config.ts`가 진짜 모듈을 이 파일로 바꿔 끼운다. 운영 설정(`vite.config.ts`)은 이 파일을 모른다.
 * 운영 빌드 산출물에 아래 표식이 없다는 것을 `staticRules.spec`이 확인한다.
 *
 * 세션은 Playwright가 페이지보다 먼저 `localStorage[E2E_USER_KEY]`에 넣은 사용자로 만든다.
 * 토큰 형식은 서버의 `e2e/fakeAuthVerifier.ts`와 같다: `e2e.<userId>.<base64url(이름)>`.
 */

export const E2E_FAKE_SUPABASE = 'E2E_FAKE_SUPABASE'
export const E2E_USER_KEY = 'tal:e2e:user'

type E2eUser = { id: string; name: string }
type AuthListener = (event: string, session: Session | null) => void

const listeners = new Set<AuthListener>()

function readUser(): E2eUser | null {
  try {
    const raw = localStorage.getItem(E2E_USER_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as Partial<E2eUser>
    if (typeof parsed.id !== 'string' || typeof parsed.name !== 'string') return null
    return { id: parsed.id, name: parsed.name }
  } catch {
    return null
  }
}

function base64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function sessionOf(user: E2eUser): Session {
  const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60
  return {
    access_token: `e2e.${user.id}.${base64Url(user.name)}`,
    refresh_token: E2E_FAKE_SUPABASE,
    expires_in: 24 * 60 * 60,
    expires_at: expiresAt,
    token_type: 'bearer',
    user: {
      id: user.id,
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: { full_name: user.name },
      created_at: new Date(0).toISOString(),
    },
  } as Session
}

function currentSession(): Session | null {
  const user = readUser()
  return user === null ? null : sessionOf(user)
}

export const supabase = {
  auth: {
    async getSession() {
      return { data: { session: currentSession() }, error: null }
    },
    onAuthStateChange(listener: AuthListener) {
      listeners.add(listener)
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              listeners.delete(listener)
            },
          },
        },
      }
    },
    async signOut() {
      try {
        localStorage.removeItem(E2E_USER_KEY)
      } catch {
        // 저장소가 막혀도 로그아웃 통지는 보낸다
      }
      for (const listener of listeners) listener('SIGNED_OUT', null)
      return { error: null }
    },
  },
}

export function authCallbackUrl(next: string | null = null): string {
  const url = new URL('/auth/callback', window.location.origin)
  if (next !== null) url.searchParams.set('next', next)
  return url.toString()
}

/** 통합 테스트는 로그인 화면을 거치지 않는다. 사용자는 Playwright가 미리 넣는다 */
export async function signInWithGoogle(_next: string | null = null): Promise<void> {
  throw new Error(`${E2E_FAKE_SUPABASE}: 통합 테스트에서는 사용자를 미리 주입한다`)
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

export async function currentAccessToken(): Promise<string | null> {
  return currentSession()?.access_token ?? null
}

export type { Session }
