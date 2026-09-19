import { CLIENT_FRAME_TYPE, SERVER_MESSAGE_TYPE } from 'tal-brothers-shared'
import type {
  Command,
  CueView,
  DeviceRole,
  RejectedMessage,
  ServerMessage,
  SnapshotMessage,
  WelcomeMessage,
} from 'tal-brothers-shared'

import { WEB_ENV } from '@/config/webEnv'
import { currentAccessToken } from './supabase'

/**
 * 방 소켓 (M3 계획 3절).
 *
 * - 클라이언트는 **명령만** 보낸다. 상태를 고쳐 보내지 않는다
 * - 연결 직후 `hello`로 토큰을 싣는다. URL에는 싣지 않는다 (아키텍처 §10)
 * - 상태 버전이 건너뛰면 `resync`를 보낸다. cue는 다시 오지 않는다
 * - 끊기면 물러나며 다시 붙는다. 재접속은 재동기화의 특수한 경우다
 */

export type SocketStatus = 'idle' | 'connecting' | 'open' | 'closed'

export type RoomSocketHandlers = {
  onStatus(status: SocketStatus): void
  onWelcome(message: WelcomeMessage): void
  onSnapshot(message: SnapshotMessage): void
  /** cue와 함께 실려 온 상태 버전. 밀린 cue의 폐기 판단에 쓴다 (M4 계획 4.3) */
  onCue(cues: CueView[], stateVersion: number): void
  onRejected(message: RejectedMessage): void
  onError(code: string, message: string): void
}

export type RoomSocket = {
  connect(): void
  send(command: Command): number
  close(): void
}

/** 재연결 대기 시간 — 물러나며 늘리고 상한을 둔다 */
const RETRY_STEPS_MS = [500, 1_000, 2_000, 5_000, 10_000]

export type RoomSocketOptions = {
  roomCode: string
  deviceRole: DeviceRole
  handlers: RoomSocketHandlers
}

export function createRoomSocket(options: RoomSocketOptions): RoomSocket {
  const { handlers } = options

  let socket: WebSocket | null = null
  let retry = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let closedByUs = false
  let seq = 0
  let lastVersion: number | null = null

  function setStatus(status: SocketStatus): void {
    handlers.onStatus(status)
  }

  function scheduleRetry(): void {
    if (closedByUs) return
    const delay = RETRY_STEPS_MS[Math.min(retry, RETRY_STEPS_MS.length - 1)] as number
    retry += 1
    retryTimer = setTimeout(connect, delay)
  }

  function handleMessage(raw: string): void {
    let message: ServerMessage
    try {
      message = JSON.parse(raw) as ServerMessage
    } catch {
      return
    }

    switch (message.t) {
      case SERVER_MESSAGE_TYPE.WELCOME:
        handlers.onWelcome(message)
        return

      case SERVER_MESSAGE_TYPE.SNAPSHOT: {
        // 버전이 건너뛰었으면 전체 스냅샷을 다시 받는다 (M3 계획 3.4)
        if (lastVersion !== null && message.stateVersion > lastVersion + 1) {
          socket?.send(
            JSON.stringify({ t: CLIENT_FRAME_TYPE.RESYNC, haveVersion: lastVersion }),
          )
        }
        lastVersion = message.stateVersion
        handlers.onSnapshot(message)
        return
      }

      case SERVER_MESSAGE_TYPE.CUE:
        handlers.onCue(message.cues, message.stateVersion)
        return

      case SERVER_MESSAGE_TYPE.REJECTED:
        handlers.onRejected(message)
        return

      case SERVER_MESSAGE_TYPE.ERROR:
        handlers.onError(message.code, message.message)
        return
    }
  }

  function connect(): void {
    if (socket !== null) return
    closedByUs = false
    setStatus('connecting')

    const next = new WebSocket(WEB_ENV.wsUrl)
    socket = next

    next.onopen = () => {
      void currentAccessToken().then((token) => {
        if (token === null) {
          handlers.onError('notAuthenticated', '로그인이 필요하다')
          next.close()
          return
        }
        next.send(
          JSON.stringify({
            t: CLIENT_FRAME_TYPE.HELLO,
            token,
            roomCode: options.roomCode,
            deviceRole: options.deviceRole,
          }),
        )
        retry = 0
        setStatus('open')
      })
    }

    next.onmessage = (event: MessageEvent<string>) => {
      handleMessage(typeof event.data === 'string' ? event.data : '')
    }

    next.onclose = () => {
      socket = null
      lastVersion = null
      setStatus('closed')
      scheduleRetry()
    }

    next.onerror = () => {
      // close가 이어서 온다. 여기서는 상태만 남긴다
    }
  }

  return {
    connect,
    send(command): number {
      seq += 1
      socket?.send(JSON.stringify({ t: CLIENT_FRAME_TYPE.COMMAND, seq, command }))
      return seq
    },
    close(): void {
      closedByUs = true
      if (retryTimer !== null) clearTimeout(retryTimer)
      retryTimer = null
      socket?.close()
      socket = null
      setStatus('idle')
    },
  }
}
