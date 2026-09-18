import { BROTHER_ROLE, JUDGMENT_KIND } from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

import { LOG_CODE } from '../engineTypes'
import type { EngineContext, StepOutput } from '../engineTypes'
import { rollD6 } from '../random'
import { INTERVENTION_KIND, SEAT_ORDER } from '../state/gameState'
import type { GameState, JudgmentState } from '../state/gameState'

/**
 * 봇 정책 (룰북 §11) — M1 범위.
 *
 * - 투표하지 않는다. 판정 굴림만 담당한다
 * - 둘째 봇: 판정 실패 시 개입 창 1단계에서 자동 재굴림. 협동 판정은 본인 주사위가 현재 최고값일 때만
 * - 부적 자동 사용: 실패가 확정됐고 +1로 성공이 되는 경우에만. **판단 시점은 부적 단계 마감 1초 전**이고,
 *   그때까지 아무도 부적을 쓰지 않았어야 한다 (룰북 §11 확정)
 * - 첫째 봇: 보스 이벤트 실패 시에만 강제 성공 → Phase 1에서는 사용하지 않는다
 * - 셋째 봇: 투표권이 없어 절대 시야를 쓰지 않는다
 *
 * 판정 계산값은 호출하는 단계 처리기가 넘겨준다. 봇 정책이 판정 규칙을 다시 구현하지 않는다.
 * 100% 방해는 M2 범위다.
 */

/** 봇 좌석의 주사위를 진입 즉시 굴린다 (아키텍처 §8) */
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

  if (judgment.kind === JUDGMENT_KIND.COOP) {
    return ownDie.value === topDiceValue
  }
  return true
}

/**
 * 부적을 쓸 봇 좌석을 고른다 (룰북 §11).
 * 실패가 확정됐고 `finalValue + 1`이 성공 기준에 닿을 때만, 아직 아무도 쓰지 않았을 때 1명만 고른다.
 * 좌석 순서(첫째 → 둘째 → 셋째)로 먼저 걸리는 봇이 쓴다.
 */
export function botTalismanUser(
  draft: GameState,
  judgment: JudgmentState,
  finalValue: number,
): BrotherRole | null {
  if (judgment.talismanUsedThisJudgment) return null
  if (judgment.succeeded !== false) return null
  // +1로도 성공이 되지 않으면 쓰지 않는다
  if (finalValue + 1 < judgment.threshold) return null

  for (const role of SEAT_ORDER) {
    const seat = draft.seats[role]
    if (!seat.isBot) continue
    if (seat.talismanCount + seat.tutorialTalismanCount < 1) continue
    return role
  }
  return null
}

/**
 * 첫째 봇의 강제 성공 (룰북 §11).
 * 보스 이벤트 실패 시에만 쓰므로 Phase 1에서는 항상 false다.
 */
export function shouldBotForceSuccess(): boolean {
  return false
}
