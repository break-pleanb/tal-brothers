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

function optional(value: string | undefined): string | null {
  return value === undefined || value.trim() === '' ? null : value.trim()
}

export const WEB_ENV = {
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
  apiBaseUrl: required('VITE_API_BASE_URL', import.meta.env.VITE_API_BASE_URL),
  wsUrl: required('VITE_WS_URL', import.meta.env.VITE_WS_URL),
  /**
   * 초대 QR에 실을 주소. 없으면 지금 보고 있는 주소를 쓴다.
   * PC를 `localhost`로 열어 두면 폰이 그 주소로 올 수 없어 이 값이 필요하다
   */
  publicWebOrigin: optional(import.meta.env.VITE_PUBLIC_WEB_ORIGIN),
} as const
