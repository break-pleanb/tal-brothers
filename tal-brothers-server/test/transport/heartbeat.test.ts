import { describe, expect, it } from 'vitest'

import { WS_HEARTBEAT_MS, createHeartbeat } from '../../src/transport/ws/heartbeat'
import type { HeartbeatSocket } from '../../src/transport/ws/heartbeat'
import { createFakeScheduler } from '../support/fakeRoom'

/**
 * ws 하트비트 (M4 실기 2차).
 *
 * 실기에서 **Display가 조용히 멈춘 채 폰만 진행하는** 상황이 나왔다.
 * 서버가 죽은 소켓을 계속 열려 있다고 믿으면 연결 변화가 일어나지 않아
 * 자동 일시정지(아키텍처 §8)도 걸리지 않는다. 그 구멍을 막는 장치다.
 */

const START = 1_700_000_000_000

type FakeSocket = HeartbeatSocket & { pings: number; terminated: boolean }

function fakeSocket(): FakeSocket {
  return {
    pings: 0,
    terminated: false,
    ping(): void {
      this.pings += 1
    },
    terminate(): void {
      this.terminated = true
    },
  }
}

describe('ws 하트비트', () => {
  it('주기마다 ping을 보내고, pong이 오면 살려 둔다', () => {
    const scheduler = createFakeScheduler(START)
    const heartbeat = createHeartbeat({ scheduler })
    const socket = fakeSocket()
    heartbeat.add(socket)

    scheduler.advanceTo(START + WS_HEARTBEAT_MS)
    expect(socket.pings).toBe(1)
    expect(socket.terminated).toBe(false)

    heartbeat.markAlive(socket)
    scheduler.advanceTo(START + WS_HEARTBEAT_MS * 2)
    expect(socket.pings).toBe(2)
    expect(socket.terminated).toBe(false)

    heartbeat.stop()
  })

  it('한 주기 동안 pong이 없으면 끊는다', () => {
    const scheduler = createFakeScheduler(START)
    const heartbeat = createHeartbeat({ scheduler })
    const socket = fakeSocket()
    heartbeat.add(socket)

    // 첫 주기: 살아 있음 표시를 지우고 ping
    scheduler.advanceTo(START + WS_HEARTBEAT_MS)
    expect(socket.terminated).toBe(false)

    // 두 번째 주기까지 pong이 없었다 → 죽은 소켓
    scheduler.advanceTo(START + WS_HEARTBEAT_MS * 2)
    expect(socket.terminated).toBe(true)
    // 끊은 뒤에는 더 보내지 않는다
    expect(socket.pings).toBe(1)

    heartbeat.stop()
  })

  it('닫힌 소켓은 더 확인하지 않는다', () => {
    const scheduler = createFakeScheduler(START)
    const heartbeat = createHeartbeat({ scheduler })
    const socket = fakeSocket()
    heartbeat.add(socket)
    heartbeat.remove(socket)

    scheduler.advanceTo(START + WS_HEARTBEAT_MS * 3)
    expect(socket.pings).toBe(0)
    expect(socket.terminated).toBe(false)

    heartbeat.stop()
  })

  it('소켓 하나가 죽어도 나머지는 계속 확인한다', () => {
    const scheduler = createFakeScheduler(START)
    const heartbeat = createHeartbeat({ scheduler })
    const dead = fakeSocket()
    const alive = fakeSocket()
    heartbeat.add(dead)
    heartbeat.add(alive)

    scheduler.advanceTo(START + WS_HEARTBEAT_MS)
    heartbeat.markAlive(alive)

    scheduler.advanceTo(START + WS_HEARTBEAT_MS * 2)
    expect(dead.terminated).toBe(true)
    expect(alive.terminated).toBe(false)
    expect(alive.pings).toBe(2)

    heartbeat.stop()
  })

  it('멈추면 더 예약하지 않는다', () => {
    const scheduler = createFakeScheduler(START)
    const heartbeat = createHeartbeat({ scheduler })
    const socket = fakeSocket()
    heartbeat.add(socket)
    heartbeat.stop()

    scheduler.advanceTo(START + WS_HEARTBEAT_MS * 5)
    expect(socket.pings).toBe(0)
    expect(scheduler.pendingCount()).toBe(0)
  })
})
