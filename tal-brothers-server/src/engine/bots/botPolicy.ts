import { BROTHER_ROLE, JUDGMENT_KIND } from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

import { LOG_CODE } from '../engineTypes'
import type { EngineContext, StepOutput } from '../engineTypes'
import { pickOne, rollD6 } from '../random'
import { addTeamModifier } from '../rules/modifiers'
import { INTERVENTION_KIND, PUBLIC_NOTICE_KIND, SEAT_ORDER } from '../state/gameState'
import type { GameState, JudgmentState } from '../state/gameState'

/**
 * 봇 정책 (룰북 §11).
 *
 * - 투표하지 않는다. 판정 굴림만 담당한다
 * - 둘째 봇: 판정 실패 시 개입 창 1단계에서 자동 재굴림. 협동 판정은 본인 주사위가 현재 최고값일 때만
 * - 부적 자동 사용: 실패가 확정됐고 +1로 성공이 되는 경우에만. **판단 시점은 부적 단계 마감 1초 전**이고,
 *   그때까지 아무도 부적을 쓰지 않았어야 한다
 * - 첫째 봇: 보스 이벤트 실패 시에만 강제 성공
 * - 셋째 봇: 투표권이 없어 절대 시야를 쓰지 않는다
 * - 100% 방해: 게임당 1회, 팀 다음 판정 -1 또는 부적 보유자 1명의 부적 1개 소멸
 *
 * 판정 계산값은 호출하는 단계 처리기가 넘겨준다. 봇 정책이 판정 규칙을 다시 구현하지 않는다.
 */

/** 봇 좌석의 주사위를 진입 즉시 굴린다 (아키텍처 §8). 대립 판정의 팀 측 주사위도 같다 */
export function botRollOwnDice(draft: GameState, context: EngineContext, out: StepOutput): void {
  const judgment = draft.currentJudgment
  if (judgment === null) return

  for (const die of judgment.dice) {
    if (die.value !== null) continue
    if (!draft.seats[die.seat].isBot) continue

    die.value = rollD6(context.rng)
    out.logs.push({
      at: context.now,
      code: LOG_CODE.DICE_ROLLED,
      message: `${die.seat}(봇) 굴림 ${die.value}`,
    })
  }
}

/**
 * 둘째 봇이 재굴림을 쓸지 판단한다 (룰북 §11).
 * 협동 판정에서는 본인 주사위가 현재 최고값(`topDiceValue`)일 때만 쓴다.
 */
export function shouldBotReroll(
  draft: GameState,
  judgment: JudgmentState,
  topDiceValue: number,
): boolean {
  const second = draft.seats[BROTHER_ROLE.SECOND]
  if (!second.isBot) return false
  if (second.abilityUsed) return false
  if (judgment.succeeded !== false) return false
  if (judgment.interventions.some((record) => record.kind === INTERVENTION_KIND.REROLL)) {
    return false
  }

  const ownDie = judgment.dice.find((die) => die.seat === BROTHER_ROLE.SECOND)
  if (ownDie === undefined || ownDie.value === null) return false

  if (judgment.kind === JUDGMENT_KIND.COOP || judgment.kind === JUDGMENT_KIND.CONTEST) {
    return ownDie.value === topDiceValue
  }
  return true
}

/**
 * 부적을 쓸 봇 좌석을 고른다 (룰북 §11).
 * 실패가 확정됐고 `finalValue + 1`이 성공 기준에 닿을 때만, 아직 아무도 쓰지 않았을 때 1명만 고른다.
 * 좌석 순서(첫째 → 둘째 → 셋째)로 먼저 걸리는 봇이 쓴다. 보류함 부적은 세지 않는다 (M2 계획 10.1).
 */
export function botTalismanUser(
  draft: GameState,
  judgment: JudgmentState,
  finalValue: number,
): BrotherRole | null {
  if (judgment.talismanUsedThisJudgment) return null
  if (judgment.succeeded !== false) return null
  // +1로도 성공이 되지 않으면 쓰지 않는다
  if (!wouldSucceedWithTalisman(judgment, finalValue)) return null

  for (const role of SEAT_ORDER) {
    const seat = draft.seats[role]
    if (!seat.isBot) continue
    if (seat.talismanCount + seat.tutorialTalismanCount < 1) continue
    return role
  }
  return null
}

/** 부적 +1이 성패를 뒤집는지. 대립 판정은 동점이 배신자 승이라 상대값을 넘어야 한다 (룰북 §14.3) */
function wouldSucceedWithTalisman(judgment: JudgmentState, finalValue: number): boolean {
  if (judgment.contest) {
    const opponent = judgment.opponentDie?.value
    if (opponent === null || opponent === undefined) return false
    return finalValue + 1 > opponent
  }
  return finalValue + 1 >= judgment.threshold
}

/**
 * 첫째 봇의 강제 성공 (룰북 §11).
 * 보스 이벤트 실패 시에만 쓴다. Phase 3에서는 강제 성공 자체가 금지다 (룰북 §14.2).
 */
export function shouldBotForceSuccess(isBoss: boolean): boolean {
  return isBoss
}

/** 100% 방해 수단 (룰북 §11) */
export const BOT_SABOTAGE_KIND = {
  /** 팀의 다음 판정 -1 (디버프 합계 하한 -2) */
  TEAM_DEBUFF: 'teamDebuff',
  /** 부적 보유자 1명의 부적 1개 소멸 */
  TALISMAN_BURN: 'talismanBurn',
} as const

export type BotSabotageKind = (typeof BOT_SABOTAGE_KIND)[keyof typeof BOT_SABOTAGE_KIND]

export type SabotageOptions = {
  /** 1인 플레이에서 본인에게 적용할 때. 부적 소멸 대상을 본인으로 한정한다 (룰북 §10.1) */
  selfOnly: boolean
}

/**
 * 100% 방해 (룰북 §11).
 * 게임당 1회. 부적 소멸은 보유자가 있을 때만 발동할 수 있으므로 **발동 가능한 수단 중에서** 고른다.
 */
export function applyBotSabotage(
  draft: GameState,
  role: BrotherRole,
  context: EngineContext,
  out: StepOutput,
  options: SabotageOptions,
): BotSabotageKind | null {
  const actor = draft.seats[role]
  if (actor.botSabotageUsed) return null

  const burnTargets = talismanHolders(draft, options.selfOnly ? role : null)
  const kinds: BotSabotageKind[] =
    burnTargets.length === 0
      ? [BOT_SABOTAGE_KIND.TEAM_DEBUFF]
      : [BOT_SABOTAGE_KIND.TEAM_DEBUFF, BOT_SABOTAGE_KIND.TALISMAN_BURN]
  const kind = pickOne(context.rng, kinds)

  actor.botSabotageUsed = true

  if (kind === BOT_SABOTAGE_KIND.TEAM_DEBUFF) {
    draft.teamModifier = addTeamModifier(draft.teamModifier, -1)
    // 출처 없이 익명으로 표시한다 (룰북 §5.5)
    const noticeText = '누군가의 불길한 기운 -1'
    draft.notices.push({ kind: PUBLIC_NOTICE_KIND.ANONYMOUS_MODIFIER, text: noticeText })
    out.logs.push({
      at: context.now,
      code: LOG_CODE.ANONYMOUS_NOTICE,
      message: `${role} 100% 방해 — 팀 다음 판정 -1`,
      data: {
        notice: PUBLIC_NOTICE_KIND.ANONYMOUS_MODIFIER,
        source: 'botSabotage',
        seat: role,
        delta: -1,
        text: noticeText,
      },
    })
    out.logs.push({
      at: context.now,
      code: LOG_CODE.BOT_SABOTAGE,
      message: `${role} 100% 방해 — 팀 다음 판정 -1`,
      data: { seat: role, kind },
    })
    return kind
  }

  const victim = pickOne(context.rng, burnTargets)
  draft.seats[victim].talismanCount -= 1
  out.logs.push({
    at: context.now,
    code: LOG_CODE.BOT_SABOTAGE,
    message: `${role} 100% 방해 — ${victim}의 부적 1개 소멸`,
    data: { seat: role, kind, victim },
  })
  return kind
}

/** 부적 보유 좌석. 보류함은 쓸 수 없는 부적이라 세지 않는다 (M2 계획 10.1) */
function talismanHolders(draft: GameState, only: BrotherRole | null): BrotherRole[] {
  return SEAT_ORDER.filter((role) => {
    if (only !== null && role !== only) return false
    return draft.seats[role].talismanCount > 0
  })
}
