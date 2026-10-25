import { createServer } from 'node:http'

import express from 'express'

import { createSeededRng } from '../src/engine/random'
import { createRoomRegistry } from '../src/room/roomRegistry'
import { createHttpApp } from '../src/transport/http/httpApp'
import { attachWsServer } from '../src/transport/ws/wsServer'
import { createAcceleratedScheduler } from './acceleratedScheduler'
import { createFakeAuthVerifier } from './fakeAuthVerifier'

/**
 * 통합 테스트 전용 서버 진입점 (m4-plan 11.3 M4-A).
 *
 * `src/index.ts`와 같은 부품을 같은 방식으로 조립한다. 다른 점은 넷뿐이다.
 * - 가짜 토큰 검증 (Google 로그인 우회, m4-plan 11.1 1번)
 * - `repository: null` — Supabase DB에 쓰지 않는다
 * - 가속 스케줄러 (`E2E_TIME_RATE`, 기본 4배)
 * - 시드 고정 난수 (`E2E_SEED`). 테스트가 `POST /__e2e/seed`로 **다음 방**의 시드를 지정할 수 있다
 *
 * 운영 환경에서 실수로 켜지지 않도록 `NODE_ENV=production`이면 시작하지 않는다.
 */

if ((process.env.NODE_ENV ?? '').trim() === 'production') {
  throw new Error('e2eServer는 운영 환경에서 실행하지 않는다')
}

function numberEnv(key: string, fallback: number): number {
  const raw = process.env[key]
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new Error(`${key}가 숫자가 아니다: ${raw}`)
  return value
}

const port = numberEnv('E2E_SERVER_PORT', 3100)
const webPort = numberEnv('E2E_WEB_PORT', 5174)
const rate = numberEnv('E2E_TIME_RATE', 4)
let autoSeed = numberEnv('E2E_SEED', 1)
let pinnedSeed: number | null = null

const scheduler = createAcceleratedScheduler(rate)

const rooms = createRoomRegistry({
  scheduler,
  createRng: () => {
    const seed = pinnedSeed ?? autoSeed++
    pinnedSeed = null
    return createSeededRng(seed)
  },
})

const auth = createFakeAuthVerifier()

const gameApp = createHttpApp({
  rooms,
  auth,
  repository: null,
  corsOrigins: [`http://localhost:${webPort}`, `http://127.0.0.1:${webPort}`],
  devOptionsEnabled: true,
  now: () => scheduler.now(),
})

const app = express()
app.post('/__e2e/seed', express.json(), (request, response) => {
  const seed = (request.body as { seed?: unknown } | undefined)?.seed
  if (typeof seed !== 'number' || !Number.isInteger(seed)) {
    response.status(400).json({ error: 'seed는 정수여야 한다' })
    return
  }
  pinnedSeed = seed
  response.json({ ok: true, seed })
})
app.get('/__e2e/info', (_request, response) => {
  response.json({ rate, serverNow: scheduler.now() })
})
app.use(gameApp)

const server = createServer(app)
// hello 대기와 하트비트도 스케줄러를 따른다. 서버 시각 기준으로 적어 실제 시간은 배율만큼 짧아진다
attachWsServer({ server, rooms, auth, scheduler, helloTimeoutMs: 10_000 * rate })

// localhost가 IPv4·IPv6 어느 쪽으로 풀려도 닿도록 주소를 지정하지 않는다
server.listen(port, () => {
  console.info(`[tal-brothers e2e] http://localhost:${port} (배율 ${rate}, 시드 ${autoSeed})`)
})
