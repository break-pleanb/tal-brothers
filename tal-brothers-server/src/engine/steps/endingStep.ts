import { CUE_KIND, ENDING_ID, PUBLIC_NOTICE_KIND } from 'tal-brothers-shared'
import type { EndingId } from 'tal-brothers-shared'

import { ENDING_NARRATIONS, ENDINGS } from '../../scenario/endings'
import type { EndingNarrationKey } from '../../scenario/endings'
import type { StepHandler } from '../dispatch'
import { CUE_AUDIENCE, LOG_CODE } from '../engineTypes'
import type { EngineContext, StepOutput } from '../engineTypes'
import { traitorOutcome, traitorSeats } from '../rules/traitor'
import { SEAT_ORDER } from '../state/gameState'
import type { GameState } from '../state/gameState'

/**
 * 엔딩 (룰북 §15).
 *
 * - 엔딩 확정은 `requestEnding`으로 상태에 먼저 적어 두고 `ENDING` 단계로 들어간다
 * - `ENDING`은 타이머가 없는 종료 상태다. 이후 액션은 `dispatch`가 모두 거절한다
 * - 엔딩 연출 20분은 게임 시계 밖에서 진행한다 (룰북 §2.1)
 */

export type EndingRequest = {
  /** 1인 플레이 A-2 성공 등 전용 내레이션 (룰북 §14.5) */
  narrationKey?: EndingNarrationKey | null
}

/** 엔딩을 확정해 상태에 적는다. 승패는 엔딩표에서 읽는다 (룰북 §15) */
export function requestEnding(
  draft: GameState,
  id: EndingId,
  request: EndingRequest = {},
): void {
  draft.ending = {
    id,
    traitorWon: traitorOutcome(draft, id),
    narrationKey: request.narrationKey ?? null,
  }
}

/** 배신자 승패 표기 — 배신자가 없는 판은 승패를 판정하지 않는다 (룰북 §15) */
export function traitorOutcomeLabel(traitorWon: boolean | null): string {
  if (traitorWon === null) return '승패 해당 없음'
  return traitorWon ? '승리' : '패배'
}

function narrationOf(state: GameState): string {
  const ending = state.ending
  if (ending === null) throw new Error('엔딩이 확정되지 않았다')
  if (ending.narrationKey !== null) {
    const custom = ENDING_NARRATIONS[ending.narrationKey as EndingNarrationKey]
    if (custom !== undefined) return custom
  }
  return ENDINGS[ending.id].narration
}

export const ENDING_HANDLER: StepHandler = {
  enter(draft: GameState, context: EngineContext, out: StepOutput) {
    const ending = draft.ending
    if (ending === null) throw new Error('엔딩이 확정되지 않았다')

    const definition = ENDINGS[ending.id]
    // 종료 상태라 타이머를 남기지 않는다
    draft.progress.stepDeadlineAt = null

    draft.notices.push({
      kind: PUBLIC_NOTICE_KIND.ENDING,
      text: definition.title,
    })
    out.cues.push({
      kind: CUE_KIND.ENDING,
      audience: CUE_AUDIENCE.DISPLAY,
      text: `${definition.title} — ${narrationOf(draft)}`,
      data: { endingId: ending.id, assets: definition.assets },
    })

    // 강제 잠식은 모든 화면이 노이즈로 덮이고 조작이 잠긴다 (룰북 §2.1)
    if (ending.id === ENDING_ID.FORCED_EROSION) {
      out.cues.push({
        kind: CUE_KIND.NOISE_LOCK,
        audience: CUE_AUDIENCE.DISPLAY,
        text: '모든 화면이 노이즈로 덮인다',
      })
    }

    out.logs.push({
      at: context.now,
      code: LOG_CODE.ENDING_DECIDED,
      message: `엔딩 ${definition.title} (배신자 ${traitorOutcomeLabel(ending.traitorWon)})`,
      data: {
        endingId: ending.id,
        traitorWon: ending.traitorWon,
        narrationKey: ending.narrationKey,
        traitorSeats: traitorSeats(draft),
        erosion: Object.fromEntries(
          SEAT_ORDER.map((role) => [role, draft.seats[role].erosionPercent]),
        ),
        clockRemainingMs: draft.clock.deadlineAt - context.now,
        timedOut: draft.clock.expiredAt !== null,
      },
    })
  },
}
