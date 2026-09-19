import { describe, expect, it } from 'vitest'
import {
  BROTHER_ROLE,
  COMMAND_TYPE,
  DEVICE_ROLE,
  SEAT_CONNECTION,
} from 'tal-brothers-shared'

import { createSeededRng } from '../../src/engine/random'
import {
  DEFAULT_ROOM_TTL_MS,
  ROOM_CODE_ALPHABET,
  createRoomRegistry,
} from '../../src/room/roomRegistry'
import { createRoom } from '../../src/room/roomRuntime'
import { actorOf, presenceActionFor, seatOfConnection } from '../../src/room/seatBinding'
import { createFakeConnection, createFakeScheduler } from '../support/fakeRoom'

/**
 * 좌석 바인딩과 방 목록 (M3 계획 9.1 M3-3 6번, 아키텍처 §10).
 * 좌석의 주인은 소켓이 아니라 계정이다.
 */

const START = 1_700_000_000_000
const HOST = 'host-user'

function room() {
  const scheduler = createFakeScheduler(START)
  return {
    scheduler,
    room: createRoom({
      code: 'TESTAB',
      hostUserId: HOST,
      scheduler,
      rng: createSeededRng(1),
    }),
  }
}

describe('좌석 바인딩', () => {
  it('Display는 좌석이 없고 Controller는 계정으로 좌석을 찾는다', () => {
    const { room: current } = room()
    const display = createFakeConnection(HOST, DEVICE_ROLE.DISPLAY)
    const alice = createFakeConnection('user-alice')

    current.attach(display)
    current.attach(alice)
    current.submitCommand(alice, 1, {
      type: COMMAND_TYPE.LOBBY_PICK_SEAT,
      seat: BROTHER_ROLE.THIRD,
    })

    expect(seatOfConnection(current.state, display)).toBeNull()
    expect(seatOfConnection(current.state, alice)).toBe(BROTHER_ROLE.THIRD)

    // 같은 계정이 Display로 붙어도 좌석 명령은 Controller 쪽에만 붙는다 (아키텍처 §1)
    const hostPhone = createFakeConnection(HOST, DEVICE_ROLE.CONTROLLER)
    expect(actorOf(current.state, hostPhone).device).toBe(DEVICE_ROLE.CONTROLLER)
    expect(actorOf(current.state, display).seat).toBeNull()
  })

  it('연결 변화 액션은 그 접속의 주체를 그대로 싣는다', () => {
    const { room: current } = room()
    const alice = createFakeConnection('user-alice')
    current.attach(alice)
    current.submitCommand(alice, 1, {
      type: COMMAND_TYPE.LOBBY_PICK_SEAT,
      seat: BROTHER_ROLE.SECOND,
    })

    const action = presenceActionFor(current.state, alice, SEAT_CONNECTION.DISCONNECTED)
    expect(action.target.seat).toBe(BROTHER_ROLE.SECOND)
    expect(action.target.userId).toBe('user-alice')
    expect(action.status).toBe(SEAT_CONNECTION.DISCONNECTED)
  })
})

describe('방 목록 (아키텍처 §6)', () => {
  it('방을 만들면 코드가 나오고 같은 코드가 두 번 발급되지 않는다', () => {
    const scheduler = createFakeScheduler(START)
    // 같은 코드를 두 번 내주는 발급기를 넣어 충돌 회피를 확인한다
    const codes = ['AAAAAA', 'AAAAAA', 'BBBBBB']
    let index = 0
    const registry = createRoomRegistry({
      scheduler,
      generateCode: () => codes[index++] as string,
    })

    const first = registry.create({ hostUserId: HOST })
    const second = registry.create({ hostUserId: 'other-host' })

    expect(first.code).toBe('AAAAAA')
    expect(second.code).toBe('BBBBBB')
    expect(registry.get('AAAAAA')).toBe(first)
    expect(registry.get('ZZZZZZ')).toBeNull()
    expect(registry.list()).toHaveLength(2)
  })

  it('기본 코드는 혼동 문자를 뺀 대문자·숫자 6자다 (M3 계획 10절 6번)', () => {
    const registry = createRoomRegistry({ scheduler: createFakeScheduler(START) })
    const created = registry.create({ hostUserId: HOST })

    expect(created.code).toHaveLength(6)
    for (const character of created.code) {
      expect(ROOM_CODE_ALPHABET).toContain(character)
    }
    expect(created.code).not.toMatch(/[01OIL]/)
  })

  it('마지막 활동 후 보관 기간이 지난 방을 정리한다', () => {
    const scheduler = createFakeScheduler(START)
    const registry = createRoomRegistry({ scheduler })
    const created = registry.create({ hostUserId: HOST })

    expect(registry.sweep(START + DEFAULT_ROOM_TTL_MS - 1)).toEqual([])
    expect(registry.sweep(START + DEFAULT_ROOM_TTL_MS)).toEqual([created.code])
    expect(registry.get(created.code)).toBeNull()
  })

  it('방 멤버는 참가 자격이고 좌석과는 별개다 (M3 계획 4.2)', () => {
    const { room: current } = room()
    expect(current.hasMember(HOST)).toBe(true)
    expect(current.hasMember('user-alice')).toBe(false)

    current.addMember('user-alice', '앨리스', START)
    current.addMember('user-alice', '다른 이름', START + 10)

    expect(current.members()).toHaveLength(2)
    expect(current.members().find((member) => member.userId === 'user-alice')?.displayName).toBe(
      '앨리스',
    )
    // 참가만 했을 뿐 좌석은 없다
    expect(current.state.seats[BROTHER_ROLE.FIRST].userId).toBeNull()
  })
})
