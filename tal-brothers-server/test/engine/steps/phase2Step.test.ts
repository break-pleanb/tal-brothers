import { describe, expect, it } from 'vitest'
import {
  BROTHER_ROLE,
  COMMAND_TYPE,
  CUE_KIND,
  GAME_PHASE,
  GAME_STEP,
} from 'tal-brothers-shared'
import type { BrotherRole, Command, GameStep } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../../src/scenario/gameConfig'
import { EFFECT_CATEGORY } from '../../../src/scenario/constants/effectCategory'
import { EFFECT_KIND } from '../../../src/scenario/constants/effectKind'
import { EFFECT_TARGET } from '../../../src/scenario/constants/effectTarget'
import { WHISPER_KIND } from '../../../src/scenario/constants/whisperKind'
import { dispatch, enterStep, finishDispatch } from '../../../src/engine/dispatch'
import { ACTION_KIND, createStepOutput } from '../../../src/engine/engineTypes'
import type { DispatchResult, DispatchSuccess } from '../../../src/engine/engineTypes'
import { createSeededRng } from '../../../src/engine/random'
import type { Rng } from '../../../src/engine/random'
import { applyEffects } from '../../../src/engine/rules/effects'
import { createGame, seatSetupForHumans } from '../../../src/engine/state/createGame'
import { SEAT_ORDER } from '../../../src/engine/state/gameState'
import type { GameState } from '../../../src/engine/state/gameState'

const START = 1_700_000_000_000

/** 항상 최솟값 — 주사위 1, `pickOne`은 첫 항목, 변이는 흉 */
const LOW: Rng = { nextInt: () => 0 }
/** 항상 최댓값 — 주사위 6, `pickOne`은 마지막 항목, 변이는 길 */
const HIGH: Rng = { nextInt: (bound) => bound - 1 }

type Setup = {
  humans?: number
  rng?: Rng
  /** Phase 2 진입 직전 상태를 손본다 */
  before?: (state: GameState) => void
}

/** 새 게임을 만들고 Phase 1을 건너뛴 채 Phase 2 진입 단계부터 돌린다 */
function startPhase2Entry(setup: Setup = {}) {
  const rng = setup.rng ?? LOW
  let now = START
  const created = createGame(
    { roomCode: 'TEST', seats: seatSetupForHumans(setup.humans ?? 3) },
    { now, rng },
  )

  const state = created.state
  // Phase 1은 이 테스트의 관심사가 아니므로 마친 것으로 두고 진입만 재현한다
  state.progress.phase = GAME_PHASE.PHASE_1
  state.currentEvent = null
  state.currentJudgment = null
  setup.before?.(state)

  const out = createStepOutput()
  enterStep(state, GAME_STEP.PHASE2_ENTRY, { now, rng }, out)
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
      if (result.rejected) throw new Error(`타이머 거절: ${result.reason} ${result.detail ?? ''}`)
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
    /** 단계를 직접 다시 밟는다 (테스트가 특정 이벤트부터 시작할 때) */
    enter(step: GameStep): void {
      const out = createStepOutput()
      enterStep(last.state, step, { now, rng }, out)
      last = finishDispatch(last.state, out)
    },
    tickUntil(step: GameStep, limit = 40): void {
      let count = 0
      while (last.state.progress.step !== step) {
        this.tick()
        count += 1
        if (count > limit) throw new Error(`${step}에 도달하지 못했다`)
      }
    },
  }
}

type Game = ReturnType<typeof startPhase2Entry>

/** 특정 Phase 2 이벤트만 순서표에 올려 그 이벤트부터 진행한다 */
function startEvent(eventIds: string[], setup: Setup = {}): Game {
  const game = startPhase2Entry(setup)
  // Phase 2 진입 처리가 끝난 뒤 순서표만 원하는 이벤트로 바꾼다
  game.state.progress.eventOrder = eventIds
  game.state.progress.eventIndex = 0

  game.enter(GAME_STEP.EVENT_INTRO)
  return game
}

const vote = (choiceId: string): Command => ({ type: COMMAND_TYPE.VOTE_SUBMIT, choiceId })

function erosion(game: Game, role: BrotherRole): number {
  return game.state.seats[role].erosionPercent
}

describe('Phase 2 진입 환청 (룰북 §13.1)', () => {
  it('부적 미보유자만 +20%, 보유자는 경고 귓속말만 받는다', () => {
    const game = startPhase2Entry({
      before: (state) => {
        state.seats[BROTHER_ROLE.FIRST].talismanCount = 1
      },
    })

    expect(erosion(game, BROTHER_ROLE.FIRST)).toBe(0)
    // 부적은 소모되지 않는다
    expect(game.state.seats[BROTHER_ROLE.FIRST].talismanCount).toBe(1)
    expect(game.state.seats[BROTHER_ROLE.FIRST].whispers[0]?.kind).toBe(
      WHISPER_KIND.ENTRY_WARNING,
    )

    expect(erosion(game, BROTHER_ROLE.SECOND)).toBe(GAME_CONFIG.phase2EntryNoTalismanPercent)
    expect(erosion(game, BROTHER_ROLE.THIRD)).toBe(GAME_CONFIG.phase2EntryNoTalismanPercent)
    expect(game.state.seats[BROTHER_ROLE.SECOND].whispers).toHaveLength(0)
  })

  it('미보유자 1명당 팀 -1이고 하한 -2를 넘지 않는다 (룰북 §5.5)', () => {
    const one = startPhase2Entry({
      before: (state) => {
        state.seats[BROTHER_ROLE.FIRST].talismanCount = 1
        state.seats[BROTHER_ROLE.SECOND].talismanCount = 1
      },
    })
    expect(one.state.teamModifier).toBe(-1)

    // 전원 미보유 → -3이지만 하한 -2
    const all = startPhase2Entry()
    expect(all.state.teamModifier).toBe(GAME_CONFIG.debuffFloor)
  })

  it('보류함 부적은 보유로 세지 않는다 (M2 계획 10.1)', () => {
    const game = startPhase2Entry({
      before: (state) => {
        state.seats[BROTHER_ROLE.FIRST].talismanOverflow = 1
      },
    })

    expect(erosion(game, BROTHER_ROLE.FIRST)).toBe(GAME_CONFIG.phase2EntryNoTalismanPercent)
  })

  it('슬롯 배치를 확정하고 첫 이벤트(분기)로 이어진다 (룰북 §13.3)', () => {
    const game = startPhase2Entry({ rng: createSeededRng(42) })

    expect(game.state.progress.phase).toBe(GAME_PHASE.PHASE_2)
    expect(game.state.progress.eventOrder).toHaveLength(9)
    expect(game.state.progress.eventOrder[0]).toBe('branch')
    expect(game.state.progress.eventOrder[7]).toBe('p2-15')
    // 타이머 없이 첫 이벤트 상황 제시로 이어진다
    expect(game.state.progress.step).toBe(GAME_STEP.EVENT_INTRO)
    expect(game.state.currentEvent?.eventId).toBe('branch')
  })
})

describe('환경 잠식 (룰북 §4.2)', () => {
  it('랜덤 이벤트가 끝날 때마다 전원 +5%', () => {
    const game = startEvent(['p2-01'], { rng: HIGH })
    const before = SEAT_ORDER.map((role) => erosion(game, role))

    game.tick() // EVENT_INTRO 마감 → VOTING
    game.tickUntil(GAME_STEP.VOTING)
    game.send(BROTHER_ROLE.FIRST, vote('p2-01-c')) // 판정 없는 우회 선택지
    game.send(BROTHER_ROLE.SECOND, vote('p2-01-c'))
    game.send(BROTHER_ROLE.THIRD, vote('p2-01-c'))

    for (const [index, role] of SEAT_ORDER.entries()) {
      expect(erosion(game, role) - (before[index] ?? 0), role).toBe(
        GAME_CONFIG.environmentErosionPercent,
      )
    }
  })

  it('분기에는 적용하지 않는다', () => {
    const game = startEvent(['branch'], { rng: HIGH })
    const before = SEAT_ORDER.map((role) => erosion(game, role))

    game.tick()
    game.tickUntil(GAME_STEP.VOTING)
    game.send(BROTHER_ROLE.FIRST, vote('branch-a'))
    game.send(BROTHER_ROLE.SECOND, vote('branch-a'))
    game.send(BROTHER_ROLE.THIRD, vote('branch-a'))

    for (const [index, role] of SEAT_ORDER.entries()) {
      expect(erosion(game, role), role).toBe(before[index] ?? 0)
    }
  })

  it('판정 실패·성공과 무관하게 한 번만 적용된다', () => {
    // 두 번째 이벤트를 붙여 첫 이벤트가 끝난 시점을 관찰한다
    const game = startEvent(['p2-01', 'p2-02'], { rng: LOW })
    const before = erosion(game, BROTHER_ROLE.SECOND)

    game.tick()
    game.tickUntil(GAME_STEP.VOTING)
    // 주사위 1 + 보정 1 → 흉 변이 기준 5, 실패 경로
    game.send(BROTHER_ROLE.FIRST, vote('p2-01-a'))
    game.send(BROTHER_ROLE.SECOND, vote('p2-01-a'))
    game.send(BROTHER_ROLE.THIRD, vote('p2-01-a'))
    while (game.state.progress.eventIndex === 0) game.tick()

    // 판정자는 둘째가 아니므로(민첩 → 둘째) 실패 페널티와 환경 잠식을 함께 본다
    expect(game.state.currentEvent?.eventId).toBe('p2-02')
    const gained = erosion(game, BROTHER_ROLE.SECOND) - before
    expect(gained).toBeGreaterThanOrEqual(GAME_CONFIG.environmentErosionPercent)
    // 환경 잠식은 이벤트당 1회만 적용된다
    expect(
      game.state.progress.eventIndex === 1 &&
        (game.state.currentEvent?.environmentErosionApplied ?? true),
    ).toBe(false)
  })
})

describe('부적 보유 상한과 보류함 (룰북 §9.1, M2 계획 10.1)', () => {
  it('상한 2를 넘긴 만큼은 인벤토리가 아니라 보류함에 들어간다', () => {
    const game = startPhase2Entry()
    const state = game.state
    state.seats[BROTHER_ROLE.FIRST].talismanCount = 2

    const out = createStepOutput()
    applyEffects(
      state,
      [
        {
          category: EFFECT_CATEGORY.REWARD,
          kind: EFFECT_KIND.TALISMAN,
          target: EFFECT_TARGET.ROLLER,
          count: 2,
        },
      ],
      {
        rollerSeat: BROTHER_ROLE.FIRST,
        coopTopSeat: null,
        submitterSeat: null,
        eventId: 'p2-01',
        nextEventId: null,
      },
      { now: START, rng: LOW },
      out,
    )

    expect(state.seats[BROTHER_ROLE.FIRST].talismanCount).toBe(GAME_CONFIG.talismanLimit)
    expect(state.seats[BROTHER_ROLE.FIRST].talismanOverflow).toBe(2)
  })

  it('양도는 받는 좌석의 상한을 검사한다', () => {
    const game = startEvent(['p2-01'])
    game.tick()
    game.tickUntil(GAME_STEP.VOTING)

    game.state.seats[BROTHER_ROLE.FIRST].talismanOverflow = 1
    game.state.seats[BROTHER_ROLE.SECOND].talismanCount = GAME_CONFIG.talismanLimit

    const full = game.send(BROTHER_ROLE.FIRST, {
      type: COMMAND_TYPE.TALISMAN_TRANSFER,
      toSeat: BROTHER_ROLE.SECOND,
    })
    expect(full.rejected).toBe(true)

    const ok = game.send(BROTHER_ROLE.FIRST, {
      type: COMMAND_TYPE.TALISMAN_TRANSFER,
      toSeat: BROTHER_ROLE.THIRD,
    })
    expect(ok.rejected).toBe(false)
    expect(game.state.seats[BROTHER_ROLE.FIRST].talismanOverflow).toBe(0)
    expect(game.state.seats[BROTHER_ROLE.THIRD].talismanCount).toBe(1)
  })

  it('버림 명령으로 보류함을 비울 수 있다', () => {
    const game = startEvent(['p2-01'])
    game.tick()
    game.tickUntil(GAME_STEP.VOTING)
    game.state.seats[BROTHER_ROLE.THIRD].talismanOverflow = 1

    expect(game.send(BROTHER_ROLE.THIRD, { type: COMMAND_TYPE.TALISMAN_DISCARD }).rejected).toBe(
      false,
    )
    expect(game.state.seats[BROTHER_ROLE.THIRD].talismanOverflow).toBe(0)

    // 보류함이 비면 더 버릴 수 없다
    expect(game.send(BROTHER_ROLE.THIRD, { type: COMMAND_TYPE.TALISMAN_DISCARD }).rejected).toBe(
      true,
    )
  })

  it('투표가 마감되면 남은 보류함 부적을 자동으로 버린다', () => {
    const game = startEvent(['p2-01'])
    game.tick()
    game.tickUntil(GAME_STEP.VOTING)
    game.state.seats[BROTHER_ROLE.FIRST].talismanOverflow = 2

    game.send(BROTHER_ROLE.FIRST, vote('p2-01-c'))
    game.send(BROTHER_ROLE.SECOND, vote('p2-01-c'))
    game.send(BROTHER_ROLE.THIRD, vote('p2-01-c'))

    expect(game.state.seats[BROTHER_ROLE.FIRST].talismanOverflow).toBe(0)
  })

  it('보류함 부적은 판정 보정에도 회복에도 쓸 수 없다', () => {
    const game = startEvent(['p2-01'])
    game.tick()
    game.tickUntil(GAME_STEP.VOTING)
    game.state.seats[BROTHER_ROLE.FIRST].talismanCount = 0
    game.state.seats[BROTHER_ROLE.FIRST].talismanOverflow = 2
    game.state.seats[BROTHER_ROLE.FIRST].erosionPercent = 40

    const heal = game.send(BROTHER_ROLE.FIRST, { type: COMMAND_TYPE.TALISMAN_HEAL })
    expect(heal.rejected).toBe(true)
    expect(game.state.seats[BROTHER_ROLE.FIRST].erosionPercent).toBe(40)
  })
})

describe('잠식 티어 효과와 13번 발목 대상 (룰북 §4.3, §13.5)', () => {
  it('60% 이상 좌석에는 가짜 라벨이 확정 저장된다', () => {
    const game = startEvent(['p2-01'], {
      rng: LOW,
      before: (state) => {
        state.seats[BROTHER_ROLE.FIRST].erosionPercent = 60
      },
    })

    const labels = game.state.currentEvent?.fakeLabels[BROTHER_ROLE.FIRST]
    expect(labels).toBeDefined()
    expect(Object.keys(labels ?? {})).toEqual(Object.keys(game.state.currentEvent?.variants ?? {}))
    // 각 라벨은 실제 변이와 다르다 (M2 계획 10.2)
    for (const [choiceId, fake] of Object.entries(labels ?? {})) {
      expect(fake, choiceId).not.toBe(game.state.currentEvent?.variants[choiceId])
    }
    // 0~29% 좌석에는 만들지 않는다
    expect(game.state.currentEvent?.fakeLabels[BROTHER_ROLE.THIRD]).toBeUndefined()
  })

  it('30% 이상 좌석은 랜덤 이벤트 시작 시 티어 환청을 받는다', () => {
    const game = startEvent(['p2-01'], {
      rng: LOW,
      before: (state) => {
        state.seats[BROTHER_ROLE.SECOND].erosionPercent = 60
      },
    })

    const whispers = game.state.seats[BROTHER_ROLE.SECOND].whispers
    expect(whispers.some((whisper) => whisper.kind === WHISPER_KIND.TIER_HALLUCINATION)).toBe(true)
    // 환청은 좌석당 이벤트당 1건이다 (M2 계획 10절 5번)
    expect(
      whispers.filter((whisper) => whisper.kind === WHISPER_KIND.TIER_HALLUCINATION),
    ).toHaveLength(1)
  })

  it('가짜 붉은 메시지는 진짜 전환과 같은 cue 형식을 쓴다 (룰북 §10.1)', () => {
    const game = startEvent(['p2-01'], {
      rng: LOW,
      before: (state) => {
        state.seats[BROTHER_ROLE.FIRST].erosionPercent = 60
      },
    })

    const red = game.last.cues.filter((cue) => cue.kind === CUE_KIND.RED_MESSAGE)
    expect(red.length).toBeGreaterThan(0)
    expect(red[0]?.data).toEqual({ durationSeconds: GAME_CONFIG.redMessageSeconds })
    // 배신자가 아닌데도 같은 메시지를 받는다
    expect(game.state.seats[BROTHER_ROLE.FIRST].isTraitor).toBe(false)
  })

  it('13번은 무작위 형제 1명을 지목해 Display에 공개한다', () => {
    const game = startEvent(['p2-13'], { rng: LOW })

    const grabbed = game.state.currentEvent?.grabbedSeat
    expect(grabbed).not.toBeNull()
    expect(SEAT_ORDER).toContain(grabbed)
    expect(game.state.notices.some((notice) => notice.kind === 'seatGrabbed')).toBe(true)
    // 연출 전용이라 판정자와 무관하다 (M2 계획 10절 8번)
    expect(game.state.currentEvent?.rollerSeat).toBeNull()
  })
})

describe('전원 회복과 배신자 (룰북 §4.4, §13.4)', () => {
  it('"전원" 회복은 배신자를 건너뛴다', () => {
    const game = startPhase2Entry()
    const state = game.state
    state.seats[BROTHER_ROLE.FIRST].isTraitor = true
    state.seats[BROTHER_ROLE.FIRST].erosionPercent = 100
    state.seats[BROTHER_ROLE.SECOND].erosionPercent = 50

    applyEffects(
      state,
      [
        {
          category: EFFECT_CATEGORY.REWARD,
          kind: EFFECT_KIND.EROSION,
          target: EFFECT_TARGET.ALL,
          deltaPercent: -10,
        },
      ],
      {
        rollerSeat: BROTHER_ROLE.SECOND,
        coopTopSeat: null,
        submitterSeat: null,
        eventId: 'p2-06',
        nextEventId: null,
      },
      { now: START, rng: LOW },
      createStepOutput(),
    )

    expect(state.seats[BROTHER_ROLE.FIRST].erosionPercent).toBe(100)
    expect(state.seats[BROTHER_ROLE.SECOND].erosionPercent).toBe(40)
  })
})
