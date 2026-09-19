import { API_ERROR_CODE } from 'tal-brothers-shared'
import type { NextFunction, Request, RequestHandler, Response } from 'express'

import type { AuthUser, AuthVerifier } from '../../infra/authVerifier'
import { sendApiError } from './httpErrors'

/**
 * `Authorization: Bearer <access_token>` 검증 (M3 계획 4.1).
 * 토큰을 URL·쿼리스트링에 싣지 않는다 (아키텍처 §10).
 */

/** 인증을 통과한 요청에 붙는 사용자 */
export type AuthedRequest = Request & { authUser?: AuthUser }

function bearerToken(request: Request): string | null {
  const header = request.header('authorization')
  if (header === undefined) return null

  const [scheme, value] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || value === undefined || value.length === 0) return null
  return value
}

export function createRequireAuth(auth: AuthVerifier): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    const token = bearerToken(request)
    if (token === null) {
      sendApiError(response, API_ERROR_CODE.UNAUTHENTICATED, '인증 토큰이 없다')
      return
    }

    void auth
      .verify(token)
      .then((user) => {
        if (user === null) {
          sendApiError(response, API_ERROR_CODE.UNAUTHENTICATED, '토큰을 확인할 수 없다')
          return
        }
        ;(request as AuthedRequest).authUser = user
        next()
      })
      .catch(() => {
        sendApiError(response, API_ERROR_CODE.INTERNAL, '토큰 검증 중 오류가 났다')
      })
  }
}

/** 인증 미들웨어를 지난 요청에서만 부른다 */
export function authUserOf(request: Request): AuthUser {
  const user = (request as AuthedRequest).authUser
  if (user === undefined) throw new Error('인증 미들웨어를 지나지 않은 요청이다')
  return user
}
