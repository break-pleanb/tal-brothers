import { GAME_STEP, PAUSE_REASON } from 'tal-brothers-shared'
import type { PauseReason } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'
import { LOG_CODE } from '../engineTypes'
import type { EngineContext, StepOutput } from '../engineTypes'
import type { GameState } from '../state/gameState'
import { connectedHumanSeats, humanSeats } from './seatControl'

/**
 * 일시정지 (아키텍처 §8, M3 계획 5.4·5.5).
 *
 * - 모든 시간이 절대 마감 시각이라 정지·재개는 남은 시간 변환 두 줄로 끝난다 (아키텍처 §2 원칙 6)
 * - 정지 중에는 게임 시계가 흐르지 않으므로 타임오버(룰북 §2.1) 검사에 걸리지 않는다
 * - 자동 정지는 **게임당 누적 5분**까지다. 한도를 넘기면 그 뒤로는 자동 정지를 하지 않고,
 *   **호스트 수동 정지는 한도와 무관하게 계속 가능**하다 (M3 계획 10절 10번)
 */

export function autoPauseLimitMs(): number {
  return GAME_CONFIG.autoPauseLimitMinutes * 60_000
}

/** 자동 정지 한도를 이미 넘겼는지. 넘겼으면 이후로도 자동 정지를 하지 않는다 */
export function autoPauseExhausted(state: GameState): boolean {
  return state.pause.autoAccumulatedMs >= autoPauseLimitMs()
}

export function isPaused(state: GameState): boolean {
  return state.pause.active !== null
}

/** 정지·재개를 받을 수 없는 종료 단계 */
function isTerminal(state: GameState): boolean {
  return state.progress.step === GAME_STEP.ENDING
}

/**
 * 지금 자동 정지 조건이 걸려 있는지 (아키텍처 §8).
 *
 * - Display가 끊기면 공용 화면이 없다
 * - 연결된 인간 Controller가 0명이면 조작할 사람이 없다
 *
 * **인간 좌석이 애초에 0명인 구성(봇 자동 대전)은 이 검사를 하지 않는다.** 시뮬레이터에는 소켓이 없다.
 */
export function autoPauseReason(state: GameState): PauseReason | null {
  if (state.progress.step === GAME_STEP.LOBBY || isTerminal(state)) return null
  if (humanSeats(state).length === 0) return null

  if (!state.room.displayConnected) return PAUSE_REASON.DISPLAY_GONE
  if (connectedHumanSeats(state).length === 0) return PAUSE_REASON.NO_HUMAN_CONTROLLER
  return null
}

/**
 * 정지한다 (M3 계획 5.5).
 * 마감 시각을 남은 시간으로 바꿔 두고 단계를 `PAUSED`로 옮긴다.
 */
export function pauseGame(
  draft: GameState,
  reason: PauseReason,
  context: EngineContext,
  out: StepOutput,
): boolean {
  if (isPaused(draft) || isTerminal(draft)) return false
  if (draft.progress.step === GAME_STEP.LOBBY) return false

  const at = context.now
  draft.clock.pausedRemainingMs = Math.max(0, draft.clock.deadlineAt - at)
  draft.progress.pausedStepRemainingMs =
    draft.progress.stepDeadlineAt === null
      ? null
      : Math.max(0, draft.progress.stepDeadlineAt - at)

  draft.pause.active = { reason, pausedAt: at, resumeStep: draft.progress.step }
  draft.progress.step = GAME_STEP.PAUSED
  draft.progress.stepDeadlineAt = null
  // 정지 중에는 단계 타이머를 걸지 않는다. 런타임도 예약된 타이머를 취소한다 (M3 계획 2.2)
  draft.progress.stepTimerAt = null

  out.logs.push({
    at,
    code: LOG_CODE.GAME_PAUSED,
    message: `일시정지 (${reason}) — ${draft.pause.active.resumeStep}에서 멈춤`,
    data: { reason, resumeStep: draft.pause.active.resumeStep },
  })
  return true
}

/**
 * 재개한다 (M3 계획 5.5).
 * 남은 시간을 새 마감 시각으로 되돌리고, 자동 정지였다면 정지해 있던 시간을 누적에 더한다.
 */
export function resumeGame(draft: GameState, context: EngineContext, out: StepOutput): boolean {
  const active = draft.pause.active
  if (active === null) return false

  const at = context.now
  draft.clock.deadlineAt = at + (draft.clock.pausedRemainingMs ?? 0)
  draft.clock.pausedRemainingMs = null

  draft.progress.step = active.resumeStep
  draft.progress.stepDeadlineAt =
    draft.progress.pausedStepRemainingMs === null
      ? null
      : at + draft.progress.pausedStepRemainingMs
  draft.progress.pausedStepRemainingMs = null
  draft.progress.stepTimerAt =
    draft.progress.stepDeadlineAt === null
      ? null
      : draft.progress.stepDeadlineAt + GAME_CONFIG.inputGraceMs

  // 호스트 수동 정지는 누적에 세지 않는다 (아키텍처 §8)
  if (active.reason !== PAUSE_REASON.HOST) {
    draft.pause.autoAccumulatedMs += Math.max(0, at - active.pausedAt)
  }
  draft.pause.active = null

  out.logs.push({
    at,
    code: LOG_CODE.GAME_RESUMED,
    message: `재개 (${active.reason}) — ${active.resumeStep}로 복귀`,
    data: {
      reason: active.reason,
      resumeStep: active.resumeStep,
      autoAccumulatedMs: draft.pause.autoAccumulatedMs,
    },
  })
  return true
}

/**
 * 자동 정지 조건을 다시 보고 정지·재개를 맞춘다.
 * 연결 변화가 있을 때마다 부른다.
 */
export function syncAutoPause(
  draft: GameState,
  context: EngineContext,
  out: StepOutput,
): void {
  const reason = autoPauseReason(draft)
  const active = draft.pause.active

  if (active === null) {
    // 한도를 넘겼으면 더 이상 자동으로 멈추지 않는다 (M3 계획 10절 10번)
    if (reason !== null && !autoPauseExhausted(draft)) {
      pauseGame(draft, reason, context, out)
    }
    return
  }

  // 호스트 수동 정지는 `host.resume`으로만 푼다 (아키텍처 §8)
  if (active.reason === PAUSE_REASON.HOST) return
  if (reason === null) resumeGame(draft, context, out)
}

/**
 * 호스트 수동 정지를 받을 수 있는 시점인지 (아키텍처 §8 "이벤트 사이에만").
 *
 * 상황 제시 단계만 허용한다. 투표·판정·개입 창은 입력 창이 열려 있어 "이벤트 사이"가 아니다.
 * 이 해석은 `docs/m3-notes.md`의 확인 필요 항목이다.
 */
export function canHostPause(state: GameState): boolean {
  return state.progress.step === GAME_STEP.EVENT_INTRO
}
