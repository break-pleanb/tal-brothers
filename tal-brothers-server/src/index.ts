import { createServer } from 'node:http'

import { loadServerEnv } from './config/serverEnv'
import { createSupabaseAuthVerifier } from './infra/authVerifier'
import { createRoomRepository } from './infra/roomRepository'
import { createSupabaseAdmin } from './infra/supabaseAdmin'
import { createRoomRegistry } from './room/roomRegistry'
import { createRealScheduler } from './room/scheduler'
import { createHttpApp } from './transport/http/httpApp'
import { attachWsServer } from './transport/ws/wsServer'

/**
 * 부트스트랩 (M3 계획 M3-5).
 *
 * Express와 ws가 **같은 HTTP 서버**를 쓴다. 폰이 PC 내부 IP로 붙어야 하므로 0.0.0.0에 바인딩한다.
 * 환경 변수가 없으면 여기서 즉시 실패한다.
 */

const env = loadServerEnv()
const scheduler = createRealScheduler()
const supabase = createSupabaseAdmin(env)

const rooms = createRoomRegistry({
  scheduler,
  codeLength: env.roomCodeLength,
  roomTtlMs: env.roomTtlMs,
})

const auth = createSupabaseAuthVerifier(supabase)

const app = createHttpApp({
  rooms,
  auth,
  repository: createRoomRepository(supabase),
  corsOrigins: env.corsOrigins,
  now: () => scheduler.now(),
})

const server = createServer(app)
attachWsServer({ server, rooms, auth, scheduler, helloTimeoutMs: env.helloTimeoutMs })

// 마지막 활동 후 보관 기간이 지난 방을 주기적으로 정리한다
const sweepTimer = setInterval(
  () => {
    rooms.sweep(scheduler.now())
  },
  10 * 60_000,
)
sweepTimer.unref()

server.listen(env.port, '0.0.0.0', () => {
  console.info(`[tal-brothers] http://0.0.0.0:${env.port} (ws: /ws)`)
})
