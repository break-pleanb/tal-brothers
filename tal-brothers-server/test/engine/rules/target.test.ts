import { describe, expect, it } from 'vitest'
import { BROTHER_ROLE } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../../src/scenario/gameConfig'
import { createSeededRng } from '../../../src/engine/random'
import type { Rng } from '../../../src/engine/random'
import {
  jadeHairpinHolder,
  moveJadeHairpinAwayFromTarget,
  selectPhase3Target,
  targetCandidates,
} from '../../../src/engine/rules/target'
import { createGame, seatSetupForHumans } from '../../../src/engine/state/createGame'
import type { GameState } from '../../../src/engine/state/gameState'

const NOW = 1_700_000_000_000

/** 항상 첫 항목 / 항상 마지막 항목 — 동점 무작위 경로를 고정한다 */
const FIRST_PICK: Rng = { nextInt: () => 0 }
const LAST_PICK: Rng = { nextInt: (bound) => bound - 1 }

function makeState(humanCount = 3): GameState {
  const result = createGame(
    { roomCode: 'TEST', seats: seatSetupForHumans(humanCount) },
    { now: NOW, rng: createSeededRng(1) },
  )
  if (result.rejected) throw new Error('게임 생성 실패')
  return result.state
}

describe('Phase 3 타겟 지정 (룰북 §14.1)', () => {
  it('전원이 30% 미만이면 타겟이 없다', () => {
    const state = makeState()
    state.seats[BROTHER_ROLE.FIRST].erosionPercent = 25
    state.seats[BROTHER_ROLE.SECOND].erosionPercent = 0
    state.seats[BROTHER_ROLE.THIRD].erosionPercent = 20

    expect(targetCandidates(state)).toEqual([])
    expect(selectPhase3Target(state, FIRST_PICK)).toBeNull()
  })

  it('임계 30%는 포함이다 (룰북 §19)', () => {
    const state = makeState()
    state.seats[BROTHER_ROLE.SECOND].erosionPercent = GAME_CONFIG.phase3TargetThresholdPercent

    expect(selectPhase3Target(state, FIRST_PICK)).toBe(BROTHER_ROLE.SECOND)
  })

  it('잠식도가 가장 높은 1명이 타겟이 된다', () => {
    const state = makeState()
    state.seats[BROTHER_ROLE.FIRST].erosionPercent = 35
    state.seats[BROTHER_ROLE.SECOND].erosionPercent = 80
    state.seats[BROTHER_ROLE.THIRD].erosionPercent = 60

    expect(selectPhase3Target(state, LAST_PICK)).toBe(BROTHER_ROLE.SECOND)
  })

  it('동점이면 인간 배신자 > 봇 > 기타 인간 순으로 고른다', () => {
    // 첫째 인간(일반), 둘째 인간(배신자), 셋째 봇 — 셋 다 100%
    const state = makeState(2)
    for (const role of [BROTHER_ROLE.FIRST, BROTHER_ROLE.SECOND, BROTHER_ROLE.THIRD]) {
      state.seats[role].erosionPercent = 100
    }
    state.seats[BROTHER_ROLE.SECOND].isTraitor = true

    expect(selectPhase3Target(state, FIRST_PICK)).toBe(BROTHER_ROLE.SECOND)
    expect(selectPhase3Target(state, LAST_PICK)).toBe(BROTHER_ROLE.SECOND)

    // 배신자가 없으면 봇이 인간보다 먼저다
    state.seats[BROTHER_ROLE.SECOND].isTraitor = false
    expect(selectPhase3Target(state, FIRST_PICK)).toBe(BROTHER_ROLE.THIRD)
  })

  it('같은 순위 동점은 난수로 고른다', () => {
    const state = makeState(3)
    state.seats[BROTHER_ROLE.FIRST].erosionPercent = 70
    state.seats[BROTHER_ROLE.SECOND].erosionPercent = 70
    state.seats[BROTHER_ROLE.THIRD].erosionPercent = 70

    expect(selectPhase3Target(state, FIRST_PICK)).toBe(BROTHER_ROLE.FIRST)
    expect(selectPhase3Target(state, LAST_PICK)).toBe(BROTHER_ROLE.THIRD)
  })
})

describe('옥비녀 이동 (룰북 §14.1)', () => {
  it('타겟이 보유자면 잠식도가 가장 낮은 좌석으로 옮긴다', () => {
    const state = makeState()
    state.seats[BROTHER_ROLE.FIRST].erosionPercent = 90
    state.seats[BROTHER_ROLE.SECOND].erosionPercent = 40
    state.seats[BROTHER_ROLE.THIRD].erosionPercent = 10
    state.seats[BROTHER_ROLE.FIRST].hasJadeHairpin = true

    const moved = moveJadeHairpinAwayFromTarget(state, BROTHER_ROLE.FIRST, FIRST_PICK)

    expect(moved).toBe(BROTHER_ROLE.THIRD)
    expect(state.seats[BROTHER_ROLE.FIRST].hasJadeHairpin).toBe(false)
    expect(jadeHairpinHolder(state)).toBe(BROTHER_ROLE.THIRD)
  })

  it('타겟이 보유자가 아니면 옮기지 않는다', () => {
    const state = makeState()
    state.seats[BROTHER_ROLE.THIRD].hasJadeHairpin = true

    expect(moveJadeHairpinAwayFromTarget(state, BROTHER_ROLE.FIRST, FIRST_PICK)).toBeNull()
    expect(jadeHairpinHolder(state)).toBe(BROTHER_ROLE.THIRD)
  })

  it('받는 좌석이 동점이면 난수로 고른다', () => {
    const state = makeState()
    state.seats[BROTHER_ROLE.FIRST].erosionPercent = 100
    state.seats[BROTHER_ROLE.SECOND].erosionPercent = 20
    state.seats[BROTHER_ROLE.THIRD].erosionPercent = 20
    state.seats[BROTHER_ROLE.FIRST].hasJadeHairpin = true

    expect(moveJadeHairpinAwayFromTarget(state, BROTHER_ROLE.FIRST, LAST_PICK)).toBe(
      BROTHER_ROLE.THIRD,
    )
  })

  it('보유자가 없으면 null이다', () => {
    expect(jadeHairpinHolder(makeState())).toBeNull()
  })
})
