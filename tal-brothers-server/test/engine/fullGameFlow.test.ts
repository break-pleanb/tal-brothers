import { describe, expect, it } from 'vitest'
import { ENDING_ID, GAME_PHASE, GAME_STEP } from 'tal-brothers-shared'
import type { GameStep } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../src/scenario/gameConfig'
import { SEAT_ORDER } from '../../src/engine/state/gameState'
import { runGame } from '../../src/sim/playGame'

/** 한 판 전체 흐름 (로드맵 M2 완료 기준, M2 계획 9절 M2-7) */

const START = 1_700_000_000_000

/** 6절 전이표에서 관찰될 수 있는 단계 */
const ALLOWED_STEPS: GameStep[] = [
  GAME_STEP.EVENT_INTRO,
  GAME_STEP.VOTING,
  GAME_STEP.ROLL_WAIT,
  GAME_STEP.ROLL_REVEAL,
  GAME_STEP.INTERVENTION_REROLL,
  GAME_STEP.INTERVENTION_TALISMAN,
  GAME_STEP.INTERVENTION_FORCE,
  GAME_STEP.PRACTICE_INTERVENTION,
  GAME_STEP.TALISMAN_WINDOW,
  GAME_STEP.RESOLUTION,
  GAME_STEP.PHASE2_ENTRY,
  GAME_STEP.P3_TARGETING,
  GAME_STEP.P3_VOTING,
  GAME_STEP.ENDING,
]

const ENDING_IDS: string[] = Object.values(ENDING_ID)

function run(seed: number, humans: number) {
  return runGame({ seed, humans, startedAt: START })
}

describe('전체 흐름 (로드맵 M2)', () => {
  for (const humans of [0, 1, 2, 3]) {
    it(`인간 ${humans}명 구성이 엔딩에 도달한다`, () => {
      const result = run(42, humans)

      expect(result.finalState.progress.step).toBe(GAME_STEP.ENDING)
      expect(result.finalState.progress.phase).not.toBe(GAME_PHASE.PHASE_1)
      expect(ENDING_IDS).toContain(result.finalState.ending?.id)
    })
  }

  it('100판을 돌려도 예외 없이 엔딩까지 간다', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const humans = seed % 4
      const result = run(seed, humans)
      expect(result.finalState.ending, `seed ${seed}/${humans}명`).not.toBeNull()
    }
  })

  it('방문한 단계가 전이표를 벗어나지 않는다 (아키 §5.3)', () => {
    for (const seed of [1, 2, 3, 42, 99]) {
      for (const humans of [0, 3]) {
        const steps: GameStep[] = []
        runGame({
          seed,
          humans,
          startedAt: START,
          onStep: (step) => steps.push(step.state.progress.step),
        })

        for (const step of steps) {
          expect(ALLOWED_STEPS, `seed ${seed}/${humans}명`).toContain(step)
        }
        expect(steps).not.toContain(GAME_STEP.LOBBY)
      }
    }
  })

  it('타임오버가 없으면 Phase 1 4개 + Phase 2 9개 + Phase 3 1개를 지난다 (룰북 §2.1)', () => {
    let checked = 0

    for (let seed = 1; seed <= 40; seed += 1) {
      const result = run(seed, 3)
      // 타임오버로 Phase 1~2에서 끊긴 판은 이벤트 수가 줄어든다
      if (result.finalState.progress.phase !== GAME_PHASE.PHASE_3) continue

      const phase1 = result.events.filter((event) => event.phase === GAME_PHASE.PHASE_1)
      const phase2 = result.events.filter((event) => event.phase === GAME_PHASE.PHASE_2)
      const phase3 = result.events.filter((event) => event.phase === GAME_PHASE.PHASE_3)

      expect(phase1, `seed ${seed}`).toHaveLength(4)
      expect(phase2, `seed ${seed}`).toHaveLength(9)
      expect(phase3.length, `seed ${seed}`).toBeLessThanOrEqual(1)
      checked += 1
    }

    expect(checked).toBeGreaterThan(0)
  })

  it('Phase 2 슬롯 배치가 룰북 §13.3을 따른다', () => {
    for (const seed of [1, 7, 42]) {
      const result = run(seed, 3)
      const phase2 = result.events
        .filter((event) => event.phase === GAME_PHASE.PHASE_2)
        .map((event) => event.eventId)
      if (phase2.length < 8) continue

      expect(phase2[0], `seed ${seed}`).toBe('branch')
      expect(phase2[7], `seed ${seed}`).toBe('p2-15')
      const randoms = phase2.slice(1).filter((id) => id !== 'p2-15')
      expect(new Set(randoms).size, `seed ${seed}`).toBe(randoms.length)
    }
  })

  it('잠식도가 0~100 범위에서 5% 단위를 유지한다 (룰북 §4.1)', () => {
    for (const seed of [1, 5, 42, 123, 2026]) {
      runGame({
        seed,
        humans: 3,
        startedAt: START,
        onStep: (step) => {
          for (const role of SEAT_ORDER) {
            const erosion = step.state.seats[role].erosionPercent
            expect(erosion, `seed ${seed}/${role}`).toBeGreaterThanOrEqual(0)
            expect(erosion, `seed ${seed}/${role}`).toBeLessThanOrEqual(100)
            expect(erosion % 5 === 0, `seed ${seed}/${role}`).toBe(true)
          }
        },
      })
    }
  })

  it('부적 보유 수가 어떤 시점에도 상한을 넘지 않는다 (룰북 §9.1)', () => {
    for (const seed of [1, 5, 42, 123, 2026]) {
      runGame({
        seed,
        humans: 3,
        startedAt: START,
        onStep: (step) => {
          for (const role of SEAT_ORDER) {
            expect(
              step.state.seats[role].talismanCount,
              `seed ${seed}/${role}`,
            ).toBeLessThanOrEqual(GAME_CONFIG.talismanLimit)
          }
        },
      })
    }
  })

  it('보류함은 Phase 3까지 넘어가지 않는다 (M2 계획 10.1)', () => {
    for (const seed of [1, 5, 42, 123, 2026]) {
      runGame({
        seed,
        humans: 3,
        startedAt: START,
        onStep: (step) => {
          if (step.state.progress.phase !== GAME_PHASE.PHASE_3) return
          for (const role of SEAT_ORDER) {
            expect(step.state.seats[role].talismanOverflow, `seed ${seed}/${role}`).toBe(0)
          }
        },
      })
    }
  })
})

describe('재현성 (아키 §5.5)', () => {
  it('같은 시드와 같은 구성은 최종 상태가 완전히 같다', () => {
    for (const humans of [0, 1, 2, 3]) {
      const first = run(42, humans)
      const second = run(42, humans)

      expect(JSON.stringify(second.finalState)).toBe(JSON.stringify(first.finalState))
      expect(second.endedAt).toBe(first.endedAt)
    }
  })

  it('다른 시드는 최소 한 지점 이상 달라진다', () => {
    const base = run(42, 3)
    const other = run(43, 3)

    expect(JSON.stringify(other.finalState)).not.toBe(JSON.stringify(base.finalState))
  })
})

describe('가상 입력 지연 (M2 계획 10.3)', () => {
  it('인간이 있으면 조기 마감이 0초가 아니라 지연 뒤에 일어난다', () => {
    const result = run(42, 3)
    const voting = result.events.filter((event) => event.tally?.earlyClosed === true)
    expect(voting.length).toBeGreaterThan(0)

    // 이벤트 사이 간격이 상황 제시 30초보다 길다 = 투표에 시간이 흘렀다
    for (const [index, event] of result.events.entries()) {
      const next = result.events[index + 1]
      if (next === undefined) continue
      expect(next.startedAt - event.startedAt).toBeGreaterThan(
        GAME_CONFIG.eventIntroSeconds * 1000,
      )
    }
  })

  it('인간 0명 구성은 투표 3분이 그대로 흘러 더 오래 걸린다', () => {
    const bots = run(42, 0)
    const humans = run(42, 3)

    expect(bots.endedAt - bots.startedAt).toBeGreaterThan(humans.endedAt - humans.startedAt)
  })
})
