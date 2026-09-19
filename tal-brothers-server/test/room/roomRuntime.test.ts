import { describe, expect, it } from 'vitest'
import {
  BROTHER_ROLE,
  COMMAND_TYPE,
  CUE_KIND,
  DEVICE_ROLE,
  GAME_STEP,
  PROTOCOL_ERROR_CODE,
  REJECTION_REASON,
  SEAT_CONNECTION,
} from 'tal-brothers-shared'

import { createSeededRng } from '../../src/engine/random'
import { createRoom } from '../../src/room/roomRuntime'
import type { Room } from '../../src/room/roomTypes'
import {
  CUE,
  REJECTED,
  SNAPSHOT,
  createFakeConnection,
  createFakeScheduler,
} from '../support/fakeRoom'
import type { FakeConnection, FakeScheduler } from '../support/fakeRoom'

/**
 * 방 런타임 (M3 계획 9.1 M3-3).
 * 시각은 가짜 스케줄러로, 소켓은 가짜 접속으로 돌린다.
 */

const START = 1_700_000_000_000
const HOST = 'host-user'

type Fixture = {
  room: Room
  scheduler: FakeScheduler
  display: FakeConnection
  alice: FakeConnection
  bob: FakeConnection
}

function setup(): Fixture {
  const scheduler = createFakeScheduler(START)
  const room = createRoom({
    code: 'TESTAB',
    hostUserId: HOST,
    scheduler,
    rng: createSeededRng(1),
  })

  const display = createFakeConnection(HOST, DEVICE_ROLE.DISPLAY)
  const alice = createFakeConnection('user-alice', DEVICE_ROLE.CONTROLLER)
  const bob = createFakeConnection('user-bob', DEVICE_ROLE.CONTROLLER)
  return { room, scheduler, display, alice, bob }
}

/** 좌석 둘을 채우고 게임을 시작해 상황 제시 단계까지 간다 */
function startedRoom(): Fixture {
  const fixture = setup()
  const { room, display, alice, bob } = fixture

  room.attach(display)
  room.addMember(alice.userId, null, START)
  room.addMember(bob.userId, null, START)
  room.attach(alice)
  room.attach(bob)

  room.submitCommand(alice, 1, { type: COMMAND_TYPE.LOBBY_PICK_SEAT, seat: BROTHER_ROLE.FIRST })
  room.submitCommand(bob, 1, { type: COMMAND_TYPE.LOBBY_PICK_SEAT, seat: BROTHER_ROLE.SECOND })
  room.submitCommand(display, 1, { type: COMMAND_TYPE.LOBBY_START })

  display.clear()
  alice.clear()
  bob.clear()
  return fixture
}

describe('직렬 큐 (아키텍처 §2 원칙 7)', () => {
  it('동시에 들어온 명령 2건이 도착 순서대로 처리된다', () => {
    const { room, display, alice, bob } = setup()
    room.attach(display)
    room.attach(alice)
    room.attach(bob)

    // 같은 좌석을 두 사람이 노린다. 먼저 도착한 쪽만 앉는다
    room.submitCommand(alice, 1, { type: COMMAND_TYPE.LOBBY_PICK_SEAT, seat: BROTHER_ROLE.FIRST })
    room.submitCommand(bob, 1, { type: COMMAND_TYPE.LOBBY_PICK_SEAT, seat: BROTHER_ROLE.FIRST })

    expect(room.state.seats[BROTHER_ROLE.FIRST].userId).toBe('user-alice')
    expect(bob.ofType(REJECTED)).toHaveLength(1)
    expect(bob.ofType(REJECTED)[0]?.reason).toBe(REJECTION_REASON.NOT_ALLOWED)
  })

  it('거절은 요청자에게만 가고 다른 대상에는 아무것도 나가지 않는다', () => {
    const { room, display, alice } = startedRoom()

    // 상황 제시 단계에서는 투표를 받지 않는다
    room.submitCommand(alice, 7, { type: COMMAND_TYPE.VOTE_SUBMIT, choiceId: 't1-a' })

    expect(alice.ofType(REJECTED)).toHaveLength(1)
    expect(alice.ofType(REJECTED)[0]?.seq).toBe(7)
    expect(alice.ofType(SNAPSHOT)).toHaveLength(0)
    expect(display.sent).toHaveLength(0)
  })
})

describe('타이머 예약과 무효화 (M3 계획 2.2)', () => {
  it('로비에는 마감이 없어 타이머를 예약하지 않는다', () => {
    const { room, scheduler, display, alice } = setup()
    room.attach(display)
    room.attach(alice)

    expect(room.step).toBe(GAME_STEP.LOBBY)
    expect(scheduler.pendingCount()).toBe(0)
  })

  it('새 결과가 나오면 이전 타이머를 취소한다', () => {
    const { room, scheduler, alice } = startedRoom()
    expect(scheduler.pendingCount()).toBe(1)

    // 상황 제시 마감 전에 연결 변화가 들어오면 상태 버전이 올라 타이머를 다시 건다
    room.detach(alice)
    expect(scheduler.pendingCount()).toBe(1)
  })

  it('취소가 늦어 옛 타이머가 발화해도 staleTimer로 거절되고 상태는 그대로다', () => {
    const { room, scheduler, display, alice } = startedRoom()
    room.detach(alice)

    const stepBefore = room.step
    const versionBefore = room.state.meta.stateVersion
    display.clear()

    // 취소된 옛 타이머를 억지로 발화시킨다. 액션에 실린 (단계, 상태 버전)이 어긋난다
    scheduler.fireCancelled()

    expect(room.step).toBe(stepBefore)
    expect(room.state.meta.stateVersion).toBe(versionBefore)
    // 요청자가 없는 액션이라 거절 메시지도 나가지 않는다
    expect(display.sent).toHaveLength(0)
  })

  it('단계 마감이 지나면 다음 단계로 넘어간다', () => {
    const { room, scheduler } = startedRoom()
    expect(room.step).toBe(GAME_STEP.EVENT_INTRO)

    scheduler.advanceTo(START + 31_000)
    expect(room.step).toBe(GAME_STEP.VOTING)
  })
})

describe('스냅샷과 cue 전송 (M3 계획 2.3)', () => {
  it('처리 1건마다 대상별 스냅샷이 1회씩 나가고 Display에는 좌석 연결 상태가 실린다', () => {
    const { room, display, alice, bob } = startedRoom()
    room.submitCommand(display, 2, { type: COMMAND_TYPE.HOST_PAUSE })

    expect(display.ofType(SNAPSHOT)).toHaveLength(1)
    expect(alice.ofType(SNAPSHOT)).toHaveLength(1)
    expect(bob.ofType(SNAPSHOT)).toHaveLength(1)

    const displaySnapshot = display.ofType(SNAPSHOT)[0]?.snapshot
    expect(displaySnapshot).toHaveProperty('seatConnections')
    // 좌석 스냅샷에는 본인 항목이 실리고 다른 좌석의 연결 상태는 없다 (룰북 §17)
    const seatSnapshot = alice.ofType(SNAPSHOT)[0]?.snapshot
    expect(seatSnapshot).toHaveProperty('erosionPercent')
    expect(seatSnapshot).not.toHaveProperty('seatConnections')
  })

  it('cue는 audience가 가리키는 대상에게만 나간다', () => {
    const { room, display, alice, bob } = setup()
    room.attach(display)
    room.attach(alice)
    room.attach(bob)
    room.submitCommand(alice, 1, { type: COMMAND_TYPE.LOBBY_PICK_SEAT, seat: BROTHER_ROLE.FIRST })
    room.submitCommand(bob, 1, { type: COMMAND_TYPE.LOBBY_PICK_SEAT, seat: BROTHER_ROLE.SECOND })
    display.clear()
    alice.clear()
    bob.clear()

    // 시작 처리에서 두 종류의 cue가 나온다:
    // 이벤트 진입(Display 전용)과 튜토리얼 부적 지급(특정 좌석 1명)
    room.submitCommand(display, 2, { type: COMMAND_TYPE.LOBBY_START })

    const displayCues = display.ofType(CUE).flatMap((message) => message.cues)
    expect(displayCues.map((cue) => cue.kind)).toContain(CUE_KIND.EVENT_INTRO)
    expect(displayCues.map((cue) => cue.kind)).not.toContain(CUE_KIND.TUTORIAL_TALISMAN_GRANTED)

    const seatCues = [...alice.ofType(CUE), ...bob.ofType(CUE)].flatMap((message) => message.cues)
    // 부적은 한 명에게만 간다 (룰북 §9.2)
    expect(seatCues.filter((cue) => cue.kind === CUE_KIND.TUTORIAL_TALISMAN_GRANTED)).toHaveLength(
      1,
    )
    expect(seatCues.map((cue) => cue.kind)).not.toContain(CUE_KIND.EVENT_INTRO)
  })

  it('좌석을 고르기 전 Controller는 공개 항목만 받는다', () => {
    const { room, alice } = setup()
    room.attach(alice)

    const message = room.snapshotFor(alice)
    expect(message.t).toBe(SNAPSHOT)
    if (message.t !== SNAPSHOT) return
    expect(message.snapshot).not.toHaveProperty('erosionPercent')
    expect(message.snapshot).not.toHaveProperty('seatConnections')
    expect(message.snapshot.lobby?.seats).toHaveLength(3)
  })
})

describe('접속 관리 (M3 계획 10절 7번·12번)', () => {
  it('같은 계정·같은 역할로 다시 접속하면 이전 소켓이 밀려난다', () => {
    const { room, alice } = setup()
    room.attach(alice)

    const again = createFakeConnection(alice.userId, DEVICE_ROLE.CONTROLLER)
    room.attach(again)

    expect(alice.closed?.code).toBe(PROTOCOL_ERROR_CODE.REPLACED_BY_NEW_SESSION)
    // 밀려난 소켓의 정리는 연결 끊김으로 잡히지 않는다
    room.detach(alice)
    expect(room.state.seats[BROTHER_ROLE.FIRST].connection.status).toBe(SEAT_CONNECTION.CONNECTED)
  })

  it('같은 userId가 재접속하면 같은 좌석으로 복귀한다', () => {
    const { room, alice } = startedRoom()

    expect(room.seatOf(alice)).toBe(BROTHER_ROLE.FIRST)
    room.detach(alice)
    expect(room.state.seats[BROTHER_ROLE.FIRST].connection.status).toBe(
      SEAT_CONNECTION.DISCONNECTED,
    )

    const reconnected = createFakeConnection(alice.userId, DEVICE_ROLE.CONTROLLER)
    room.attach(reconnected)

    expect(room.seatOf(reconnected)).toBe(BROTHER_ROLE.FIRST)
    expect(room.state.seats[BROTHER_ROLE.FIRST].connection.status).toBe(SEAT_CONNECTION.CONNECTED)
    expect(room.state.seats[BROTHER_ROLE.FIRST].botTakeover).toBe(false)
  })

  it('Display가 끊기면 자동으로 정지하고 다시 붙으면 재개한다 (아키텍처 §8)', () => {
    const { room, display } = startedRoom()

    room.detach(display)
    expect(room.step).toBe(GAME_STEP.PAUSED)

    const again = createFakeConnection(HOST, DEVICE_ROLE.DISPLAY)
    room.attach(again)
    expect(room.step).toBe(GAME_STEP.EVENT_INTRO)
  })
})
