import { describe, expect, it } from 'vitest'
import {
  BROTHER_ROLE,
  CLIENT_FRAME_TYPE,
  COMMAND_TYPE,
  DEVICE_ROLE,
  PROTOCOL_ERROR_CODE,
  REJECTION_REASON,
  SERVER_MESSAGE_TYPE,
} from 'tal-brothers-shared'
import type { DeviceRole, ServerMessage } from 'tal-brothers-shared'

import { createSeededRng } from '../../src/engine/random'
import type { AuthVerifier } from '../../src/infra/authVerifier'
import { createRoom } from '../../src/room/roomRuntime'
import type { Room } from '../../src/room/roomTypes'
import { createWsSession } from '../../src/transport/ws/wsSession'
import type { SocketPort } from '../../src/transport/ws/socketPort'
import { createFakeScheduler } from '../support/fakeRoom'
import type { FakeScheduler } from '../support/fakeRoom'

/**
 * ws 세션 (M3 계획 9.1 M3-4).
 * 실제 소켓 없이 프레임을 넣고 나간 메시지를 배열로 본다.
 */

const START = 1_700_000_000_000
const HOST = 'host-user'
const HELLO_TIMEOUT_MS = 10_000

type FakeSocket = SocketPort & {
  sent: ServerMessage[]
  closedWith: string | null
  last(): ServerMessage | undefined
  ofType<T extends ServerMessage['t']>(type: T): Extract<ServerMessage, { t: T }>[]
  clear(): void
}

function createFakeSocket(): FakeSocket {
  const sent: ServerMessage[] = []
  return {
    sent,
    closedWith: null,
    send(payload): void {
      sent.push(JSON.parse(payload) as ServerMessage)
    },
    close(reason): void {
      this.closedWith = reason
    },
    last(): ServerMessage | undefined {
      return sent[sent.length - 1]
    },
    ofType<T extends ServerMessage['t']>(type: T): Extract<ServerMessage, { t: T }>[] {
      return sent.filter((message): message is Extract<ServerMessage, { t: T }> => {
        return message.t === type
      })
    },
    clear(): void {
      sent.length = 0
      this.closedWith = null
    },
  }
}

/** 실제 Supabase를 부르지 않는다 (M3 계획 9절) */
function fakeAuth(users: Record<string, string>): AuthVerifier {
  return {
    verify: async (token) => {
      const userId = users[token]
      if (userId === undefined) return null
      return { userId, displayName: null, email: null }
    },
  }
}

type Fixture = {
  room: Room
  scheduler: FakeScheduler
  auth: AuthVerifier
  open(socket: FakeSocket): ReturnType<typeof createWsSession>
}

function setup(): Fixture {
  const scheduler = createFakeScheduler(START)
  const room = createRoom({
    code: 'TESTAB',
    hostUserId: HOST,
    scheduler,
    rng: createSeededRng(1),
  })
  room.addMember('user-alice', null, START)

  const auth = fakeAuth({ 'token-host': HOST, 'token-alice': 'user-alice', 'token-bob': 'user-bob' })

  return {
    room,
    scheduler,
    auth,
    open(socket): ReturnType<typeof createWsSession> {
      return createWsSession({
        socket,
        auth,
        findRoom: (code) => (code === room.code ? room : null),
        scheduler,
        helloTimeoutMs: HELLO_TIMEOUT_MS,
      })
    },
  }
}

function helloFrame(
  token: string,
  roomCode = 'TESTAB',
  deviceRole: DeviceRole = DEVICE_ROLE.CONTROLLER,
) {
  return JSON.stringify({ t: CLIENT_FRAME_TYPE.HELLO, token, roomCode, deviceRole })
}

function commandFrame(seq: number, command: unknown) {
  return JSON.stringify({ t: CLIENT_FRAME_TYPE.COMMAND, seq, command })
}

describe('인증 핸드셰이크 (M3 계획 3.2)', () => {
  it('hello 이전의 프레임은 모두 거절한다', async () => {
    const fixture = setup()
    const socket = createFakeSocket()
    const session = fixture.open(socket)

    await session.handleMessage(commandFrame(1, { type: COMMAND_TYPE.ROLL_REQUEST }))
    await session.handleMessage(JSON.stringify({ t: CLIENT_FRAME_TYPE.RESYNC, haveVersion: 0 }))

    expect(socket.ofType(SERVER_MESSAGE_TYPE.ERROR)).toHaveLength(2)
    expect(socket.ofType(SERVER_MESSAGE_TYPE.ERROR)[0]?.code).toBe(
      PROTOCOL_ERROR_CODE.NOT_AUTHENTICATED,
    )
    expect(socket.ofType(SERVER_MESSAGE_TYPE.SNAPSHOT)).toHaveLength(0)
  })

  it('hello가 성공하면 welcome → 스냅샷 순서로 나간다', async () => {
    const fixture = setup()
    const socket = createFakeSocket()
    const session = fixture.open(socket)

    await session.handleMessage(helloFrame('token-alice'))

    expect(socket.sent[0]?.t).toBe(SERVER_MESSAGE_TYPE.WELCOME)
    expect(socket.sent[1]?.t).toBe(SERVER_MESSAGE_TYPE.SNAPSHOT)

    const welcome = socket.ofType(SERVER_MESSAGE_TYPE.WELCOME)[0]
    expect(welcome?.roomCode).toBe('TESTAB')
    expect(welcome?.seat).toBeNull()
    expect(socket.closedWith).toBeNull()
  })

  it('토큰 검증 실패·없는 방·호스트가 아닌 Display가 각각 다른 사유로 닫힌다', async () => {
    const fixture = setup()

    const badToken = createFakeSocket()
    await fixture.open(badToken).handleMessage(helloFrame('token-none'))
    expect(badToken.ofType(SERVER_MESSAGE_TYPE.ERROR)[0]?.code).toBe(
      PROTOCOL_ERROR_CODE.INVALID_TOKEN,
    )
    expect(badToken.closedWith).not.toBeNull()

    const noRoom = createFakeSocket()
    await fixture.open(noRoom).handleMessage(helloFrame('token-alice', 'ZZZZZZ'))
    expect(noRoom.ofType(SERVER_MESSAGE_TYPE.ERROR)[0]?.code).toBe(
      PROTOCOL_ERROR_CODE.ROOM_NOT_FOUND,
    )

    const notHost = createFakeSocket()
    await fixture
      .open(notHost)
      .handleMessage(helloFrame('token-alice', 'TESTAB', DEVICE_ROLE.DISPLAY))
    expect(notHost.ofType(SERVER_MESSAGE_TYPE.ERROR)[0]?.code).toBe(PROTOCOL_ERROR_CODE.NOT_HOST)

    const notMember = createFakeSocket()
    await fixture.open(notMember).handleMessage(helloFrame('token-bob'))
    expect(notMember.ofType(SERVER_MESSAGE_TYPE.ERROR)[0]?.code).toBe(
      PROTOCOL_ERROR_CODE.NOT_MEMBER,
    )
  })

  it('hello 타임아웃 안에 오지 않으면 닫는다', () => {
    const fixture = setup()
    const socket = createFakeSocket()
    fixture.open(socket)

    fixture.scheduler.advanceTo(START + HELLO_TIMEOUT_MS)

    expect(socket.ofType(SERVER_MESSAGE_TYPE.ERROR)[0]?.code).toBe(
      PROTOCOL_ERROR_CODE.HELLO_TIMEOUT,
    )
    expect(socket.closedWith).not.toBeNull()
  })

  it('같은 (계정, 기기 역할)로 다시 접속하면 이전 소켓이 닫힌다 (M3 계획 10절 7번)', async () => {
    const fixture = setup()

    const first = createFakeSocket()
    await fixture.open(first).handleMessage(helloFrame('token-alice'))
    expect(first.closedWith).toBeNull()

    const second = createFakeSocket()
    await fixture.open(second).handleMessage(helloFrame('token-alice'))

    expect(first.ofType(SERVER_MESSAGE_TYPE.ERROR)[0]?.code).toBe(
      PROTOCOL_ERROR_CODE.REPLACED_BY_NEW_SESSION,
    )
    expect(first.closedWith).not.toBeNull()
    expect(second.closedWith).toBeNull()
  })
})

describe('명령 중계 (M3 계획 3.3)', () => {
  it('깨진 프레임은 error로, 모르는 명령은 seq를 실은 unknownCommand로 거절한다', async () => {
    const fixture = setup()
    const socket = createFakeSocket()
    const session = fixture.open(socket)
    await session.handleMessage(helloFrame('token-alice'))
    socket.clear()

    await session.handleMessage('{{{')
    expect(socket.ofType(SERVER_MESSAGE_TYPE.ERROR)[0]?.code).toBe(PROTOCOL_ERROR_CODE.BAD_FRAME)

    await session.handleMessage(commandFrame(11, { type: 'game.hack' }))
    const rejected = socket.ofType(SERVER_MESSAGE_TYPE.REJECTED)[0]
    expect(rejected?.reason).toBe(REJECTION_REASON.UNKNOWN_COMMAND)
    expect(rejected?.seq).toBe(11)
    expect(socket.closedWith).toBeNull()
  })

  it('Display가 좌석 명령을 보내면 wrongSeat으로 거절한다', async () => {
    const fixture = setup()
    const socket = createFakeSocket()
    const session = fixture.open(socket)
    await session.handleMessage(helloFrame('token-host', 'TESTAB', DEVICE_ROLE.DISPLAY))
    socket.clear()

    await session.handleMessage(commandFrame(3, { type: COMMAND_TYPE.VOTE_SUBMIT, choiceId: 'x' }))

    const rejected = socket.ofType(SERVER_MESSAGE_TYPE.REJECTED)[0]
    expect(rejected?.reason).toBe(REJECTION_REASON.WRONG_SEAT)
    expect(rejected?.seq).toBe(3)
  })

  it('Controller가 호스트 명령을 보내면 wrongSeat으로 거절한다', async () => {
    const fixture = setup()
    const socket = createFakeSocket()
    const session = fixture.open(socket)
    await session.handleMessage(helloFrame('token-alice'))
    socket.clear()

    await session.handleMessage(commandFrame(4, { type: COMMAND_TYPE.LOBBY_START }))
    expect(socket.ofType(SERVER_MESSAGE_TYPE.REJECTED)[0]?.reason).toBe(
      REJECTION_REASON.WRONG_SEAT,
    )
  })

  it('엔진이 거절한 명령도 요청의 seq를 그대로 싣는다', async () => {
    const fixture = setup()
    const socket = createFakeSocket()
    const session = fixture.open(socket)
    await session.handleMessage(helloFrame('token-alice'))
    socket.clear()

    // 로비에서는 투표를 받지 않는다
    await session.handleMessage(
      commandFrame(21, { type: COMMAND_TYPE.VOTE_SUBMIT, choiceId: 't1-a' }),
    )

    const rejected = socket.ofType(SERVER_MESSAGE_TYPE.REJECTED)[0]
    expect(rejected?.seq).toBe(21)
    expect(rejected?.reason).toBe(REJECTION_REASON.WRONG_STEP)
  })

  it('좌석을 고르면 이후 스냅샷이 좌석 투영으로 바뀐다', async () => {
    const fixture = setup()
    const socket = createFakeSocket()
    const session = fixture.open(socket)
    await session.handleMessage(helloFrame('token-alice'))
    socket.clear()

    await session.handleMessage(
      commandFrame(5, { type: COMMAND_TYPE.LOBBY_PICK_SEAT, seat: BROTHER_ROLE.SECOND }),
    )

    const snapshot = socket.ofType(SERVER_MESSAGE_TYPE.SNAPSHOT)[0]?.snapshot
    expect(snapshot).toHaveProperty('erosionPercent')
    expect(fixture.room.state.seats[BROTHER_ROLE.SECOND].userId).toBe('user-alice')
  })
})

describe('재동기화 (M3 계획 3.4)', () => {
  it('resync에 전체 스냅샷 1건으로 답하고 cue는 보내지 않는다', async () => {
    const fixture = setup()
    const socket = createFakeSocket()
    const session = fixture.open(socket)
    await session.handleMessage(helloFrame('token-alice'))
    socket.clear()

    await session.handleMessage(JSON.stringify({ t: CLIENT_FRAME_TYPE.RESYNC, haveVersion: 0 }))

    expect(socket.sent).toHaveLength(1)
    expect(socket.sent[0]?.t).toBe(SERVER_MESSAGE_TYPE.SNAPSHOT)
    expect(socket.ofType(SERVER_MESSAGE_TYPE.CUE)).toHaveLength(0)
  })
})

describe('연결 종료', () => {
  it('소켓이 닫히면 방에서 떨어지고 좌석이 끊김으로 바뀐다', async () => {
    const fixture = setup()
    const socket = createFakeSocket()
    const session = fixture.open(socket)
    await session.handleMessage(helloFrame('token-alice'))
    await session.handleMessage(
      commandFrame(1, { type: COMMAND_TYPE.LOBBY_PICK_SEAT, seat: BROTHER_ROLE.FIRST }),
    )

    session.handleClose()

    expect(fixture.room.state.seats[BROTHER_ROLE.FIRST].connection.status).toBe('disconnected')
    // 좌석 주인은 그대로다. 같은 계정이 다시 붙으면 복귀한다 (아키텍처 §10)
    expect(fixture.room.state.seats[BROTHER_ROLE.FIRST].userId).toBe('user-alice')
  })
})
