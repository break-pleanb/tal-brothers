import { BROTHER_ROLE, COMMAND_TYPE, GAME_STEP } from 'tal-brothers-shared'
import type { BrotherRole, Command } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../scenario/gameConfig'
import { rollChance } from '../engine/random'
import type { Rng } from '../engine/random'
import { SEAT_ORDER } from '../engine/state/gameState'
import type { GameState } from '../engine/state/gameState'
import { currentScenarioEvent } from '../engine/steps/rollStep'

/**
 * 시뮬레이터의 인간 좌석 정책 (M2 계획 10.3).
 *
 * **게임 규칙이 아니라 시뮬레이터 전용 값이다.** 룰북은 건드리지 않는다.
 *
 * - 확률: 각 행동을 얼마나 자주 하는지
 * - 지연: 단계에 들어간 뒤 **얼마 있다가** 명령을 보내는지.
 *   지연이 없으면 조기 마감이 항상 0초에 끝나 시계 소모가 과소 평가된다 (M1 노트)
 */

export type DelayRange = {
  minSeconds: number
  maxSeconds: number
}

export type HumanPolicyConfig = {
  /** 투표 참여율. 나머지는 기권 (룰북 §8) */
  votePercent: number
  trueSightPercent: number
  healPercent: number
  rollPercent: number
  rerollPercent: number
  talismanPercent: number
  forceSuccessPercent: number
  practicePressPercent: number
  /** 14A 부적 제출 (룰북 §13.5) */
  submitTalismanPercent: number
  /** 보류함을 양도로 처리할 확률. 나머지는 버린다 (M2 계획 10.1) */
  transferOverflowPercent: number

  /** 상황 제시 뒤 토론하다 누르는 시간 */
  voteDelay: DelayRange
  /** 투표 전에 정보를 먼저 확인한다 */
  abilityDelay: DelayRange
  /** 자동 굴림(10초)보다 앞선다 */
  rollDelay: DelayRange
  /** 개입 단계 4초 안에 들어간다 */
  interventionDelay: DelayRange
  /** 보류함 정리 */
  overflowDelay: DelayRange
  /** 14A 제출 창 8초 안에 들어간다 */
  submitDelay: DelayRange
}

export const DEFAULT_HUMAN_POLICY: HumanPolicyConfig = {
  votePercent: 90,
  trueSightPercent: 50,
  healPercent: 40,
  rollPercent: 70,
  rerollPercent: 70,
  talismanPercent: 60,
  forceSuccessPercent: 50,
  practicePressPercent: 50,
  submitTalismanPercent: 60,
  transferOverflowPercent: 50,

  voteDelay: { minSeconds: 15, maxSeconds: 120 },
  abilityDelay: { minSeconds: 5, maxSeconds: 30 },
  rollDelay: { minSeconds: 1, maxSeconds: 6 },
  interventionDelay: { minSeconds: 0.5, maxSeconds: 3 },
  overflowDelay: { minSeconds: 10, maxSeconds: 60 },
  submitDelay: { minSeconds: 1, maxSeconds: 6 },
}

/** 예약된 인간 입력 1건 */
export type PlannedInput = {
  /** 가상 시계 기준 발신 시각 */
  at: number
  seat: BrotherRole
  command: Command
}

/** 범위 안의 지연을 밀리초로 고른다. 0.1초 단위로 굴린다 */
export function pickDelayMs(rng: Rng, range: DelayRange): number {
  const min = Math.round(range.minSeconds * 10)
  const max = Math.round(range.maxSeconds * 10)
  const span = Math.max(1, max - min + 1)
  return (min + rng.nextInt(span)) * 100
}

function humanSeats(state: GameState): BrotherRole[] {
  return SEAT_ORDER.filter((role) => !state.seats[role].isBot)
}

/** 단계 마감을 넘기지 않도록 지연을 자른다 */
function clampToDeadline(state: GameState, now: number, at: number): number {
  const deadline = state.progress.stepDeadlineAt
  if (deadline === null) return at
  const latest = now + Math.max(0, (deadline - now) * 0.8)
  return Math.min(at, latest)
}

/**
 * 이 단계에서 인간 좌석이 보낼 명령을 미리 짠다.
 * 실행은 `playGame`이 가상 시계를 그 시각까지 옮긴 뒤에 한다.
 */
export function planHumanInputs(
  state: GameState,
  rng: Rng,
  now: number,
  policy: HumanPolicyConfig,
): PlannedInput[] {
  const step = state.progress.step
  const planned: PlannedInput[] = []
  const at = (range: DelayRange): number =>
    clampToDeadline(state, now, now + pickDelayMs(rng, range))

  if (step === GAME_STEP.VOTING) {
    const event = currentScenarioEvent(state)
    const third = state.seats[BROTHER_ROLE.THIRD]

    // 절대 시야는 투표 전에 쓴다 (룰북 §3.4)
    if (
      !third.isBot &&
      !(state.currentEvent?.trueSightUsed ?? true) &&
      !third.abilityUsed &&
      rollChance(rng, policy.trueSightPercent)
    ) {
      planned.push({
        at: at(policy.abilityDelay),
        seat: BROTHER_ROLE.THIRD,
        command: { type: COMMAND_TYPE.ABILITY_TRUE_SIGHT },
      })
    }

    for (const role of humanSeats(state)) {
      const seat = state.seats[role]

      // 부적 회복 (룰북 §9.1)
      if (
        seat.talismanCount > 0 &&
        seat.erosionPercent >= GAME_CONFIG.talismanHealPercent &&
        rollChance(rng, policy.healPercent)
      ) {
        planned.push({
          at: at(policy.abilityDelay),
          seat: role,
          command: { type: COMMAND_TYPE.TALISMAN_HEAL },
        })
      }

      // 보류함 정리 — 양도나 버림 (M2 계획 10.1)
      if (seat.talismanOverflow > 0) {
        const receiver = SEAT_ORDER.find(
          (other) => other !== role && state.seats[other].talismanCount < GAME_CONFIG.talismanLimit,
        )
        const transfer = receiver !== undefined && rollChance(rng, policy.transferOverflowPercent)
        planned.push({
          at: at(policy.overflowDelay),
          seat: role,
          command: transfer
            ? { type: COMMAND_TYPE.TALISMAN_TRANSFER, toSeat: receiver }
            : { type: COMMAND_TYPE.TALISMAN_DISCARD },
        })
      }

      // 투표 (룰북 §8)
      if (!rollChance(rng, policy.votePercent)) continue
      const choice = event.choices[rng.nextInt(event.choices.length)]
      if (choice === undefined) continue
      planned.push({
        at: at(policy.voteDelay),
        seat: role,
        command: { type: COMMAND_TYPE.VOTE_SUBMIT, choiceId: choice.id },
      })
    }

    return planned
  }

  if (step === GAME_STEP.P3_VOTING) {
    const event = currentScenarioEvent(state)
    for (const role of humanSeats(state)) {
      if (!rollChance(rng, policy.votePercent)) continue
      const choice = event.choices[rng.nextInt(event.choices.length)]
      if (choice === undefined) continue
      planned.push({
        at: at(policy.voteDelay),
        seat: role,
        command: { type: COMMAND_TYPE.VOTE_SUBMIT, choiceId: choice.id },
      })
    }
    return planned
  }

  if (step === GAME_STEP.ROLL_WAIT) {
    const judgment = state.currentJudgment
    if (judgment === null) return planned

    for (const die of judgment.dice) {
      if (die.value !== null) continue
      if (state.seats[die.seat].isBot) continue
      if (!rollChance(rng, policy.rollPercent)) continue

      planned.push({
        at: at(policy.rollDelay),
        seat: die.seat,
        command: { type: COMMAND_TYPE.ROLL_REQUEST },
      })
    }
    return planned
  }

  if (step === GAME_STEP.INTERVENTION_REROLL) {
    const second = state.seats[BROTHER_ROLE.SECOND]
    if (!second.isBot && !second.abilityUsed && rollChance(rng, policy.rerollPercent)) {
      planned.push({
        at: at(policy.interventionDelay),
        seat: BROTHER_ROLE.SECOND,
        command: { type: COMMAND_TYPE.INTERVENTION_REROLL },
      })
    }
    return planned
  }

  if (step === GAME_STEP.INTERVENTION_TALISMAN) {
    for (const role of humanSeats(state)) {
      const seat = state.seats[role]
      if (seat.talismanCount + seat.tutorialTalismanCount < 1) continue
      if (!rollChance(rng, policy.talismanPercent)) continue

      planned.push({
        at: at(policy.interventionDelay),
        seat: role,
        command: { type: COMMAND_TYPE.INTERVENTION_TALISMAN },
      })
    }
    return planned
  }

  if (step === GAME_STEP.INTERVENTION_FORCE) {
    const first = state.seats[BROTHER_ROLE.FIRST]
    if (!first.isBot && !first.abilityUsed && rollChance(rng, policy.forceSuccessPercent)) {
      planned.push({
        at: at(policy.interventionDelay),
        seat: BROTHER_ROLE.FIRST,
        command: { type: COMMAND_TYPE.INTERVENTION_FORCE_SUCCESS },
      })
    }
    return planned
  }

  if (step === GAME_STEP.TALISMAN_WINDOW) {
    for (const role of humanSeats(state)) {
      if (state.seats[role].talismanCount < 1) continue
      if (!rollChance(rng, policy.submitTalismanPercent)) continue

      planned.push({
        at: at(policy.submitDelay),
        seat: role,
        command: { type: COMMAND_TYPE.TALISMAN_SUBMIT },
      })
    }
    return planned
  }

  if (step === GAME_STEP.PRACTICE_INTERVENTION) {
    const humans = humanSeats(state)
    const seat = humans[rng.nextInt(Math.max(1, humans.length))]
    if (seat !== undefined && rollChance(rng, policy.practicePressPercent)) {
      planned.push({
        at: at(policy.interventionDelay),
        seat,
        command: { type: COMMAND_TYPE.INTERVENTION_TALISMAN },
      })
    }
    return planned
  }

  return planned
}
