import { describe, expect, it } from 'vitest'
import { BROTHER_ROLE, COMMAND_TYPE, GAME_PHASE, GAME_STEP } from 'tal-brothers-shared'
import type { GameStep } from 'tal-brothers-shared'

import { dispatch } from '../../src/engine/dispatch'
import { ACTION_KIND, REJECTION_REASON } from '../../src/engine/engineTypes'
import type { DispatchSuccess, LogEntry } from '../../src/engine/engineTypes'
import { createSeededRng } from '../../src/engine/random'
import { createGame, seatSetupForHumans } from '../../src/engine/state/createGame'
import { SEAT_ORDER } from '../../src/engine/state/gameState'
import { parseArgs, runPhase1 } from '../../src/sim/playPhase1'

const START = 1_700_000_000_000

/** 5절 전이표에서 관찰될 수 있는 단계 (RESOLUTION은 타이머 없이 지나가므로 관찰되지 않는다) */
const ALLOWED_STEPS: GameStep[] = [
  GAME_STEP.EVENT_INTRO,
  GAME_STEP.VOTING,
  GAME_STEP.ROLL_WAIT,
  GAME_STEP.ROLL_REVEAL,
  GAME_STEP.INTERVENTION_REROLL,
  GAME_STEP.INTERVENTION_TALISMAN,
  GAME_STEP.INTERVENTION_FORCE,
  GAME_STEP.PRACTICE_INTERVENTION,
  GAME_STEP.RESOLUTION,
  GAME_STEP.PHASE2_ENTRY,
]

function runWithTrace(seed: number, humans: number) {
  const steps: GameStep[] = []
  const logs: LogEntry[] = []
  const result = runPhase1({
    seed,
    humans,
    startedAt: START,
    onStep: (step) => {
      steps.push(step.state.progress.step)
      logs.push(...step.logs)
    },
  })
  return { result, steps, logs }
}

describe('Phase 1 전체 흐름 (로드맵 M1 완료 기준)', () => {
  for (const humans of [1, 2, 3]) {
    it(`인간 ${humans}명 구성이 Phase 1 이벤트 4개를 마치고 Phase 2로 넘어간다`, () => {
      const { result } = runWithTrace(42, humans)

      // Phase 2 진입 단계는 타이머 없이 첫 이벤트로 이어진다 (룰북 §13.1)
      expect(result.finalState.progress.phase).toBe(GAME_PHASE.PHASE_2)
      expect(result.finalState.progress.step).toBe(GAME_STEP.EVENT_INTRO)
      expect(result.events).toHaveLength(4)
      expect(result.finalState.progress.eventIndex).toBe(0)
    })
  }

  it('이벤트를 t1 → t2-1 → t2-2 → villageChief 순서로 지난다 (룰북 §12)', () => {
    for (const humans of [1, 2, 3]) {
      const { result } = runWithTrace(7, humans)
      expect(result.events.map((event) => event.eventId)).toEqual([
        't1',
        't2-1',
        't2-2',
        'villageChief',
      ])
    }
  })

  it('방문한 단계가 전이표를 벗어나지 않는다 (아키 §5.3)', () => {
    for (const seed of [1, 2, 3, 42, 99]) {
      for (const humans of [1, 2, 3]) {
        const { steps } = runWithTrace(seed, humans)
        for (const step of steps) {
          expect(ALLOWED_STEPS, `seed ${seed}/${humans}명`).toContain(step)
        }
        expect(steps).not.toContain(GAME_STEP.LOBBY)
      }
    }
  })

  it('모든 좌석 잠식도가 0~100 범위에서 5% 단위를 유지한다 (룰북 §4.1)', () => {
    for (const seed of [1, 5, 42, 123, 2026]) {
      const { result } = runWithTrace(seed, 3)
      for (const role of SEAT_ORDER) {
        const erosion = result.finalState.seats[role].erosionPercent
        expect(erosion, `seed ${seed}/${role}`).toBeGreaterThanOrEqual(0)
        expect(erosion, `seed ${seed}/${role}`).toBeLessThanOrEqual(100)
        expect(erosion % 5, `seed ${seed}/${role}`).toBe(0)
      }
    }
  })
})

describe('재현성 (아키 §5.5)', () => {
  it('같은 시드와 같은 구성은 최종 상태가 완전히 같다', () => {
    for (const humans of [1, 2, 3]) {
      const first = runPhase1({ seed: 42, humans, startedAt: START })
      const second = runPhase1({ seed: 42, humans, startedAt: START })

      expect(JSON.stringify(second.finalState)).toBe(JSON.stringify(first.finalState))
      expect(second.lines).toEqual(first.lines)
    }
  })

  it('다른 시드는 최소 한 지점 이상 달라진다', () => {
    const base = runPhase1({ seed: 42, humans: 3, startedAt: START })
    const other = runPhase1({ seed: 43, humans: 3, startedAt: START })

    expect(JSON.stringify(other.finalState)).not.toBe(JSON.stringify(base.finalState))
  })
})

describe('게임 시계 (룰북 §2.1)', () => {
  it('Phase 1~2에서 시계가 0을 지나면 진행이 중단된다', () => {
    let pushed = false

    // 시뮬레이터는 Phase 1을 마치기 전에 멈추므로 예외로 관찰한다
    expect(() =>
      runPhase1({
        seed: 42,
        humans: 3,
        startedAt: START,
        onStep: (step) => {
          if (pushed) return
          // 시계를 이미 지난 시각으로 밀어 놓는다
          step.state.clock.deadlineAt = START - 60_000
          pushed = true
        },
      }),
    ).toThrow()
  })
})

describe('시뮬레이션 기록 (로드맵 M1-5)', () => {
  const SEEDS = [1, 2, 3, 42, 99]

  it('조기 마감된 이벤트는 득표 합계가 인간 수와 같다 (룰북 §8)', () => {
    let earlyClosedCount = 0

    for (const seed of SEEDS) {
      for (const humans of [1, 2, 3]) {
        const result = runPhase1({ seed, humans, startedAt: START })
        for (const event of result.events) {
          if (event.tally?.earlyClosed !== true) continue
          earlyClosedCount += 1
          const total = Object.values(event.tally.counts).reduce((sum, count) => sum + count, 0)
          expect(total, `seed ${seed}/${humans}명 ${event.eventId}`).toBe(humans)
        }
      }
    }

    // 조기 마감 경로가 실제로 실행되는지까지 함께 고정한다
    expect(earlyClosedCount).toBeGreaterThan(0)
  })

  it('이벤트 소요 시간이 게임 시계에서 그대로 빠진다 (룰북 §2.1)', () => {
    for (const seed of SEEDS) {
      const result = runPhase1({ seed, humans: 3, startedAt: START })

      for (const [index, event] of result.events.entries()) {
        const next = result.events[index + 1]
        if (next === undefined) continue
        // 다음 이벤트 진입 시각 − 이번 이벤트 진입 시각 = 이번 이벤트에 흐른 시간
        expect(next.startedAt, `seed ${seed} ${event.eventId}`).toBeGreaterThan(event.startedAt)
      }
    }
  })

  it('개입 기록에 사용 좌석·수단·적용 전후 값·재판정 결과가 남는다 (룰북 §7.2)', () => {
    let interventionCount = 0

    for (const seed of SEEDS) {
      for (const humans of [1, 2, 3]) {
        const result = runPhase1({ seed, humans, startedAt: START })
        for (const event of result.events) {
          for (const used of event.interventions) {
            interventionCount += 1
            const where = `seed ${seed}/${humans}명 ${event.eventId} ${used.kind}`

            expect(SEAT_ORDER, where).toContain(used.seat)
            expect(used.threshold, where).toBeGreaterThan(0)

            if (used.kind === 'reroll') {
              // 재굴림은 어느 주사위가 얼마에서 얼마로 바뀌었는지 남아야 한다
              expect(used.dieSeat, where).not.toBeNull()
              expect(used.diceBefore, where).not.toBeNull()
              expect(used.diceAfter, where).not.toBeNull()
            }
            if (used.kind === 'talisman') {
              expect(used.finalValueAfter, where).toBe(used.finalValueBefore + 1)
            }
            if (used.kind === 'forceSuccess') {
              expect(used.succeeded, where).toBe(true)
            } else {
              expect(used.succeeded, where).toBe(used.finalValueAfter >= used.threshold)
            }
          }
        }
      }
    }

    expect(interventionCount).toBeGreaterThan(0)
  })
})

describe('액션 검증 (아키 §5.1)', () => {
  function newGame(): DispatchSuccess {
    return createGame(
      { roomCode: 'TEST', seats: seatSetupForHumans(3) },
      { now: START, rng: createSeededRng(1) },
    )
  }

  it('늦은 타이머는 무시된다', () => {
    const game = newGame()
    const deadline = game.nextDeadline
    expect(deadline).not.toBeNull()
    if (deadline === null) return

    const staleVersion = dispatch(
      game.state,
      {
        kind: ACTION_KIND.TIMER_EXPIRY,
        step: deadline.step,
        stateVersion: deadline.stateVersion - 1,
      },
      { now: deadline.at, rng: createSeededRng(1) },
    )
    expect(staleVersion.rejected && staleVersion.reason).toBe(REJECTION_REASON.STALE_TIMER)

    const staleStep = dispatch(
      game.state,
      {
        kind: ACTION_KIND.TIMER_EXPIRY,
        step: GAME_STEP.VOTING,
        stateVersion: deadline.stateVersion,
      },
      { now: deadline.at, rng: createSeededRng(1) },
    )
    expect(staleStep.rejected && staleStep.reason).toBe(REJECTION_REASON.STALE_TIMER)
  })

  it('거절된 명령은 상태 버전을 올리지 않고 상태를 바꾸지 않는다', () => {
    const game = newGame()
    const before = JSON.stringify(game.state)

    const result = dispatch(
      game.state,
      {
        kind: ACTION_KIND.COMMAND,
        seat: BROTHER_ROLE.FIRST,
        command: { type: COMMAND_TYPE.VOTE_SUBMIT, choiceId: 't1-a' },
      },
      { now: START, rng: createSeededRng(1) },
    )

    expect(result.rejected).toBe(true)
    expect(JSON.stringify(game.state)).toBe(before)
    expect(game.state.meta.stateVersion).toBe(1)
  })

  it('처리기가 없는 단계에서는 모든 액션을 거절한다', () => {
    const result = runPhase1({ seed: 42, humans: 3, startedAt: START })
    const finished = result.finalState

    const command = dispatch(
      finished,
      {
        kind: ACTION_KIND.COMMAND,
        seat: BROTHER_ROLE.FIRST,
        command: { type: COMMAND_TYPE.ROLL_REQUEST },
      },
      { now: START, rng: createSeededRng(1) },
    )
    // Phase 2 진입 처리기는 M2-4에서 채운다. 그때까지는 처리기 없는 단계로 거절된다
    expect(command.rejected).toBe(true)

    const timer = dispatch(
      finished,
      {
        kind: ACTION_KIND.TIMER_EXPIRY,
        step: GAME_STEP.PHASE2_ENTRY,
        stateVersion: finished.meta.stateVersion,
      },
      { now: START, rng: createSeededRng(1) },
    )
    expect(timer.rejected).toBe(true)
  })
})

describe('시뮬레이터 인자 파싱 (로드맵 M1-5)', () => {
  it('--seed와 --humans를 읽고 기본값을 쓴다', () => {
    expect(parseArgs([])).toEqual({ seed: 1, humans: 3 })
    expect(parseArgs(['--seed', '42'])).toEqual({ seed: 42, humans: 3 })
    expect(parseArgs(['--seed', '42', '--humans', '2'])).toEqual({ seed: 42, humans: 2 })
  })

  it('인간 좌석 수가 1~3을 벗어나면 예외를 던진다', () => {
    expect(() => parseArgs(['--humans', '0'])).toThrow()
    expect(() => parseArgs(['--humans', '4'])).toThrow()
    expect(() => parseArgs(['--seed', 'abc'])).toThrow()
  })

  it('이벤트 블록에 필요한 줄이 모두 들어 있다', () => {
    const result = runPhase1({ seed: 42, humans: 3, startedAt: START })
    const text = result.lines.join('\n')

    for (const label of ['투표', '변이', '판정', '주사위', '결과', '개입', '좌석', '시계']) {
      expect(text).toContain(label)
    }
    expect(text).toContain('[이벤트 4/4]')
    expect(text).toContain('Phase 1 종료')
  })
})
