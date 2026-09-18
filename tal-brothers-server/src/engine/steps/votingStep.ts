import { BROTHER_ROLE, COMMAND_TYPE, CUE_KIND, GAME_STEP } from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'
import { hasJudgment } from '../../scenario/scenarioTypes'
import type { StepHandler } from '../dispatch'
import { LOG_CODE, REJECTION_REASON, reject } from '../engineTypes'
import type { EngineContext, Rejection, StepOutput } from '../engineTypes'
import { pickOne } from '../random'
import { applySeatErosion } from '../rules/erosion'
import { PUBLIC_NOTICE_KIND, SEAT_ORDER } from '../state/gameState'
import type { CurrentEventState, GameState } from '../state/gameState'
import { adoptChoice, currentScenarioEvent } from './rollStep'

/**
 * 투표 (룰북 §8) + 투표 시간 중 행동 (룰북 §3.4, §9.1).
 *
 * - 투표권은 인간 좌석 전원. 봇은 투표하지 않으며 조기 마감 판정에서도 제외한다 (룰북 §11)
 * - 마감 전 재전송으로 선택을 바꿀 수 있다 (아키텍처 §8)
 * - 동률은 동률 선택지 중 무작위, 전원 기권은 전체 선택지 중 무작위 (룰북 §8)
 */

function requireCurrentEvent(state: GameState): CurrentEventState {
  if (state.currentEvent === null) throw new Error('현재 이벤트가 없다')
  return state.currentEvent
}

function humanSeats(state: GameState): BrotherRole[] {
  return SEAT_ORDER.filter((role) => !state.seats[role].isBot)
}

/** 연결된 인간 전원이 투표했는지 (아키텍처 §8). M1은 전원 연결 상태로 본다 */
function allHumansVoted(state: GameState): boolean {
  const current = requireCurrentEvent(state)
  return humanSeats(state).every((role) => current.votes[role] !== undefined)
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

  const choice = adoptChoice(draft, adopted)
  out.next = hasJudgment(choice) ? GAME_STEP.ROLL_WAIT : GAME_STEP.RESOLUTION
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
        // 튜토리얼 부적은 판정 보정 전용이라 회복에 쓸 수 없다 (룰북 §9.2)
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
