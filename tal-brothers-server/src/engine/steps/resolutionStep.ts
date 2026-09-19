import { CUE_KIND, ENDING_ID, GAME_PHASE, GAME_STEP, JUDGMENT_KIND, PHASE3_ROUTE } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'
import { hasJudgment } from '../../scenario/scenarioTypes'
import type { Effect } from '../../scenario/scenarioTypes'
import type { StepHandler } from '../dispatch'
import { CUE_AUDIENCE, LOG_CODE } from '../engineTypes'
import type { EngineContext, StepOutput } from '../engineTypes'
import { ENDING_NARRATION_KEY } from '../../scenario/endings'
import { applyEffects, stripRewards } from '../rules/effects'
import { isClockExpired, markClockExpired, timeoutEndsGame } from '../rules/clock'
import { allHumansTurned } from '../rules/traitor'
import { requestEnding } from './endingStep'
import { applySeatErosion } from '../rules/erosion'
import { clampTeamModifier } from '../rules/modifiers'
import { SEAT_ORDER } from '../state/gameState'
import type { GameState } from '../state/gameState'
import { adoptedChoice, coopTopSeat, currentScenarioEvent } from './rollStep'

/**
 * 결과 적용 (룰북 §3.2, §4.2, §5.4, §5.5, §9.2).
 *
 * 진입에서 효과를 모두 적용하고 **3초 머문다** (룰북 §19, 아키텍처 §5.3).
 * 체류를 서버 단계로 두어야 Display와 모든 Controller가 같은 시점에 같은 결과를 본다.
 * 다음 이벤트·Phase로 넘어가는 일은 타이머 만료가 한다.
 *
 * 진입: ① 비공개 판정 대가 고정 적용 ② 적용된 팀 플래그 소멸 ③ 변이 적용된 결과 선택
 * ④ 강제 성공이면 보상 제거 ⑤ 효과 적용 ⑥ 환경 잠식 ⑦ T1 종료 시 튜토리얼 부적 소멸 ⑧ 체류 마감 설정
 *
 * 만료: 다음 이벤트 또는 다음 Phase
 *
 * **효과 적용 직후 게임이 끝나는 경우는 체류하지 않는다** — 타임오버, 인간 전원 배신자, Phase 3.
 * 엔딩 화면이 곧 결과 화면이라 같은 내용을 두 번 기다리게 된다.
 */

/** Phase 2 랜덤 이벤트가 끝날 때마다 전원 +5% (룰북 §4.2) */
function applyEnvironmentErosion(
  draft: GameState,
  context: EngineContext,
  out: StepOutput,
): void {
  const current = draft.currentEvent
  if (current === null || current.environmentErosionApplied) return

  current.environmentErosionApplied = true
  for (const role of SEAT_ORDER) {
    applySeatErosion(draft, role, GAME_CONFIG.environmentErosionPercent, context, out)
  }

  out.logs.push({
    at: context.now,
    code: LOG_CODE.ENVIRONMENT_EROSION,
    message: `환경 잠식 전원 +${GAME_CONFIG.environmentErosionPercent}%`,
    data: {
      eventId: current.eventId,
      erosion: Object.fromEntries(
        SEAT_ORDER.map((role) => [role, draft.seats[role].erosionPercent]),
      ),
    },
  })
}

/**
 * Phase 3 결과 — 효과가 아니라 엔딩으로 이어진다 (룰북 §14, §15).
 * A-1은 판정 없이 비극적 탈출, B-1·A-2는 판정 결과로 갈린다.
 */
function decidePhase3Ending(draft: GameState, context: EngineContext, out: StepOutput): void {
  const phase3 = draft.phase3
  if (phase3 === null) throw new Error('Phase 3 상태가 없다')
  const judgment = draft.currentJudgment
  const succeeded = judgment?.succeeded === true

  if (phase3.route === PHASE3_ROUTE.BAIT) {
    requestEnding(draft, ENDING_ID.TRAGIC_ESCAPE)
  } else if (phase3.route === PHASE3_ROUTE.PURIFY) {
    requestEnding(draft, succeeded ? ENDING_ID.PURIFY : ENDING_ID.ETERNAL_MAZE)
  } else {
    // A-2. 1인 플레이에서 본인이 타겟인 성공은 전용 내레이션을 쓴다 (룰북 §14.5)
    requestEnding(draft, succeeded ? ENDING_ID.ESCAPE_PARTING : ENDING_ID.ANNIHILATION, {
      narrationKey:
        succeeded && phase3.soloPlayTargetIsSelf ? ENDING_NARRATION_KEY.SOLO_SELF_TARGET : null,
    })
  }

  if (judgment !== null) {
    out.logs.push({
      at: context.now,
      code: LOG_CODE.CONTEST_RESOLVED,
      message: `Phase 3 ${phase3.route ?? '-'} ${succeeded ? '성공' : '실패'}`,
      data: {
        route: phase3.route,
        targetSeat: phase3.targetSeat,
        contest: judgment.contest,
        opponentValue: judgment.opponentDie?.value ?? null,
        teamSeats: judgment.teamSeats,
        succeeded,
      },
    })
  }

  out.next = GAME_STEP.ENDING
}

export const RESOLUTION_HANDLER: StepHandler = {
  enter(draft, context, out) {
    // Phase 3는 효과 목록이 아니라 엔딩으로 간다 (룰북 §14, §15)
    if (draft.progress.phase === GAME_PHASE.PHASE_3) {
      decidePhase3Ending(draft, context, out)
      return
    }

    const event = currentScenarioEvent(draft)
    const current = draft.currentEvent
    const judgment = draft.currentJudgment
    const choice = adoptedChoice(draft)
    const rollerSeat = current?.rollerSeat ?? null

    // 비공개 판정 대가는 성패와 무관하게 판정자에게 고정 적용 (룰북 §5.4)
    if (judgment !== null && judgment.kind === JUDGMENT_KIND.HIDDEN && rollerSeat !== null) {
      applySeatErosion(draft, rollerSeat, GAME_CONFIG.hiddenJudgmentCostPercent, context, out)
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
    applyEffects(
      draft,
      effects,
      {
        rollerSeat,
        coopTopSeat: judgment === null ? null : coopTopSeat(judgment, context),
        submitterSeat: current?.talismanSubmittedBy ?? null,
        eventId: event.id,
        nextEventId: draft.progress.eventOrder[draft.progress.eventIndex + 1] ?? null,
      },
      context,
      out,
    )

    out.logs.push({
      at: context.now,
      code: LOG_CODE.EFFECTS_APPLIED,
      message: `${event.id} ${current?.adoptedChoiceId ?? '-'} 효과 ${effects.length}건 적용`,
      data: {
        eventId: event.id,
        adoptedChoiceId: current?.adoptedChoiceId ?? null,
        succeeded: judgment?.succeeded ?? null,
        forcedSuccess: judgment?.forcedSuccess ?? false,
        judgmentKind: judgment?.kind ?? null,
      },
    })

    // 환경 잠식은 판정 결과·강제 성공과 무관하게 적용한다 (룰북 §4.2)
    if (event.environmentErosion) {
      applyEnvironmentErosion(draft, context, out)
    }

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

    // 시간 페널티로 시계가 0 아래로 내려가면 그 자리에서 타임오버다 (룰북 §2.1)
    if (timeoutEndsGame(draft) && isClockExpired(draft, context.now)) {
      markClockExpired(draft, context.now)
      out.logs.push({
        at: context.now,
        code: LOG_CODE.CLOCK_TIMEOUT,
        message: '결과 적용 직후 게임 시계가 0을 지났다',
        data: { phase: draft.progress.phase, eventId: event.id },
      })
      requestEnding(draft, ENDING_ID.FORCED_EROSION)
      out.next = GAME_STEP.ENDING
      return
    }

    // 살아있는 인간이 전원 배신자가 되면 즉시 강제 잠식 (룰북 §10.3)
    if (allHumansTurned(draft)) {
      out.logs.push({
        at: context.now,
        code: LOG_CODE.PHASE_COMPLETE,
        message: '인간 전원이 이면의 형제가 되었다',
        data: { phase: draft.progress.phase, eventId: event.id },
      })
      requestEnding(draft, ENDING_ID.FORCED_EROSION)
      out.next = GAME_STEP.ENDING
      return
    }

    // 결과를 볼 시간을 둔다. 다음 단계 전이는 타이머 만료가 한다 (룰북 §19, 아키텍처 §5.3)
    draft.progress.stepDeadlineAt = context.now + GAME_CONFIG.resolutionSeconds * 1000
  },

  timeout(draft, context, out) {
    draft.progress.eventIndex += 1
    if (draft.progress.eventIndex < draft.progress.eventOrder.length) {
      out.next = GAME_STEP.EVENT_INTRO
      return
    }

    out.logs.push({
      at: context.now,
      code: LOG_CODE.PHASE_COMPLETE,
      message: `${draft.progress.phase} 이벤트를 모두 마쳤다`,
      data: { phase: draft.progress.phase },
    })

    // Phase 전환은 해당 Phase의 이벤트를 모두 마쳤을 때 일어난다 (룰북 §2.1)
    out.next =
      draft.progress.phase === GAME_PHASE.PHASE_1
        ? GAME_STEP.PHASE2_ENTRY
        : GAME_STEP.P3_TARGETING
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
