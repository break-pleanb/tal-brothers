import { COMMAND_TYPE, CUE_KIND, GAME_STEP, JUDGMENT_KIND } from 'tal-brothers-shared'
import type { Attribute, BrotherRole } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'
import { findPhase1Event } from '../../scenario/phase1Events'
import { hasJudgment } from '../../scenario/scenarioTypes'
import type { Choice, JudgmentChoice, ScenarioEvent } from '../../scenario/scenarioTypes'
import { botRollOwnDice } from '../bots/botPolicy'
import type { StepHandler } from '../dispatch'
import { CUE_AUDIENCE, LOG_CODE, REJECTION_REASON, reject } from '../engineTypes'
import type { EngineContext, Rejection, StepOutput } from '../engineTypes'
import { rollD6 } from '../random'
import { roleBonusFor, rollerSeatFor } from '../rules/modifiers'
import { applyVariantToChoice, variantOf } from '../rules/variant'
import { SEAT_ORDER } from '../state/gameState'
import type { GameState, JudgmentState } from '../state/gameState'

/**
 * 굴림 대기와 판정 연출 (룰북 §5, 아키텍처 §8).
 * 다른 단계 처리기도 쓰는 판정 계산 헬퍼를 함께 둔다.
 */

/** 진행 중인 이벤트의 시나리오 데이터 */
export function currentScenarioEvent(state: GameState): ScenarioEvent {
  const eventId = state.currentEvent?.eventId
  if (eventId === undefined) throw new Error('현재 이벤트가 없다')
  const event = findPhase1Event(eventId)
  if (event === undefined) throw new Error(`시나리오에 없는 이벤트다: ${eventId}`)
  return event
}

/** 채택된 선택지에 확정된 변이를 적용한 사본 (룰북 §6.2) */
export function adoptedChoice(state: GameState): Choice {
  const current = state.currentEvent
  if (current === null || current.adoptedChoiceId === null) {
    throw new Error('채택된 선택지가 없다')
  }

  const raw = currentScenarioEvent(state).choices.find(
    (choice) => choice.id === current.adoptedChoiceId,
  )
  if (raw === undefined) throw new Error(`선택지를 찾지 못했다: ${current.adoptedChoiceId}`)

  return applyVariantToChoice(raw, variantOf(current.variants, raw.id))
}

/**
 * 선택지를 채택하고 판정자를 확정한다 (룰북 §3.1).
 * 투표 마감과 투표 생략 이벤트가 같은 경로를 쓴다.
 */
export function adoptChoice(draft: GameState, choiceId: string): Choice {
  const current = draft.currentEvent
  if (current === null) throw new Error('현재 이벤트가 없다')

  current.adoptedChoiceId = choiceId
  const choice = adoptedChoice(draft)

  if (!hasJudgment(choice)) {
    current.rollerSeat = null
    return choice
  }

  const attribute = judgmentAttribute(choice)
  current.rollerSeat = attribute === null ? null : rollerSeatFor(attribute)
  return choice
}

export function adoptedJudgmentChoice(state: GameState): JudgmentChoice {
  const choice = adoptedChoice(state)
  if (!hasJudgment(choice)) throw new Error('판정 없는 선택지다')
  return choice
}

/** 판정 사양의 속성. 협동 판정은 없다 */
export function judgmentAttribute(choice: JudgmentChoice): Attribute | null {
  return choice.judgment.kind === JUDGMENT_KIND.COOP ? null : choice.judgment.attribute
}

/** 굴려서 나온 주사위 값. 협동은 최고값 (룰북 §5.3) */
export function baseDiceValue(judgment: JudgmentState): number {
  const values = judgment.dice
    .map((die) => die.value)
    .filter((value): value is number => value !== null)
  if (values.length === 0) return 0
  return judgment.kind === JUDGMENT_KIND.COOP ? Math.max(...values) : (values[0] as number)
}

/** 최종값 = D6 + 직업 보정 + 버프/디버프 + 부적 (룰북 §5.1) */
export function judgmentFinalValue(judgment: JudgmentState): number {
  return (
    baseDiceValue(judgment) +
    judgment.roleBonus +
    judgment.teamModifierApplied +
    judgment.talismanBonus
  )
}

/** 성패를 다시 계산한다. 강제 성공은 계산을 덮어쓴다 (룰북 §3.2) */
export function evaluateJudgment(judgment: JudgmentState): boolean {
  if (judgment.forcedSuccess) return true
  return judgmentFinalValue(judgment) >= judgment.threshold
}

/**
 * 협동 판정의 보상 수령자 — 최종 최고값 주사위의 주인 (룰북 §5.3).
 * 부적 +1은 최고값 주사위에 걸리므로 순위를 바꾸지 않는다. 동점이면 랜덤이다.
 */
export function coopTopSeat(judgment: JudgmentState, context: EngineContext): BrotherRole | null {
  if (judgment.kind !== JUDGMENT_KIND.COOP) return null

  const top = baseDiceValue(judgment)
  const owners = judgment.dice
    .filter((die) => die.value === top)
    .map((die) => die.seat)
  if (owners.length === 0) return null
  if (owners.length === 1) return owners[0] as BrotherRole
  return owners[context.rng.nextInt(owners.length)] as BrotherRole
}

function requireJudgment(state: GameState): JudgmentState {
  if (state.currentJudgment === null) throw new Error('진행 중인 판정이 없다')
  return state.currentJudgment
}

/** 아직 굴리지 않은 주사위를 모두 굴린다 (아키텍처 §8의 10초 자동 굴림) */
function rollRemaining(judgment: JudgmentState, context: EngineContext, out: StepOutput): void {
  for (const die of judgment.dice) {
    if (die.value !== null) continue
    die.value = rollD6(context.rng)
    out.logs.push({
      at: context.now,
      code: LOG_CODE.DICE_ROLLED,
      message: `${die.seat} 자동 굴림 ${die.value}`,
    })
  }
}

function allDiceRolled(judgment: JudgmentState): boolean {
  return judgment.dice.every((die) => die.value !== null)
}

export const ROLL_WAIT_HANDLER: StepHandler = {
  enter(draft, context, out) {
    const choice = adoptedJudgmentChoice(draft)
    const kind = choice.judgment.kind
    const roller = draft.currentEvent?.rollerSeat ?? null

    draft.currentJudgment = {
      kind,
      threshold: choice.judgment.threshold,
      dice:
        kind === JUDGMENT_KIND.COOP
          ? SEAT_ORDER.map((seat) => ({ seat, value: null }))
          : [{ seat: rollerOrThrow(roller), value: null }],
      roleBonus: roleBonusFor(kind, judgmentAttribute(choice), roller),
      // 대기 중인 팀 플래그를 이 판정에 적용한다. 소멸은 RESOLUTION에서 (룰북 §5.5)
      teamModifierApplied: draft.teamModifier,
      talismanBonus: 0,
      succeeded: null,
      forcedSuccess: false,
      isPractice: false,
      talismanUsedThisJudgment: false,
      botTalismanDecided: false,
      interventions: [],
    }

    draft.progress.stepDeadlineAt = context.now + GAME_CONFIG.autoRollSeconds * 1000

    // 봇 주사위는 진입 즉시 (아키텍처 §8)
    botRollOwnDice(draft, context, out)

    if (allDiceRolled(draft.currentJudgment)) {
      out.next = GAME_STEP.ROLL_REVEAL
    }
  },

  command(draft, context, out, seat, command): Rejection | undefined {
    if (command.type !== COMMAND_TYPE.ROLL_REQUEST) {
      return reject(REJECTION_REASON.WRONG_STEP, command.type)
    }

    const judgment = requireJudgment(draft)
    const die = judgment.dice.find((candidate) => candidate.seat === seat)
    if (die === undefined) {
      return reject(REJECTION_REASON.WRONG_SEAT, '이 판정에서 굴릴 주사위가 없다')
    }
    if (die.value !== null) {
      return reject(REJECTION_REASON.NOT_ALLOWED, '이미 굴렸다')
    }

    die.value = rollD6(context.rng)
    out.logs.push({
      at: context.now,
      code: LOG_CODE.DICE_ROLLED,
      message: `${seat} 굴림 ${die.value}`,
    })

    if (allDiceRolled(judgment)) {
      out.next = GAME_STEP.ROLL_REVEAL
    }
    return undefined
  },

  timeout(draft, context, out) {
    rollRemaining(requireJudgment(draft), context, out)
    out.next = GAME_STEP.ROLL_REVEAL
  },
}

function rollerOrThrow(roller: BrotherRole | null): BrotherRole {
  if (roller === null) throw new Error('개인·비공개 판정에 판정자가 없다')
  return roller
}

export const ROLL_REVEAL_HANDLER: StepHandler = {
  enter(draft, context, out) {
    const judgment = requireJudgment(draft)
    judgment.succeeded = evaluateJudgment(judgment)
    draft.progress.stepDeadlineAt = context.now + GAME_CONFIG.rollRevealSeconds * 1000

    const hidden = judgment.kind === JUDGMENT_KIND.HIDDEN
    if (hidden) {
      // 비공개 판정은 판정자에게도 결과를 공개하지 않는다 (룰북 §5.4)
      out.cues.push({
        kind: CUE_KIND.HIDDEN_JUDGMENT_DONE,
        audience: CUE_AUDIENCE.DISPLAY,
        text: '판정 완료',
      })
    } else {
      out.cues.push({
        kind: CUE_KIND.DICE_ROLLED,
        audience: CUE_AUDIENCE.DISPLAY,
        text: judgment.dice
          .map((die) => `${die.seat} ${die.value ?? '-'}`)
          .join(' · '),
      })
      out.cues.push({
        kind: CUE_KIND.JUDGMENT_RESULT,
        audience: CUE_AUDIENCE.DISPLAY,
        text: `최종값 ${judgmentFinalValue(judgment)} / 기준 ${judgment.threshold} — ${
          judgment.succeeded ? '성공' : '실패'
        }`,
      })
    }

    out.logs.push({
      at: context.now,
      code: LOG_CODE.JUDGMENT_RESOLVED,
      message: `${judgment.kind} 판정 최종값 ${judgmentFinalValue(judgment)} 기준 ${
        judgment.threshold
      } → ${judgment.succeeded ? '성공' : '실패'}`,
    })
  },

  timeout(draft, _context, out) {
    const judgment = requireJudgment(draft)

    // 비공개 판정은 개입 창 없이 결과로 간다 (룰북 §5.4, §7.1)
    if (judgment.kind === JUDGMENT_KIND.HIDDEN) {
      out.next = GAME_STEP.RESOLUTION
      return
    }

    if (judgment.succeeded === true) {
      // 튜토리얼 성공은 연습 개입 창 (룰북 §12)
      out.next = currentScenarioEvent(draft).isTutorial
        ? GAME_STEP.PRACTICE_INTERVENTION
        : GAME_STEP.RESOLUTION
      return
    }

    // 공개 판정 실패 → 개입 창 1단계 (룰북 §7.1)
    out.next = GAME_STEP.INTERVENTION_REROLL
  },
}
