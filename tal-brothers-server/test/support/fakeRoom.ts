import { DEVICE_ROLE, SERVER_MESSAGE_TYPE } from 'tal-brothers-shared'
import type { DeviceRole, ProtocolErrorCode, ServerMessage } from 'tal-brothers-shared'

import type { Scheduler, ScheduledTimer } from '../../src/room/scheduler'
import type { RoomConnection } from '../../src/room/roomTypes'

/**
 * room 런타임 테스트의 가짜 (M3 계획 9절).
 * 시각과 소켓을 인터페이스로 끊어 두었으므로 여기서 손으로 돌린다.
 */

export type FakeScheduler = Scheduler & {
  /** 시각을 옮기고, 그 시각까지 예약된 타이머를 순서대로 발화시킨다 */
  advanceTo(time: number): void
  /** 시각만 옮긴다. 타이머는 발화시키지 않는다 */
  setNow(time: number): void
  /** 예약돼 있는(취소되지 않은) 타이머 수 */
  pendingCount(): number
  /** 시각과 무관하게 예약된 타이머를 모두 발화시킨다 */
  fireAll(): void
  /**
   * **취소된 타이머까지** 발화시킨다.
   * 취소가 늦어 이미 발화해 버린 상황을 재현한다 (M3 계획 2.2의 이중 방어)
   */
  fireCancelled(): void
}

type FakeTimer = {
  at: number
  fn: () => void
  cancelled: boolean
}

export function createFakeScheduler(start: number): FakeScheduler {
  let now = start
  let timers: FakeTimer[] = []
  const cancelled: FakeTimer[] = []

  function fire(candidates: FakeTimer[]): void {
    for (const timer of candidates) {
      if (timer.cancelled) continue
      timer.cancelled = true
      timer.fn()
    }
    timers = timers.filter((timer) => !timer.cancelled)
  }

  return {
    now: () => now,
    at(time, fn): ScheduledTimer {
      const timer: FakeTimer = { at: time, fn, cancelled: false }
      timers.push(timer)
      return {
        cancel: () => {
          if (timer.cancelled) return
          timer.cancelled = true
          cancelled.push(timer)
        },
      }
    },
    setNow(time): void {
      now = time
    },
    advanceTo(time): void {
      now = time
      fire([...timers].filter((timer) => timer.at <= time).sort((a, b) => a.at - b.at))
    },
    fireAll(): void {
      fire([...timers].sort((a, b) => a.at - b.at))
    },
    fireCancelled(): void {
      for (const timer of [...cancelled].sort((a, b) => a.at - b.at)) timer.fn()
      cancelled.length = 0
    },
    pendingCount(): number {
      return timers.filter((timer) => !timer.cancelled).length
    },
  }
}

export type FakeConnection = RoomConnection & {
  /** 이 소켓으로 나간 메시지 */
  sent: ServerMessage[]
  closed: { code: ProtocolErrorCode; message: string } | null
  /** 나간 메시지 중 종류가 맞는 것만 */
  ofType<T extends ServerMessage['t']>(type: T): Extract<ServerMessage, { t: T }>[]
  clear(): void
}

export function createFakeConnection(
  userId: string,
  deviceRole: DeviceRole = DEVICE_ROLE.CONTROLLER,
  displayName: string | null = null,
): FakeConnection {
  const sent: ServerMessage[] = []

  return {
    userId,
    deviceRole,
    displayName,
    sent,
    closed: null,
    send(message): void {
      sent.push(message)
    },
    close(code, message): void {
      this.closed = { code, message }
    },
    ofType<T extends ServerMessage['t']>(type: T): Extract<ServerMessage, { t: T }>[] {
      return sent.filter((message): message is Extract<ServerMessage, { t: T }> => {
        return message.t === type
      })
    },
    clear(): void {
      sent.length = 0
    },
  }
}

export const SNAPSHOT = SERVER_MESSAGE_TYPE.SNAPSHOT
export const CUE = SERVER_MESSAGE_TYPE.CUE
export const REJECTED = SERVER_MESSAGE_TYPE.REJECTED
