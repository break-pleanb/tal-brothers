import { createClient } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'

import { WEB_ENV } from '@/config/webEnv'
import { NEXT_QUERY_KEY } from '@/lib/nextPath'

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

/**
 * OAuth 복귀 지점 (M3 계획 4.1).
 *
 * **지금 이 페이지를 연 주소를 그대로 쓴다.** PC는 `localhost`로, 폰은 내부 IP로 같은 앱을 열기
 * 때문에 한 값으로 고정할 수 없다. `VITE_PUBLIC_WEB_ORIGIN`은 초대 QR 전용이라 여기에 쓰지 않는다.
 *
 * 돌아갈 경로는 쿼리에 실어 보낸다. 저장소는 오리진마다 따로라 오리진이 바뀌면 사라진다.
 *
 * 이 주소는 Supabase 대시보드의 **Additional Redirect URLs에 등록돼 있어야 한다.**
 * 목록에 없으면 Supabase는 이 값을 조용히 무시하고 Site URL로 되돌린다 —
 * 폰에서 `localhost`로 튕기는 증상이 그것이다.
 */
export function authCallbackUrl(next: string | null = null): string {
  const url = new URL('/auth/callback', window.location.origin)
  if (next !== null) url.searchParams.set(NEXT_QUERY_KEY, next)
  return url.toString()
}

export async function signInWithGoogle(next: string | null = null): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: authCallbackUrl(next) },
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
