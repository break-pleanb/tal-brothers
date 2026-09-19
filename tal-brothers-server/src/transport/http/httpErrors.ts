import { API_ERROR_CODE } from 'tal-brothers-shared'
import type { ApiErrorBody, ApiErrorCode } from 'tal-brothers-shared'
import type { Response } from 'express'

/**
 * REST 실패 응답 (M3 계획 4.2).
 * 실패는 **모두 같은 모양**이다: `{ error: { code, message } }`.
 */

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  [API_ERROR_CODE.UNAUTHENTICATED]: 401,
  [API_ERROR_CODE.FORBIDDEN]: 403,
  [API_ERROR_CODE.ROOM_NOT_FOUND]: 404,
  [API_ERROR_CODE.ROOM_NOT_JOINABLE]: 409,
  [API_ERROR_CODE.BAD_REQUEST]: 400,
  [API_ERROR_CODE.INTERNAL]: 500,
}

export function sendApiError(response: Response, code: ApiErrorCode, message: string): void {
  const body: ApiErrorBody = { error: { code, message } }
  response.status(STATUS_BY_CODE[code]).json(body)
}
