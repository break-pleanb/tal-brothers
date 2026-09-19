/**
 * 서버 환경 변수 (M3 계획 7.2).
 *
 * **누락되면 즉시 실패한다.** 절반만 설정된 채로 뜨면 첫 접속에서야 문제가 드러난다.
 * 룰이 아닌 운영 설정값(방 코드 길이, hello 타임아웃, 방 보관 기간)도 여기에 둔다 (M3 계획 10절 6번).
 * 룰 설정값은 `scenario/gameConfig.ts`가 원본이다.
 */

export type ServerEnv = {
  port: number
  supabaseUrl: string
  supabaseServiceRoleKey: string
  /** 허용할 웹 오리진 목록 */
  corsOrigins: string[]
  /** 방 코드 길이 — 혼동 문자를 뺀 대문자·숫자 */
  roomCodeLength: number
  /** hello 프레임을 기다리는 시간 */
  helloTimeoutMs: number
  /** 마지막 활동 후 방을 보관하는 시간 */
  roomTtlMs: number
}

export const SERVER_ENV_DEFAULTS = {
  port: 3000,
  roomCodeLength: 6,
  helloTimeoutSeconds: 10,
  roomTtlHours: 6,
} as const

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]
  if (value === undefined || value.trim() === '') {
    throw new Error(`환경 변수 ${key}가 없다. tal-brothers-server/.env를 확인한다`)
  }
  return value.trim()
}

function optionalNumber(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const value = env[key]
  if (value === undefined || value.trim() === '') return fallback

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`환경 변수 ${key}는 양수여야 한다: ${value}`)
  }
  return parsed
}

export function loadServerEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  return {
    port: optionalNumber(env, 'PORT', SERVER_ENV_DEFAULTS.port),
    supabaseUrl: required(env, 'SUPABASE_URL'),
    supabaseServiceRoleKey: required(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    corsOrigins: required(env, 'CORS_ORIGIN')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    roomCodeLength: optionalNumber(
      env,
      'ROOM_CODE_LENGTH',
      SERVER_ENV_DEFAULTS.roomCodeLength,
    ),
    helloTimeoutMs:
      optionalNumber(env, 'HELLO_TIMEOUT_SECONDS', SERVER_ENV_DEFAULTS.helloTimeoutSeconds) * 1000,
    roomTtlMs: optionalNumber(env, 'ROOM_TTL_HOURS', SERVER_ENV_DEFAULTS.roomTtlHours) * 3_600_000,
  }
}
