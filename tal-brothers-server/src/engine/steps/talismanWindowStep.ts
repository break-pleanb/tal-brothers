import {
  COMMAND_TYPE,
  CUE_KIND,
  GAME_STEP,
  JUDGMENT_KIND,
  PUBLIC_NOTICE_KIND,
} from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'
import type { StepHandler } from '../dispatch'
import { CUE_AUDIENCE, LOG_CODE, REJECTION_REASON, reject } from '../engineTypes'
import type { Rejection } from '../engineTypes'
import type { GameState, JudgmentState } from '../state/gameState'

/**
 * 14A 부적 제출 창 (룰북 §13.5).
 *
 * - 8초 고정. 누군가 제출하면 즉시 종료, 아무도 없으면 8초를 모두 대기한다
 * - 제출은 선착순 1개만 적용한다. 보류함과 튜토리얼 부적은 쓸 수 없다 (M2 계획 10.1, 룰북 §9.2)
 * - 주사위 판정이 없으므로 개입 창이 없고 변이도 적용하지 않는다 (룰북 §6.3)
 * - 버프/디버프를 소비하지 않고 다음 판정으로 이월한다 (룰북 §5.5)
 *
 * 효과(제출자 -15% / 미제출 시 무작위 1명 +10%)는 `RESOLUTION`이 선택지 데이터를 보고 적용한다.
 */

function requireCurrentEvent(state: GameState) {
  if (state.currentEvent === null) throw new Error('현재 이벤트가 없다')
  return state.currentEvent
}

function requireJudgment(state: GameState): JudgmentState {
  if (state.currentJudgment === null) throw new Error('진행 중인 판정이 없다')
  return state.currentJudgment
}

export const TALISMAN_WINDOW_HANDLER: StepHandler = {
  enter(draft, context, out) {
    draft.currentJudgment = {
      kind: JUDGMENT_KIND.ITEM,
      // 주사위도 성공 기준도 없다. 제출 여부가 곧 성패다
      threshold: 0,
      dice: [],
      opponentDie: null,
      contest: false,
      teamSeats: [],
      roleBonus: 0,
      // 14A는 팀 플래그를 소비하지 않는다 (룰북 §5.5)
      teamModifierApplied: 0,
      talismanBonus: 0,
      succeeded: null,
      forcedSuccess: false,
      isPractice: false,
      talismanUsedThisJudgment: false,
      botTalismanDecided: false,
      interventions: [],
    }

    draft.progress.stepDeadlineAt = context.now + GAME_CONFIG.talismanWindowSeconds * 1000

    out.cues.push({
      kind: CUE_KIND.TALISMAN_WINDOW,
      audience: CUE_AUDIENCE.DISPLAY,
      text: `부적을 태워 저주를 봉인할 시간 ${GAME_CONFIG.talismanWindowSeconds}초`,
    })
  },

  command(draft, context, out, seat, command): Rejection | undefined {
    if (command.type !== COMMAND_TYPE.TALISMAN_SUBMIT) {
      return reject(REJECTION_REASON.WRONG_STEP, command.type)
    }

    const current = requireCurrentEvent(draft)
    // 선착순 1개만 적용한다 (룰북 §13.5)
    if (current.talismanSubmittedBy !== null) {
      return reject(REJECTION_REASON.NOT_ALLOWED, '이미 제출된 부적이 있다')
    }
    if (draft.seats[seat].talismanCount < 1) {
      return reject(REJECTION_REASON.NOT_ALLOWED, '제출할 낡은 부적이 없다')
    }

    draft.seats[seat].talismanCount -= 1
    current.talismanSubmittedBy = seat
    requireJudgment(draft).succeeded = true

    // 부적 사용 사실은 이름과 함께 공개한다 (룰북 §7.4, §17)
    draft.notices.push({
      kind: PUBLIC_NOTICE_KIND.TALISMAN_USED,
      text: `${seat}가 부적을 태워 탈 조각을 봉인했다`,
    })
    out.logs.push({
      at: context.now,
      code: LOG_CODE.TALISMAN_SUBMITTED,
      message: `${seat} 14A 부적 제출`,
      data: { eventId: current.eventId, seat, submitted: true },
    })

    out.next = GAME_STEP.RESOLUTION
    return undefined
  },

  timeout(draft, context, out) {
    const current = requireCurrentEvent(draft)
    requireJudgment(draft).succeeded = false

    // 미제출 — 무작위 1명이 저주를 받는다. Display에는 익명으로만 표시 (룰북 §13.5)
    draft.notices.push({
      kind: PUBLIC_NOTICE_KIND.ANONYMOUS_CURSE,
      text: '누군가 탈 조각의 저주를 받았다',
    })
    out.logs.push({
      at: context.now,
      code: LOG_CODE.TALISMAN_SUBMITTED,
      message: '14A 부적 미제출 — 봉인 실패',
      data: { eventId: current.eventId, seat: null, submitted: false },
    })

    out.next = GAME_STEP.RESOLUTION
  },
}
