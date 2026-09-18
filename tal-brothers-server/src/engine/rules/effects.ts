import type { BrotherRole } from 'tal-brothers-shared'

import { EFFECT_CATEGORY } from '../../scenario/constants/effectCategory'
import { EFFECT_KIND } from '../../scenario/constants/effectKind'
import { EFFECT_TARGET } from '../../scenario/constants/effectTarget'
import type { EffectTarget } from '../../scenario/constants/effectTarget'
import { WHISPER_KIND } from '../../scenario/constants/whisperKind'
import type { Effect } from '../../scenario/scenarioTypes'
import { PUBLIC_NOTICE_KIND, SEAT_ORDER } from '../state/gameState'
import type { GameState } from '../state/gameState'
import { applyErosionDelta } from './erosion'
import { addTeamModifier } from './modifiers'
import { T2_WHISPER_TARGET_EVENT_ID } from './whisper'

/**
 * 효과 적용 (룰북 §3.2, §4.1, §5.3, 아키텍처 §5.4).
 * 이벤트마다 예외 코드를 쓰지 않고 효과의 분류만 보고 처리한다.
 */

export type EffectContext = {
  /** 개인·비공개 판정자. 협동 판정은 null (룰북 §5.2) */
  rollerSeat: BrotherRole | null
  /** 협동 판정의 보상 수령자 — 개입 후 최종 최고값 주사위의 주인 (룰북 §5.3) */
  coopTopSeat: BrotherRole | null
  /** 효과가 발생한 이벤트 id. 귓속말 예약에 쓴다 */
  eventId: string
}

/**
 * 강제 성공 시 적용할 효과를 고른다 (룰북 §3.2).
 * 보상은 제거하고 성공에 따라오는 부작용은 그대로 남긴다.
 */
export function stripRewards(effects: Effect[]): Effect[] {
  return effects.filter((effect) => effect.category !== EFFECT_CATEGORY.REWARD)
}

/** 효과 대상을 좌석 목록으로 바꾼다 (룰북 §4.1, §5.3) */
export function resolveTargetSeats(target: EffectTarget, context: EffectContext): BrotherRole[] {
  if (target === EFFECT_TARGET.ALL) return [...SEAT_ORDER]

  const seat = target === EFFECT_TARGET.ROLLER ? context.rollerSeat : context.coopTopSeat
  if (seat === null) {
    throw new Error(`효과 대상 ${target}을 해석할 좌석이 없다 (이벤트 ${context.eventId})`)
  }
  return [seat]
}

/** 효과 목록을 상태에 적용한다. `draft`는 이미 복제된 상태여야 한다 */
export function applyEffects(draft: GameState, effects: Effect[], context: EffectContext): void {
  for (const effect of effects) {
    applyEffect(draft, effect, context)
  }
}

function applyEffect(draft: GameState, effect: Effect, context: EffectContext): void {
  switch (effect.kind) {
    case EFFECT_KIND.EROSION: {
      for (const role of resolveTargetSeats(effect.target, context)) {
        const seat = draft.seats[role]
        seat.erosionPercent = applyErosionDelta(seat.erosionPercent, effect.deltaPercent)
      }
      return
    }

    case EFFECT_KIND.TALISMAN: {
      for (const role of resolveTargetSeats(effect.target, context)) {
        // 보유 상한(룰북 §9.1) 검사와 양도·버림은 M2
        draft.seats[role].talismanCount += effect.count
      }
      return
    }

    case EFFECT_KIND.TEAM_MODIFIER: {
      draft.teamModifier = addTeamModifier(draft.teamModifier, effect.delta)
      draft.notices.push({
        kind: PUBLIC_NOTICE_KIND.ANONYMOUS_MODIFIER,
        text:
          effect.delta < 0
            ? `누군가의 불길한 기운 ${effect.delta}`
            : `누군가의 든든한 기운 +${effect.delta}`,
      })
      return
    }

    case EFFECT_KIND.TIME_DELTA: {
      // 시간 페널티는 남은 시간에서 즉시 차감한다 (룰북 §2.1)
      draft.clock.deadlineAt += effect.minutes * 60_000
      return
    }

    case EFFECT_KIND.WHISPER: {
      const [targetSeat] = resolveTargetSeats(effect.target, context)
      if (targetSeat === undefined) return
      // 진실/거짓은 발생 시점에 확정해 저장하고, 내용은 발송 시점에 만든다 (룰북 §12, §16)
      draft.pendingWhispers.push({
        kind: effect.whisperKind,
        targetSeat,
        truthful: effect.truthful,
        deliverAtEventId:
          effect.whisperKind === WHISPER_KIND.T2_VARIANT
            ? T2_WHISPER_TARGET_EVENT_ID
            : context.eventId,
      })
      // Display 알림은 실제 발송 시점에 남긴다 (룰북 §16)
      return
    }
  }
}
