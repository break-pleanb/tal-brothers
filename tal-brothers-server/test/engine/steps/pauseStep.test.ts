import { describe, expect, it } from 'vitest'
import {
  BROTHER_ROLE,
  GAME_STEP,
  PAUSE_REASON,
  REJECTION_REASON,
  SEAT_CONNECTION,
} from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../../src/scenario/gameConfig'
import { projectDisplay } from '../../../src/engine/projection/projectDisplay'
import { SEAT_ORDER } from '../../../src/engine/state/gameState'
import { host, hostPause, hostResume, startAt, startGame, vote } from '../../support/gameDriver'

/**
 * 일시정지 (M3 계획 9.1 M3-2 8~12번, 아키텍처 §8).
 *
 * 모든 시간이 절대 마감 시각이라 정지·재개는 남은 시간 변환으로 끝난다 (아키텍처 §2 원칙 6).
 */

const LIMIT_MS = GAME_CONFIG.autoPauseLimitMinutes * 60_000

/** 연결된 인간 좌석을 모두 끊는다 */
function disconnectAllSeats(game: ReturnType<typeof startGame>): void {
  for (const role of SEAT_ORDER) {
    if (game.state.seats[role].isBot) continue
    game.disconnectSeat(role)
  }
}

describe('정지 경로 세 가지 (아키텍처 §8)', () => {
  it('Display가 끊기면 자동으로 정지한다', () => {
    const game = startGame(3)
    game.presence(host, SEAT_CONNECTION.DISCONNECTED)

    expect(game.state.progress.step).toBe(GAME_STEP.PAUSED)
    expect(game.state.pause.active?.reason).toBe(PAUSE_REASON.DISPLAY_GONE)
    expect(game.state.pause.active?.resumeStep).toBe(GAME_STEP.EVENT_INTRO)
    // 정지 중에는 타이머를 걸지 않는다 (M3 계획 2.2)
    expect(game.last.nextDeadline).toBeNull()

    game.presence(host, SEAT_CONNECTION.CONNECTED)
    expect(game.state.progress.step).toBe(GAME_STEP.EVENT_INTRO)
  })

  it('연결된 인간 Controller가 0명이면 자동으로 정지하고, 한 명이라도 돌아오면 재개한다', () => {
    const game = startGame(3)
    disconnectAllSeats(game)

    expect(game.state.progress.step).toBe(GAME_STEP.PAUSED)
    expect(game.state.pause.active?.reason).toBe(PAUSE_REASON.NO_HUMAN_CONTROLLER)

    game.connectSeat(BROTHER_ROLE.SECOND)
    expect(game.state.progress.step).toBe(GAME_STEP.EVENT_INTRO)
    expect(game.state.pause.active).toBeNull()
  })

  it('호스트가 수동으로 정지하고 재개한다', () => {
    const game = startGame(3)
    expect(game.sendAs(host, hostPause).rejected).toBe(false)
    expect(game.state.pause.active?.reason).toBe(PAUSE_REASON.HOST)

    const view = projectDisplay(game.state).pause
    expect(view?.reason).toBe(PAUSE_REASON.HOST)
    // 자동 정지 누적 시간은 운영 수치라 내보내지 않는다
    expect(JSON.stringify(view)).not.toContain('autoAccumulated')

    expect(game.sendAs(host, hostResume).rejected).toBe(false)
    expect(game.state.progress.step).toBe(GAME_STEP.EVENT_INTRO)
  })

  it('인간 좌석이 0명인 구성은 자동 정지 검사를 하지 않는다 (M3 계획 5.4)', () => {
    // 봇 자동 대전에는 소켓이 없다. 로비를 거치지 않으므로 단계에서 바로 시작한다
    const game = startAt({ step: GAME_STEP.EVENT_INTRO, seats: 0 })
    game.presence(host, SEAT_CONNECTION.DISCONNECTED)
    expect(game.state.progress.step).toBe(GAME_STEP.EVENT_INTRO)
  })
})

describe('정지·재개 시각 변환 (M3 계획 5.5)', () => {
  it('게임 시계와 단계 마감의 남은 시간이 보존된다', () => {
    const game = startGame(3)
    const stepDeadline = game.state.progress.stepDeadlineAt
    const clockDeadline = game.state.clock.deadlineAt
    expect(stepDeadline).not.toBeNull()

    game.advance(10_000)
    game.sendAs(host, hostPause)

    const pausedAt = game.now
    expect(game.state.progress.pausedStepRemainingMs).toBe((stepDeadline as number) - pausedAt)
    expect(game.state.clock.pausedRemainingMs).toBe(clockDeadline - pausedAt)
    expect(game.state.progress.stepDeadlineAt).toBeNull()

    game.advance(60_000)
    game.sendAs(host, hostResume)

    expect(game.state.progress.stepDeadlineAt).toBe(game.now + ((stepDeadline as number) - pausedAt))
    expect(game.state.clock.deadlineAt).toBe(game.now + (clockDeadline - pausedAt))
    expect(game.state.clock.pausedRemainingMs).toBeNull()
    expect(game.state.progress.pausedStepRemainingMs).toBeNull()
  })

  it('호스트 수동 정지는 자동 누적에 세지 않는다', () => {
    const game = startGame(3)
    game.sendAs(host, hostPause)
    game.advance(60_000)
    game.sendAs(host, hostResume)

    expect(game.state.pause.autoAccumulatedMs).toBe(0)
  })

  it('자동 정지는 정지해 있던 시간만큼 누적된다', () => {
    const game = startGame(3)
    game.presence(host, SEAT_CONNECTION.DISCONNECTED)
    game.advance(40_000)
    game.presence(host, SEAT_CONNECTION.CONNECTED)

    expect(game.state.pause.autoAccumulatedMs).toBe(40_000)
  })
})

describe('자동 정지 누적 한도 (M3 계획 10절 10번)', () => {
  it('한도를 넘기면 그 뒤로는 자동 정지를 하지 않는다', () => {
    const game = startGame(3)
    game.state.pause.autoAccumulatedMs = LIMIT_MS

    game.presence(host, SEAT_CONNECTION.DISCONNECTED)
    expect(game.state.progress.step).toBe(GAME_STEP.EVENT_INTRO)

    disconnectAllSeats(game)
    expect(game.state.progress.step).toBe(GAME_STEP.EVENT_INTRO)
  })

  it('한도를 넘겨도 호스트 수동 정지는 계속 가능하다', () => {
    const game = startGame(3)
    game.state.pause.autoAccumulatedMs = LIMIT_MS

    expect(game.sendAs(host, hostPause).rejected).toBe(false)
    expect(game.state.pause.active?.reason).toBe(PAUSE_REASON.HOST)
  })
})

describe('정지 중 명령 (아키텍처 §8)', () => {
  it('좌석 명령은 거절되고 호스트 재개만 받는다', () => {
    const game = startGame(3)
    game.tickUntil(GAME_STEP.VOTING)
    game.presence(host, SEAT_CONNECTION.DISCONNECTED)
    expect(game.state.progress.step).toBe(GAME_STEP.PAUSED)

    const voted = game.send(BROTHER_ROLE.FIRST, vote('t1-a'))
    expect(voted.rejected && voted.reason).toBe(REJECTION_REASON.WRONG_STEP)

    // 자동 정지는 연결이 돌아와야 풀린다
    const resumed = game.sendAs(host, hostResume)
    expect(resumed.rejected && resumed.reason).toBe(REJECTION_REASON.NOT_ALLOWED)

    game.presence(host, SEAT_CONNECTION.CONNECTED)
    expect(game.state.progress.step).toBe(GAME_STEP.VOTING)
    expect(game.send(BROTHER_ROLE.FIRST, vote('t1-a')).rejected).toBe(false)
  })

  it('이미 정지 중이면 다시 정지하지 않는다', () => {
    const game = startGame(3)
    game.sendAs(host, hostPause)

    const again = game.sendAs(host, hostPause)
    expect(again.rejected && again.reason).toBe(REJECTION_REASON.NOT_ALLOWED)
  })
})

describe('호스트 수동 정지 시점 (아키텍처 §8)', () => {
  it('이벤트 사이(상황 제시)에서만 받는다', () => {
    const game = startGame(3)
    expect(game.state.progress.step).toBe(GAME_STEP.EVENT_INTRO)
    expect(game.sendAs(host, hostPause).rejected).toBe(false)
    game.sendAs(host, hostResume)

    game.tickUntil(GAME_STEP.VOTING)
    const duringVote = game.sendAs(host, hostPause)
    expect(duringVote.rejected && duringVote.reason).toBe(REJECTION_REASON.WRONG_STEP)
  })

  it('호스트가 아니면 정지할 수 없다', () => {
    const game = startGame(3)
    const result = game.send(BROTHER_ROLE.FIRST, hostPause)
    expect(result.rejected && result.reason).toBe(REJECTION_REASON.WRONG_SEAT)
  })
})
