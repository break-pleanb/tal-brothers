import { API_ERROR_CODE, GAME_STEP } from 'tal-brothers-shared'
import type {
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomResponse,
  RoomInfoResponse,
} from 'tal-brothers-shared'
import { Router } from 'express'
import type { Request, Response } from 'express'

import { isHumanSeat, isSeatOccupied } from '../../engine/rules/seatControl'
import { SEAT_ORDER } from '../../engine/state/gameState'
import type { RoomRepository } from '../../infra/roomRepository'
import type { RoomRegistry } from '../../room/roomRegistry'
import type { Room } from '../../room/roomTypes'
import { sendApiError } from './httpErrors'
import { authUserOf } from './requireAuth'
import type { AuthedRequest } from './requireAuth'

/**
 * 방 생성·조회·참가 (M3 계획 4.2).
 *
 * **좌석 선택은 여기에 없다.** 좌석은 경쟁 자원이라 방당 직렬 큐를 지나야 선착순이 흔들리지 않는다.
 * 참가(`join`)는 멤버 등록까지만 하고, 좌석은 로비에서 ws로 고른다.
 */

/** 인간 플레이어는 최대 3명이다 (룰북 §1). 좌석 수가 곧 참가 상한이다 */
const MAX_MEMBERS = SEAT_ORDER.length

export type RoomsRouterDeps = {
  rooms: RoomRegistry
  /** `rooms` 테이블 기록. 실패해도 방 진행을 막지 않는다 (원본은 메모리) */
  repository: RoomRepository | null
  requireAuth: ReturnType<typeof import('./requireAuth').createRequireAuth>
  /** 개발용 옵션을 받을지. 운영에서는 false라 본문의 개발용 값을 통째로 무시한다 (아키텍처 §8) */
  devOptionsEnabled: boolean
  now(): number
}

/** 개발용 시계 단축의 허용 범위(분). 상한은 룰북 §19의 기본값이다 */
const DEV_CLOCK_MINUTES_RANGE = { min: 1, max: 100 } as const

/**
 * 개발용 시계 단축 (아키텍처 §8).
 *
 * **운영 환경에서는 값이 들어와도 무시한다.** 범위를 벗어나거나 정수가 아니면 없는 것으로 본다 —
 * 개발 편의 값 하나 때문에 방 생성이 실패하면 안 된다.
 */
function devClockMinutesOf(body: unknown, enabled: boolean): number | undefined {
  if (!enabled) return undefined

  const value = (body as CreateRoomRequest | undefined)?.devClockMinutes
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined
  if (value < DEV_CLOCK_MINUTES_RANGE.min || value > DEV_CLOCK_MINUTES_RANGE.max) {
    return undefined
  }
  return value
}

/** Express 5의 경로 파라미터는 배열일 수 있다. 방 코드는 항상 한 개다 */
function roomCodeOf(request: Request): string {
  const value = request.params.roomCode
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

function occupiedSeatCount(room: Room): number {
  return SEAT_ORDER.filter((role) => {
    const seat = room.state.seats[role]
    return isHumanSeat(seat) && isSeatOccupied(seat)
  }).length
}

function isJoinable(room: Room): boolean {
  return room.step === GAME_STEP.LOBBY && room.members().length < MAX_MEMBERS
}

function roomInfo(room: Room): RoomInfoResponse {
  const host = room.members().find((member) => member.userId === room.hostUserId)
  return {
    roomCode: room.code,
    hostName: host?.displayName ?? null,
    step: room.step,
    seatCount: occupiedSeatCount(room),
    joinable: isJoinable(room),
  }
}

export function createRoomsRouter(deps: RoomsRouterDeps): Router {
  const router = Router()

  router.post('/rooms', deps.requireAuth, (request: Request, response: Response) => {
    const user = authUserOf(request)
    const clockMinutes = devClockMinutesOf(request.body, deps.devOptionsEnabled)
    const room = deps.rooms.create({
      hostUserId: user.userId,
      hostDisplayName: user.displayName,
      ...(clockMinutes === undefined ? {} : { clockMinutes }),
    })

    const body: CreateRoomResponse = {
      roomCode: room.code,
      hostUserId: room.hostUserId,
      createdAt: room.createdAt,
    }

    // 이력 기록은 방 진행과 무관하다. 실패해도 응답을 막지 않는다 (아키텍처 §10)
    void deps.repository
      ?.insert({ code: room.code, hostUserId: room.hostUserId, createdAt: room.createdAt })
      .catch(() => undefined)

    response.status(201).json(body)
  })

  router.get('/rooms/:roomCode', deps.requireAuth, (request: Request, response: Response) => {
    const room = deps.rooms.get(roomCodeOf(request))
    if (room === null) {
      sendApiError(response, API_ERROR_CODE.ROOM_NOT_FOUND, '없는 방 코드다')
      return
    }
    response.json(roomInfo(room))
  })

  router.post('/rooms/:roomCode/join', deps.requireAuth, (request: Request, response: Response) => {
    const user = authUserOf(request)
    const room = deps.rooms.get(roomCodeOf(request))
    if (room === null) {
      sendApiError(response, API_ERROR_CODE.ROOM_NOT_FOUND, '없는 방 코드다')
      return
    }

    // 이미 멤버면 다시 참가해도 그대로 통과시킨다 (초대 링크를 두 번 열 수 있다)
    if (!room.hasMember(user.userId) && !isJoinable(room)) {
      sendApiError(response, API_ERROR_CODE.ROOM_NOT_JOINABLE, '참가할 수 없는 방이다')
      return
    }

    const member = room.addMember(user.userId, user.displayName, deps.now())
    const body: JoinRoomResponse = { roomCode: room.code, memberId: member.userId }
    response.json(body)
  })

  return router
}

export type { AuthedRequest }
