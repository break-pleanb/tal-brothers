import { JUDGMENT_KIND } from 'tal-brothers-shared'
import type { VariantDetailView, VariantKind } from 'tal-brothers-shared'

import { EFFECT_CATEGORY } from '../../scenario/constants/effectCategory'
import { EFFECT_KIND } from '../../scenario/constants/effectKind'
import { hasJudgment, isRollJudgment } from '../../scenario/scenarioTypes'
import type { Choice, Effect, ScenarioEvent } from '../../scenario/scenarioTypes'
import { applyVariantToChoice } from './variant'

/**
 * 변이 열람 화면의 최종 적용값 (룰북 §6.2, §6.4).
 *
 * 라벨(진짜든 가짜든)의 변이를 **기본 선택지에 적용한 사본**에서 수치를 뽑는다. 가짜 라벨은 확정 저장된
 * 가짜 변이에서 결정적으로 나오므로, 같은 라벨이면 언제 투영해도 같은 값이다 (아키텍처 §2 원칙 4).
 *
 * - 키는 언제나 6개 전부 채운다. 해당 없는 값은 null — 진짜·가짜의 구조가 같아야 한다 (아키텍처 §7.3)
 * - 비공개 판정은 대가가 고정이라 **성공 기준만** 싣는다 (룰북 §5.4, §6.2)
 * - 변이를 적용하지 않는 선택지(14A)는 기본값 그대로다 (룰북 §6.3)
 */

function emptyDetail(): VariantDetailView {
  return {
    threshold: null,
    failureErosionPercent: null,
    failureTimeMinutes: null,
    rewardTalismans: null,
    rewardHealPercent: null,
    timeCostMinutes: null,
  }
}

/** 실패 시 잠식 페널티 — 효과가 여럿이면 가장 큰 값 (대상이 전원이어도 각자에게 같은 값이다, 룰북 §6.2) */
function failureErosion(effects: Effect[]): number | null {
  const values = effects
    .filter((effect) => effect.category === EFFECT_CATEGORY.PENALTY && effect.kind === EFFECT_KIND.EROSION)
    .map((effect) => (effect.kind === EFFECT_KIND.EROSION ? effect.deltaPercent : 0))
  return values.length === 0 ? null : Math.max(...values)
}

/** 시간 페널티(분, 양수로). `timeDelta.minutes`는 음수가 시간 소모다 */
function timePenalty(effects: Effect[]): number | null {
  const values = effects
    .filter((effect) => effect.category === EFFECT_CATEGORY.PENALTY && effect.kind === EFFECT_KIND.TIME_DELTA)
    // 길로 0분까지 되돌아오면 -0이 되므로 0 아래를 잘라 정리한다
    .map((effect) => (effect.kind === EFFECT_KIND.TIME_DELTA ? Math.max(0, -effect.minutes) : 0))
  return values.length === 0 ? null : Math.max(...values)
}

function rewardTalismans(effects: Effect[]): number | null {
  const counts = effects
    .filter((effect) => effect.category === EFFECT_CATEGORY.REWARD && effect.kind === EFFECT_KIND.TALISMAN)
    .map((effect) => (effect.kind === EFFECT_KIND.TALISMAN ? effect.count : 0))
  return counts.length === 0 ? null : counts.reduce((sum, count) => sum + count, 0)
}

/** 잠식도 회복 보상(%, 양수로) */
function rewardHeal(effects: Effect[]): number | null {
  const values = effects
    .filter(
      (effect) =>
        effect.category === EFFECT_CATEGORY.REWARD &&
        effect.kind === EFFECT_KIND.EROSION &&
        effect.deltaPercent < 0,
    )
    .map((effect) => (effect.kind === EFFECT_KIND.EROSION ? -effect.deltaPercent : 0))
  return values.length === 0 ? null : Math.max(...values)
}

export function variantDetailOf(choice: Choice, variant: VariantKind, applies: boolean): VariantDetailView {
  const applied = applies ? applyVariantToChoice(choice, variant) : choice
  const detail = emptyDetail()

  if (!hasJudgment(applied)) {
    detail.timeCostMinutes = timePenalty(applied.resolve)
    return detail
  }

  if (isRollJudgment(applied.judgment)) {
    detail.threshold = applied.judgment.threshold
    // 비공개 판정은 대가 고정 — 성공 기준만 (룰북 §6.2)
    if (applied.judgment.kind === JUDGMENT_KIND.HIDDEN) return detail
  }

  detail.failureErosionPercent = failureErosion(applied.failure)
  detail.failureTimeMinutes = timePenalty(applied.failure)
  detail.rewardTalismans = rewardTalismans(applied.success)
  detail.rewardHealPercent = rewardHeal(applied.success)
  return detail
}

/** 라벨이 붙은 선택지마다 최종 적용값을 만든다. 라벨이 없으면 null */
export function variantDetailsFor(
  event: ScenarioEvent,
  labels: Record<string, VariantKind> | null,
): Record<string, VariantDetailView> | null {
  if (labels === null) return null
  const details: Record<string, VariantDetailView> = {}
  for (const choice of event.choices) {
    const label = labels[choice.id]
    if (label === undefined) continue
    details[choice.id] = variantDetailOf(choice, label, event.variantApplied && choice.variantExempt !== true)
  }
  return details
}
