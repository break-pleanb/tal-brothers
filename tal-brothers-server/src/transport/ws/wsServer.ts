import type { Server } from 'node:http'

import { WebSocketServer } from 'ws'
import type { RawData, WebSocket } from 'ws'

import type { AuthVerifier } from '../../infra/authVerifier'
import type { RoomRegistry } from '../../room/roomRegistry'
import type { Scheduler } from '../../room/scheduler'
import { createWsSession } from './wsSession'
import type { SocketPort } from './socketPort'

/**
 * ws 서버 부착 (M3 계획 M3-4).
 * 연결마다 세션을 하나 만들고, 소켓 구현을 `SocketPort`로 감싸 세션에 넘긴다.
 */

export const WS_PATH = '/ws'

export type WsServerDeps = {
  server: Server
  rooms: RoomRegistry
  auth: AuthVerifier
  scheduler: Scheduler
  helloTimeoutMs: number
}

function toSocketPort(socket: WebSocket): SocketPort {
  return {
    send(payload): void {
      if (socket.readyState !== socket.OPEN) return
      socket.send(payload)
    },
    close(): void {
      socket.close()
    },
  }
}

export function attachWsServer(deps: WsServerDeps): WebSocketServer {
  const wss = new WebSocketServer({ server: deps.server, path: WS_PATH })

  wss.on('connection', (socket: WebSocket) => {
    const session = createWsSession({
      socket: toSocketPort(socket),
      auth: deps.auth,
      findRoom: (code) => deps.rooms.get(code),
      scheduler: deps.scheduler,
      helloTimeoutMs: deps.helloTimeoutMs,
    })

    socket.on('message', (data: RawData) => {
      // 프레임 처리는 비동기(토큰 검증)지만 소켓 이벤트는 기다리지 않는다.
      // 실패해도 다른 연결에 번지지 않도록 여기서 삼킨다
      void session.handleMessage(data.toString()).catch(() => {
        socket.close()
      })
    })
    socket.on('close', () => {
      session.handleClose()
    })
    socket.on('error', () => {
      session.handleClose()
    })
  })

  return wss
}
