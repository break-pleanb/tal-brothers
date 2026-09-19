import { describe, expect, it } from 'vitest'
import { BROTHER_ROLE, GAME_STEP } from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../../src/scenario/gameConfig'
import {
  ALL_SEATS,
  HIGH,
  LOW,
  forceSuccess,
  judgment,
  reroll,
  roll,
  startGame as start,
  useTalisman,
  vote,
  voteAll,
} from '../../support/gameDriver'
import type { Game } from '../../support/gameDriver'

function tutorialTalismanTotal(game: Game): number {
  return ALL_SEATS.reduce(
    (sum, role) => sum + game.state.seats[role].tutorialTalismanCount,
    0,
  )
}

function talismanHolder(game: Game): BrotherRole {
  const found = ALL_SEATS.find((role) => game.state.seats[role].tutorialTalismanCount > 0)
  if (found === undefined) throw new Error('튜토리얼 부적 보유자가 없다')
  return found
}

describe('튜토리얼 부적 (룰북 §9.2)', () => {
  it('T1 진입 시 인간 좌석 1명에게만 지급한다 (봇 제외)', () => {
    for (const humans of [1, 2, 3]) {
      const game = start(humans, LOW)
      expect(game.state.currentEvent?.eventId).toBe('t1')
      expect(tutorialTalismanTotal(game), `인간 ${humans}명`).toBe(1)

      const holder = talismanHolder(game)
      expect(game.state.seats[holder].isBot, `인간 ${humans}명`).toBe(false)
      for (const role of ALL_SEATS) {
        if (game.state.seats[role].isBot) {
          expect(game.state.seats[role].tutorialTalismanCount).toBe(0)
        }
      }
    }
  })

  it('실전 개입 창에서는 실제로 소모된다 (룰북 §12)', () => {
    const game = start(3, LOW)
    const holder = talismanHolder(game)

    game.tickUntil(GAME_STEP.VOTING)
    voteAll(game, 't1-b')
    game.send(BROTHER_ROLE.SECOND, roll)
    expect(judgment(game).succeeded).toBe(false)
    game.tick()
    game.tick()
    expect(game.state.progress.step).toBe(GAME_STEP.INTERVENTION_TALISMAN)

    expect(game.send(holder, useTalisman).rejected).toBe(false)
    expect(game.state.seats[holder].tutorialTalismanCount).toBe(0)
    expect(judgment(game).talismanBonus).toBe(1)
  })

  it('T1이 끝나면 미사용 부적이 소멸한다', () => {
    const game = start(3, LOW)
    expect(tutorialTalismanTotal(game)).toBe(1)

    game.tickUntilEvent('t2-1', GAME_STEP.EVENT_INTRO)
    expect(tutorialTalismanTotal(game)).toBe(0)
    expect(ALL_SEATS.every((role) => game.state.seats[role].talismanCount === 0)).toBe(true)
  })
})

describe('연습 개입 창 (룰북 §12, §19)', () => {
  function toPracticeWindow(game: Game): void {
    game.tickUntil(GAME_STEP.VOTING)
    voteAll(game, 't1-b')
    game.setRng(HIGH)
    game.send(BROTHER_ROLE.SECOND, roll)
    expect(judgment(game).succeeded).toBe(true)
    game.tick()
  }

  it('튜토리얼 판정 성공 시 단일 단계 12초로 열린다', () => {
    const game = start(3, LOW)
    toPracticeWindow(game)

    expect(game.state.progress.step).toBe(GAME_STEP.PRACTICE_INTERVENTION)
    expect(judgment(game).isPractice).toBe(true)
    expect(game.state.progress.stepDeadlineAt).toBe(
      game.now + GAME_CONFIG.practiceInterventionSeconds * 1000,
    )
  })

  it('입력은 설명만 띄우고 부적·능력 횟수·잠식도를 바꾸지 않는다', () => {
    const game = start(3, LOW)
    const holder = talismanHolder(game)
    toPracticeWindow(game)

    for (const [seat, command] of [
      [holder, useTalisman],
      [BROTHER_ROLE.SECOND, reroll],
      [BROTHER_ROLE.FIRST, forceSuccess],
    ] as const) {
      const result = game.send(seat, command)
      expect(result.rejected).toBe(false)
      expect(game.last.cues.some((cue) => cue.kind === 'practiceExplain')).toBe(true)
    }

    expect(game.state.seats[holder].tutorialTalismanCount).toBe(1)
    expect(ALL_SEATS.every((role) => game.state.seats[role].erosionPercent === 0)).toBe(true)
    expect(ALL_SEATS.every((role) => !game.state.seats[role].abilityUsed)).toBe(true)
    expect(judgment(game).talismanBonus).toBe(0)
    expect(judgment(game).forcedSuccess).toBe(false)
    expect(judgment(game).interventions).toEqual([])
  })

  it('12초가 지나면 결과로 넘어간다', () => {
    const game = start(3, LOW)
    toPracticeWindow(game)

    game.tick()
    expect(game.state.progress.step).toBe(GAME_STEP.RESOLUTION)

    // 결과 표시 3초 뒤에 다음 이벤트로 간다 (룰북 §19)
    game.tick()
    expect(game.state.currentEvent?.eventId).toBe('t2-1')
  })
})

describe('튜토리얼 능력 사용 (룰북 §3.5, §12)', () => {
  it('인간 좌석의 재굴림은 횟수를 소모하지 않는다', () => {
    const game = start(3, LOW)
    game.tickUntil(GAME_STEP.VOTING)
    voteAll(game, 't1-b')
    game.send(BROTHER_ROLE.SECOND, roll)
    game.tick()

    expect(game.state.progress.step).toBe(GAME_STEP.INTERVENTION_REROLL)
    expect(game.send(BROTHER_ROLE.SECOND, reroll).rejected).toBe(false)
    expect(game.state.seats[BROTHER_ROLE.SECOND].abilityUsed).toBe(false)
  })

  it('봇 좌석의 재굴림도 횟수를 소모하지 않는다', () => {
    const game = start(1, LOW)
    expect(game.state.seats[BROTHER_ROLE.SECOND].isBot).toBe(true)

    game.tickUntil(GAME_STEP.VOTING)
    game.send(BROTHER_ROLE.FIRST, vote('t1-b'))
    expect(game.state.progress.step).toBe(GAME_STEP.ROLL_REVEAL)

    game.tick()
    // 둘째 봇이 진입 즉시 재굴림하고, 그래도 실패라 부적 단계로 넘어간다
    expect(
      judgment(game).interventions.some(
        (record) => record.kind === 'reroll' && record.seat === BROTHER_ROLE.SECOND,
      ),
    ).toBe(true)
    expect(game.state.seats[BROTHER_ROLE.SECOND].abilityUsed).toBe(false)
  })

  it('강제 성공은 횟수를 소모하지 않지만 +15% 대가는 적용한다', () => {
    const game = start(3, LOW)
    game.tickUntil(GAME_STEP.VOTING)
    voteAll(game, 't1-b')
    game.send(BROTHER_ROLE.SECOND, roll)
    game.tickUntil(GAME_STEP.INTERVENTION_FORCE, 6)

    expect(game.send(BROTHER_ROLE.FIRST, forceSuccess).rejected).toBe(false)

    expect(game.state.seats[BROTHER_ROLE.FIRST].erosionPercent).toBe(
      GAME_CONFIG.forceSuccessCostPercent,
    )
    expect(game.state.seats[BROTHER_ROLE.FIRST].abilityUsed).toBe(false)
  })

  it('판정자가 첫째인 t1-a에서도 첫째 단계를 조기 스킵하지 않는다 (룰북 §12 우선)', () => {
    const game = start(3, LOW)
    game.tickUntil(GAME_STEP.VOTING)
    voteAll(game, 't1-a')
    expect(game.state.currentEvent?.rollerSeat).toBe(BROTHER_ROLE.FIRST)

    game.send(BROTHER_ROLE.FIRST, roll)
    expect(judgment(game).succeeded).toBe(false)
    game.tickUntil(GAME_STEP.INTERVENTION_FORCE, 6)

    expect(game.state.progress.stepDeadlineAt).toBe(
      game.now + GAME_CONFIG.interventionForceSeconds * 1000,
    )
    expect(game.last.cues.some((cue) => cue.kind === 'forceSuccessExplain')).toBe(true)

    // 설명만 띄우고 실제 발동은 거절한다
    const result = game.send(BROTHER_ROLE.FIRST, forceSuccess)
    expect(result.rejected).toBe(true)
    expect(game.state.seats[BROTHER_ROLE.FIRST].erosionPercent).toBe(0)
  })
})

describe('튜토리얼 이벤트 진행 (룰북 §12)', () => {
  it('T2-1은 투표 없이 상황 제시에서 굴림으로 넘어간다', () => {
    const game = start(3, LOW)
    game.tickUntilEvent('t2-1', GAME_STEP.EVENT_INTRO)

    game.tick()
    expect(game.state.progress.step).toBe(GAME_STEP.ROLL_WAIT)
    expect(game.state.currentEvent?.adoptedChoiceId).toBe('t2-1-a')
  })

  it('T1·T2-1 판정 실패에 잠식·시간 페널티가 없다', () => {
    const game = start(3, LOW)
    const clockBefore = game.state.clock.deadlineAt

    game.tickUntilEvent('t2-2', GAME_STEP.EVENT_INTRO)

    expect(ALL_SEATS.every((role) => game.state.seats[role].erosionPercent === 0)).toBe(true)
    expect(game.state.clock.deadlineAt).toBe(clockBefore)
    expect(game.state.teamModifier).toBe(0)
  })
})
