import { afterEach, describe, expect, it } from 'vitest'
import { API_ERROR_CODE, BROTHER_ROLE, COMMAND_TYPE, GAME_STEP } from 'tal-brothers-shared'
import type {
  ApiErrorBody,
  CreateRoomResponse,
  JoinRoomResponse,
  RoomInfoResponse,
} from 'tal-brothers-shared'
import type { Server } from 'node:http'

import type { AuthVerifier } from '../../src/infra/authVerifier'
import { createRoomRegistry } from '../../src/room/roomRegistry'
import type { RoomRegistry } from '../../src/room/roomRegistry'
import { createHttpApp } from '../../src/transport/http/httpApp'
import { createFakeConnection, createFakeScheduler } from '../support/fakeRoom'

/**
 * REST 왕복 (M3 계획 9.1 M3-5).
 *
 * Express 앱을 랜덤 포트로 띄우고 Node 내장 `fetch`로 왕복한다. 테스트 의존성을 늘리지 않는다.
 * **실제 Supabase는 부르지 않는다.** 토큰 검증은 가짜다.
 */

const START = 1_700_000_000_000

const fakeAuth: AuthVerifier = {
  verify: async (token) => {
    if (!token.startsWith('token-')) return null
    const userId = token.replace('token-', 'user-')
    return { userId, displayName: userId, email: null }
  },
}

type Harness = {
  baseUrl: string
  rooms: RoomRegistry
  server: Server
}

const started: Server[] = []

async function startApp(): Promise<Harness> {
  const scheduler = createFakeScheduler(START)
  const rooms = createRoomRegistry({ scheduler })
  const app = createHttpApp({
    rooms,
    auth: fakeAuth,
    repository: null,
    corsOrigins: ['http://localhost:5173'],
    now: () => scheduler.now(),
  })

  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => {
      resolve(listening)
    })
  })
  started.push(server)

  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('포트를 알 수 없다')
  return { baseUrl: `http://127.0.0.1:${address.port}`, rooms, server }
}

afterEach(async () => {
  await Promise.all(
    started.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => {
            resolve()
          })
        }),
    ),
  )
})

function authHeaders(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` }
}

describe('GET /healthz', () => {
  it('인증 없이 답한다', async () => {
    const { baseUrl } = await startApp()
    const response = await fetch(`${baseUrl}/healthz`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })
})

describe('인증 (M3 계획 4.2)', () => {
  it('토큰이 없는 요청은 401이다', async () => {
    const { baseUrl } = await startApp()
    const response = await fetch(`${baseUrl}/api/rooms`, { method: 'POST' })

    expect(response.status).toBe(401)
    const body = (await response.json()) as ApiErrorBody
    expect(body.error.code).toBe(API_ERROR_CODE.UNAUTHENTICATED)
    expect(typeof body.error.message).toBe('string')
  })

  it('확인할 수 없는 토큰도 401이다', async () => {
    const { baseUrl } = await startApp()
    const response = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: authHeaders('nope'),
    })

    expect(response.status).toBe(401)
  })
})

describe('POST /api/rooms', () => {
  it('방 코드를 돌려주고 같은 코드가 두 번 나오지 않는다', async () => {
    const { baseUrl, rooms } = await startApp()

    const first = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: authHeaders('token-host'),
    })
    const second = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: authHeaders('token-other'),
    })

    expect(first.status).toBe(201)
    const firstBody = (await first.json()) as CreateRoomResponse
    const secondBody = (await second.json()) as CreateRoomResponse

    expect(firstBody.roomCode).toHaveLength(6)
    expect(firstBody.hostUserId).toBe('user-host')
    expect(firstBody.roomCode).not.toBe(secondBody.roomCode)
    expect(rooms.list()).toHaveLength(2)
  })
})

describe('GET /api/rooms/:roomCode', () => {
  it('없는 코드는 404다', async () => {
    const { baseUrl } = await startApp()
    const response = await fetch(`${baseUrl}/api/rooms/ZZZZZZ`, { headers: authHeaders('token-a') })

    expect(response.status).toBe(404)
    const body = (await response.json()) as ApiErrorBody
    expect(body.error.code).toBe(API_ERROR_CODE.ROOM_NOT_FOUND)
  })

  it('방 정보에 단계와 좌석 수, 참가 가능 여부가 담긴다', async () => {
    const { baseUrl, rooms } = await startApp()
    const created = await (
      await fetch(`${baseUrl}/api/rooms`, { method: 'POST', headers: authHeaders('token-host') })
    ).json()
    const code = (created as CreateRoomResponse).roomCode

    const room = rooms.get(code)
    if (room === null) throw new Error('방이 없다')
    const alice = createFakeConnection('user-alice')
    room.addMember('user-alice', '앨리스', START)
    room.attach(alice)
    room.submitCommand(alice, 1, { type: COMMAND_TYPE.LOBBY_PICK_SEAT, seat: BROTHER_ROLE.FIRST })

    const response = await fetch(`${baseUrl}/api/rooms/${code}`, { headers: authHeaders('token-a') })
    const body = (await response.json()) as RoomInfoResponse

    expect(body.roomCode).toBe(code)
    expect(body.hostName).toBe('user-host')
    expect(body.step).toBe(GAME_STEP.LOBBY)
    expect(body.seatCount).toBe(1)
    expect(body.joinable).toBe(true)
  })
})

describe('POST /api/rooms/:roomCode/join', () => {
  it('참가하면 멤버가 되고, 좌석은 아직 없다', async () => {
    const { baseUrl, rooms } = await startApp()
    const created = (await (
      await fetch(`${baseUrl}/api/rooms`, { method: 'POST', headers: authHeaders('token-host') })
    ).json()) as CreateRoomResponse

    const response = await fetch(`${baseUrl}/api/rooms/${created.roomCode}/join`, {
      method: 'POST',
      headers: authHeaders('token-alice'),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as JoinRoomResponse
    expect(body.memberId).toBe('user-alice')

    const room = rooms.get(created.roomCode)
    expect(room?.hasMember('user-alice')).toBe(true)
    expect(room?.state.seats[BROTHER_ROLE.FIRST].userId).toBeNull()
  })

  it('이미 시작한 방에 참가하면 409다', async () => {
    const { baseUrl, rooms } = await startApp()
    const created = (await (
      await fetch(`${baseUrl}/api/rooms`, { method: 'POST', headers: authHeaders('token-host') })
    ).json()) as CreateRoomResponse

    const room = rooms.get(created.roomCode)
    if (room === null) throw new Error('방이 없다')

    const display = createFakeConnection('user-host', 'display')
    const alice = createFakeConnection('user-alice')
    room.addMember('user-alice', null, START)
    room.attach(display)
    room.attach(alice)
    room.submitCommand(alice, 1, { type: COMMAND_TYPE.LOBBY_PICK_SEAT, seat: BROTHER_ROLE.FIRST })
    room.submitCommand(display, 1, { type: COMMAND_TYPE.LOBBY_START })
    expect(room.step).not.toBe(GAME_STEP.LOBBY)

    const response = await fetch(`${baseUrl}/api/rooms/${created.roomCode}/join`, {
      method: 'POST',
      headers: authHeaders('token-bob'),
    })

    expect(response.status).toBe(409)
    const body = (await response.json()) as ApiErrorBody
    expect(body.error.code).toBe(API_ERROR_CODE.ROOM_NOT_JOINABLE)
  })

  it('이미 멤버면 다시 참가해도 통과한다', async () => {
    const { baseUrl } = await startApp()
    const created = (await (
      await fetch(`${baseUrl}/api/rooms`, { method: 'POST', headers: authHeaders('token-host') })
    ).json()) as CreateRoomResponse

    const first = await fetch(`${baseUrl}/api/rooms/${created.roomCode}/join`, {
      method: 'POST',
      headers: authHeaders('token-alice'),
    })
    const again = await fetch(`${baseUrl}/api/rooms/${created.roomCode}/join`, {
      method: 'POST',
      headers: authHeaders('token-alice'),
    })

    expect(first.status).toBe(200)
    expect(again.status).toBe(200)
  })

  it('인간 상한 3명을 넘기면 참가할 수 없다 (룰북 §1)', async () => {
    const { baseUrl } = await startApp()
    const created = (await (
      await fetch(`${baseUrl}/api/rooms`, { method: 'POST', headers: authHeaders('token-host') })
    ).json()) as CreateRoomResponse

    // 호스트가 이미 멤버 1명이다. 둘이 더 들어오면 정원이 찬다
    for (const token of ['token-alice', 'token-bob']) {
      const response = await fetch(`${baseUrl}/api/rooms/${created.roomCode}/join`, {
        method: 'POST',
        headers: authHeaders(token),
      })
      expect(response.status).toBe(200)
    }

    const overflow = await fetch(`${baseUrl}/api/rooms/${created.roomCode}/join`, {
      method: 'POST',
      headers: authHeaders('token-carol'),
    })
    expect(overflow.status).toBe(409)
  })
})

describe('실패 응답 모양', () => {
  it('없는 경로도 같은 모양으로 답한다', async () => {
    const { baseUrl } = await startApp()
    const response = await fetch(`${baseUrl}/api/nope`)

    const body = (await response.json()) as ApiErrorBody
    expect(Object.keys(body)).toEqual(['error'])
    expect(Object.keys(body.error).sort()).toEqual(['code', 'message'])
  })
})
