import {
  COMMAND_TYPE,
  ENDING_ID,
  GAME_STEP,
  PAUSE_REASON,
  REJECTION_REASON,
} from 'tal-brothers-shared'
import type { BrotherRole, Command, GameStep } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../scenario/gameConfig'
import { ACTION_KIND, LOG_CODE, createStepOutput, reject } from './engineTypes'
import { isClockExpired, markClockExpired, timeoutEndsGame } from './rules/clock'
import type {
  ActionActor,
  CommandAction,
  DispatchResult,
  DispatchSuccess,
  EngineAction,
  EngineContext,
  PresenceAction,
  Rejection,
  StepOutput,
  TimerDeadline,
} from './engineTypes'
import { canHostPause, isPaused, pauseGame, resumeGame } from './rules/pause'
import { applyDueBotTakeovers, applyPresence, nextBotTakeoverAt } from './rules/presence'
import { isBotControlled } from './rules/seatControl'
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
import { LOBBY_HANDLER, isHostDisplay } from './steps/lobbyStep'
import { PAUSED_HANDLER } from './steps/pausedStep'
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
  /** 좌석 명령. 좌석이 없는 주체(Display, 좌석 미선택 Controller)는 dispatch가 먼저 거절한다 */
  command?(
    draft: GameState,
    context: EngineContext,
    out: StepOutput,
    seat: BrotherRole,
    command: Command,
  ): Rejection | undefined
  /**
   * 주체 정보가 필요한 단계(로비)용. 있으면 `command` 대신 이 함수가 받는다.
   * 좌석을 고르기 전의 Controller와 Display도 명령을 보낼 수 있기 때문이다
   */
  actorCommand?(
    draft: GameState,
    context: EngineContext,
    out: StepOutput,
    actor: ActionActor,
    command: Command,
  ): Rejection | undefined
  /** 타이머 만료 */
  timeout?(draft: GameState, context: EngineContext, out: StepOutput): void
}

/**
 * 단계별 처리기.
 * 여기에 없는 단계로 들어온 액션은 `unhandledStep`으로 거절한다.
 * `ENDING`은 종료 단계라 처리기 조회 전에 `gameFinished`로 거절한다.
 */
const STEP_HANDLERS: Partial<Record<GameStep, StepHandler>> = {
  [GAME_STEP.LOBBY]: LOBBY_HANDLER,
  [GAME_STEP.PAUSED]: PAUSED_HANDLER,
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
  draft.progress.stepTimerAt = stepTimerAt(draft, out)

  return {
    rejected: false,
    state: draft,
    cues: out.cues,
    logs: out.logs,
    nextDeadline: nextTimer(draft),
  }
}

/**
 * 이 단계가 다음에 깨어날 시각.
 * 입력 유예 0.3초는 타이머를 마감 시각 + 0.3초에 발화시키는 것으로 처리한다 (아키텍처 §5.3).
 */
function stepTimerAt(draft: GameState, out: StepOutput): number | null {
  if (draft.progress.step === GAME_STEP.PAUSED) return null
  return (
    out.timerAt ??
    (draft.progress.stepDeadlineAt === null
      ? null
      : draft.progress.stepDeadlineAt + GAME_CONFIG.inputGraceMs)
  )
}

/**
 * 방마다 타이머는 하나뿐이므로 **단계 마감과 봇 대행 전환 중 이른 쪽**을 예약한다 (M3 계획 5.2).
 * 어느 쪽이 발화했는지는 시각으로 가린다. 봇 대행이 먼저면 단계 처리기를 부르지 않는다.
 */
function nextTimer(draft: GameState): TimerDeadline | null {
  const stepAt = draft.progress.stepTimerAt
  const takeoverAt = draft.progress.step === GAME_STEP.PAUSED ? null : nextBotTakeoverAt(draft)

  const at =
    stepAt === null ? takeoverAt : takeoverAt === null ? stepAt : Math.min(stepAt, takeoverAt)

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

/**
 * 연결 변화 (M3 계획 5.1).
 * 단계 처리기를 거치지 않는다. 어느 단계에서든 같은 방식으로 상태에 기록하고,
 * 봇 대행·자동 일시정지 판단은 규칙 모듈이 한다.
 */
function dispatchPresence(
  state: GameState,
  action: PresenceAction,
  context: EngineContext,
): DispatchResult {
  const draft = cloneState(state)
  const out = createStepOutput()
  applyPresence(draft, action.target, action.status, context, out)
  return finishDispatch(draft, out)
}

/**
 * 호스트의 정지·재개 (아키텍처 §8).
 * 단계와 상관없이 받아야 하므로 단계 처리기보다 앞에서 처리한다.
 */
function dispatchHostCommand(
  state: GameState,
  action: CommandAction,
  context: EngineContext,
  pause: boolean,
): DispatchResult {
  if (!isHostDisplay(state, action.actor)) {
    return reject(REJECTION_REASON.WRONG_SEAT, '호스트 Display만 보낼 수 있다')
  }

  const draft = cloneState(state)
  const out = createStepOutput()

  if (pause) {
    if (isPaused(state)) return reject(REJECTION_REASON.NOT_ALLOWED, '이미 정지 중이다')
    // 이벤트 사이에만 받는다 (아키텍처 §8)
    if (!canHostPause(state)) {
      return reject(REJECTION_REASON.WRONG_STEP, '호스트 정지는 이벤트 사이에만 받는다')
    }
    pauseGame(draft, PAUSE_REASON.HOST, context, out)
    return finishDispatch(draft, out)
  }

  const active = state.pause.active
  if (active === null) return reject(REJECTION_REASON.NOT_ALLOWED, '정지 중이 아니다')
  // 자동 정지는 연결이 돌아오면 저절로 풀린다 (아키텍처 §8)
  if (active.reason !== PAUSE_REASON.HOST) {
    return reject(REJECTION_REASON.NOT_ALLOWED, '자동 정지는 연결이 돌아와야 풀린다')
  }

  resumeGame(draft, context, out)
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

  if (action.kind === ACTION_KIND.PRESENCE) {
    return dispatchPresence(state, action, context)
  }

  if (
    action.kind === ACTION_KIND.COMMAND &&
    (action.command.type === COMMAND_TYPE.HOST_PAUSE ||
      action.command.type === COMMAND_TYPE.HOST_RESUME)
  ) {
    return dispatchHostCommand(
      state,
      action,
      context,
      action.command.type === COMMAND_TYPE.HOST_PAUSE,
    )
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

    const draft = cloneState(state)
    const out = createStepOutput()

    // 봇 대행 전환이 단계 마감보다 먼저 예약될 수 있다 (M3 계획 5.2)
    const turned = applyDueBotTakeovers(draft, context, out)
    const stepDue =
      draft.progress.stepTimerAt !== null && context.now >= draft.progress.stepTimerAt

    if (!stepDue) {
      if (turned.length === 0) {
        return reject(REJECTION_REASON.STALE_TIMER, '예약된 타이머가 없다')
      }
      return finishDispatch(draft, out)
    }
    if (handler.timeout === undefined) {
      return reject(REJECTION_REASON.WRONG_STEP, `${state.progress.step}은 타이머를 받지 않는다`)
    }

    handler.timeout(draft, context, out)
    if (out.next !== undefined) {
      enterStep(draft, out.next, context, out)
    }
    return finishDispatch(draft, out)
  }

  // 주체를 봐야 하는 단계(로비)는 좌석 해석 없이 그대로 넘긴다
  if (handler.actorCommand !== undefined) {
    const draft = cloneState(state)
    const out = createStepOutput()
    const rejection = handler.actorCommand(draft, context, out, action.actor, action.command)
    if (rejection !== undefined) return rejection

    if (out.next !== undefined) {
      enterStep(draft, out.next, context, out)
    }
    return finishDispatch(draft, out)
  }

  if (action.actor.seat === null) {
    return reject(REJECTION_REASON.WRONG_SEAT, '좌석이 없는 주체의 좌석 명령이다')
  }
  const seat = state.seats[action.actor.seat]
  if (seat === undefined) {
    return reject(REJECTION_REASON.WRONG_SEAT, action.actor.seat)
  }
  // 봇과 봇 대행 좌석은 명령을 보내지 않는다. 그 행동은 엔진이 대신한다 (아키텍처 §5.1, §8, 룰북 §11)
  if (isBotControlled(seat)) {
    return reject(REJECTION_REASON.WRONG_SEAT, '서버가 대신 조작하는 좌석이다')
  }
  if (handler.command === undefined) {
    return reject(REJECTION_REASON.WRONG_STEP, `${state.progress.step}은 명령을 받지 않는다`)
  }

  const draft = cloneState(state)
  const out = createStepOutput()
  const rejection = handler.command(draft, context, out, action.actor.seat, action.command)
  if (rejection !== undefined) return rejection

  if (out.next !== undefined) {
    enterStep(draft, out.next, context, out)
  }
  return finishDispatch(draft, out)
}
