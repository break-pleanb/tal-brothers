import { CUE_KIND } from 'tal-brothers-shared'
import type { BrotherRole, EndingId } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'
import { ENDINGS } from '../../scenario/endings'
import { LOG_CODE } from '../engineTypes'
import type { Cue, EngineContext, StepOutput } from '../engineTypes'
import { SEAT_ORDER } from '../state/gameState'
import type { GameState } from '../state/gameState'

/**
 * 이면의 형제 (룰북 §10).
 *
 * - 인간의 잠식도가 100%에 도달하는 즉시 전환한다. 봇은 전환하지 않는다 (§10.1, §11)
 * - 1인 플레이는 배신할 상대가 없어 전환하지 않는다. 대신 §11의 방해 효과를 본인에게 적용한다 (§10.1)
 * - 전환은 상태에 남기되 **붉은 메시지 cue로만** 알린다. 어떤 투영에도 `isTraitor`를 넣지 않는다 (§17)
 * - 인간이 2명 이상이고 전원 배신자가 되면 즉시 강제 잠식 엔딩 (§10.3)
 */

/** 배신자 전환과 가짜 붉은 메시지가 함께 쓰는 문장 (룰북 §10.1) */
export const RED_MESSAGE_TEXT = '당신은 요괴에 잠식되었습니다. 형제들을 파멸로 이끄십시오.'

export const TRAITOR_EROSION_PERCENT = 100

/**
 * 붉은 메시지 cue (룰북 §10.1, 아키텍처 §7.2).
 * 진짜(전환)와 가짜가 **같은 형식·같은 표시 시간**을 쓴다. 종류를 나누면 "붉은 화면 = 배신자"가 성립한다.
 */
export function redMessageCue(seat: BrotherRole): Cue {
  return {
    kind: CUE_KIND.RED_MESSAGE,
    audience: seat,
    text: RED_MESSAGE_TEXT,
    data: { durationSeconds: GAME_CONFIG.redMessageSeconds },
  }
}

export function humanSeats(state: GameState): BrotherRole[] {
  return SEAT_ORDER.filter((role) => !state.seats[role].isBot)
}

/** 1인 플레이 — 배신자 모드가 없다 (룰북 §10.1) */
export function isSoloHumanGame(state: GameState): boolean {
  return humanSeats(state).length === 1
}

export function traitorSeats(state: GameState): BrotherRole[] {
  return SEAT_ORDER.filter((role) => state.seats[role].isTraitor)
}

/** 인간이 2명 이상이고 전원 배신자인지 (룰북 §10.3, M2 계획 10절 11번) */
export function allHumansTurned(state: GameState): boolean {
  const humans = humanSeats(state)
  if (humans.length < 2) return false
  return humans.every((role) => state.seats[role].isTraitor)
}

/** 배신자로 전환한다. 호출 전에 100% 도달을 확인한다 (룰북 §10.1) */
export function turnTraitor(
  draft: GameState,
  role: BrotherRole,
  context: EngineContext,
  out: StepOutput,
): void {
  const seat = draft.seats[role]
  if (seat.isTraitor) return

  seat.isTraitor = true
  out.cues.push(redMessageCue(role))
  out.logs.push({
    at: context.now,
    code: LOG_CODE.TRAITOR_TURNED,
    message: `${role} 이면의 형제 전환 (잠식 ${seat.erosionPercent}%)`,
    data: { seat: role, eventId: draft.currentEvent?.eventId ?? null },
  })
}

/** 엔딩표의 배신자 승패 (룰북 §15) */
export function traitorWonFor(endingId: EndingId): boolean {
  return ENDINGS[endingId].traitorWon
}

/**
 * 이 판의 배신자 승패 (룰북 §15).
 * 엔딩표의 배신자 열은 배신자라는 주체가 있어야 성립하므로(§10.3),
 * 배신자가 한 명도 없으면 승패를 판정하지 않고 `null`(해당 없음)을 돌려준다.
 */
export function traitorOutcome(state: GameState, endingId: EndingId): boolean | null {
  if (traitorSeats(state).length === 0) return null
  return traitorWonFor(endingId)
}
