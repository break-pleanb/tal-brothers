import { createClient } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'

import { WEB_ENV } from '@/config/webEnv'

/**
 * Supabase 클라이언트와 Google 로그인 (아키텍처 §10, M3 계획 4.1).
 *
 * 전원 Google 로그인이다. 익명 참가는 없다.
 */

export const supabase = createClient(WEB_ENV.supabaseUrl, WEB_ENV.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/** OAuth 복귀 지점. Supabase 대시보드의 Additional Redirect URLs에 등록돼 있어야 한다 */
export function authCallbackUrl(): string {
  return `${window.location.origin}/auth/callback`
}

export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: authCallbackUrl() },
  })
  if (error !== null) throw new Error(`로그인을 시작하지 못했다: ${error.message}`)
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

/** 지금 세션의 액세스 토큰. 없으면 null */
export async function currentAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export type { Session }
