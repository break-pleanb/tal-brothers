import { CUE_KIND, GAME_STEP, JUDGMENT_KIND } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'
import { hasJudgment } from '../../scenario/scenarioTypes'
import type { Effect } from '../../scenario/scenarioTypes'
import type { StepHandler } from '../dispatch'
import { CUE_AUDIENCE, LOG_CODE } from '../engineTypes'
import { applyEffects, stripRewards } from '../rules/effects'
import { applyErosionDelta } from '../rules/erosion'
import { clampTeamModifier } from '../rules/modifiers'
import { SEAT_ORDER } from '../state/gameState'
import { adoptedChoice, coopTopSeat, currentScenarioEvent } from './rollStep'

/**
 * 결과 적용 (룰북 §3.2, §5.4, §5.5, §9.2). 타이머 없이 곧바로 다음 이벤트로 넘어간다.
 *
 * ① 비공개 판정 대가 고정 적용 ② 변이 적용된 결과 선택 ③ 강제 성공이면 보상 제거
 * ④ 효과 적용 ⑤ 적용된 팀 플래그 소멸 ⑥ T1 종료 시 튜토리얼 부적 소멸 ⑦ 다음 이벤트
 */
export const RESOLUTION_HANDLER: StepHandler = {
  enter(draft, context, out) {
    const event = currentScenarioEvent(draft)
    const current = draft.currentEvent
    const judgment = draft.currentJudgment
    const choice = adoptedChoice(draft)
    const rollerSeat = current?.rollerSeat ?? null

    // 비공개 판정 대가는 성패와 무관하게 판정자에게 고정 적용 (룰북 §5.4)
    if (judgment !== null && judgment.kind === JUDGMENT_KIND.HIDDEN && rollerSeat !== null) {
      draft.seats[rollerSeat].erosionPercent = applyErosionDelta(
        draft.seats[rollerSeat].erosionPercent,
        GAME_CONFIG.hiddenJudgmentCostPercent,
      )
      out.logs.push({
        at: context.now,
        code: LOG_CODE.HIDDEN_JUDGMENT_COST,
        message: `${rollerSeat} 비공개 판정 대가 +${GAME_CONFIG.hiddenJudgmentCostPercent}%`,
      })
    }

    // 이 판정에 적용된 팀 플래그는 소멸한다. 새 플래그는 아래 효과 적용에서 쌓인다 (룰북 §5.5)
    if (judgment !== null) {
      draft.teamModifier = clampTeamModifier(draft.teamModifier - judgment.teamModifierApplied)
    }

    const effects = resultEffects(choice, judgment)
    applyEffects(draft, effects, {
      rollerSeat,
      coopTopSeat: judgment === null ? null : coopTopSeat(judgment, context),
      eventId: event.id,
    })

    out.logs.push({
      at: context.now,
      code: LOG_CODE.EFFECTS_APPLIED,
      message: `${event.id} ${current?.adoptedChoiceId ?? '-'} 효과 ${effects.length}건 적용`,
    })

    // T1 종료 시 미사용 튜토리얼 부적은 소멸한다 (룰북 §9.2)
    if (event.grantsTutorialTalisman) {
      const remaining = SEAT_ORDER.reduce(
        (sum, role) => sum + draft.seats[role].tutorialTalismanCount,
        0,
      )
      for (const role of SEAT_ORDER) {
        draft.seats[role].tutorialTalismanCount = 0
      }
      out.logs.push({
        at: context.now,
        code: LOG_CODE.TUTORIAL_TALISMAN_EXPIRED,
        message: `튜토리얼 부적 소멸 (미사용 ${remaining}개)`,
      })
    }

    out.cues.push({
      kind: CUE_KIND.RESOLUTION,
      audience: CUE_AUDIENCE.DISPLAY,
      text: `${event.title} 결과 적용`,
    })

    draft.progress.eventIndex += 1
    if (draft.progress.eventIndex < draft.progress.eventOrder.length) {
      out.next = GAME_STEP.EVENT_INTRO
      return
    }

    out.cues.push({
      kind: CUE_KIND.PHASE_ENTERED,
      audience: CUE_AUDIENCE.DISPLAY,
      text: 'Phase 1 종료',
    })
    out.logs.push({
      at: context.now,
      code: LOG_CODE.PHASE_COMPLETE,
      message: 'Phase 1 이벤트를 모두 마쳤다',
    })
    out.next = GAME_STEP.PHASE2_ENTRY
  },
}

/** 적용할 효과 목록 — 강제 성공이면 보상을 제거하고 부작용만 남긴다 (룰북 §3.2) */
function resultEffects(
  choice: ReturnType<typeof adoptedChoice>,
  judgment: { succeeded: boolean | null; forcedSuccess: boolean } | null,
): Effect[] {
  if (!hasJudgment(choice)) return choice.resolve
  if (judgment === null) return []
  if (judgment.forcedSuccess) return stripRewards(choice.success)
  return judgment.succeeded === true ? choice.success : choice.failure
}
