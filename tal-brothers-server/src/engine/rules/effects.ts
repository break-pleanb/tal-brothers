import { CUE_KIND } from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'
import { EFFECT_CATEGORY } from '../../scenario/constants/effectCategory'
import { EFFECT_KIND } from '../../scenario/constants/effectKind'
import { EFFECT_TARGET } from '../../scenario/constants/effectTarget'
import type { EffectTarget } from '../../scenario/constants/effectTarget'
import { WHISPER_KIND } from '../../scenario/constants/whisperKind'
import type { WhisperKind } from '../../scenario/constants/whisperKind'
import type { Effect } from '../../scenario/scenarioTypes'
import { LOG_CODE } from '../engineTypes'
import type { EngineContext, StepOutput } from '../engineTypes'
import { pickOne } from '../random'
import { PUBLIC_NOTICE_KIND, SEAT_ORDER } from '../state/gameState'
import type { GameState } from '../state/gameState'
import { applySeatErosion } from './erosion'
import { addTeamModifier } from './modifiers'
import {
  T2_WHISPER_TARGET_EVENT_ID,
  buildTierWhisper,
  deliverWhisper,
  whisperLogData,
} from './whisper'

/**
 * 효과 적용 (룰북 §3.2, §4.1, §5.3, §9.1, §13.5, 아키텍처 §5.4).
 * 이벤트마다 예외 코드를 쓰지 않고 효과의 분류와 대상만 보고 처리한다.
 */

export type EffectContext = {
  /** 개인·비공개 판정자. 협동 판정은 null (룰북 §5.2) */
  rollerSeat: BrotherRole | null
  /** 협동 판정의 보상 수령자 — 개입 후 최종 최고값 주사위의 주인 (룰북 §5.3) */
  coopTopSeat: BrotherRole | null
  /** 14A 부적 제출자 (룰북 §13.5) */
  submitterSeat: BrotherRole | null
  /** 효과가 발생한 이벤트 id */
  eventId: string
  /** 다음 이벤트 id — 사당 실패 귓속말의 발송 시점 (룰북 §13.2) */
  nextEventId: string | null
}

/**
 * 강제 성공 시 적용할 효과를 고른다 (룰북 §3.2).
 * 보상은 제거하고 성공에 따라오는 부작용은 그대로 남긴다.
 */
export function stripRewards(effects: Effect[]): Effect[] {
  return effects.filter((effect) => effect.category !== EFFECT_CATEGORY.REWARD)
}

/** 로그 문장용 부호 표기 */
function signedValue(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`
}

function signedPercent(value: number): string {
  return `${signedValue(value)}%`
}

/** 효과 대상을 좌석 목록으로 바꾼다 (룰북 §4.1, §5.3, §13.5) */
export function resolveTargetSeats(
  target: EffectTarget,
  context: EffectContext,
  engine: EngineContext,
): BrotherRole[] {
  switch (target) {
    case EFFECT_TARGET.ALL:
      return [...SEAT_ORDER]
    case EFFECT_TARGET.ALL_EXCEPT_ROLLER: {
      const roller = requireSeat(context.rollerSeat, target, context)
      return SEAT_ORDER.filter((role) => role !== roller)
    }
    case EFFECT_TARGET.RANDOM_SEAT:
      // 봇과 배신자를 포함한 좌석 전원이 모집단이다 (M2 계획 10절 3번)
      return [pickOne(engine.rng, SEAT_ORDER)]
    case EFFECT_TARGET.ROLLER:
      return [requireSeat(context.rollerSeat, target, context)]
    case EFFECT_TARGET.COOP_TOP_ROLLER:
      return [requireSeat(context.coopTopSeat, target, context)]
    case EFFECT_TARGET.SUBMITTER:
      return [requireSeat(context.submitterSeat, target, context)]
  }
}

function requireSeat(
  seat: BrotherRole | null,
  target: EffectTarget,
  context: EffectContext,
): BrotherRole {
  if (seat === null) {
    throw new Error(`효과 대상 ${target}을 해석할 좌석이 없다 (이벤트 ${context.eventId})`)
  }
  return seat
}

/**
 * 부적을 지급한다 (룰북 §9.1, M2 계획 10.1).
 * 보유 상한을 넘는 만큼은 인벤토리가 아니라 보류함에 들어가고, 판정·회복에 쓸 수 없다.
 */
export function grantTalisman(
  draft: GameState,
  role: BrotherRole,
  count: number,
  engine: EngineContext,
  out: StepOutput,
): void {
  const seat = draft.seats[role]
  const room = Math.max(0, GAME_CONFIG.talismanLimit - seat.talismanCount)
  const stored = Math.min(count, room)
  const overflow = count - stored

  seat.talismanCount += stored
  seat.talismanOverflow += overflow

  out.logs.push({
    at: engine.now,
    code: LOG_CODE.TALISMAN_GAINED,
    message: `${role} 부적 +${count} (보유 ${seat.talismanCount}${
      overflow > 0 ? `, 보류함 +${overflow}` : ''
    })`,
    data: { seat: role, count, stored, overflow },
  })
}

/** 효과 목록을 상태에 적용한다. `draft`는 이미 복제된 상태여야 한다 */
export function applyEffects(
  draft: GameState,
  effects: Effect[],
  context: EffectContext,
  engine: EngineContext,
  out: StepOutput,
): void {
  for (const effect of effects) {
    applyEffect(draft, effect, context, engine, out)
  }
}

function applyEffect(
  draft: GameState,
  effect: Effect,
  context: EffectContext,
  engine: EngineContext,
  out: StepOutput,
): void {
  switch (effect.kind) {
    case EFFECT_KIND.EROSION: {
      const seats = resolveTargetSeats(effect.target, context, engine)
      for (const role of seats) {
        applySeatErosion(draft, role, effect.deltaPercent, engine, out)
      }

      // 무작위 1명 대상(14A 미제출 저주)은 Display에 익명으로만 나간다 (룰북 §13.5, §17)
      const [cursed] = seats
      if (effect.target === EFFECT_TARGET.RANDOM_SEAT && cursed !== undefined) {
        out.logs.push({
          at: engine.now,
          code: LOG_CODE.ANONYMOUS_NOTICE,
          message: `${cursed} 탈 조각의 저주 ${signedPercent(effect.deltaPercent)}`,
          data: {
            notice: PUBLIC_NOTICE_KIND.ANONYMOUS_CURSE,
            source: 'randomSeat',
            seat: cursed,
            deltaPercent: effect.deltaPercent,
            eventId: context.eventId,
            text: '누군가 탈 조각의 저주를 받았다',
          },
        })
      }
      return
    }

    case EFFECT_KIND.TALISMAN: {
      for (const role of resolveTargetSeats(effect.target, context, engine)) {
        grantTalisman(draft, role, effect.count, engine, out)
      }
      return
    }

    case EFFECT_KIND.JADE_HAIRPIN: {
      for (const role of resolveTargetSeats(effect.target, context, engine)) {
        // 비소모성이라 개수가 아니라 보유 여부다 (룰북 §9.3)
        draft.seats[role].hasJadeHairpin = true
      }
      return
    }

    case EFFECT_KIND.TEAM_MODIFIER: {
      draft.teamModifier = addTeamModifier(draft.teamModifier, effect.delta)
      const noticeText =
        effect.delta < 0
          ? `누군가의 불길한 기운 ${effect.delta}`
          : `누군가의 든든한 기운 +${effect.delta}`
      draft.notices.push({ kind: PUBLIC_NOTICE_KIND.ANONYMOUS_MODIFIER, text: noticeText })
      // 출처는 채택 선택지의 결과다. Display에는 나가지 않는다 (룰북 §5.5, §17)
      out.logs.push({
        at: engine.now,
        code: LOG_CODE.ANONYMOUS_NOTICE,
        message: `${context.eventId} 결과 — 팀 다음 판정 ${signedValue(effect.delta)}`,
        data: {
          notice: PUBLIC_NOTICE_KIND.ANONYMOUS_MODIFIER,
          source: 'choiceEffect',
          seat: null,
          delta: effect.delta,
          eventId: context.eventId,
          text: noticeText,
        },
      })
      return
    }

    case EFFECT_KIND.TIME_DELTA: {
      // 시간 페널티는 남은 시간에서 즉시 차감한다 (룰북 §2.1)
      draft.clock.deadlineAt += effect.minutes * 60_000
      return
    }

    case EFFECT_KIND.WHISPER: {
      const [targetSeat] = resolveTargetSeats(effect.target, context, engine)
      if (targetSeat === undefined) return

      // 이벤트 귓속말은 결과 적용 시점에 바로 발송한다 (룰북 §16)
      if (effect.whisperKind === WHISPER_KIND.EVENT_WHISPER) {
        const whisper = buildTierWhisper(
          draft,
          targetSeat,
          WHISPER_KIND.EVENT_WHISPER,
          effect.truthful,
          engine.rng,
          context.eventId,
        )
        deliverWhisper(draft, targetSeat, whisper, effect.truthful)
        out.cues.push({
          kind: CUE_KIND.WHISPER_RECEIVED,
          audience: targetSeat,
          text: whisper.text,
        })
        out.logs.push({
          at: engine.now,
          code: LOG_CODE.WHISPER_DELIVERED,
          message: `${targetSeat} 수신 — ${whisper.text}`,
          data: whisperLogData(context.eventId, targetSeat, whisper, effect.truthful),
        })
        return
      }

      // 나머지는 발송 시점이 뒤라 진실 여부만 확정해 예약한다 (룰북 §12, §13.2)
      draft.pendingWhispers.push({
        kind: effect.whisperKind,
        targetSeat,
        truthful: effect.truthful,
        deliverAtEventId: deliverEventIdFor(effect.whisperKind, context),
      })
      return
    }
  }
}

/** 예약 귓속말의 발송 시점 (룰북 §12, §13.2) */
function deliverEventIdFor(whisperKind: WhisperKind, context: EffectContext): string {
  if (whisperKind === WHISPER_KIND.T2_VARIANT) return T2_WHISPER_TARGET_EVENT_ID
  // 사당 실패 귓속말은 다음 이벤트 시작 시 발송한다. 판정 공개 직후에 보내면 거짓이 바로 들킨다
  return context.nextEventId ?? context.eventId
}
