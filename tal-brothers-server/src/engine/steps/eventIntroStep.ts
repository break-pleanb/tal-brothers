import { CUE_KIND, GAME_STEP } from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'
import { findPhase1Event } from '../../scenario/phase1Events'
import { hasJudgment } from '../../scenario/scenarioTypes'
import type { ScenarioEvent } from '../../scenario/scenarioTypes'
import type { StepHandler } from '../dispatch'
import { CUE_AUDIENCE, LOG_CODE } from '../engineTypes'
import type { EngineContext, StepOutput } from '../engineTypes'
import { pickOne } from '../random'
import { rollEventVariants } from '../rules/variant'
import { deliverPendingWhispers } from '../rules/whisper'
import { SEAT_ORDER } from '../state/gameState'
import type { GameState } from '../state/gameState'
import { adoptChoice } from './rollStep'

/**
 * 상황 제시 (룰북 §2.2, §6.1, §9.2, §12).
 *
 * 진입 처리 순서
 * ① 이벤트 로드 ② 튜토리얼 부적 지급 ③ 선택지별 변이 확정 ④ 예약 귓속말 발송 ⑤ 마감 설정
 */

function eventAt(state: GameState, index: number): ScenarioEvent {
  const eventId = state.progress.eventOrder[index]
  if (eventId === undefined) throw new Error(`이벤트 순서표 밖이다: ${index}`)
  const event = findPhase1Event(eventId)
  if (event === undefined) throw new Error(`시나리오에 없는 이벤트다: ${eventId}`)
  return event
}

/** 튜토리얼 부적을 인간 좌석 1명에게 랜덤 지급한다. 봇은 제외 (룰북 §9.2) */
function grantTutorialTalisman(
  draft: GameState,
  context: EngineContext,
  out: StepOutput,
): BrotherRole | null {
  const humans = SEAT_ORDER.filter((role) => !draft.seats[role].isBot)
  if (humans.length === 0) return null

  const target = pickOne(context.rng, humans)
  draft.seats[target].tutorialTalismanCount += 1

  out.cues.push({
    kind: CUE_KIND.TUTORIAL_TALISMAN_GRANTED,
    audience: target,
    text: '길바닥에서 낡은 부적 1개를 주웠다',
  })
  out.logs.push({
    at: context.now,
    code: LOG_CODE.TUTORIAL_TALISMAN_GRANTED,
    message: `${target}에게 튜토리얼 부적 1개 지급`,
  })
  return target
}

export const EVENT_INTRO_HANDLER: StepHandler = {
  enter(draft, context, out) {
    const event = eventAt(draft, draft.progress.eventIndex)

    // M1은 시계가 0을 지나도 로그만 남기고 진행한다 (로드맵 M1 범위). 타임오버 엔딩은 M2
    if (context.now > draft.clock.deadlineAt) {
      out.logs.push({
        at: context.now,
        code: LOG_CODE.CLOCK_EXPIRED,
        message: '게임 시계가 0을 지났다 (M1은 계속 진행)',
      })
    }

    draft.currentEvent = {
      eventId: event.id,
      variants: {},
      trueSightUsed: false,
      votes: {},
      adoptedChoiceId: null,
      rollerSeat: null,
    }
    draft.currentJudgment = null

    if (event.grantsTutorialTalisman) {
      grantTutorialTalisman(draft, context, out)
    }

    // 변이는 이벤트가 출현할 때 선택지마다 결정해 확정 저장한다 (룰북 §6.1)
    draft.currentEvent.variants = rollEventVariants(event, context.rng)
    if (event.variantApplied) {
      out.logs.push({
        at: context.now,
        code: LOG_CODE.VARIANTS_DECIDED,
        message: Object.entries(draft.currentEvent.variants)
          .map(([choiceId, variant]) => `${choiceId}:${variant}`)
          .join(' '),
      })
    }

    // 예약 귓속말은 변이 결정 직후 내용을 만들어 발송한다 (룰북 §12)
    const delivered = deliverPendingWhispers(
      draft,
      event,
      draft.currentEvent.variants,
      context.rng,
    )
    for (const { targetSeat, whisper } of delivered) {
      out.cues.push({
        kind: CUE_KIND.WHISPER_RECEIVED,
        audience: targetSeat,
        text: whisper.text,
      })
      out.logs.push({
        at: context.now,
        code: LOG_CODE.WHISPER_DELIVERED,
        message: `${targetSeat} 수신 — ${whisper.text}`,
      })
    }

    draft.progress.stepDeadlineAt = context.now + GAME_CONFIG.eventIntroSeconds * 1000

    out.cues.push({
      kind: CUE_KIND.EVENT_INTRO,
      audience: CUE_AUDIENCE.DISPLAY,
      text: `${event.title} — ${event.narration}`,
      data: { backgroundAsset: event.backgroundAsset, maskAsset: event.maskAsset },
    })
    out.logs.push({
      at: context.now,
      code: LOG_CODE.EVENT_ENTERED,
      message: `이벤트 ${draft.progress.eventIndex + 1}/${draft.progress.eventOrder.length} ${event.title}`,
    })
  },

  timeout(draft, _context, out) {
    const event = eventAt(draft, draft.progress.eventIndex)
    if (!event.skipVoting) {
      out.next = GAME_STEP.VOTING
      return
    }

    // 선택지가 1개인 이벤트는 투표를 생략하고 그 선택지를 곧바로 채택한다 (룰북 §12, 아키텍처 §5.3)
    const only = event.choices[0]
    if (only === undefined) throw new Error(`선택지가 없는 이벤트다: ${event.id}`)
    const choice = adoptChoice(draft, only.id)
    out.next = hasJudgment(choice) ? GAME_STEP.ROLL_WAIT : GAME_STEP.RESOLUTION
  },
}
