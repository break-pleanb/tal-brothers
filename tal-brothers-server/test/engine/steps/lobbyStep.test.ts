import { describe, expect, it } from 'vitest'
import { BROTHER_ROLE, GAME_STEP, REJECTION_REASON } from 'tal-brothers-shared'

import { lobbyActor } from '../../../src/engine/engineTypes'
import { projectDisplay } from '../../../src/engine/projection/projectDisplay'
import { HOST_USER_ID, host, lobbyStart, pickSeat, startLobby, toggleBot } from '../../support/gameDriver'

/**
 * 로비 (M3 계획 9.1 M3-2 1~3번, 룰북 §1).
 *
 * 좌석은 경쟁 자원이라 선착순이 흔들리면 안 된다. 여기서는 엔진 판정만 보고,
 * 도착 순서 보장은 방당 직렬 큐(M3-3)가 맡는다.
 */

const ALICE = lobbyActor('user-alice')
const BOB = lobbyActor('user-bob')

describe('로비 좌석 (M3 계획 10절 9번)', () => {
  it('좌석을 고르면 점유되고, 같은 좌석을 다시 고르면 일어선다', () => {
    const game = startLobby()

    expect(game.sendAs(ALICE, pickSeat(BROTHER_ROLE.SECOND)).rejected).toBe(false)
    expect(game.state.seats[BROTHER_ROLE.SECOND].userId).toBe('user-alice')

    expect(game.sendAs(ALICE, pickSeat(BROTHER_ROLE.SECOND)).rejected).toBe(false)
    expect(game.state.seats[BROTHER_ROLE.SECOND].userId).toBeNull()
  })

  it('다른 좌석을 고르면 앉아 있던 좌석에서 옮겨간다', () => {
    const game = startLobby()
    game.sendAs(ALICE, pickSeat(BROTHER_ROLE.FIRST))
    game.sendAs(ALICE, pickSeat(BROTHER_ROLE.THIRD))

    expect(game.state.seats[BROTHER_ROLE.FIRST].userId).toBeNull()
    expect(game.state.seats[BROTHER_ROLE.THIRD].userId).toBe('user-alice')
  })

  it('이미 찬 좌석은 고를 수 없다', () => {
    const game = startLobby()
    game.sendAs(ALICE, pickSeat(BROTHER_ROLE.FIRST))

    const result = game.sendAs(BOB, pickSeat(BROTHER_ROLE.FIRST))
    expect(result.rejected && result.reason).toBe(REJECTION_REASON.NOT_ALLOWED)
    expect(game.state.seats[BROTHER_ROLE.FIRST].userId).toBe('user-alice')
  })

  it('봇 토글은 호스트 Display만 보내고, 사람이 앉은 좌석은 봇으로 돌릴 수 없다', () => {
    const game = startLobby()

    const byPlayer = game.sendAs(ALICE, toggleBot(BROTHER_ROLE.FIRST, true))
    expect(byPlayer.rejected && byPlayer.reason).toBe(REJECTION_REASON.WRONG_SEAT)

    expect(game.sendAs(host, toggleBot(BROTHER_ROLE.FIRST, true)).rejected).toBe(false)
    expect(game.state.seats[BROTHER_ROLE.FIRST].isBot).toBe(true)

    // 봇으로 지정된 좌석은 고를 수 없다
    const taken = game.sendAs(ALICE, pickSeat(BROTHER_ROLE.FIRST))
    expect(taken.rejected && taken.reason).toBe(REJECTION_REASON.NOT_ALLOWED)

    game.sendAs(ALICE, pickSeat(BROTHER_ROLE.SECOND))
    const occupied = game.sendAs(host, toggleBot(BROTHER_ROLE.SECOND, true))
    expect(occupied.rejected && occupied.reason).toBe(REJECTION_REASON.NOT_ALLOWED)
  })

  it('Display 투영의 로비 현황에 점유 여부가 보이고 userId는 나가지 않는다 (룰북 §17)', () => {
    const game = startLobby()
    game.sendAs(ALICE, pickSeat(BROTHER_ROLE.FIRST))

    const lobby = projectDisplay(game.state).lobby
    expect(lobby).not.toBeNull()
    expect(lobby?.seats.map((seat) => seat.occupied)).toEqual([true, false, false])
    expect(lobby?.canStart).toBe(true)
    expect(JSON.stringify(lobby)).not.toContain('user-alice')
  })
})

describe('로비 시작 (룰북 §1, M3 계획 10절 8번)', () => {
  it('호스트 Display만 시작할 수 있다', () => {
    const game = startLobby()
    game.sendAs(ALICE, pickSeat(BROTHER_ROLE.FIRST))

    const byPlayer = game.sendAs(ALICE, lobbyStart)
    expect(byPlayer.rejected && byPlayer.reason).toBe(REJECTION_REASON.WRONG_SEAT)

    const byStranger = game.sendAs(
      { device: 'display', userId: 'someone-else', seat: null },
      lobbyStart,
    )
    expect(byStranger.rejected && byStranger.reason).toBe(REJECTION_REASON.WRONG_SEAT)
    expect(game.state.progress.step).toBe(GAME_STEP.LOBBY)

    expect(game.sendAs(host, lobbyStart).rejected).toBe(false)
    expect(game.state.progress.step).toBe(GAME_STEP.EVENT_INTRO)
    expect(game.state.currentEvent?.eventId).toBe('t1')
  })

  it('사람이 한 명도 앉지 않았으면 시작할 수 없다 (룰북 §1)', () => {
    const game = startLobby()
    const result = game.sendAs(host, lobbyStart)

    expect(result.rejected && result.reason).toBe(REJECTION_REASON.NOT_ALLOWED)
    expect(projectDisplay(game.state).lobby?.canStart).toBe(false)
  })

  it('시작 시점에 비어 있는 좌석은 봇이 된다 (룰북 §1)', () => {
    const game = startLobby()
    game.sendAs(ALICE, pickSeat(BROTHER_ROLE.SECOND))
    game.sendAs(host, lobbyStart)

    expect(game.state.seats[BROTHER_ROLE.FIRST].isBot).toBe(true)
    expect(game.state.seats[BROTHER_ROLE.SECOND].isBot).toBe(false)
    expect(game.state.seats[BROTHER_ROLE.THIRD].isBot).toBe(true)
  })

  it('게임 시계는 로비가 아니라 시작 시점부터 흐른다 (룰북 §2.1)', () => {
    const game = startLobby()
    game.sendAs(ALICE, pickSeat(BROTHER_ROLE.FIRST))

    const beforeDeadline = game.state.clock.deadlineAt
    game.advance(10 * 60_000)
    game.sendAs(host, lobbyStart)

    expect(game.state.clock.deadlineAt).toBe(beforeDeadline + 10 * 60_000)
  })

  it('시작한 뒤에는 로비 명령을 받지 않는다', () => {
    const game = startLobby()
    game.sendAs(ALICE, pickSeat(BROTHER_ROLE.FIRST))
    game.sendAs(host, lobbyStart)

    const result = game.sendAs(ALICE, pickSeat(BROTHER_ROLE.THIRD))
    expect(result.rejected).toBe(true)
  })

  it('호스트 계정이 다르면 Display여도 시작할 수 없다', () => {
    const game = startLobby()
    game.sendAs(ALICE, pickSeat(BROTHER_ROLE.FIRST))
    expect(game.state.room.hostUserId).toBe(HOST_USER_ID)

    const result = game.sendAs({ device: 'display', userId: null, seat: null }, lobbyStart)
    expect(result.rejected && result.reason).toBe(REJECTION_REASON.WRONG_SEAT)
  })
})
