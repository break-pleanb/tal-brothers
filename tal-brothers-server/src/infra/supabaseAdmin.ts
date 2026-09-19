import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { ServerEnv } from '../config/serverEnv'

/**
 * service role 클라이언트 (아키텍처 §10).
 *
 * **DB 쓰기는 서버만 한다.** 클라이언트는 RLS로 본인 데이터 읽기만 할 수 있다.
 * service role 키는 절대 web 번들에 넣지 않는다 (M3 계획 7.2).
 */
export function createSupabaseAdmin(env: ServerEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      // 서버는 세션을 들고 있지 않는다. 요청마다 토큰을 받아 확인할 뿐이다
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
