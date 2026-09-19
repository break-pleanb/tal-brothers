/**
 * web 환경 변수 (M3 계획 7.2).
 *
 * **anon 키까지만 둔다.** service role 키는 절대 여기에 넣지 않는다 (아키텍처 §10).
 * 폰이 PC 내부 IP로 접속하므로 서버 주소는 `localhost`가 아니라 내부 IP다.
 */

function required(key: string, value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(`환경 변수 ${key}가 없다. tal-brothers-web/.env.local을 확인한다`)
  }
  return value.trim()
}

export const WEB_ENV = {
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
  apiBaseUrl: required('VITE_API_BASE_URL', import.meta.env.VITE_API_BASE_URL),
  wsUrl: required('VITE_WS_URL', import.meta.env.VITE_WS_URL),
} as const
