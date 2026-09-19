import {
  COMMAND_TYPE,
  CUE_KIND,
  GAME_STEP,
  JUDGMENT_KIND,
  PHASE3_ROUTE,
  REJECTION_REASON,
} from 'tal-brothers-shared'
import type { Attribute, BrotherRole, GameStep } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'
import { CONTEST_TEAM_DICE } from '../../scenario/scenarioTypes'
import type { ContestJudgmentSpec } from '../../scenario/scenarioTypes'
import { findPhase1Event } from '../../scenario/phase1Events'
import { findPhase2Event } from '../../scenario/phase2Events'
import { PHASE3_EVENT_ID, buildPhase3Event } from '../../scenario/phase3Scene'
import { hasAttribute, hasJudgment, isRollJudgment } from '../../scenario/scenarioTypes'
import type { Choice, JudgmentChoice, ScenarioEvent } from '../../scenario/scenarioTypes'
import { botRollOwnDice } from '../bots/botPolicy'
import type { StepHandler } from '../dispatch'
import { CUE_AUDIENCE, LOG_CODE, reject } from '../engineTypes'
import type { EngineContext, Rejection, StepOutput } from '../engineTypes'
import { rollD6 } from '../random'
import { roleBonusFor, rollerSeatFor } from '../rules/modifiers'
import { jadeHairpinHolder } from '../rules/target'
import { applyVariantToChoice, variantOf } from '../rules/variant'
import { SEAT_ORDER } from '../state/gameState'
import type { DiceRoll, GameState, JudgmentState } from '../state/gameState'

/**
 * 굴림 대기와 판정 연출 (룰북 §5, 아키텍처 §8).
 * 다른 단계 처리기도 쓰는 판정 계산 헬퍼를 함께 둔다.
 */

/**
 * 이벤트 id로 시나리오를 찾는다 (룰북 §12, §13, §14).
 * Phase 3 장면은 루트와 1인 플레이 여부에 따라 선택지가 달라지므로 그때그때 구성한다 (룰북 §14.5).
 */
export function findScenarioEvent(state: GameState, eventId: string): ScenarioEvent | undefined {
  if (eventId === PHASE3_EVENT_ID) {
    return buildPhase3Event({
      purifyRoute: state.phase3?.route === PHASE3_ROUTE.PURIFY,
      soloTargetIsSelf: state.phase3?.soloPlayTargetIsSelf ?? false,
    })
  }
  return findPhase1Event(eventId) ?? findPhase2Event(eventId)
}

/** 순서표의 n번째 이벤트 */
export function scenarioEventAt(state: GameState, index: number): ScenarioEvent {
  const eventId = state.progress.eventOrder[index]
  if (eventId === undefined) throw new Error(`이벤트 순서표 밖이다: ${index}`)
  const event = findScenarioEvent(state, eventId)
  if (event === undefined) throw new Error(`시나리오에 없는 이벤트다: ${eventId}`)
  return event
}

/** 진행 중인 이벤트의 시나리오 데이터 */
export function currentScenarioEvent(state: GameState): ScenarioEvent {
  const eventId = state.currentEvent?.eventId
  if (eventId === undefined) throw new Error('현재 이벤트가 없다')
  const event = findScenarioEvent(state, eventId)
  if (event === undefined) throw new Error(`시나리오에 없는 이벤트다: ${eventId}`)
  return event
}

/**
 * 선택지를 채택한 뒤 갈 단계 (아키텍처 §5.3).
 * 14A는 주사위 대신 부적 제출 창으로 간다 (룰북 §13.5).
 */
export function nextStepAfterAdopt(choice: Choice): GameStep {
  if (!hasJudgment(choice)) return GAME_STEP.RESOLUTION
  if (choice.judgment.kind === JUDGMENT_KIND.ITEM) return GAME_STEP.TALISMAN_WINDOW
  return GAME_STEP.ROLL_WAIT
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

/** 판정 사양의 속성. 협동·아이템·대립 판정은 없다 (룰북 §5.2) */
export function judgmentAttribute(choice: JudgmentChoice): Attribute | null {
  return hasAttribute(choice.judgment) ? choice.judgment.attribute : null
}

/** 변이까지 반영된 성공 기준. 주사위가 없는 14A에는 기준이 없다 */
export function judgmentThreshold(choice: JudgmentChoice): number {
  if (!isRollJudgment(choice.judgment)) {
    throw new Error(`성공 기준이 없는 판정이다: ${choice.id}`)
  }
  return choice.judgment.threshold
}

/** 굴려서 나온 주사위 값. 협동과 대립(팀 측)은 최고값 (룰북 §5.3, §14.4) */
export function baseDiceValue(judgment: JudgmentState): number {
  const values = judgment.dice
    .map((die) => die.value)
    .filter((value): value is number => value !== null)
  if (values.length === 0) return 0
  if (judgment.kind === JUDGMENT_KIND.COOP || judgment.kind === JUDGMENT_KIND.CONTEST) {
    return Math.max(...values)
  }
  return values[0] as number
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

/**
 * 성패를 다시 계산한다 (룰북 §3.2, §14.3).
 * 강제 성공은 계산을 덮어쓰고, 대립 판정은 동점이 배신자 승이라 상대값을 **넘어야** 한다.
 */
export function evaluateJudgment(judgment: JudgmentState): boolean {
  if (judgment.forcedSuccess) return true

  const finalValue = judgmentFinalValue(judgment)
  if (judgment.contest) {
    const opponent = judgment.opponentDie?.value
    if (opponent === null || opponent === undefined) return false
    return finalValue > opponent
  }
  return finalValue >= judgment.threshold
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

/**
 * 대립 판정의 팀 구성과 상대 주사위 (룰북 §14.3, §14.4).
 *
 * - B-1은 옥비녀 보유자 1명, A-2는 타겟을 제외한 전원이 굴린다
 * - 타겟이 **인간 배신자**일 때만 상대 D6와 겨루고, 그 외에는 고정 기준으로 판정한다
 * - 상대 주사위는 진입 즉시 서버가 굴리며 재굴림·부적의 대상이 아니다 (룰북 §14.2)
 */
function contestSetup(
  draft: GameState,
  spec: ContestJudgmentSpec,
  context: EngineContext,
): { teamSeats: BrotherRole[]; contest: boolean; opponentDie: DiceRoll | null } {
  const targetSeat = draft.phase3?.targetSeat ?? null

  let teamSeats: BrotherRole[]
  if (spec.teamDice === CONTEST_TEAM_DICE.JADE_HOLDER) {
    const holder = jadeHairpinHolder(draft)
    if (holder === null) throw new Error('옥비녀 보유자가 없다')
    teamSeats = [holder]
  } else {
    teamSeats = SEAT_ORDER.filter((role) => role !== targetSeat)
  }

  const target = targetSeat === null ? null : draft.seats[targetSeat]
  const contest = target !== null && !target.isBot && target.isTraitor
  const opponentDie: DiceRoll | null =
    contest && targetSeat !== null ? { seat: targetSeat, value: rollD6(context.rng) } : null

  return { teamSeats, contest, opponentDie }
}

export const ROLL_WAIT_HANDLER: StepHandler = {
  enter(draft, context, out) {
    const choice = adoptedJudgmentChoice(draft)
    const kind = choice.judgment.kind
    const roller = draft.currentEvent?.rollerSeat ?? null

    const contest =
      choice.judgment.kind === JUDGMENT_KIND.CONTEST
        ? contestSetup(draft, choice.judgment, context)
        : { teamSeats: [] as BrotherRole[], contest: false, opponentDie: null }

    const judgment: JudgmentState = {
      kind,
      threshold: judgmentThreshold(choice),
      dice:
        kind === JUDGMENT_KIND.CONTEST
          ? contest.teamSeats.map((seat) => ({ seat, value: null }))
          : kind === JUDGMENT_KIND.COOP
            ? SEAT_ORDER.map((seat) => ({ seat, value: null }))
            : [{ seat: rollerOrThrow(roller), value: null }],
      opponentDie: contest.opponentDie,
      contest: contest.contest,
      teamSeats: contest.teamSeats,
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
    draft.currentJudgment = judgment

    draft.progress.stepDeadlineAt = context.now + GAME_CONFIG.autoRollSeconds * 1000

    // 봇 주사위는 진입 즉시 (아키텍처 §8)
    botRollOwnDice(draft, context, out)

    if (allDiceRolled(judgment)) {
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

/**
 * 성패를 가른 기준의 표기 (룰북 §14.3, §14.4).
 * 대립 판정은 상대값을 **넘어야** 하고(동점은 배신자 승), 그 밖에는 고정 기준 이상이면 성공이다.
 */
export function judgmentCriterionText(judgment: JudgmentState): string {
  if (judgment.contest) return `상대 ${judgment.opponentDie?.value ?? '-'} 초과`
  return `기준 ${judgment.threshold}`
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
        text: `최종값 ${judgmentFinalValue(judgment)} / ${judgmentCriterionText(judgment)} — ${
          judgment.succeeded ? '성공' : '실패'
        }`,
      })
    }

    out.logs.push({
      at: context.now,
      code: LOG_CODE.JUDGMENT_RESOLVED,
      message: `${judgment.kind} 판정 최종값 ${judgmentFinalValue(judgment)} ${judgmentCriterionText(
        judgment,
      )} → ${judgment.succeeded ? '성공' : '실패'}`,
      data: { kind: judgment.kind, contest: judgment.contest },
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
