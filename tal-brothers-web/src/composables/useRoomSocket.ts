import { onMounted } from 'vue'
import type { Command, DeviceRole } from 'tal-brothers-shared'

import { usePlayStore } from '@/stores/play'

/**
 * 이 화면을 방에 붙인다 (M4 계획 4.1).
 *
 * **연결 수명은 화면이 아니라 방에 묶여 있다.** 스토어가 소켓을 들고 있고, 같은 방·같은 역할이면
 * 이미 열린 연결을 그대로 쓴다. 로비 → 게임 화면 이동에서 소켓이 끊겼다 붙으면
 * 서버가 그것을 연결 끊김으로 받아 자동 일시정지 조건에 걸릴 수 있다 (아키텍처 §8).
 *
 * 방을 벗어날 때의 정리는 라우터 가드(`router/guards.ts`)가 한 곳에서 한다.
 * 화면은 명령을 보내고 스냅샷을 그리기만 한다 (아키텍처 §9.3).
 */

export type UseRoomSocket = {
  send(command: Command): void
}

export function useRoomSocket(roomCode: string, deviceRole: DeviceRole): UseRoomSocket {
  const play = usePlayStore()

  onMounted(() => {
    play.connect(roomCode, deviceRole)
  })

  return {
    send(command): void {
      play.send(command)
    },
  }
}
