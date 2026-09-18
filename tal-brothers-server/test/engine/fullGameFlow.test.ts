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

/**
 * 시뮬레이터 이벤트 블록의 심리전 요소 (로드맵 M2-7).
 *
 * 좌석에만 가는 정보는 상태나 투영이 아니라 **엔진 감사 로그**에서만 읽을 수 있다.
 * 요소마다 발생 조건이 달라 한 판으로는 전부 나오지 않으므로, 여러 구성의 출력을 모아 확인한다.
 * 설정값을 조정하면 어느 시드에서 무엇이 나오는지가 달라지므로 시드 목록은 넓게 잡는다.
 */
describe('시뮬레이터 이벤트 블록 — 심리전 요소 (로드맵 M2-7)', () => {
  const corpus = [1, 2, 3, 6, 7, 38]
    .flatMap((seed) =>
      [1, 2, 3].map((humans) =>
        runGame({ seed, humans, startedAt: START, withLines: true }).lines.join('\n'),
      ),
    )
    .join('\n')

  it('귓속말 5종을 수신 좌석·내용·진실 여부와 함께 적는다 (룰북 §16)', () => {
    for (const label of [
      'T2 귓속말',
      '이벤트 귓속말',
      '티어 환청',
      '분기 실패 귓속말',
      '진입 경고',
    ]) {
      expect(corpus).toContain(label)
    }
    expect(corpus).toMatch(/티어 환청 · \S+의 잠식은 \S+ 구간 \[(진실|거짓)\]/)
    expect(corpus).toMatch(/T2 귓속말 · \S+의 기운은 [흉평길] \[(진실|거짓)\]/)
  })

  it('가짜 라벨은 표시된 값과 실제 값을 나란히 적는다 (룰북 §4.3)', () => {
    expect(corpus).toMatch(/가짜 라벨\s+\S+ — \S+ [흉평길]\(실제 [흉평길]\)/)
  })

  it('가짜 붉은 메시지를 받은 좌석을 적는다 (룰북 §4.3, §10.1)', () => {
    expect(corpus).toMatch(/붉은 메시지\s+.+가짜 \(진짜 전환과 같은 연출\)/)
  })

  it('배신자 전환을 좌석·시점과 함께 적는다 (룰북 §10.1)', () => {
    expect(corpus).toMatch(/배신자\s+\S+ 잠식 100% 도달 → 이면의 형제 전환/)
  })

  it('익명 표기의 Display 문구와 실제 원인을 함께 적는다 (룰북 §5.5, §13.5, §17)', () => {
    expect(corpus).toContain('Phase 2 진입 환청 — 부적 미보유')
    expect(corpus).toContain('봇 100% 방해')
    expect(corpus).toContain('채택 선택지 결과')
    expect(corpus).toContain('누군가 탈 조각의 저주를 받았다')
    expect(corpus).toMatch(/익명 표기\s+Display "누군가/)
  })

  it('Phase 3 판정을 대립과 고정 기준으로 나눠 적는다 (룰북 §14.3, §14.4)', () => {
    expect(corpus).toMatch(/판정\s+대립 · 상대 주사위 [1-6] 초과/)
    expect(corpus).toMatch(/판정\s+고정 기준 · 기준 [45]/)
  })

  it('부적 이동을 좌석·보유 수 변화와 함께 적는다 (룰북 §9.1, §13.5)', () => {
    for (const label of [
      '획득 +',
      '판정 보정에 1개 사용',
      '회복에 1개 사용',
      '14A 제출로 1개 소모',
      '양도',
      '자동 폐기',
      '100% 방해로 1개 소멸',
    ]) {
      expect(corpus).toContain(label)
    }
    expect(corpus).toMatch(/부적\s+\S+ 획득 \+\d+개 \(인벤토리 \+\d+\) → 보유 \d+/)
  })
})
