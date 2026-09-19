import {
  DEVICE_ROLE,
  PROTOCOL_ERROR_CODE,
  PROTOCOL_VERSION,
  SEAT_CONNECTION,
  SERVER_MESSAGE_TYPE,
} from 'tal-brothers-shared'
import type { BrotherRole, Command, CueView, ServerMessage } from 'tal-brothers-shared'

import { dispatch } from '../engine/dispatch'
import { ACTION_KIND, CUE_AUDIENCE } from '../engine/engineTypes'
import type { Cue, EngineAction, TimerDeadline } from '../engine/engineTypes'
import { projectDisplay, projectPublic } from '../engine/projection/projectDisplay'
import { projectSeat } from '../engine/projection/projectSeat'
import type { Rng } from '../engine/random'
import { createGame } from '../engine/state/createGame'
import type { GameState } from '../engine/state/gameState'
import type { Scheduler, ScheduledTimer } from './scheduler'
import { actorOf, presenceActionFor, seatOfConnection } from './seatBinding'
import { connectionKey } from './roomTypes'
import type { Room, RoomConnection, RoomMember } from './roomTypes'

/**
 * 방 런타임 (M3 계획 2절, 아키텍처 §6).
 *
 * - **방당 액션 직렬 큐.** 명령·타이머 만료·연결 변화를 같은 큐에 넣어 도착 순서로 처리한다.
 *   부적 선착순(룰북 §7.4)이 락 없이 도착 순서로 결정된다
 * - 드레인은 동기 루프다. `dispatch`가 순수 함수라 중간에 비동기 지점이 없다
 * - **전송은 드레인 밖에서** 한다. I/O가 큐를 막지 않는다
 * - 타이머는 **방마다 하나**다. 새 결과가 나오면 이전 타이머를 먼저 취소하고,
 *   취소가 늦어 발화하더라도 `(단계, 상태 버전)`이 어긋나 엔진이 `staleTimer`로 거절한다
 */

export type RoomOptions = {
  code: string
  hostUserId: string
  hostDisplayName?: string | null
  scheduler: Scheduler
  /** 방마다 운영용 난수 1개를 들고 있는다 (아키텍처 §5.5) */
  rng: Rng
  /**
   * 이 방의 게임 시계 길이(분). 생략하면 룰북 §19의 100분이다.
   * **개발용 시계 단축**만 값을 넣는다 (아키텍처 §8)
   */
  clockMinutes?: number
}

type QueueItem = {
  action: EngineAction
  /** 거절을 돌려줄 소켓. 타이머·연결 변화는 없다 */
  origin?: RoomConnection
  seq?: number
}

/** 한 번의 처리 결과를 대상별로 내보내기 위한 묶음 */
type Delivery = {
  state: GameState
  cues: Cue[]
}

function toCueView(cue: Cue): CueView {
  return cue.data === undefined
    ? { kind: cue.kind, text: cue.text }
    : { kind: cue.kind, text: cue.text, data: cue.data }
}

/** 이 cue가 이 대상에게 가는지 (아키텍처 §7.2) */
function cueReaches(cue: Cue, deviceRole: string, seat: BrotherRole | null): boolean {
  if (cue.audience === CUE_AUDIENCE.DISPLAY) return deviceRole === DEVICE_ROLE.DISPLAY
  if (cue.audience === CUE_AUDIENCE.ALL_SEATS) return seat !== null
  return seat !== null && seat === cue.audience
}

export function createRoom(options: RoomOptions): Room {
  const { scheduler, rng } = options
  const createdAt = scheduler.now()

  let state: GameState = createGame(
    {
      roomCode: options.code,
      hostUserId: options.hostUserId,
      ...(options.clockMinutes === undefined ? {} : { clockMinutes: options.clockMinutes }),
    },
    { now: createdAt, rng },
  ).state

  const connections = new Map<string, RoomConnection>()
  const members = new Map<string, RoomMember>()
  const queue: QueueItem[] = []
  let draining = false
  let timer: ScheduledTimer | null = null
  let lastActiveAt = createdAt

  members.set(options.hostUserId, {
    userId: options.hostUserId,
    displayName: options.hostDisplayName ?? null,
    joinedAt: createdAt,
  })

  function snapshotMessage(connection: RoomConnection, source: GameState): ServerMessage {
    const seat = seatOfConnection(source, connection)
    const snapshot =
      connection.deviceRole === DEVICE_ROLE.DISPLAY
        ? projectDisplay(source)
        : seat === null
          ? projectPublic(source)
          : projectSeat(source, seat)

    return {
      t: SERVER_MESSAGE_TYPE.SNAPSHOT,
      stateVersion: source.meta.stateVersion,
      // 마감 시각이 서버 기준이라 받는 쪽이 시계 차이를 보정할 수 있게 함께 보낸다 (아키텍처 §7.2)
      serverNow: scheduler.now(),
      snapshot,
    }
  }

  /**
   * 스냅샷을 먼저, cue를 나중에 보낸다 (M3 계획 2.3).
   * cue가 가리키는 값이 이미 스냅샷에 반영돼 있어야 화면이 어긋나지 않는다.
   */
  function deliver(deliveries: Delivery[]): void {
    for (const delivery of deliveries) {
      for (const connection of connections.values()) {
        connection.send(snapshotMessage(connection, delivery.state))

        const seat = seatOfConnection(delivery.state, connection)
        const cues = delivery.cues
          .filter((cue) => cueReaches(cue, connection.deviceRole, seat))
          .map(toCueView)
        if (cues.length === 0) continue

        connection.send({
          t: SERVER_MESSAGE_TYPE.CUE,
          stateVersion: delivery.state.meta.stateVersion,
          cues,
        })
      }
    }
  }

  function scheduleNext(deadline: TimerDeadline | null): void {
    timer?.cancel()
    timer = null
    // 로비·엔딩처럼 마감이 없으면 예약하지 않는다 (M3 계획 2.2)
    if (deadline === null) return

    timer = scheduler.at(deadline.at, () => {
      enqueue({
        action: {
          kind: ACTION_KIND.TIMER_EXPIRY,
          step: deadline.step,
          stateVersion: deadline.stateVersion,
        },
      })
    })
  }

  /**
   * Phase 전환 시 자동 저장 — **M5 예정** (아키텍처 §6, M3 계획 10절 13번).
   * M3는 호출 자리만 둔다.
   */
  function onPhaseChanged(_before: GameState, _after: GameState): void {
    // M5: saveRepository.save(after)
  }

  function drain(): void {
    if (draining) return
    draining = true

    const deliveries: Delivery[] = []
    let deadline: TimerDeadline | null = null
    let changed = false

    try {
      while (queue.length > 0) {
        const item = queue.shift() as QueueItem
        const now = scheduler.now()
        lastActiveAt = now

        const result = dispatch(state, item.action, { now, rng })
        if (result.rejected) {
          // 거절은 요청자에게만 간다. 상태는 그대로다 (M3 계획 2.3)
          item.origin?.send({
            t: SERVER_MESSAGE_TYPE.REJECTED,
            seq: item.seq ?? null,
            reason: result.reason,
            ...(result.detail === undefined ? {} : { detail: result.detail }),
          })
          continue
        }

        const before = state
        state = result.state
        deadline = result.nextDeadline
        changed = true
        deliveries.push({ state: result.state, cues: result.cues })

        if (before.progress.phase !== state.progress.phase) onPhaseChanged(before, state)
      }
    } finally {
      draining = false
    }

    if (changed) scheduleNext(deadline)
    deliver(deliveries)
  }

  function enqueue(item: QueueItem): void {
    queue.push(item)
    if (!draining) drain()
  }

  return {
    get code(): string {
      return options.code
    },
    get hostUserId(): string {
      return options.hostUserId
    },
    get createdAt(): number {
      return createdAt
    },
    get lastActiveAt(): number {
      return lastActiveAt
    },
    get state(): GameState {
      return state
    },
    get step() {
      return state.progress.step
    },

    addMember(userId, displayName, now): RoomMember {
      const existing = members.get(userId)
      if (existing !== undefined) return existing

      const member: RoomMember = { userId, displayName, joinedAt: now }
      members.set(userId, member)
      lastActiveAt = now
      return member
    },
    hasMember(userId): boolean {
      return members.has(userId)
    },
    members(): RoomMember[] {
      return [...members.values()]
    },

    attach(connection): void {
      const key = connectionKey(connection.userId, connection.deviceRole)
      const existing = connections.get(key)
      if (existing !== undefined && existing !== connection) {
        // 나중 소켓이 이전 소켓을 밀어낸다 (M3 계획 10절 7번).
        // 먼저 목록에서 지워야 밀려난 소켓의 정리가 연결 끊김으로 잡히지 않는다
        connections.delete(key)
        existing.close(
          PROTOCOL_ERROR_CODE.REPLACED_BY_NEW_SESSION,
          '같은 계정이 다른 기기에서 접속했다',
        )
      }

      connections.set(key, connection)
      enqueue({ action: presenceActionFor(state, connection, SEAT_CONNECTION.CONNECTED) })
    },

    detach(connection): void {
      const key = connectionKey(connection.userId, connection.deviceRole)
      // 이미 밀려난 소켓이면 아무것도 하지 않는다
      if (connections.get(key) !== connection) return

      connections.delete(key)
      enqueue({ action: presenceActionFor(state, connection, SEAT_CONNECTION.DISCONNECTED) })
    },

    seatOf(connection): BrotherRole | null {
      return seatOfConnection(state, connection)
    },

    snapshotFor(connection): ServerMessage {
      return snapshotMessage(connection, state)
    },

    submitCommand(connection, seq, command: Command): void {
      enqueue({
        action: { kind: ACTION_KIND.COMMAND, actor: actorOf(state, connection), command },
        origin: connection,
        seq,
      })
    },

    dispose(): void {
      timer?.cancel()
      timer = null
      queue.length = 0
      connections.clear()
    },
  }
}

/** hello 성공 직후 보내는 환영 메시지 (M3 계획 2.3) */
export function welcomeMessage(room: Room, connection: RoomConnection): ServerMessage {
  return {
    t: SERVER_MESSAGE_TYPE.WELCOME,
    roomCode: room.code,
    deviceRole: connection.deviceRole,
    seat: room.seatOf(connection),
    protocolVersion: PROTOCOL_VERSION,
  }
}
