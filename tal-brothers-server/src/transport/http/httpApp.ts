import { API_ERROR_CODE } from 'tal-brothers-shared'
import express from 'express'
import type { Express, NextFunction, Request, Response } from 'express'

import type { AuthVerifier } from '../../infra/authVerifier'
import type { RoomRepository } from '../../infra/roomRepository'
import type { RoomRegistry } from '../../room/roomRegistry'
import { createHealthRouter } from './healthRouter'
import { sendApiError } from './httpErrors'
import { createRequireAuth } from './requireAuth'
import { createRoomsRouter } from './roomsRouter'

/**
 * Express 앱 조립 (M3 계획 4.2).
 *
 * `index.ts`와 나눠 둔 이유는 **테스트가 가짜를 넣어 앱만 띄우기 위해서**다 (M3 계획 9절).
 * 여기서는 포트를 열지 않는다.
 */

export type HttpAppDeps = {
  rooms: RoomRegistry
  auth: AuthVerifier
  repository: RoomRepository | null
  corsOrigins: string[]
  /** 개발용 옵션(짧은 게임 시계)을 받을지. 운영에서는 false다 (아키텍처 §8) */
  devOptionsEnabled?: boolean
  now(): number
}

/**
 * CORS — 폰이 PC 내부 IP로 접속하므로 오리진이 둘 이상이다 (M3 계획 7.2).
 * 의존성을 늘리지 않고 필요한 헤더만 직접 붙인다.
 */
function corsMiddleware(allowed: string[]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const origin = request.header('origin')
    if (origin !== undefined && allowed.includes(origin)) {
      response.setHeader('Access-Control-Allow-Origin', origin)
      response.setHeader('Vary', 'Origin')
      response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    }

    if (request.method === 'OPTIONS') {
      response.status(204).end()
      return
    }
    next()
  }
}

export function createHttpApp(deps: HttpAppDeps): Express {
  const app = express()

  app.use(corsMiddleware(deps.corsOrigins))
  app.use(express.json({ limit: '32kb' }))

  app.use(createHealthRouter())
  app.use(
    '/api',
    createRoomsRouter({
      rooms: deps.rooms,
      repository: deps.repository,
      requireAuth: createRequireAuth(deps.auth),
      devOptionsEnabled: deps.devOptionsEnabled === true,
      now: deps.now,
    }),
  )

  app.use((_request: Request, response: Response) => {
    sendApiError(response, API_ERROR_CODE.ROOM_NOT_FOUND, '없는 경로다')
  })

  // 라우터가 던진 오류도 같은 모양으로 답한다 (M3 계획 4.2)
  app.use((_error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    sendApiError(response, API_ERROR_CODE.INTERNAL, '서버 오류가 났다')
  })

  return app
}
