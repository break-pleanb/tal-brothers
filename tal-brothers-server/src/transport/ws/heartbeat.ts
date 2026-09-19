import type { Scheduler, ScheduledTimer } from '../../room/scheduler'

/**
 * ws 하트비트 (M4 실기 2차).
 *
 * **소켓이 죽어도 양쪽이 모르는 상태를 없앤다.** TCP는 상대가 사라져도 FIN을 보내지 않을 수 있어,
 * 서버는 계속 열려 있다고 믿고 보내고 클라이언트는 조용히 아무것도 받지 못한다.
 * Display가 그렇게 되면 **자동 일시정지(아키텍처 §8)도 걸리지 않아** 폰만 혼자 진행한다.
 *
 * - 주기마다 살아 있음 표시를 지우고 ping을 보낸다. 다음 주기까지 pong이 없으면 끊는다
 * - 끊긴 소켓은 `close` 이벤트를 타고 세션 정리 → 연결 변화(presence)로 이어진다
 * - `setInterval`을 직접 쓰지 않고 **주입받은 스케줄러로 스스로 다시 예약**한다.
 *   테스트가 시간을 손으로 돌릴 수 있어야 하기 때문이다 (M3 계획 9절)
 */

/** 살아 있음 확인 주기 */
export const WS_HEARTBEAT_MS = 30_000

/** 하트비트가 보는 소켓. `ws`의 최소 모양만 쓴다 */
export type HeartbeatSocket = {
  ping(): void
  terminate(): void
}

export type Heartbeat = {
  /** 새 소켓을 하트비트 대상에 넣는다 */
  add(socket: HeartbeatSocket): void
  /** pong을 받았다고 표시한다 */
  markAlive(socket: HeartbeatSocket): void
  /** 소켓이 닫혔다 */
  remove(socket: HeartbeatSocket): void
  /** 예약을 멈춘다 */
  stop(): void
}

export type HeartbeatOptions = {
  scheduler: Scheduler
  intervalMs?: number
}

export function createHeartbeat(options: HeartbeatOptions): Heartbeat {
  const intervalMs = options.intervalMs ?? WS_HEARTBEAT_MS
  /** 소켓 → 지난 주기 이후 pong을 받았는지 */
  const sockets = new Map<HeartbeatSocket, boolean>()
  let timer: ScheduledTimer | null = null
  let stopped = false

  function schedule(): void {
    if (stopped || timer !== null) return
    timer = options.scheduler.at(options.scheduler.now() + intervalMs, () => {
      timer = null
      beat()
      schedule()
    })
  }

  function beat(): void {
    for (const [socket, alive] of [...sockets]) {
      if (!alive) {
        // 지난 주기의 ping에 답하지 않았다. 죽은 소켓으로 보고 끊는다
        sockets.delete(socket)
        socket.terminate()
        continue
      }
      sockets.set(socket, false)
      socket.ping()
    }
  }

  return {
    add(socket): void {
      sockets.set(socket, true)
      schedule()
    },
    markAlive(socket): void {
      if (sockets.has(socket)) sockets.set(socket, true)
    },
    remove(socket): void {
      sockets.delete(socket)
    },
    stop(): void {
      stopped = true
      timer?.cancel()
      timer = null
      sockets.clear()
    },
  }
}
