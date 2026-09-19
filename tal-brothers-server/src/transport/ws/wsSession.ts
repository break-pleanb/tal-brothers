import {
  CLIENT_FRAME_TYPE,
  COMMAND_TYPE,
  DEVICE_ROLE,
  PROTOCOL_ERROR_CODE,
  REJECTION_REASON,
  SERVER_MESSAGE_TYPE,
} from 'tal-brothers-shared'
import type {
  Command,
  CommandType,
  HelloFrame,
  ProtocolErrorCode,
  RejectionReason,
  ServerMessage,
} from 'tal-brothers-shared'

import type { AuthVerifier } from '../../infra/authVerifier'
import { welcomeMessage } from '../../room/roomRuntime'
import type { Room, RoomConnection } from '../../room/roomTypes'
import type { Scheduler, ScheduledTimer } from '../../room/scheduler'
import { decodeClientFrame } from './commandCodec'
import type { SocketPort } from './socketPort'

/**
 * ws 세션 (M3 계획 3절).
 *
 * 세션이 판단하는 것은 **"누가 무엇을 보낼 수 있는가"뿐이다** (3겹 중 2겹).
 * 룰 판단은 전부 엔진이 한다. 그래야 세션 테스트가 엔진 테스트만큼 빠르고 결정적이다.
 *
 * - hello 이전의 모든 프레임은 거절한다. 인증 상태는 세션 객체가 들고 있다
 * - hello 타임아웃 안에 오지 않으면 소켓을 닫는다
 * - 같은 (계정, 기기 역할) 소켓이 이미 있으면 방이 이전 소켓을 밀어낸다 (M3 계획 10절 7번)
 */

/** 호스트 Display만 보내는 명령 (아키텍처 §7.1) */
const DISPLAY_ONLY_COMMANDS: ReadonlySet<CommandType> = new Set([
  COMMAND_TYPE.LOBBY_TOGGLE_BOT,
  COMMAND_TYPE.LOBBY_START,
  COMMAND_TYPE.HOST_PAUSE,
  COMMAND_TYPE.HOST_RESUME,
  COMMAND_TYPE.HOST_SAVE,
])

export type WsSessionDeps = {
  socket: SocketPort
  auth: AuthVerifier
  findRoom(roomCode: string): Room | null
  scheduler: Scheduler
  helloTimeoutMs: number
}

export type WsSession = {
  handleMessage(raw: string): Promise<void>
  handleClose(): void
}

type Phase = 'awaitingHello' | 'authenticating' | 'open' | 'closed'

export function createWsSession(deps: WsSessionDeps): WsSession {
  const { socket, auth, findRoom, scheduler } = deps

  let phase: Phase = 'awaitingHello'
  let room: Room | null = null
  let connection: RoomConnection | null = null

  // 함수 밖에서 바꾸므로 대입은 이 한 곳으로 모은다. 비동기 사이에 상태가 바뀔 수 있다
  function setPhase(next: Phase): void {
    phase = next
  }

  let helloTimer: ScheduledTimer | null = scheduler.at(
    scheduler.now() + deps.helloTimeoutMs,
    () => {
      helloTimer = null
      if (phase !== 'awaitingHello') return
      fail(PROTOCOL_ERROR_CODE.HELLO_TIMEOUT, '인증 프레임이 오지 않았다')
    },
  )

  function send(message: ServerMessage): void {
    if (phase === 'closed') return
    socket.send(JSON.stringify(message))
  }

  function sendError(code: ProtocolErrorCode, message: string): void {
    send({ t: SERVER_MESSAGE_TYPE.ERROR, code, message })
  }

  function sendRejected(seq: number | null, reason: RejectionReason, detail: string): void {
    send({ t: SERVER_MESSAGE_TYPE.REJECTED, seq, reason, detail })
  }

  /** 사유를 보내고 닫는다. 연결이 성립하지 않는 경우에만 쓴다 */
  function fail(code: ProtocolErrorCode, message: string): void {
    sendError(code, message)
    close(message)
  }

  function close(reason: string): void {
    if (phase === 'closed') return
    setPhase('closed')
    helloTimer?.cancel()
    helloTimer = null
    socket.close(reason)
  }

  function createConnection(
    userId: string,
    displayName: string | null,
    deviceRole: HelloFrame['deviceRole'],
  ): RoomConnection {
    return {
      userId,
      deviceRole,
      displayName,
      send(message): void {
        send(message)
      },
      close(code, message): void {
        // 방이 이 소켓을 밀어냈다. 여기서 닫아야 다음 정리가 연결 끊김으로 잡히지 않는다
        connection = null
        room = null
        fail(code, message)
      },
    }
  }

  async function authenticate(frame: HelloFrame): Promise<void> {
    setPhase('authenticating')
    helloTimer?.cancel()
    helloTimer = null

    const user = await auth.verify(frame.token)
    if (phase === 'closed') return

    if (user === null) {
      fail(PROTOCOL_ERROR_CODE.INVALID_TOKEN, '토큰을 확인할 수 없다')
      return
    }

    const found = findRoom(frame.roomCode)
    if (found === null) {
      fail(PROTOCOL_ERROR_CODE.ROOM_NOT_FOUND, `방을 찾을 수 없다: ${frame.roomCode}`)
      return
    }

    if (frame.deviceRole === DEVICE_ROLE.DISPLAY && user.userId !== found.hostUserId) {
      fail(PROTOCOL_ERROR_CODE.NOT_HOST, 'Display는 방을 만든 계정만 열 수 있다')
      return
    }
    if (frame.deviceRole === DEVICE_ROLE.CONTROLLER && !found.hasMember(user.userId)) {
      fail(PROTOCOL_ERROR_CODE.NOT_MEMBER, '먼저 방에 참가해야 한다')
      return
    }

    room = found
    connection = createConnection(user.userId, user.displayName, frame.deviceRole)
    setPhase('open')

    // 환영 → 연결 변화(대상별 스냅샷) 순서다 (M3 계획 3.2)
    send(welcomeMessage(found, connection))
    found.attach(connection)
  }

  function handleCommand(seq: number, command: Command): void {
    if (room === null || connection === null) return

    const displayOnly = DISPLAY_ONLY_COMMANDS.has(command.type)
    const isDisplay = connection.deviceRole === DEVICE_ROLE.DISPLAY

    // 2겹: 이 기기가 보낼 수 있는 명령인지만 본다. 단계·조건은 엔진이 판정한다 (M3 계획 3.3)
    if (isDisplay && !displayOnly) {
      sendRejected(seq, REJECTION_REASON.WRONG_SEAT, 'Display는 좌석 명령을 보내지 않는다')
      return
    }
    if (!isDisplay && displayOnly) {
      sendRejected(seq, REJECTION_REASON.WRONG_SEAT, '호스트 Display만 보내는 명령이다')
      return
    }

    room.submitCommand(connection, seq, command)
  }

  return {
    async handleMessage(raw): Promise<void> {
      if (phase === 'closed') return

      const decoded = decodeClientFrame(raw)

      if (decoded.kind === 'badFrame') {
        sendError(PROTOCOL_ERROR_CODE.BAD_FRAME, decoded.detail)
        return
      }
      if (decoded.kind === 'badCommand') {
        if (phase !== 'open') {
          sendError(PROTOCOL_ERROR_CODE.NOT_AUTHENTICATED, 'hello 이전에는 명령을 받지 않는다')
          return
        }
        sendRejected(decoded.seq, REJECTION_REASON.UNKNOWN_COMMAND, decoded.detail)
        return
      }

      const frame = decoded.frame
      if (frame.t === CLIENT_FRAME_TYPE.HELLO) {
        if (phase !== 'awaitingHello') {
          sendError(PROTOCOL_ERROR_CODE.ALREADY_AUTHENTICATED, '이미 인증했다')
          return
        }
        await authenticate(frame)
        return
      }

      if (phase !== 'open' || room === null || connection === null) {
        sendError(PROTOCOL_ERROR_CODE.NOT_AUTHENTICATED, 'hello 이전에는 명령을 받지 않는다')
        return
      }

      if (frame.t === CLIENT_FRAME_TYPE.COMMAND) {
        handleCommand(frame.seq, frame.command)
        return
      }

      // 재동기화는 현재 전체 스냅샷 1건으로 답한다. cue는 다시 보내지 않는다 (M3 계획 3.4)
      send(room.snapshotFor(connection))
    },

    handleClose(): void {
      helloTimer?.cancel()
      helloTimer = null
      if (room !== null && connection !== null) {
        room.detach(connection)
      }
      room = null
      connection = null
      setPhase('closed')
    },
  }
}
