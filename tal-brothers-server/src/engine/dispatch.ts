import { ENDING_ID, GAME_STEP, REJECTION_REASON } from 'tal-brothers-shared'
import type { BrotherRole, Command, GameStep } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../scenario/gameConfig'
import { ACTION_KIND, LOG_CODE, createStepOutput, reject } from './engineTypes'
import { isClockExpired, markClockExpired, timeoutEndsGame } from './rules/clock'
import type {
  DispatchResult,
  DispatchSuccess,
  EngineAction,
  EngineContext,
  Rejection,
  StepOutput,
  TimerDeadline,
} from './engineTypes'
import { ENDING_HANDLER, requestEnding } from './steps/endingStep'
import { EVENT_INTRO_HANDLER } from './steps/eventIntroStep'
import { P3_TARGETING_HANDLER, P3_VOTING_HANDLER } from './steps/phase3Step'
import { PHASE2_ENTRY_HANDLER } from './steps/phase2EntryStep'
import { TALISMAN_WINDOW_HANDLER } from './steps/talismanWindowStep'
import {
  INTERVENTION_FORCE_HANDLER,
  INTERVENTION_REROLL_HANDLER,
  INTERVENTION_TALISMAN_HANDLER,
  PRACTICE_INTERVENTION_HANDLER,
} from './steps/interventionStep'
import { RESOLUTION_HANDLER } from './steps/resolutionStep'
import { ROLL_REVEAL_HANDLER, ROLL_WAIT_HANDLER } from './steps/rollStep'
import { VOTING_HANDLER } from './steps/votingStep'
import { cloneState } from './state/gameState'
import type { GameState } from './state/gameState'

/**
 * 단계 처리기 분기 (아키텍처 §5.1).
 * 상태는 액션마다 복제한 뒤 수정하고, 거절 시 원본을 건드리지 않는다.
 * 액션이 적용되면 상태 버전을 1 올린다.
 */

export type StepHandler = {
  /** 단계에 진입할 때. 마감 시각 설정과 봇 즉시 행동을 여기서 처리한다 */
  enter?(draft: GameState, context: EngineContext, out: StepOutput): void
  /** 좌석 명령. 거절하려면 `Rejection`을 돌려준다 */
  command?(
    draft: GameState,
    context: EngineContext,
    out: StepOutput,
    seat: BrotherRole,
    command: Command,
  ): Rejection | undefined
  /** 타이머 만료 */
  timeout?(draft: GameState, context: EngineContext, out: StepOutput): void
}

/**
 * 단계별 처리기.
 * 여기에 없는 단계(`LOBBY`, `PAUSED` 등)로 들어온 액션은 `unhandledStep`으로 거절한다.
 * `ENDING`은 종료 단계라 처리기 조회 전에 `gameFinished`로 거절한다.
 */
const STEP_HANDLERS: Partial<Record<GameStep, StepHandler>> = {
  [GAME_STEP.PHASE2_ENTRY]: PHASE2_ENTRY_HANDLER,
  [GAME_STEP.EVENT_INTRO]: EVENT_INTRO_HANDLER,
  [GAME_STEP.VOTING]: VOTING_HANDLER,
  [GAME_STEP.ROLL_WAIT]: ROLL_WAIT_HANDLER,
  [GAME_STEP.ROLL_REVEAL]: ROLL_REVEAL_HANDLER,
  [GAME_STEP.INTERVENTION_REROLL]: INTERVENTION_REROLL_HANDLER,
  [GAME_STEP.INTERVENTION_TALISMAN]: INTERVENTION_TALISMAN_HANDLER,
  [GAME_STEP.INTERVENTION_FORCE]: INTERVENTION_FORCE_HANDLER,
  [GAME_STEP.PRACTICE_INTERVENTION]: PRACTICE_INTERVENTION_HANDLER,
  [GAME_STEP.TALISMAN_WINDOW]: TALISMAN_WINDOW_HANDLER,
  [GAME_STEP.RESOLUTION]: RESOLUTION_HANDLER,
  [GAME_STEP.P3_TARGETING]: P3_TARGETING_HANDLER,
  [GAME_STEP.P3_VOTING]: P3_VOTING_HANDLER,
  [GAME_STEP.ENDING]: ENDING_HANDLER,
}

/** 연쇄 전이 상한. 넘으면 전이표가 순환한다는 뜻이므로 조용히 돌지 않고 멈춘다 */
const MAX_TRANSITIONS = 32

/**
 * 단계로 진입한다. 진입 처리가 또 다른 전이를 요청하면 연쇄로 처리한다
 * (예: `RESOLUTION`은 타이머 없이 곧바로 다음 이벤트로 넘어간다).
 */
export function enterStep(
  draft: GameState,
  step: GameStep,
  context: EngineContext,
  out: StepOutput,
): void {
  let next: GameStep | undefined = step
  let guard = 0

  while (next !== undefined) {
    const current: GameStep = next
    out.next = undefined
    out.timerAt = undefined
    draft.progress.step = current
    draft.progress.stepDeadlineAt = null

    STEP_HANDLERS[current]?.enter?.(draft, context, out)

    next = out.next
    out.next = undefined

    guard += 1
    if (guard > MAX_TRANSITIONS) {
      throw new Error(`단계 전이가 ${MAX_TRANSITIONS}회를 넘었다: ${current}`)
    }
  }
}

/** 상태 버전을 올리고 다음 타이머를 계산한다 */
export function finishDispatch(draft: GameState, out: StepOutput): DispatchSuccess {
  draft.meta.stateVersion += 1

  return {
    rejected: false,
    state: draft,
    cues: out.cues,
    logs: out.logs,
    nextDeadline: nextTimer(draft, out),
  }
}

function nextTimer(draft: GameState, out: StepOutput): TimerDeadline | null {
  // 입력 유예 0.3초는 타이머를 마감 시각 + 0.3초에 발화시키는 것으로 처리한다 (아키텍처 §5.3)
  const at =
    out.timerAt ??
    (draft.progress.stepDeadlineAt === null
      ? null
      : draft.progress.stepDeadlineAt + GAME_CONFIG.inputGraceMs)

  if (at === null) return null
  return { at, step: draft.progress.step, stateVersion: draft.meta.stateVersion }
}

/** 타임오버 — 진행 중인 판정·개입 창을 중단하고 강제 잠식 엔딩으로 간다 (룰북 §2.1) */
function endByTimeout(state: GameState, context: EngineContext): DispatchSuccess {
  const draft = cloneState(state)
  const out = createStepOutput()

  markClockExpired(draft, context.now)
  out.logs.push({
    at: context.now,
    code: LOG_CODE.CLOCK_TIMEOUT,
    message: `게임 시계 0 — ${draft.progress.step}에서 중단`,
    data: { phase: draft.progress.phase, step: draft.progress.step },
  })

  requestEnding(draft, ENDING_ID.FORCED_EROSION)
  enterStep(draft, GAME_STEP.ENDING, context, out)
  return finishDispatch(draft, out)
}

export function dispatch(
  state: GameState,
  action: EngineAction,
  context: EngineContext,
): DispatchResult {
  if (state.progress.step === GAME_STEP.ENDING) {
    return reject(REJECTION_REASON.GAME_FINISHED, '엔딩에 도달한 상태다')
  }

  const handler = STEP_HANDLERS[state.progress.step]
  if (handler === undefined) {
    return reject(REJECTION_REASON.UNHANDLED_STEP, state.progress.step)
  }

  if (action.kind === ACTION_KIND.TIMER_EXPIRY) {
    // 시계 0 검사는 타이머 처리의 맨 앞 한 곳에서만 한다 (룰북 §2.1, M2 계획 5.6).
    // Phase 3는 예외로, 시계가 0을 지나도 판정과 개입 창을 끝까지 진행한다 (룰북 §14.2)
    if (timeoutEndsGame(state) && isClockExpired(state, context.now)) {
      return endByTimeout(state, context)
    }

    if (action.step !== state.progress.step || action.stateVersion !== state.meta.stateVersion) {
      return reject(
        REJECTION_REASON.STALE_TIMER,
        `${action.step}/${action.stateVersion} ≠ ${state.progress.step}/${state.meta.stateVersion}`,
      )
    }
    if (handler.timeout === undefined) {
      return reject(REJECTION_REASON.WRONG_STEP, `${state.progress.step}은 타이머를 받지 않는다`)
    }

    const draft = cloneState(state)
    const out = createStepOutput()
    handler.timeout(draft, context, out)
    if (out.next !== undefined) {
      enterStep(draft, out.next, context, out)
    }
    return finishDispatch(draft, out)
  }

  const seat = state.seats[action.seat]
  if (seat === undefined) {
    return reject(REJECTION_REASON.WRONG_SEAT, action.seat)
  }
  // 봇은 명령을 보내지 않는다. 봇 행동은 단계 진입 시 엔진 내부에서 처리한다 (아키텍처 §5.1, 룰북 §11)
  if (seat.isBot) {
    return reject(REJECTION_REASON.WRONG_SEAT, '봇 좌석은 명령을 보내지 않는다')
  }
  if (handler.command === undefined) {
    return reject(REJECTION_REASON.WRONG_STEP, `${state.progress.step}은 명령을 받지 않는다`)
  }

  const draft = cloneState(state)
  const out = createStepOutput()
  const rejection = handler.command(draft, context, out, action.seat, action.command)
  if (rejection !== undefined) return rejection

  if (out.next !== undefined) {
    enterStep(draft, out.next, context, out)
  }
  return finishDispatch(draft, out)
}
