import { API_ERROR_CODE } from 'tal-brothers-shared'
import type {
  ApiErrorBody,
  ApiErrorCode,
  CreateRoomResponse,
  JoinRoomResponse,
  RoomInfoResponse,
} from 'tal-brothers-shared'

import { WEB_ENV } from '@/config/webEnv'
import { currentAccessToken } from './supabase'

/**
 * REST 호출 (M3 계획 4.2).
 *
 * 액세스 토큰을 `Authorization` 헤더에 싣는다. URL·쿼리스트링에 싣지 않는다 (아키텍처 §10).
 * 실패 응답은 모두 `{ error: { code, message } }` 모양이다.
 */

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number

  constructor(code: ApiErrorCode, status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await currentAccessToken()
  if (token === null) {
    throw new ApiError(API_ERROR_CODE.UNAUTHENTICATED, 401, '로그인이 필요하다')
  }

  const response = await fetch(`${WEB_ENV.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null
    throw new ApiError(
      body?.error.code ?? API_ERROR_CODE.INTERNAL,
      response.status,
      body?.error.message ?? '요청이 실패했다',
    )
  }

  return (await response.json()) as T
}

export function createRoom(): Promise<CreateRoomResponse> {
  return request<CreateRoomResponse>('/api/rooms', { method: 'POST' })
}

export function fetchRoom(roomCode: string): Promise<RoomInfoResponse> {
  return request<RoomInfoResponse>(`/api/rooms/${encodeURIComponent(roomCode)}`)
}

export function joinRoom(roomCode: string): Promise<JoinRoomResponse> {
  return request<JoinRoomResponse>(`/api/rooms/${encodeURIComponent(roomCode)}/join`, {
    method: 'POST',
  })
}
