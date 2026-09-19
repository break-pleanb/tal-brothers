import {
  COMMAND_TYPE,
  CUE_KIND,
  ENDING_ID,
  GAME_PHASE,
  GAME_STEP,
  PHASE3_ROUTE,
  PUBLIC_NOTICE_KIND,
  REJECTION_REASON,
} from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

import { PHASE3_CHOICE_ID, PHASE3_EVENT_ID } from '../../scenario/phase3Scene'
import type { StepHandler } from '../dispatch'
import { CUE_AUDIENCE, LOG_CODE, reject } from '../engineTypes'
import type { EngineContext, Rejection, StepOutput } from '../engineTypes'
import { pickOne } from '../random'
import { markClockExpired, truncateClockForPhase3 } from '../rules/clock'
import { humanSeats, isSoloHumanGame } from '../rules/seatControl'
import { allHumansTurned } from '../rules/traitor'
import {
  jadeHairpinHolder,
  moveJadeHairpinAwayFromTarget,
  selectPhase3Target,
} from '../rules/target'
import { SEAT_ORDER } from '../state/gameState'
import type { CurrentEventState, GameState } from '../state/gameState'
import { requestEnding } from './endingStep'
import { adoptChoice, currentScenarioEvent, nextStepAfterAdopt } from './rollStep'
import { discardRemainingOverflow } from './votingStep'

/**
 * Phase 3: 장승 앞의 결전 (룰북 §14).
 *
 * 진입 판정 순서 (§14.1)
 * ```
 * -1. 보류함 정리 (M2 계획 10.1)
 *  0. 타겟 지정 → 타겟이 옥비녀 보유자면 이동
 *  1. 인간 2명 이상 전원 배신자 → 강제 잠식
 *  2. 타겟 없음 → 무사귀환
 *  3. 옥비녀 보유자 존재 → B-1, 투표 없이 즉시 판정 (시계 절삭 없음)
 *  4. 그 외 → 시계 10분 절삭 후 A 루트 투표
 * ```
 */

function newPhase3Event(): CurrentEventState {
  return {
    eventId: PHASE3_EVENT_ID,
    // Phase 3에는 흉/평/길 변이가 없다 (룰북 §6.3, §14.2)
    variants: {},
    fakeLabels: {},
    trueSightUsed: false,
    votes: {},
    adoptedChoiceId: null,
    rollerSeat: null,
    grabbedSeat: null,
    talismanSubmittedBy: null,
    environmentErosionApplied: false,
  }
}

function requireCurrentEvent(state: GameState): CurrentEventState {
  if (state.currentEvent === null) throw new Error('현재 이벤트가 없다')
  return state.currentEvent
}

/** 타겟 지정과 옥비녀 이동 (룰북 §14.1의 0번) */
function selectTarget(draft: GameState, context: EngineContext, out: StepOutput): void {
  const targetSeat = selectPhase3Target(draft, context.rng)
  const soloSelf =
    targetSeat !== null && isSoloHumanGame(draft) && !draft.seats[targetSeat].isBot

  draft.phase3 = {
    targetSeat,
    route: null,
    jadeHairpinMovedTo: null,
    soloPlayTargetIsSelf: soloSelf,
  }

  if (targetSeat === null) {
    out.logs.push({
      at: context.now,
      code: LOG_CODE.TARGET_SELECTED,
      message: '타겟 없음 — 전원이 임계 미만이다',
      data: { targetSeat: null },
    })
    return
  }

  // 타겟은 Display에 공개한다 (룰북 §17)
  draft.notices.push({
    kind: PUBLIC_NOTICE_KIND.PHASE3_TARGET,
    text: `${targetSeat}의 눈에서 피눈물이 흐른다`,
  })
  out.cues.push({
    kind: CUE_KIND.TARGET_REVEALED,
    audience: CUE_AUDIENCE.DISPLAY,
    text: `${targetSeat}의 눈에서 피눈물이 흐른다`,
    data: { targetSeat },
  })
  out.logs.push({
    at: context.now,
    code: LOG_CODE.TARGET_SELECTED,
    message: `타겟 ${targetSeat} (잠식 ${draft.seats[targetSeat].erosionPercent}%)`,
    data: {
      targetSeat,
      erosionPercent: draft.seats[targetSeat].erosionPercent,
      isBot: draft.seats[targetSeat].isBot,
      isTraitor: draft.seats[targetSeat].isTraitor,
      soloPlayTargetIsSelf: soloSelf,
    },
  })

  // 타겟이 옥비녀를 보유하면 다른 형제에게 옮긴다 (룰북 §14.1)
  const movedTo = moveJadeHairpinAwayFromTarget(draft, targetSeat, context.rng)
  if (movedTo === null) return

  draft.phase3.jadeHairpinMovedTo = movedTo
  draft.notices.push({
    kind: PUBLIC_NOTICE_KIND.JADE_HAIRPIN_MOVED,
    text: '옥비녀가 요기를 거부하며 손에서 튕겨 나간다',
  })
  out.cues.push({
    kind: CUE_KIND.JADE_HAIRPIN_MOVED,
    audience: CUE_AUDIENCE.DISPLAY,
    text: '옥비녀가 요기를 거부하며 손에서 튕겨 나간다',
    data: { from: targetSeat, to: movedTo },
  })
  out.logs.push({
    at: context.now,
    code: LOG_CODE.JADE_HAIRPIN_MOVED,
    message: `옥비녀 ${targetSeat} → ${movedTo}`,
    data: { from: targetSeat, to: movedTo },
  })
}

export const P3_TARGETING_HANDLER: StepHandler = {
  enter(draft, context, out) {
    draft.progress.phase = GAME_PHASE.PHASE_3
    draft.progress.eventOrder = [PHASE3_EVENT_ID]
    draft.progress.eventIndex = 0
    draft.currentJudgment = null

    // 보류함은 Phase 3까지 들고 가지 않는다 (M2 계획 10.1)
    discardRemainingOverflow(draft, context, out)

    out.cues.push({
      kind: CUE_KIND.PHASE_ENTERED,
      audience: CUE_AUDIENCE.DISPLAY,
      text: '마을 경계의 거대한 천하대장군 장승 앞. 추격대가 턱밑까지 왔다',
    })
    // Phase 2가 끝난 시점의 잠식도를 한 번 찍어 둔다 (봇 자동 대전 지표, M2 계획 8.1)
    out.logs.push({
      at: context.now,
      code: LOG_CODE.PHASE_ENTERED,
      message: 'Phase 3 진입',
      data: {
        phase: GAME_PHASE.PHASE_3,
        erosion: Object.fromEntries(
          SEAT_ORDER.map((role) => [role, draft.seats[role].erosionPercent]),
        ),
        clockRemainingMs: draft.clock.deadlineAt - context.now,
      },
    })

    selectTarget(draft, context, out)
    const phase3 = draft.phase3
    if (phase3 === null) throw new Error('Phase 3 상태가 없다')

    // 1. 인간이 2명 이상이고 전원 배신자 (룰북 §10.3, §14.1)
    if (allHumansTurned(draft)) {
      requestEnding(draft, ENDING_ID.FORCED_EROSION)
      out.next = GAME_STEP.ENDING
      return
    }

    // 2. 타겟 없음 → 무사귀환. 옥비녀는 쓰지 않는다 (룰북 §14.1)
    if (phase3.targetSeat === null) {
      requestEnding(draft, ENDING_ID.SAFE_RETURN)
      out.next = GAME_STEP.ENDING
      return
    }

    draft.currentEvent = newPhase3Event()

    // 3. 옥비녀 보유자 존재 → B-1, 투표 없이 즉시 판정 (룰북 §14.3)
    const holder = jadeHairpinHolder(draft)
    if (holder !== null) {
      phase3.route = PHASE3_ROUTE.PURIFY
      const choice = adoptChoice(draft, PHASE3_CHOICE_ID.PURIFY)
      // 판정자는 속성이 아니라 옥비녀 보유자다 (룰북 §14.3)
      requireCurrentEvent(draft).rollerSeat = holder
      out.logs.push({
        at: context.now,
        code: LOG_CODE.VOTE_TALLIED,
        message: `B-1 정화 — 투표 없이 즉시 판정 (보유자 ${holder})`,
        data: { eventId: PHASE3_EVENT_ID, adoptedChoiceId: choice.id, route: phase3.route },
      })
      out.next = GAME_STEP.ROLL_WAIT
      return
    }

    // 4. 그 외 → 시계 10분 절삭 후 A 루트 투표 (룰북 §14.4)
    truncateClockForPhase3(draft, context.now)
    out.next = GAME_STEP.P3_VOTING
  },
}

/** A 루트 투표 마감 — 유효표 0이면 강제 잠식 (룰북 §14.4) */
function closeVote(
  draft: GameState,
  context: EngineContext,
  out: StepOutput,
  earlyClosed: boolean,
): void {
  const current = requireCurrentEvent(draft)
  const event = currentScenarioEvent(draft)
  const phase3 = draft.phase3
  if (phase3 === null) throw new Error('Phase 3 상태가 없다')

  const counts = new Map<string, number>()
  for (const role of humanSeats(draft)) {
    const choiceId = current.votes[role]
    if (choiceId === undefined) continue
    counts.set(choiceId, (counts.get(choiceId) ?? 0) + 1)
  }

  draft.notices.push({
    kind: PUBLIC_NOTICE_KIND.VOTE_TALLY,
    text: event.choices.map((choice) => `${choice.text} ${counts.get(choice.id) ?? 0}표`).join(' · '),
  })

  // 유효표가 0이면 기권 무작위 채택 규칙을 쓰지 않고 강제 잠식으로 끝난다 (룰북 §14.4)
  if (counts.size === 0) {
    out.logs.push({
      at: context.now,
      code: LOG_CODE.VOTE_TALLIED,
      message: 'Phase 3 유효표 0 — 강제 잠식',
      data: { eventId: PHASE3_EVENT_ID, adoptedChoiceId: null, counts: {}, earlyClosed },
    })
    requestEnding(draft, ENDING_ID.FORCED_EROSION)
    out.next = GAME_STEP.ENDING
    return
  }

  const top = Math.max(...counts.values())
  const tied = [...counts.entries()]
    .filter(([, count]) => count === top)
    .map(([choiceId]) => choiceId)
  const adopted = tied.length === 1 ? (tied[0] as string) : pickOne(context.rng, tied)

  phase3.route =
    adopted === PHASE3_CHOICE_ID.BAIT ? PHASE3_ROUTE.BAIT : PHASE3_ROUTE.BREAK

  out.logs.push({
    at: context.now,
    code: LOG_CODE.VOTE_TALLIED,
    message: `채택 ${adopted} (득표 ${counts.get(adopted) ?? 0}${earlyClosed ? ', 조기 마감' : ''})`,
    data: {
      eventId: PHASE3_EVENT_ID,
      adoptedChoiceId: adopted,
      counts: Object.fromEntries(counts),
      earlyClosed,
      route: phase3.route,
    },
  })

  out.next = nextStepAfterAdopt(adoptChoice(draft, adopted))
}

/** 타겟 본인을 포함한 인간 전원이 투표했는지 (룰북 §14.4) */
function allHumansVoted(state: GameState): boolean {
  const current = requireCurrentEvent(state)
  const humans = humanSeats(state)
  if (humans.length === 0) return false
  return humans.every((role) => current.votes[role] !== undefined)
}

export const P3_VOTING_HANDLER: StepHandler = {
  enter(draft, context, _out) {
    requireCurrentEvent(draft).votes = {}
    // 투표 마감 = 시계 0 (룰북 §14.4)
    draft.progress.stepDeadlineAt = draft.clock.deadlineAt
  },

  command(draft, context, out, seat: BrotherRole, command): Rejection | undefined {
    if (command.type !== COMMAND_TYPE.VOTE_SUBMIT) {
      return reject(REJECTION_REASON.WRONG_STEP, command.type)
    }

    const current = requireCurrentEvent(draft)
    const event = currentScenarioEvent(draft)
    if (!event.choices.some((choice) => choice.id === command.choiceId)) {
      return reject(REJECTION_REASON.NOT_ALLOWED, `없는 선택지다: ${command.choiceId}`)
    }

    current.votes[seat] = command.choiceId
    out.logs.push({
      at: context.now,
      code: LOG_CODE.VOTE_SUBMITTED,
      message: `${seat} Phase 3 투표 완료`,
    })

    if (allHumansVoted(draft)) {
      closeVote(draft, context, out, true)
    }
    return undefined
  },

  timeout(draft, context, out) {
    // 마감 시각이 곧 시계 0이다 (룰북 §14.4)
    markClockExpired(draft, context.now)
    closeVote(draft, context, out, false)
  },
}
