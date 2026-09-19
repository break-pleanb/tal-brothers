import { describe, expect, it } from 'vitest'
import { BROTHER_ROLE, GAME_STEP, REJECTION_REASON, SEAT_CONNECTION } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../../src/scenario/gameConfig'
import { createStepOutput } from '../../../src/engine/engineTypes'
import { projectDisplay } from '../../../src/engine/projection/projectDisplay'
import { projectSeat } from '../../../src/engine/projection/projectSeat'
import { applySeatErosion } from '../../../src/engine/rules/erosion'
import { LOW, startGame, vote } from '../../support/gameDriver'

/**
 * 연결 변화와 봇 대행 (M3 계획 9.1 M3-2 4~7번, 아키텍처 §8).
 *
 * 봇 대행 중인 인간 좌석은 **여전히 인간이다.** 조작만 서버가 대신한다 (룰북 §10.1, §11).
 */

const TAKEOVER_MS = GAME_CONFIG.botTakeoverSeconds * 1000

describe('봇 대행 전환 (아키텍처 §8)', () => {
  it('끊긴 지 30초가 지나면 봇 대행으로 바뀌고, 재접속하면 즉시 풀린다', () => {
    const game = startGame(3)
    game.disconnectSeat(BROTHER_ROLE.SECOND)

    expect(game.state.seats[BROTHER_ROLE.SECOND].connection.status).toBe(
      SEAT_CONNECTION.DISCONNECTED,
    )
    expect(game.state.seats[BROTHER_ROLE.SECOND].botTakeover).toBe(false)

    // 단계 마감(30초 + 유예)보다 봇 대행 전환(30초)이 이르다
    expect(game.last.nextDeadline?.at).toBe(game.now + TAKEOVER_MS)

    game.tick()
    expect(game.state.seats[BROTHER_ROLE.SECOND].botTakeover).toBe(true)
    expect(game.state.progress.step).toBe(GAME_STEP.EVENT_INTRO)

    game.connectSeat(BROTHER_ROLE.SECOND)
    expect(game.state.seats[BROTHER_ROLE.SECOND].botTakeover).toBe(false)
    expect(game.state.seats[BROTHER_ROLE.SECOND].connection.disconnectedAt).toBeNull()
  })

  it('봇 대행 좌석의 명령은 거절되고, 굴림은 서버가 대신한다 (룰북 §11)', () => {
    const game = startGame(3)
    game.disconnectSeat(BROTHER_ROLE.FIRST)
    game.tick()
    expect(game.state.seats[BROTHER_ROLE.FIRST].botTakeover).toBe(true)

    game.tickUntil(GAME_STEP.VOTING)
    const rejected = game.send(BROTHER_ROLE.FIRST, vote('t1-a'))
    expect(rejected.rejected && rejected.reason).toBe(REJECTION_REASON.WRONG_SEAT)

    // 연결된 인간 둘이 투표하면 조기 마감된다 (7번)
    game.send(BROTHER_ROLE.SECOND, vote('t1-a'))
    game.send(BROTHER_ROLE.THIRD, vote('t1-a'))

    // t1-a는 근력/보호라 판정자가 첫째다 (룰북 §3.1).
    // 대행 중이라 서버가 진입 즉시 굴려 굴림 대기 없이 연출로 넘어간다
    expect(game.state.currentEvent?.rollerSeat).toBe(BROTHER_ROLE.FIRST)
    expect(game.state.progress.step).toBe(GAME_STEP.ROLL_REVEAL)
    expect(game.state.currentJudgment?.dice[0]?.value).not.toBeNull()
  })

  it('봇 대행 좌석도 100%에서 배신자로 전환한다 (룰북 §10.1)', () => {
    const game = startGame(3)
    const draft = game.state
    draft.seats[BROTHER_ROLE.SECOND].botTakeover = true

    const out = createStepOutput()
    applySeatErosion(draft, BROTHER_ROLE.SECOND, 100, { now: game.now, rng: LOW }, out)

    expect(draft.seats[BROTHER_ROLE.SECOND].erosionPercent).toBe(100)
    expect(draft.seats[BROTHER_ROLE.SECOND].isTraitor).toBe(true)
    // 방해 효과는 좌석 구성이 봇일 때의 규칙이라 대행 좌석에는 적용하지 않는다 (M3 계획 10절 5번)
    expect(draft.seats[BROTHER_ROLE.SECOND].botSabotageUsed).toBe(false)
  })
})

describe('조기 마감 기준 (아키텍처 §8)', () => {
  it('연결된 인간 전원이 투표하면 마감된다. 끊긴 좌석은 기다리지 않는다', () => {
    const game = startGame(3)
    game.tickUntil(GAME_STEP.VOTING)
    game.disconnectSeat(BROTHER_ROLE.THIRD)

    game.send(BROTHER_ROLE.FIRST, vote('t1-a'))
    expect(game.state.progress.step).toBe(GAME_STEP.VOTING)

    game.send(BROTHER_ROLE.SECOND, vote('t1-a'))
    expect(game.state.progress.step).toBe(GAME_STEP.ROLL_WAIT)
  })
})

describe('연결 상태 공개 범위 (룰북 §17)', () => {
  it('Display에는 좌석별 연결 상태가, 좌석에는 본인 것만 나간다', () => {
    const game = startGame(3)
    game.disconnectSeat(BROTHER_ROLE.THIRD)

    const display = projectDisplay(game.state)
    expect(display.seatConnections).toEqual([
      { seat: BROTHER_ROLE.FIRST, connection: SEAT_CONNECTION.CONNECTED },
      { seat: BROTHER_ROLE.SECOND, connection: SEAT_CONNECTION.CONNECTED },
      { seat: BROTHER_ROLE.THIRD, connection: SEAT_CONNECTION.DISCONNECTED },
    ])

    const seat = projectSeat(game.state, BROTHER_ROLE.FIRST)
    expect(seat.connection).toBe(SEAT_CONNECTION.CONNECTED)
    expect(Object.keys(seat)).not.toContain('seatConnections')
  })

  it('Display 투영에 봇 대행 여부가 실리지 않는다', () => {
    const game = startGame(3)
    game.disconnectSeat(BROTHER_ROLE.THIRD)
    game.tick()
    expect(game.state.seats[BROTHER_ROLE.THIRD].botTakeover).toBe(true)

    expect(JSON.stringify(projectDisplay(game.state))).not.toContain('botTakeover')
    expect(projectSeat(game.state, BROTHER_ROLE.THIRD).botTakeover).toBe(true)
  })
})
