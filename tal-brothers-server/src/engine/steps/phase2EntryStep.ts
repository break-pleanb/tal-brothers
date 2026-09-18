import { CUE_KIND, GAME_PHASE, GAME_STEP } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'
import type { StepHandler } from '../dispatch'
import { CUE_AUDIENCE, LOG_CODE } from '../engineTypes'
import { applySeatErosion } from '../rules/erosion'
import { addTeamModifier } from '../rules/modifiers'
import { buildPhase2EventOrder } from '../rules/slots'
import { buildEntryWarningWhisper, deliverWhisper } from '../rules/whisper'
import { PUBLIC_NOTICE_KIND, SEAT_ORDER } from '../state/gameState'

/**
 * Phase 2 진입 (룰북 §13.1, §13.3).
 *
 * - 슬롯 배치를 확정해 이벤트 순서표를 교체한다
 * - 진입 환청: 부적 보유자는 경고 귓속말만(부적 소모 없음), 미보유자는 잠식 +20%와 1명당 팀 -1
 * - 선택지가 없어 좌석마다 결과가 달라서 이벤트가 아니라 단계로 둔다 (M2 계획 10절 1번)
 * - 룰북에 이 연출의 시간이 없으므로 타이머 없이 곧바로 첫 이벤트로 넘어간다
 */

const NARRATION =
  '끝없는 고목 숲. 나뭇가지의 오방색 헝겊이 미세하게 흔들리고, 누군가의 귓가에 속삭임이 들린다. ' +
  '"너희들 중 누군가는 이미 껍데기만 남았어. 뒤를 돌아보지 마라."'

export const PHASE2_ENTRY_HANDLER: StepHandler = {
  enter(draft, context, out) {
    draft.progress.phase = GAME_PHASE.PHASE_2
    draft.progress.eventOrder = buildPhase2EventOrder(context.rng)
    draft.progress.eventIndex = 0
    draft.currentEvent = null
    draft.currentJudgment = null

    const firstEventId = draft.progress.eventOrder[0] ?? ''

    out.cues.push({
      kind: CUE_KIND.PHASE_ENTERED,
      audience: CUE_AUDIENCE.DISPLAY,
      text: NARRATION,
    })

    for (const role of SEAT_ORDER) {
      const seat = draft.seats[role]

      // 보류함 부적은 쓸 수 없으므로 보유로 세지 않는다 (M2 계획 10.1)
      if (seat.talismanCount > 0) {
        const whisper = buildEntryWarningWhisper(firstEventId)
        deliverWhisper(draft, role, whisper)
        out.cues.push({ kind: CUE_KIND.WHISPER_RECEIVED, audience: role, text: whisper.text })
        out.logs.push({
          at: context.now,
          code: LOG_CODE.WHISPER_DELIVERED,
          message: `${role} 진입 경고 (부적 소모 없음)`,
          data: { eventId: firstEventId, seat: role, kind: whisper.kind },
        })
        continue
      }

      applySeatErosion(draft, role, GAME_CONFIG.phase2EntryNoTalismanPercent, context, out)
      // 미보유자 1명당 팀 다음 판정 -1. 하한 -2는 합산에서 걸린다 (룰북 §5.5, §13.1)
      draft.teamModifier = addTeamModifier(draft.teamModifier, -1)
      draft.notices.push({
        kind: PUBLIC_NOTICE_KIND.ANONYMOUS_MODIFIER,
        text: '누군가의 불길한 기운 -1',
      })
    }

    out.logs.push({
      at: context.now,
      code: LOG_CODE.PHASE_ENTERED,
      message: `Phase 2 진입 — 슬롯 ${draft.progress.eventOrder.join(' → ')}`,
      data: {
        phase: GAME_PHASE.PHASE_2,
        eventOrder: [...draft.progress.eventOrder],
        teamModifier: draft.teamModifier,
        erosion: Object.fromEntries(
          SEAT_ORDER.map((role) => [role, draft.seats[role].erosionPercent]),
        ),
      },
    })

    out.next = GAME_STEP.EVENT_INTRO
  },
}
