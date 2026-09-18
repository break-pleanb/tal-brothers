import { CUE_KIND, EROSION_TIER, GAME_STEP } from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'
import { WHISPER_KIND } from '../../scenario/constants/whisperKind'
import type { StepHandler } from '../dispatch'
import { CUE_AUDIENCE, LOG_CODE } from '../engineTypes'
import type { EngineContext, StepOutput } from '../engineTypes'
import { pickOne, rollChance } from '../random'
import { tierOf } from '../rules/erosion'
import { redMessageCue } from '../rules/traitor'
import { rollEventVariants, rollFakeLabelsForSeat } from '../rules/variant'
import {
  buildTierWhisper,
  deliverPendingWhispers,
  deliverWhisper,
  rollTierWhisperTruth,
  shouldReceiveTierWhisper,
} from '../rules/whisper'
import { PUBLIC_NOTICE_KIND, SEAT_ORDER } from '../state/gameState'
import type { CurrentEventState, GameState } from '../state/gameState'
import { adoptChoice, nextStepAfterAdopt, scenarioEventAt } from './rollStep'

/**
 * 상황 제시 (룰북 §2.2, §4.3, §6.1, §9.2, §12, §13).
 *
 * 진입 처리 순서
 * ① 이벤트 로드 ② 튜토리얼 부적 지급 ③ 선택지별 변이 확정 ④ 가짜 라벨 확정
 * ⑤ 티어 환청·가짜 붉은 메시지(랜덤 이벤트) ⑥ 13번 발목 대상 ⑦ 예약 귓속말 발송 ⑧ 마감 설정
 *
 * 가짜 정보는 여기서 한 번 굴려 상태에 확정 저장한다. 전송할 때마다 새로 굴리지 않는다 (아키텍처 §2).
 */

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

/**
 * 60~99% 좌석의 가짜 라벨을 확정한다 (룰북 §4.3, M2 계획 10.2).
 * 좌석마다 1회 굴리고, 걸리면 그 이벤트의 모든 선택지를 가짜로 표시한다.
 */
function decideFakeLabels(
  draft: GameState,
  current: CurrentEventState,
  context: EngineContext,
  out: StepOutput,
): void {
  for (const role of SEAT_ORDER) {
    if (tierOf(draft.seats[role].erosionPercent) !== EROSION_TIER.TIER60) continue

    const labels = rollFakeLabelsForSeat(current.variants, context.rng)
    if (labels === null) continue

    current.fakeLabels[role] = labels
    out.logs.push({
      at: context.now,
      code: LOG_CODE.VARIANTS_DECIDED,
      message: `${role} 가짜 라벨 확정`,
      data: { eventId: current.eventId, seat: role, fakeLabels: labels },
    })
  }
}

/**
 * 랜덤 이벤트 시작 시의 잠식 티어 효과 (룰북 §4.3, §13.3, M2 계획 10절 5·6번).
 *
 * - 티어 환청: 30~59%는 50%, 60~99%는 100%. 좌석당 이벤트당 1건
 * - 가짜 붉은 메시지: 60~99% 좌석마다 확률 판정. 진짜 전환과 같은 cue를 쓴다
 */
function applyTierEffects(
  draft: GameState,
  current: CurrentEventState,
  context: EngineContext,
  out: StepOutput,
): void {
  for (const role of SEAT_ORDER) {
    const seat = draft.seats[role]

    if (shouldReceiveTierWhisper(seat.erosionPercent, context.rng)) {
      const truthful = rollTierWhisperTruth(context.rng)
      const whisper = buildTierWhisper(
        draft,
        role,
        WHISPER_KIND.TIER_HALLUCINATION,
        truthful,
        context.rng,
        current.eventId,
      )
      deliverWhisper(draft, role, whisper)
      out.cues.push({ kind: CUE_KIND.WHISPER_RECEIVED, audience: role, text: whisper.text })
      out.logs.push({
        at: context.now,
        code: LOG_CODE.WHISPER_DELIVERED,
        message: `${role} 티어 환청 — ${whisper.text}`,
        data: { eventId: current.eventId, seat: role, kind: WHISPER_KIND.TIER_HALLUCINATION },
      })
    }

    if (
      tierOf(seat.erosionPercent) === EROSION_TIER.TIER60 &&
      rollChance(context.rng, GAME_CONFIG.fakeRedMessageChance)
    ) {
      // 진짜 전환과 같은 형식·문장·표시 시간이라 "붉은 화면 = 배신자"가 성립하지 않는다 (룰북 §10.1)
      out.cues.push(redMessageCue(role))
    }
  }
}

/** 13번 발목 대상 — 연출 전용이고 판정자·효과 대상과 무관하다 (룰북 §13.5, M2 계획 10절 8번) */
function pickGrabbedSeat(
  draft: GameState,
  current: CurrentEventState,
  context: EngineContext,
  out: StepOutput,
): void {
  const target = pickOne(context.rng, SEAT_ORDER)
  current.grabbedSeat = target

  draft.notices.push({
    kind: PUBLIC_NOTICE_KIND.SEAT_GRABBED,
    text: `${target}의 발목을 썩은 손들이 붙잡았다`,
  })
  out.logs.push({
    at: context.now,
    code: LOG_CODE.SEAT_GRABBED,
    message: `${target} 발목 대상 지목`,
    data: { eventId: current.eventId, seat: target },
  })
}

export const EVENT_INTRO_HANDLER: StepHandler = {
  enter(draft, context, out) {
    const event = scenarioEventAt(draft, draft.progress.eventIndex)

    const current: CurrentEventState = {
      eventId: event.id,
      variants: {},
      fakeLabels: {},
      trueSightUsed: false,
      votes: {},
      adoptedChoiceId: null,
      rollerSeat: null,
      grabbedSeat: null,
      talismanSubmittedBy: null,
      environmentErosionApplied: false,
    }
    draft.currentEvent = current
    draft.currentJudgment = null

    if (event.grantsTutorialTalisman) {
      grantTutorialTalisman(draft, context, out)
    }

    // 변이는 이벤트가 출현할 때 선택지마다 결정해 확정 저장한다 (룰북 §6.1)
    current.variants = rollEventVariants(event, context.rng)
    if (event.variantApplied) {
      out.logs.push({
        at: context.now,
        code: LOG_CODE.VARIANTS_DECIDED,
        message: Object.entries(current.variants)
          .map(([choiceId, variant]) => `${choiceId}:${variant}`)
          .join(' '),
        data: { eventId: event.id, variants: { ...current.variants } },
      })
      decideFakeLabels(draft, current, context, out)
    }

    // 티어 효과는 Phase 2 랜덤 이벤트에만 적용한다 (룰북 §4.3, §13.3)
    if (event.environmentErosion) {
      applyTierEffects(draft, current, context, out)
    }

    if (event.grabsRandomSeat) {
      pickGrabbedSeat(draft, current, context, out)
    }

    // 예약 귓속말은 변이 결정 직후 내용을 만들어 발송한다 (룰북 §12, §13.2)
    const delivered = deliverPendingWhispers(draft, event, current.variants, context.rng)
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
        data: { eventId: event.id, seat: targetSeat, kind: whisper.kind },
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
      data: { eventId: event.id, phase: draft.progress.phase, index: draft.progress.eventIndex },
    })
  },

  timeout(draft, _context, out) {
    const event = scenarioEventAt(draft, draft.progress.eventIndex)
    if (!event.skipVoting) {
      out.next = GAME_STEP.VOTING
      return
    }

    // 선택지가 1개인 이벤트는 투표를 생략하고 그 선택지를 곧바로 채택한다 (룰북 §12, §14.3)
    const only = event.choices[0]
    if (only === undefined) throw new Error(`선택지가 없는 이벤트다: ${event.id}`)
    out.next = nextStepAfterAdopt(adoptChoice(draft, only.id))
  },
}
