/**
 * web 환경 변수 (M3 계획 7.2).
 *
 * **anon 키까지만 둔다.** service role 키는 절대 여기에 넣지 않는다 (아키텍처 §10).
 *
 * 서버 주소는 **지금 이 페이지를 연 주소에서 끌어낸다.** PC는 `localhost`로, 폰은 내부 IP로
 * 같은 앱을 열기 때문에, 주소를 한 값으로 고정하면 둘 중 한쪽이 반드시 깨진다.
 * 값을 명시해야 하는 경우(서버가 다른 기기에 있는 등)만 `VITE_API_BASE_URL`·`VITE_WS_URL`로 덮어쓴다.
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

function serverPort(): string {
  return optional(import.meta.env.VITE_SERVER_PORT) ?? '3000'
}

/** 이 페이지를 연 호스트의 서버 주소 */
function derivedApiBaseUrl(): string {
  return `${window.location.protocol}//${window.location.hostname}:${serverPort()}`
}

function derivedWsUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${window.location.hostname}:${serverPort()}/ws`
}

export const WEB_ENV = {
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
  /** 비우면 지금 보고 있는 호스트의 `:3000` */
  apiBaseUrl: optional(import.meta.env.VITE_API_BASE_URL) ?? derivedApiBaseUrl(),
  /** 비우면 지금 보고 있는 호스트의 `:3000/ws` */
  wsUrl: optional(import.meta.env.VITE_WS_URL) ?? derivedWsUrl(),
  /**
   * 초대 QR에 실을 주소. **QR 전용이다.**
   * 로그인 리디렉션에는 쓰지 않는다 — 폰과 PC가 서로 다른 오리진으로 접속할 수 있어야 한다.
   * 비우면 지금 보고 있는 주소를 쓴다
   */
  publicWebOrigin: optional(import.meta.env.VITE_PUBLIC_WEB_ORIGIN),
} as const
