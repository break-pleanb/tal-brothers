import { onBeforeUnmount, onMounted } from 'vue'
import type { Command, DeviceRole } from 'tal-brothers-shared'

import { createRoomSocket } from '@/services/roomSocket'
import type { RoomSocket } from '@/services/roomSocket'
import { useLobbyStore } from '@/stores/lobby'

/**
 * 소켓을 스토어에 이어 붙인다 (M3 계획 M3-7).
 * 화면은 명령을 보내고 스냅샷을 그리기만 한다. 판정은 전부 서버가 한다 (아키텍처 §9.3).
 */

export type UseRoomSocket = {
  send(command: Command): void
}

export function useRoomSocket(roomCode: string, deviceRole: DeviceRole): UseRoomSocket {
  const lobby = useLobbyStore()
  lobby.reset(roomCode, deviceRole)

  let socket: RoomSocket | null = null

  onMounted(() => {
    socket = createRoomSocket({
      roomCode,
      deviceRole,
      handlers: {
        onStatus(status) {
          lobby.status = status
        },
        onWelcome(message) {
          lobby.welcomeSeat = message.seat
          lobby.message = null
        },
        onSnapshot(message) {
          lobby.applySnapshot(message.snapshot)
        },
        onCue(cues) {
          lobby.pushCues(cues)
        },
        onRejected(message) {
          lobby.message = message.detail ?? message.reason
        },
        onError(_code, text) {
          lobby.message = text
        },
      },
    })
    socket.connect()
  })

  onBeforeUnmount(() => {
    socket?.close()
    socket = null
  })

  return {
    send(command): void {
      socket?.send(command)
    },
  }
}
