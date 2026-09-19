import type { HealthResponse } from 'tal-brothers-shared'
import { Router } from 'express'

/** 기동 확인 (M3 계획 4.2). 인증이 없다 */
export function createHealthRouter(): Router {
  const router = Router()

  router.get('/healthz', (_request, response) => {
    const body: HealthResponse = { ok: true }
    response.json(body)
  })

  return router
}
