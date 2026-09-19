import { describe, expect, it } from 'vitest'
import { BROTHER_ROLE, GAME_PHASE, GAME_STEP, REJECTION_REASON } from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../../src/scenario/gameConfig'
import { canForceSuccess } from '../../../src/engine/steps/interventionStep'
import { coopTopSeat, judgmentFinalValue } from '../../../src/engine/steps/rollStep'
import {
  ALL_SEATS,
  HIGH,
  LOW,
  diceRng,
  forceSuccess,
  judgment,
  reroll,
  roll,
  startGame as start,
  useTalisman,
  voteAll,
} from '../../support/gameDriver'
import type { Game } from '../../support/gameDriver'

/** t1-b(판정자 둘째)를 실패시키고 개입 창 1단계까지 간다 */
function failTutorialSolo(game: Game): void {
  game.tickUntil(GAME_STEP.VOTING)
  voteAll(game, 't1-b')
  game.send(BROTHER_ROLE.SECOND, roll)
  expect(judgment(game).succeeded).toBe(false)
  game.tick()
}

/** 이장 이벤트의 선택지를 실패시키고 개입 창 1단계까지 간다 */
function failChief(game: Game, choiceId: string, roller: BrotherRole): void {
  game.tickUntilEvent('villageChief', GAME_STEP.VOTING)
  voteAll(game, choiceId)
  game.send(roller, roll)
  expect(judgment(game).succeeded).toBe(false)
  game.tick()
}

describe('개입 창 열림 조건 (룰북 §7.1)', () => {
  it('공개 판정 실패 시에만 열린다', () => {
    const game = start(3, LOW)
    failTutorialSolo(game)
    expect(game.state.progress.step).toBe(GAME_STEP.INTERVENTION_REROLL)
  })

  it('튜토리얼 성공은 연습 창으로, 본게임 성공은 결과로 간다', () => {
    const tutorial = start(3, LOW)
    tutorial.tickUntil(GAME_STEP.VOTING)
    voteAll(tutorial, 't1-b')
    tutorial.setRng(HIGH)
    tutorial.send(BROTHER_ROLE.SECOND, roll)
    expect(judgment(tutorial).succeeded).toBe(true)
    tutorial.tick()
    expect(tutorial.state.progress.step).toBe(GAME_STEP.PRACTICE_INTERVENTION)

    const chief = start(3, LOW)
    chief.tickUntilEvent('villageChief', GAME_STEP.VOTING)
    voteAll(chief, 'chief-a')
    chief.setRng(HIGH)
    chief.send(BROTHER_ROLE.SECOND, roll)
    expect(judgment(chief).succeeded).toBe(true)
    chief.tick()
    expect(chief.state.progress.phase).toBe(GAME_PHASE.PHASE_2)
  })
})

describe('개입 창 순서와 시간 (룰북 §7.2, §7.3, §19)', () => {
  it('둘째 → 부적 → 첫째 순서로 각 4초를 쓴다', () => {
    const game = start(3, LOW)
    failTutorialSolo(game)

    expect(game.state.progress.step).toBe(GAME_STEP.INTERVENTION_REROLL)
    expect(game.state.progress.stepDeadlineAt).toBe(
      game.now + GAME_CONFIG.interventionRerollSeconds * 1000,
    )

    game.tick()
    expect(game.state.progress.step).toBe(GAME_STEP.INTERVENTION_TALISMAN)
    expect(game.state.progress.stepDeadlineAt).toBe(
      game.now + GAME_CONFIG.interventionTalismanSeconds * 1000,
    )
    // 봇 판단용 중간 타이머가 마감 1초 전에 걸린다 (룰북 §11)
    expect(game.last.nextDeadline?.at).toBe(
      game.now + (GAME_CONFIG.interventionTalismanSeconds - GAME_CONFIG.botTalismanDelaySeconds) * 1000,
    )

    game.tick()
    expect(game.state.progress.step).toBe(GAME_STEP.INTERVENTION_TALISMAN)

    game.tick()
    expect(game.state.progress.step).toBe(GAME_STEP.INTERVENTION_FORCE)
    expect(game.state.progress.stepDeadlineAt).toBe(
      game.now + GAME_CONFIG.interventionForceSeconds * 1000,
    )
  })

  it('개입으로 성공이 되면 창을 즉시 종료한다', () => {
    const game = start(3, LOW)
    failTutorialSolo(game)

    game.setRng(HIGH)
    expect(game.send(BROTHER_ROLE.SECOND, reroll).rejected).toBe(false)

    // 성공으로 바뀌면 남은 단계를 건너뛰고 결과로 간다 (§7.2가 §12의 연습 창보다 우선)
    expect(game.state.progress.step).toBe(GAME_STEP.EVENT_INTRO)
    expect(game.state.currentEvent?.eventId).toBe('t2-1')
  })

  it('둘째가 능력을 이미 썼으면 1단계를 조기 스킵한다', () => {
    const game = start(3, LOW)
    game.tickUntilEvent('villageChief', GAME_STEP.VOTING)
    voteAll(game, 'chief-a')
    game.send(BROTHER_ROLE.SECOND, roll)
    game.state.seats[BROTHER_ROLE.SECOND].abilityUsed = true

    game.tick()
    expect(game.state.progress.step).toBe(GAME_STEP.INTERVENTION_TALISMAN)
  })

  it('부적 단계는 보유자가 없어도 스킵하지 않고 4초 대기한다', () => {
    const game = start(3, LOW)
    failChief(game, 'chief-a', BROTHER_ROLE.SECOND)
    game.tick()

    expect(game.state.progress.step).toBe(GAME_STEP.INTERVENTION_TALISMAN)
    expect(ALL_SEATS.every((role) => game.state.seats[role].talismanCount === 0)).toBe(true)
    expect(game.state.progress.stepDeadlineAt).toBe(
      game.now + GAME_CONFIG.interventionTalismanSeconds * 1000,
    )
  })

  it('둘째 재굴림은 둘째만 쓸 수 있다', () => {
    const game = start(3, LOW)
    failTutorialSolo(game)

    const result = game.send(BROTHER_ROLE.FIRST, reroll)
    expect(result.rejected && result.reason).toBe(REJECTION_REASON.WRONG_SEAT)
  })
})

describe('부적 사용 (룰북 §7.4)', () => {
  function toTalismanStep(game: Game): void {
    failChief(game, 'chief-b', BROTHER_ROLE.THIRD)
    game.tick()
    expect(game.state.progress.step).toBe(GAME_STEP.INTERVENTION_TALISMAN)
  }

  it('판정당 1개만 적용되고, 적용되지 않은 사람의 부적은 소모되지 않는다', () => {
    const game = start(3, LOW)
    toTalismanStep(game)
    game.state.seats[BROTHER_ROLE.FIRST].talismanCount = 1
    game.state.seats[BROTHER_ROLE.SECOND].talismanCount = 1

    expect(game.send(BROTHER_ROLE.FIRST, useTalisman).rejected).toBe(false)
    expect(game.state.seats[BROTHER_ROLE.FIRST].talismanCount).toBe(0)

    // 두 번째 입력은 적용되지 않고 부적도 그대로다
    const second = game.send(BROTHER_ROLE.SECOND, useTalisman)
    expect(second.rejected).toBe(true)
    expect(game.state.seats[BROTHER_ROLE.SECOND].talismanCount).toBe(1)
  })

  it('같은 단계에서 두 번째 입력은 선착순 규칙으로 거절된다', () => {
    const game = start(3, LOW)
    toTalismanStep(game)
    game.state.seats[BROTHER_ROLE.SECOND].talismanCount = 1
    // 먼저 도달한 1명이 이미 적용된 상태
    judgment(game).talismanUsedThisJudgment = true

    const result = game.send(BROTHER_ROLE.SECOND, useTalisman)
    expect(result.rejected && result.reason).toBe(REJECTION_REASON.NOT_ALLOWED)
    expect(game.state.seats[BROTHER_ROLE.SECOND].talismanCount).toBe(1)
  })

  it('부적이 없으면 거절된다', () => {
    const game = start(3, LOW)
    toTalismanStep(game)

    const result = game.send(BROTHER_ROLE.FIRST, useTalisman)
    expect(result.rejected && result.reason).toBe(REJECTION_REASON.NOT_ALLOWED)
  })

  it('누구의 판정에든 쓸 수 있다', () => {
    const game = start(3, LOW)
    toTalismanStep(game)
    expect(game.state.currentEvent?.rollerSeat).toBe(BROTHER_ROLE.THIRD)

    game.state.seats[BROTHER_ROLE.FIRST].talismanCount = 1
    expect(game.send(BROTHER_ROLE.FIRST, useTalisman).rejected).toBe(false)
    expect(judgment(game).talismanBonus).toBe(1)
    expect(game.state.seats[BROTHER_ROLE.FIRST].talismanCount).toBe(0)
  })

  it('협동 판정에서는 최종 최고값 주사위 기준으로 +1이 걸린다 (룰북 §5.3, 계획 7절 8번)', () => {
    const game = start(3, LOW)
    game.tickUntilEvent('t2-1', GAME_STEP.ROLL_WAIT)

    game.setRng(diceRng(1))
    game.send(BROTHER_ROLE.FIRST, roll)
    game.setRng(diceRng(3))
    game.send(BROTHER_ROLE.SECOND, roll)
    game.setRng(diceRng(1))
    game.send(BROTHER_ROLE.THIRD, roll)

    expect(judgment(game).dice.map((die) => die.value)).toEqual([1, 3, 1])
    expect(judgment(game).succeeded).toBe(false)

    game.tick()
    game.tick()
    expect(game.state.progress.step).toBe(GAME_STEP.INTERVENTION_TALISMAN)

    game.state.seats[BROTHER_ROLE.FIRST].talismanCount = 1
    game.send(BROTHER_ROLE.FIRST, useTalisman)

    const result = judgment(game)
    // 주사위 순위는 그대로고 최종값만 1 오른다 → 보상 수령자는 최고값 주사위의 주인
    expect(result.dice.map((die) => die.value)).toEqual([1, 3, 1])
    expect(result.talismanBonus).toBe(1)
    expect(judgmentFinalValue(result)).toBe(4)
    expect(coopTopSeat(result, { now: game.now, rng: LOW })).toBe(BROTHER_ROLE.SECOND)
  })
})

describe('강제 성공 (룰북 §3.2)', () => {
  function toForceStep(game: Game, choiceId: string, roller: BrotherRole): void {
    failChief(game, choiceId, roller)
    game.tick()
    game.tick()
    game.tick()
  }

  it('첫째 잠식 +15%와 함께 결과를 성공으로 바꾼다', () => {
    const game = start(3, LOW)
    toForceStep(game, 'chief-b', BROTHER_ROLE.THIRD)
    expect(game.state.progress.step).toBe(GAME_STEP.INTERVENTION_FORCE)

    expect(game.send(BROTHER_ROLE.FIRST, forceSuccess).rejected).toBe(false)
    expect(game.state.seats[BROTHER_ROLE.FIRST].abilityUsed).toBe(true)
    expect(game.state.progress.phase).toBe(GAME_PHASE.PHASE_2)

    // 이장이 Phase 1 마지막 이벤트라 결과 적용에 Phase 2 진입 환청 +20%가 이어진다 (룰북 §13.1).
    // 부적을 아무도 들고 있지 않으므로 세 좌석 모두 +20%다
    const entry = GAME_CONFIG.phase2EntryNoTalismanPercent
    expect(game.state.seats[BROTHER_ROLE.FIRST].erosionPercent).toBe(
      GAME_CONFIG.forceSuccessCostPercent + entry,
    )

    // 강제 성공은 보상을 제거하고 부작용만 남긴다 (이장 B: 부적 없음, 판정자 +5%)
    expect(game.state.seats[BROTHER_ROLE.THIRD].talismanCount).toBe(0)
    expect(game.state.seats[BROTHER_ROLE.THIRD].erosionPercent).toBe(15 + entry)
  })

  it('첫째만 쓸 수 있다', () => {
    const game = start(3, LOW)
    toForceStep(game, 'chief-b', BROTHER_ROLE.THIRD)

    const result = game.send(BROTHER_ROLE.SECOND, forceSuccess)
    expect(result.rejected && result.reason).toBe(REJECTION_REASON.WRONG_SEAT)
  })

  it('본인 판정에는 쓸 수 없어 단계를 조기 스킵한다', () => {
    const game = start(3, LOW)
    failChief(game, 'chief-c', BROTHER_ROLE.FIRST)
    expect(game.state.currentEvent?.rollerSeat).toBe(BROTHER_ROLE.FIRST)
    expect(canForceSuccess(game.state)).toBe(false)

    game.tick()
    game.tick()
    game.tick()
    // 첫째 단계를 건너뛰고 결과로 간다 (본게임이므로 설명 표시 없음)
    expect(game.state.progress.phase).toBe(GAME_PHASE.PHASE_2)
  })

  it('비공개 판정에는 쓸 수 없다', () => {
    const game = start(3, LOW)
    game.tickUntilEvent('t2-2', GAME_STEP.VOTING)
    voteAll(game, 't2-2-a')
    game.send(BROTHER_ROLE.THIRD, roll)

    expect(game.state.progress.step).toBe(GAME_STEP.ROLL_REVEAL)
    expect(canForceSuccess(game.state)).toBe(false)
  })

  it('능력을 이미 썼으면 쓸 수 없다', () => {
    const game = start(3, LOW)
    failChief(game, 'chief-b', BROTHER_ROLE.THIRD)
    game.state.seats[BROTHER_ROLE.FIRST].abilityUsed = true
    expect(canForceSuccess(game.state)).toBe(false)
  })
})

describe('협동 판정 재굴림 (룰북 §3.3)', () => {
  it('본인 주사위 1개만 다시 굴린다', () => {
    const game = start(3, LOW)
    game.tickUntilEvent('t2-1', GAME_STEP.ROLL_WAIT)
    for (const seat of ALL_SEATS) game.send(seat, roll)
    expect(judgment(game).dice.map((die) => die.value)).toEqual([1, 1, 1])

    game.tick()
    expect(game.state.progress.step).toBe(GAME_STEP.INTERVENTION_REROLL)

    // 4는 협동 기준 5에 못 미쳐 창이 계속 열려 있고, 재굴림 대상만 바뀐 것을 확인할 수 있다
    game.setRng(diceRng(4))
    expect(game.send(BROTHER_ROLE.SECOND, reroll).rejected).toBe(false)
    expect(judgment(game).dice.map((die) => die.value)).toEqual([1, 4, 1])
    expect(game.state.progress.step).toBe(GAME_STEP.INTERVENTION_TALISMAN)
  })
})
