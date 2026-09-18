import { describe, expect, it } from 'vitest'
import {
  BROTHER_ROLE,
  COMMAND_TYPE,
  ENDING_ID,
  GAME_PHASE,
  GAME_STEP,
  JUDGMENT_KIND,
  PHASE3_ROUTE,
} from 'tal-brothers-shared'
import type { BrotherRole, Command, GameStep } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../../src/scenario/gameConfig'
import { PHASE3_CHOICE_ID } from '../../../src/scenario/phase3Scene'
import { dispatch, enterStep, finishDispatch } from '../../../src/engine/dispatch'
import { projectDisplay } from '../../../src/engine/projection/projectDisplay'
import { ACTION_KIND, REJECTION_REASON, createStepOutput } from '../../../src/engine/engineTypes'
import type { DispatchResult, DispatchSuccess } from '../../../src/engine/engineTypes'
import type { Rng } from '../../../src/engine/random'
import { canForceSuccess } from '../../../src/engine/steps/interventionStep'
import { createGame, seatSetupForHumans } from '../../../src/engine/state/createGame'
import type { GameState } from '../../../src/engine/state/gameState'

/** Phase 3 판정 순서와 대립 판정 (룰북 §14) */

const START = 1_700_000_000_000

const LOW: Rng = { nextInt: () => 0 }
const HIGH: Rng = { nextInt: (bound) => bound - 1 }

/** 정해진 수열을 돌려주는 난수. 주사위 값 v는 v-1로 적는다 */
function scriptRng(values: number[]): Rng {
  let index = 0
  return {
    nextInt(bound: number): number {
      const value = values[index] ?? 0
      index += 1
      return value % bound
    },
  }
}

const vote = (choiceId: string): Command => ({ type: COMMAND_TYPE.VOTE_SUBMIT, choiceId })
const roll: Command = { type: COMMAND_TYPE.ROLL_REQUEST }

type Setup = {
  humans?: number
  rng?: Rng
  /** Phase 3 진입 직전 좌석 상태 */
  before?: (state: GameState) => void
  /** 진입 시점의 남은 시간 (분) */
  remainingMinutes?: number
}

function startPhase3(setup: Setup = {}) {
  const rng = setup.rng ?? LOW
  let now = START
  // 게임 생성은 Phase 1 첫 이벤트 진입까지 난수를 쓰므로 고정 난수로 돌리고,
  // 지정한 난수는 Phase 3 진입부터 쓴다
  const created = createGame(
    { roomCode: 'TEST', seats: seatSetupForHumans(setup.humans ?? 3) },
    { now, rng: LOW },
  )

  const state = created.state
  // 튜토리얼 부적은 T1 종료 시 소멸한다 (룰북 §9.2). 생성 직후 상태에서 지워 둔다
  for (const role of [BROTHER_ROLE.FIRST, BROTHER_ROLE.SECOND, BROTHER_ROLE.THIRD]) {
    state.seats[role].tutorialTalismanCount = 0
  }
  state.progress.phase = GAME_PHASE.PHASE_2
  state.clock.deadlineAt = now + (setup.remainingMinutes ?? 40) * 60_000
  state.currentEvent = null
  state.currentJudgment = null
  setup.before?.(state)

  const out = createStepOutput()
  enterStep(state, GAME_STEP.P3_TARGETING, { now, rng }, out)
  let last: DispatchSuccess = finishDispatch(state, out)

  return {
    get state(): GameState {
      return last.state
    },
    get last(): DispatchSuccess {
      return last
    },
    get now(): number {
      return now
    },
    tick(): void {
      const deadline = last.nextDeadline
      if (deadline === null) throw new Error(`타이머가 없다: ${last.state.progress.step}`)
      now = deadline.at
      const result = dispatch(
        last.state,
        {
          kind: ACTION_KIND.TIMER_EXPIRY,
          step: deadline.step,
          stateVersion: deadline.stateVersion,
        },
        { now, rng },
      )
      if (result.rejected) throw new Error(`타이머 거절: ${result.reason}`)
      last = result
    },
    send(seat: BrotherRole, command: Command): DispatchResult {
      const result = dispatch(
        last.state,
        { kind: ACTION_KIND.COMMAND, seat, command },
        { now, rng },
      )
      if (!result.rejected) last = result
      return result
    },
    tickUntil(step: GameStep, limit = 20): void {
      let count = 0
      while (last.state.progress.step !== step) {
        this.tick()
        count += 1
        if (count > limit) throw new Error(`${step}에 도달하지 못했다`)
      }
    },
  }
}

type Game = ReturnType<typeof startPhase3>

/** 인간 2명(첫째·둘째) + 봇 1명에서 둘째를 배신자 타겟으로 만든다 */
function traitorTarget(state: GameState): void {
  state.seats[BROTHER_ROLE.SECOND].erosionPercent = 100
  state.seats[BROTHER_ROLE.SECOND].isTraitor = true
  state.seats[BROTHER_ROLE.FIRST].erosionPercent = 20
  state.seats[BROTHER_ROLE.THIRD].erosionPercent = 10
}

function endingOf(game: Game): string | null {
  return game.state.ending?.id ?? null
}

describe('진입 판정 순서 0~4 (룰북 §14.1)', () => {
  it('타겟이 없으면 무사귀환으로 끝난다', () => {
    const game = startPhase3({
      before: (state) => {
        state.seats[BROTHER_ROLE.FIRST].erosionPercent = 25
        state.seats[BROTHER_ROLE.SECOND].erosionPercent = 20
        state.seats[BROTHER_ROLE.THIRD].erosionPercent = 0
        // 옥비녀가 있어도 쓰지 않는다 (룰북 §14.1의 2번)
        state.seats[BROTHER_ROLE.FIRST].hasJadeHairpin = true
      },
    })

    expect(game.state.phase3?.targetSeat).toBeNull()
    expect(endingOf(game)).toBe(ENDING_ID.SAFE_RETURN)
    expect(game.state.progress.step).toBe(GAME_STEP.ENDING)
  })

  it('인간 2명 이상이 전원 배신자면 강제 잠식으로 끝난다 (룰북 §10.3)', () => {
    const game = startPhase3({
      humans: 2,
      before: (state) => {
        for (const role of [BROTHER_ROLE.FIRST, BROTHER_ROLE.SECOND]) {
          state.seats[role].erosionPercent = 100
          state.seats[role].isTraitor = true
        }
      },
    })

    expect(endingOf(game)).toBe(ENDING_ID.FORCED_EROSION)
  })

  it('옥비녀 보유자가 있으면 투표 없이 B-1 판정으로 간다', () => {
    const game = startPhase3({
      humans: 2,
      remainingMinutes: 40,
      before: (state) => {
        traitorTarget(state)
        state.seats[BROTHER_ROLE.FIRST].hasJadeHairpin = true
      },
    })

    expect(game.state.phase3?.route).toBe(PHASE3_ROUTE.PURIFY)
    expect(game.state.progress.step).toBe(GAME_STEP.ROLL_WAIT)
    expect(game.state.currentEvent?.adoptedChoiceId).toBe(PHASE3_CHOICE_ID.PURIFY)
    expect(game.state.currentEvent?.rollerSeat).toBe(BROTHER_ROLE.FIRST)
    // 시계 절삭이 없다 (룰북 §14.3)
    expect(game.state.clock.deadlineAt - START).toBe(40 * 60_000)
  })

  it('옥비녀가 없으면 시계를 10분으로 절삭하고 A 루트 투표로 간다', () => {
    const game = startPhase3({
      humans: 2,
      remainingMinutes: 40,
      before: traitorTarget,
    })

    expect(game.state.progress.step).toBe(GAME_STEP.P3_VOTING)
    expect(game.state.clock.deadlineAt - START).toBe(GAME_CONFIG.phase3TruncateMinutes * 60_000)
    // 투표 마감 = 시계 0 (룰북 §14.4)
    expect(game.state.progress.stepDeadlineAt).toBe(game.state.clock.deadlineAt)
  })

  it('남은 시간이 10분 미만이면 그대로 둔다', () => {
    const game = startPhase3({
      humans: 2,
      remainingMinutes: 9,
      before: traitorTarget,
    })

    expect(game.state.clock.deadlineAt - START).toBe(9 * 60_000)
  })

  it('타겟이 옥비녀 보유자면 먼저 옮긴 뒤 루트를 고른다', () => {
    const game = startPhase3({
      humans: 2,
      before: (state) => {
        traitorTarget(state)
        // 타겟(둘째)이 옥비녀를 들고 있다
        state.seats[BROTHER_ROLE.SECOND].hasJadeHairpin = true
      },
    })

    // 잠식도가 가장 낮은 셋째(10%)로 옮겨간다
    expect(game.state.phase3?.jadeHairpinMovedTo).toBe(BROTHER_ROLE.THIRD)
    expect(game.state.seats[BROTHER_ROLE.SECOND].hasJadeHairpin).toBe(false)
    // 옮긴 뒤 보유자가 있으므로 B-1 루트다
    expect(game.state.phase3?.route).toBe(PHASE3_ROUTE.PURIFY)
    expect(game.state.currentEvent?.rollerSeat).toBe(BROTHER_ROLE.THIRD)
  })

  it('보류함 부적은 Phase 3로 넘어오지 않는다 (M2 계획 10.1)', () => {
    const game = startPhase3({
      humans: 2,
      before: (state) => {
        traitorTarget(state)
        state.seats[BROTHER_ROLE.FIRST].talismanOverflow = 2
      },
    })

    expect(game.state.seats[BROTHER_ROLE.FIRST].talismanOverflow).toBe(0)
  })
})

describe('대립 판정 (룰북 §14.3, §14.4)', () => {
  it('B-1 동점은 배신자 승이다', () => {
    // 상대 6, 팀 6 → 6 > 6이 아니므로 실패
    const game = startPhase3({
      humans: 2,
      rng: HIGH,
      before: (state) => {
        traitorTarget(state)
        state.seats[BROTHER_ROLE.FIRST].hasJadeHairpin = true
      },
    })

    game.send(BROTHER_ROLE.FIRST, roll)
    expect(game.state.currentJudgment?.contest).toBe(true)
    expect(game.state.currentJudgment?.opponentDie?.value).toBe(6)
    expect(game.state.currentJudgment?.succeeded).toBe(false)
  })

  it('B-1은 팀 값이 상대보다 커야 성공한다', () => {
    // 상대 3(값 2), 팀 5(값 4)
    const game = startPhase3({
      humans: 2,
      rng: scriptRng([2, 4]),
      before: (state) => {
        traitorTarget(state)
        state.seats[BROTHER_ROLE.FIRST].hasJadeHairpin = true
      },
    })

    game.send(BROTHER_ROLE.FIRST, roll)
    expect(game.state.currentJudgment?.opponentDie?.value).toBe(3)
    expect(game.state.currentJudgment?.succeeded).toBe(true)

    // 판정 연출이 끝나면 결과가 엔딩으로 이어진다
    game.tick()
    expect(endingOf(game)).toBe(ENDING_ID.PURIFY)
  })

  it('타겟이 배신자가 아니면 고정 기준 4로 판정한다 (B-1)', () => {
    const game = startPhase3({
      humans: 1,
      rng: scriptRng([3]),
      before: (state) => {
        // 봇 타겟 — 대립이 아니라 고정 기준
        state.seats[BROTHER_ROLE.THIRD].erosionPercent = 80
        state.seats[BROTHER_ROLE.FIRST].hasJadeHairpin = true
      },
    })

    expect(game.state.phase3?.targetSeat).toBe(BROTHER_ROLE.THIRD)
    expect(game.state.currentJudgment?.contest).toBe(false)
    expect(game.state.currentJudgment?.opponentDie).toBeNull()
    expect(game.state.currentJudgment?.threshold).toBe(GAME_CONFIG.thresholdBase)

    game.send(BROTHER_ROLE.FIRST, roll)
    // 주사위 4, 직업 보정 없음 → 기준 4 이상이라 성공
    expect(game.state.currentJudgment?.succeeded).toBe(true)
  })

  it('투영이 대립과 고정 기준을 구분해 표기한다 (룰북 §14.3, §14.4)', () => {
    const contested = startPhase3({
      humans: 2,
      rng: HIGH,
      before: (state) => {
        traitorTarget(state)
        state.seats[BROTHER_ROLE.FIRST].hasJadeHairpin = true
      },
    })
    contested.send(BROTHER_ROLE.FIRST, roll)
    const contestedView = projectDisplay(contested.state).judgment
    expect(contestedView?.kind).toBe(JUDGMENT_KIND.CONTEST)
    expect(contestedView?.contest).toBe(true)
    expect(contestedView?.opponentValue).toBe(6)

    // 타겟이 봇이면 같은 `contest` 판정 유형이어도 고정 기준이다
    const fixed = startPhase3({
      humans: 1,
      rng: scriptRng([3]),
      before: (state) => {
        state.seats[BROTHER_ROLE.THIRD].erosionPercent = 80
        state.seats[BROTHER_ROLE.FIRST].hasJadeHairpin = true
      },
    })
    fixed.send(BROTHER_ROLE.FIRST, roll)
    const fixedView = projectDisplay(fixed.state).judgment
    expect(fixedView?.kind).toBe(JUDGMENT_KIND.CONTEST)
    expect(fixedView?.contest).toBe(false)
    expect(fixedView?.opponentValue).toBeNull()
    expect(fixedView?.threshold).toBe(GAME_CONFIG.thresholdBase)
  })

  it('A-2는 타겟을 제외한 전원이 굴리고 고정 기준은 5다', () => {
    const game = startPhase3({
      humans: 1,
      rng: LOW,
      before: (state) => {
        state.seats[BROTHER_ROLE.THIRD].erosionPercent = 70
      },
    })

    game.send(BROTHER_ROLE.FIRST, vote(PHASE3_CHOICE_ID.BREAK))
    expect(game.state.progress.step).toBe(GAME_STEP.ROLL_WAIT)
    expect(game.state.currentJudgment?.teamSeats).toEqual([
      BROTHER_ROLE.FIRST,
      BROTHER_ROLE.SECOND,
    ])
    expect(game.state.currentJudgment?.threshold).toBe(GAME_CONFIG.thresholdHard)
  })

  it('남은 버프·디버프가 팀 측 값에 적용된다 (룰북 §14.2)', () => {
    const game = startPhase3({
      humans: 1,
      rng: LOW,
      before: (state) => {
        state.seats[BROTHER_ROLE.THIRD].erosionPercent = 70
        state.teamModifier = -2
      },
    })

    game.send(BROTHER_ROLE.FIRST, vote(PHASE3_CHOICE_ID.BREAK))
    expect(game.state.currentJudgment?.teamModifierApplied).toBe(-2)
    // 대립 판정에는 직업 보정이 없다 (룰북 §14.2)
    expect(game.state.currentJudgment?.roleBonus).toBe(0)
  })
})

describe('Phase 3 개입 창 (룰북 §14.2)', () => {
  it('강제 성공은 거절된다', () => {
    const game = startPhase3({
      humans: 2,
      rng: LOW,
      before: (state) => {
        traitorTarget(state)
        state.seats[BROTHER_ROLE.FIRST].hasJadeHairpin = true
      },
    })

    game.send(BROTHER_ROLE.FIRST, roll)
    // 팀이 졌으므로 개입 창이 열린다
    game.tickUntil(GAME_STEP.INTERVENTION_TALISMAN, 8)

    expect(canForceSuccess(game.state)).toBe(false)
    const result = game.send(BROTHER_ROLE.FIRST, {
      type: COMMAND_TYPE.INTERVENTION_FORCE_SUCCESS,
    })
    expect(result.rejected).toBe(true)

    // 첫째 단계는 조기 스킵되고 곧바로 결과로 간다 (관찰 가능한 단계가 아니다)
    while (game.state.progress.step !== GAME_STEP.ENDING) game.tick()
    expect(game.state.seats[BROTHER_ROLE.FIRST].abilityUsed).toBe(false)
  })

  it('팀 측이 졌을 때만 열리고 부적으로 값을 올릴 수 있다', () => {
    // 상대 4(값 3), 팀 3(값 2) → 실패 후 부적 +1로도 4 = 4라 동점(배신자 승)
    const game = startPhase3({
      humans: 2,
      rng: scriptRng([3, 2]),
      before: (state) => {
        traitorTarget(state)
        state.seats[BROTHER_ROLE.FIRST].hasJadeHairpin = true
        state.seats[BROTHER_ROLE.FIRST].talismanCount = 1
      },
    })

    game.send(BROTHER_ROLE.FIRST, roll)
    expect(game.state.currentJudgment?.succeeded).toBe(false)

    game.tickUntil(GAME_STEP.INTERVENTION_TALISMAN, 8)
    expect(game.send(BROTHER_ROLE.FIRST, { type: COMMAND_TYPE.INTERVENTION_TALISMAN }).rejected).toBe(
      false,
    )
    expect(game.state.seats[BROTHER_ROLE.FIRST].talismanCount).toBe(0)
    // 4 vs 4 → 동점은 배신자 승이라 여전히 실패다 (룰북 §14.3)
    expect(endingOf(game)).toBe(ENDING_ID.ETERNAL_MAZE)
  })
})

describe('A 루트 투표 (룰북 §14.4)', () => {
  it('유효표가 0이면 강제 잠식으로 끝난다', () => {
    const game = startPhase3({
      humans: 1,
      rng: LOW,
      before: (state) => {
        state.seats[BROTHER_ROLE.THIRD].erosionPercent = 70
      },
    })

    expect(game.state.progress.step).toBe(GAME_STEP.P3_VOTING)
    game.tick() // 시계 0까지 아무도 투표하지 않았다

    expect(endingOf(game)).toBe(ENDING_ID.FORCED_EROSION)
  })

  it('A-1을 채택하면 비극적 탈출로 끝난다', () => {
    const game = startPhase3({
      humans: 2,
      rng: LOW,
      before: traitorTarget,
    })

    game.send(BROTHER_ROLE.FIRST, vote(PHASE3_CHOICE_ID.BAIT))
    game.send(BROTHER_ROLE.SECOND, vote(PHASE3_CHOICE_ID.BAIT))

    expect(game.state.phase3?.route).toBe(PHASE3_ROUTE.BAIT)
    expect(endingOf(game)).toBe(ENDING_ID.TRAGIC_ESCAPE)
  })

  it('타겟 본인도 투표에 참여한다', () => {
    const game = startPhase3({
      humans: 2,
      rng: LOW,
      before: traitorTarget,
    })

    // 둘째가 타겟이자 배신자다
    expect(game.state.phase3?.targetSeat).toBe(BROTHER_ROLE.SECOND)
    expect(game.send(BROTHER_ROLE.SECOND, vote(PHASE3_CHOICE_ID.BREAK)).rejected).toBe(false)
  })
})

describe('1인 플레이에서 본인이 타겟 (룰북 §14.5)', () => {
  it('A-1이 선택지에서 빠지고 A-2 문장이 바뀐다', () => {
    const game = startPhase3({
      humans: 1,
      rng: LOW,
      before: (state) => {
        state.seats[BROTHER_ROLE.FIRST].erosionPercent = 80
      },
    })

    expect(game.state.phase3?.targetSeat).toBe(BROTHER_ROLE.FIRST)
    expect(game.state.phase3?.soloPlayTargetIsSelf).toBe(true)

    // A-1 투표는 없는 선택지로 거절된다
    expect(game.send(BROTHER_ROLE.FIRST, vote(PHASE3_CHOICE_ID.BAIT)).rejected).toBe(true)
    expect(game.send(BROTHER_ROLE.FIRST, vote(PHASE3_CHOICE_ID.BREAK)).rejected).toBe(false)
  })

  it('봇 2명이 굴리고 본인은 팀 측 주사위가 없어 재굴림을 쓸 수 없다', () => {
    const game = startPhase3({
      humans: 1,
      rng: LOW,
      before: (state) => {
        state.seats[BROTHER_ROLE.FIRST].erosionPercent = 80
      },
    })

    game.send(BROTHER_ROLE.FIRST, vote(PHASE3_CHOICE_ID.BREAK))
    // 타겟(첫째)을 제외한 봇 2명이 팀이다
    expect(game.state.currentJudgment?.teamSeats).toEqual([
      BROTHER_ROLE.SECOND,
      BROTHER_ROLE.THIRD,
    ])
    // 본인은 첫째라 둘째 재굴림 자체가 해당되지 않는다
    expect(game.state.currentJudgment?.contest).toBe(false)
  })

  it('옥비녀는 잠식도가 가장 낮은 봇에게 옮겨가고 기준 4로 판정한다', () => {
    const game = startPhase3({
      humans: 1,
      rng: LOW,
      before: (state) => {
        state.seats[BROTHER_ROLE.FIRST].erosionPercent = 80
        state.seats[BROTHER_ROLE.FIRST].hasJadeHairpin = true
        state.seats[BROTHER_ROLE.SECOND].erosionPercent = 40
        state.seats[BROTHER_ROLE.THIRD].erosionPercent = 10
      },
    })

    expect(game.state.phase3?.jadeHairpinMovedTo).toBe(BROTHER_ROLE.THIRD)
    expect(game.state.currentJudgment?.threshold).toBe(GAME_CONFIG.thresholdBase)
    expect(game.state.currentJudgment?.contest).toBe(false)
  })
})
