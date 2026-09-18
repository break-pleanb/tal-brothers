import { BROTHER_ROLE, COMMAND_TYPE, CUE_KIND } from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'
import type { StepHandler } from '../dispatch'
import { LOG_CODE, REJECTION_REASON, reject } from '../engineTypes'
import type { EngineContext, Rejection, StepOutput } from '../engineTypes'
import { pickOne } from '../random'
import { applySeatErosion } from '../rules/erosion'
import { PUBLIC_NOTICE_KIND, SEAT_ORDER } from '../state/gameState'
import type { CurrentEventState, GameState } from '../state/gameState'
import { adoptChoice, currentScenarioEvent, nextStepAfterAdopt } from './rollStep'

/**
 * 투표 (룰북 §8) + 투표 시간 중 행동 (룰북 §3.4, §9.1, M2 계획 10.1).
 *
 * - 투표권은 인간 좌석 전원. 봇은 투표하지 않으며 조기 마감 판정에서도 제외한다 (룰북 §11)
 * - 마감 전 재전송으로 선택을 바꿀 수 있다 (아키텍처 §8)
 * - 동률은 동률 선택지 중 무작위, 전원 기권은 전체 선택지 중 무작위 (룰북 §8)
 * - 부적 보유 상한 초과분(보류함)은 이 시간에 양도·버림으로 정리하고, 마감 시 남으면 자동으로 버린다
 */

function requireCurrentEvent(state: GameState): CurrentEventState {
  if (state.currentEvent === null) throw new Error('현재 이벤트가 없다')
  return state.currentEvent
}

function humanSeats(state: GameState): BrotherRole[] {
  return SEAT_ORDER.filter((role) => !state.seats[role].isBot)
}

/** 연결된 인간 전원이 투표했는지 (아키텍처 §8). M2는 전원 연결 상태로 본다 */
function allHumansVoted(state: GameState): boolean {
  const current = requireCurrentEvent(state)
  const humans = humanSeats(state)
  // 인간이 없는 구성(봇 자동 대전)은 조기 마감하지 않고 투표 시간을 그대로 흘린다 (M2 계획 10절 12번)
  if (humans.length === 0) return false
  return humans.every((role) => current.votes[role] !== undefined)
}

/**
 * 투표 마감 시점에 남은 보류함 부적을 모두 버린다 (M2 계획 10.1).
 * 보유 여부는 비공개이므로 Display 알림을 남기지 않는다 (룰북 §9.1).
 */
export function discardRemainingOverflow(
  draft: GameState,
  context: EngineContext,
  out: StepOutput,
): void {
  for (const role of SEAT_ORDER) {
    const seat = draft.seats[role]
    if (seat.talismanOverflow <= 0) continue

    const discarded = seat.talismanOverflow
    seat.talismanOverflow = 0
    out.logs.push({
      at: context.now,
      code: LOG_CODE.TALISMAN_OVERFLOW,
      message: `${role} 보류함 부적 ${discarded}개 자동 폐기 (투표 마감)`,
      data: { seat: role, discarded, reason: 'voteClosed' },
    })
  }
}

/**
 * 집계 → 채택 → 판정자 확정 (룰북 §3.1, §8).
 * `earlyClosed`는 인간 전원이 투표해 마감 시각 전에 끝났는지다 (룰북 §8).
 */
function tallyAndAdopt(
  draft: GameState,
  context: EngineContext,
  out: StepOutput,
  earlyClosed: boolean,
): void {
  const current = requireCurrentEvent(draft)
  const event = currentScenarioEvent(draft)

  const counts = new Map<string, number>()
  for (const role of humanSeats(draft)) {
    const choiceId = current.votes[role]
    if (choiceId === undefined) continue
    counts.set(choiceId, (counts.get(choiceId) ?? 0) + 1)
  }

  let adopted: string
  if (counts.size === 0) {
    // 전원 기권 → 전체 선택지 중 무작위 (룰북 §8)
    adopted = pickOne(context.rng, event.choices).id
  } else {
    const top = Math.max(...counts.values())
    const tied = [...counts.entries()]
      .filter(([, count]) => count === top)
      .map(([choiceId]) => choiceId)
    // 동률 → 동률 선택지 중 무작위 (룰북 §8)
    adopted = tied.length === 1 ? (tied[0] as string) : pickOne(context.rng, tied)
  }

  // 마감 후 득표 수만 공개한다. 투표자는 끝까지 비공개 (룰북 §8)
  draft.notices.push({
    kind: PUBLIC_NOTICE_KIND.VOTE_TALLY,
    text: event.choices.map((choice) => `${choice.text} ${counts.get(choice.id) ?? 0}표`).join(' · '),
  })
  // 마지막 표는 집계·채택·다음 이벤트 진입이 한 처리 안에서 끝나 상태로는 관찰되지 않는다.
  // 득표 수를 로그에 함께 남겨야 조기 마감 경로에서도 집계 결과를 그대로 읽을 수 있다
  out.logs.push({
    at: context.now,
    code: LOG_CODE.VOTE_TALLIED,
    message: `채택 ${adopted} (득표 ${counts.get(adopted) ?? 0}${earlyClosed ? ', 조기 마감' : ''})`,
    data: {
      eventId: event.id,
      adoptedChoiceId: adopted,
      counts: Object.fromEntries(counts),
      earlyClosed,
    },
  })

  // 투표 시간이 끝나면 보류함을 정리한다 (M2 계획 10.1)
  discardRemainingOverflow(draft, context, out)

  out.next = nextStepAfterAdopt(adoptChoice(draft, adopted))
}

export const VOTING_HANDLER: StepHandler = {
  enter(draft, context, _out) {
    requireCurrentEvent(draft).votes = {}
    draft.progress.stepDeadlineAt = context.now + GAME_CONFIG.votingSeconds * 1000
  },

  command(draft, context, out, seat, command): Rejection | undefined {
    const current = requireCurrentEvent(draft)
    const event = currentScenarioEvent(draft)

    switch (command.type) {
      case COMMAND_TYPE.VOTE_SUBMIT: {
        if (!event.choices.some((choice) => choice.id === command.choiceId)) {
          return reject(REJECTION_REASON.NOT_ALLOWED, `없는 선택지다: ${command.choiceId}`)
        }
        current.votes[seat] = command.choiceId
        out.logs.push({
          at: context.now,
          code: LOG_CODE.VOTE_SUBMITTED,
          message: `${seat} 투표 완료`,
        })

        // 인간 전원이 투표를 마치면 조기 마감 (룰북 §8, 아키텍처 §8)
        if (allHumansVoted(draft)) {
          tallyAndAdopt(draft, context, out, true)
        }
        return undefined
      }

      case COMMAND_TYPE.ABILITY_TRUE_SIGHT: {
        // 셋째만, 투표 시간 중에만 (룰북 §3.4)
        if (seat !== BROTHER_ROLE.THIRD) {
          return reject(REJECTION_REASON.WRONG_SEAT, '절대 시야는 셋째만 쓴다')
        }
        if (current.trueSightUsed) {
          return reject(REJECTION_REASON.NOT_ALLOWED, '이 이벤트에서 이미 열람했다')
        }
        if (draft.seats[seat].abilityUsed) {
          return reject(REJECTION_REASON.NOT_ALLOWED, '고유 능력을 이미 썼다')
        }

        current.trueSightUsed = true
        // T1·T2 중 사용은 횟수를 소모하지 않는다 (룰북 §3.5)
        if (!event.isTutorial) {
          draft.seats[seat].abilityUsed = true
        }

        // 가짜 라벨을 무시하고 항상 진짜를 보여준다 (룰북 §3.4)
        out.cues.push({
          kind: CUE_KIND.TRUE_SIGHT_RESULT,
          audience: seat,
          text: '모든 선택지의 실제 변이를 열람했다',
          data: { variants: { ...current.variants } },
        })
        draft.notices.push({
          kind: PUBLIC_NOTICE_KIND.ABILITY_USED,
          text: '셋째가 절대 시야를 사용했다',
        })
        out.logs.push({
          at: context.now,
          code: LOG_CODE.ABILITY_USED,
          message: `${seat} 절대 시야 (횟수 소모 ${event.isTutorial ? '없음' : '있음'})`,
        })
        return undefined
      }

      case COMMAND_TYPE.TALISMAN_HEAL: {
        // 튜토리얼 부적은 판정 보정 전용이고, 보류함 부적은 어느 용도로도 쓸 수 없다 (룰북 §9.2, M2 계획 10.1)
        if (draft.seats[seat].talismanCount < 1) {
          return reject(REJECTION_REASON.NOT_ALLOWED, '회복에 쓸 낡은 부적이 없다')
        }

        draft.seats[seat].talismanCount -= 1
        applySeatErosion(draft, seat, -GAME_CONFIG.talismanHealPercent, context, out)
        draft.notices.push({
          kind: PUBLIC_NOTICE_KIND.TALISMAN_USED,
          text: `${seat}가 낡은 부적으로 잠식을 씻었다`,
        })
        out.logs.push({
          at: context.now,
          code: LOG_CODE.TALISMAN_HEALED,
          message: `${seat} 부적 회복 -${GAME_CONFIG.talismanHealPercent}%`,
          data: { seat, healPercent: GAME_CONFIG.talismanHealPercent },
        })
        return undefined
      }

      case COMMAND_TYPE.TALISMAN_TRANSFER: {
        const giver = draft.seats[seat]
        if (giver.talismanOverflow < 1) {
          return reject(REJECTION_REASON.NOT_ALLOWED, '정리할 보류함 부적이 없다')
        }
        if (command.toSeat === seat) {
          return reject(REJECTION_REASON.NOT_ALLOWED, '자기 자신에게는 양도할 수 없다')
        }

        const receiver = draft.seats[command.toSeat]
        if (receiver === undefined) {
          return reject(REJECTION_REASON.WRONG_SEAT, command.toSeat)
        }
        // 받는 좌석도 상한을 넘길 수 없다 (룰북 §9.1)
        if (receiver.talismanCount >= GAME_CONFIG.talismanLimit) {
          return reject(REJECTION_REASON.NOT_ALLOWED, '받는 좌석이 이미 보유 상한이다')
        }

        giver.talismanOverflow -= 1
        receiver.talismanCount += 1

        // 받는 사람에게만 알린다. Display에는 표시하지 않는다 (룰북 §21)
        out.cues.push({
          kind: CUE_KIND.TUTORIAL_TALISMAN_GRANTED,
          audience: command.toSeat,
          text: '형제가 낡은 부적 1개를 건넸다',
        })
        out.logs.push({
          at: context.now,
          code: LOG_CODE.TALISMAN_OVERFLOW,
          message: `${seat} → ${command.toSeat} 보류함 부적 1개 양도`,
          data: { seat, toSeat: command.toSeat, reason: 'transfer' },
        })
        return undefined
      }

      case COMMAND_TYPE.TALISMAN_DISCARD: {
        if (draft.seats[seat].talismanOverflow < 1) {
          return reject(REJECTION_REASON.NOT_ALLOWED, '버릴 보류함 부적이 없다')
        }

        draft.seats[seat].talismanOverflow -= 1
        out.logs.push({
          at: context.now,
          code: LOG_CODE.TALISMAN_OVERFLOW,
          message: `${seat} 보류함 부적 1개 버림`,
          data: { seat, discarded: 1, reason: 'discard' },
        })
        return undefined
      }

      default:
        return reject(REJECTION_REASON.WRONG_STEP, command.type)
    }
  },

  timeout(draft, context, out) {
    // 미투표자는 기권 처리 (룰북 §8)
    tallyAndAdopt(draft, context, out, false)
  },
}
