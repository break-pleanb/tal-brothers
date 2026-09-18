import { JUDGMENT_KIND, VARIANT_KIND } from 'tal-brothers-shared'
import type { VariantKind } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'
import { EFFECT_CATEGORY } from '../../scenario/constants/effectCategory'
import { EFFECT_KIND } from '../../scenario/constants/effectKind'
import { hasJudgment } from '../../scenario/scenarioTypes'
import type { Choice, Effect, JudgmentSpec, ScenarioEvent } from '../../scenario/scenarioTypes'
import { pickWeighted, type Rng } from '../random'

/**
 * 흉/평/길 변이 (룰북 §6).
 * 변이는 수치를 곱하지 않고 가산한다. 이벤트 진입 시 선택지마다 결정해 상태에 확정 저장한다.
 */

/** 흉 30% / 평 50% / 길 20% (룰북 §6.1) */
export function rollVariant(rng: Rng): VariantKind {
  return pickWeighted(rng, [
    { value: VARIANT_KIND.ILL, weight: GAME_CONFIG.variantWeights.ill },
    { value: VARIANT_KIND.PLAIN, weight: GAME_CONFIG.variantWeights.plain },
    { value: VARIANT_KIND.BLESS, weight: GAME_CONFIG.variantWeights.bless },
  ])
}

/**
 * 이벤트의 선택지별 변이를 굴린다.
 * 변이 미적용 이벤트(T1, T2 등)는 굴리지 않고 빈 표를 돌려준다 (룰북 §6.3).
 */
export function rollEventVariants(event: ScenarioEvent, rng: Rng): Record<string, VariantKind> {
  if (!event.variantApplied) return {}

  const variants: Record<string, VariantKind> = {}
  for (const choice of event.choices) {
    variants[choice.id] = rollVariant(rng)
  }
  return variants
}

/** 이벤트에 저장된 변이를 읽는다. 변이 미적용 이벤트는 평으로 취급한다 */
export function variantOf(
  variants: Record<string, VariantKind>,
  choiceId: string,
): VariantKind {
  return variants[choiceId] ?? VARIANT_KIND.PLAIN
}

/** 길 변이로 한 단계 올릴 수 있는 보상인지 (룰북 §6.2) */
export function isBoostableReward(effect: Effect): boolean {
  if (effect.category !== EFFECT_CATEGORY.REWARD) return false
  // 부적은 +1개, 잠식도 회복은 +5%p
  if (effect.kind === EFFECT_KIND.TALISMAN) return true
  if (effect.kind === EFFECT_KIND.EROSION) return effect.deltaPercent < 0
  // 버프(teamModifier)와 옥비녀는 증가 대상이 아니다
  return false
}

function boostReward(effect: Effect): Effect {
  if (effect.kind === EFFECT_KIND.TALISMAN) {
    return { ...effect, count: effect.count + GAME_CONFIG.blessTalismanStep }
  }
  if (effect.kind === EFFECT_KIND.EROSION) {
    return { ...effect, deltaPercent: effect.deltaPercent - GAME_CONFIG.blessHealStepPercent }
  }
  return effect
}

/**
 * 실패 잠식 페널티를 가감한다 (룰북 §6.2).
 * 대상이 전원이면 각자에게 가산되므로 효과 하나당 한 번만 적용한다.
 */
function shiftErosionPenalty(effects: Effect[], deltaPercent: number): Effect[] {
  return effects.map((effect) => {
    if (effect.category !== EFFECT_CATEGORY.PENALTY) return effect
    if (effect.kind !== EFFECT_KIND.EROSION) return effect
    const shifted = effect.deltaPercent + deltaPercent
    return { ...effect, deltaPercent: shifted < 0 ? 0 : shifted }
  })
}

/**
 * 판정 없는 선택지의 시간 페널티를 가감한다 (룰북 §6.2).
 * `timeDelta.minutes`는 `-`가 시간 소모이므로, 흉은 더 깎고 길은 0분까지 되돌린다.
 * 시간 페널티가 아예 없는 선택지는 가감할 대상이 없어 그대로 둔다.
 */
function shiftTimePenalty(effects: Effect[], costDeltaMinutes: number): Effect[] {
  return effects.map((effect) => {
    if (effect.category !== EFFECT_CATEGORY.PENALTY) return effect
    if (effect.kind !== EFFECT_KIND.TIME_DELTA) return effect
    const shifted = effect.minutes - costDeltaMinutes
    return { ...effect, minutes: shifted > 0 ? 0 : shifted }
  })
}

function shiftThreshold(judgment: JudgmentSpec, delta: number): JudgmentSpec {
  const raw = judgment.threshold + delta
  const min = judgment.kind === JUDGMENT_KIND.HIDDEN ? GAME_CONFIG.hiddenThresholdMin : 0
  const capped = Math.min(Math.max(raw, min), GAME_CONFIG.thresholdMax)
  return { ...judgment, threshold: capped }
}

/**
 * 선택지에 변이를 적용한 사본을 만든다 (룰북 §6.2).
 *
 * - 판정 선택지: 흉은 기준 +1(상한 6)과 실패 잠식 페널티 +10%p.
 *   길은 증가 가능한 보상이 하나라도 있으면 보상 +1단계, 없으면 실패 잠식 페널티 -10%p(최소 0)
 * - 비공개 판정: 기준만 바뀐다. 흉 +1(상한 6), 길 -1(하한 2). 대가 +10%는 변이와 무관하게 고정
 * - 판정 없는 선택지: 흉은 시간 페널티 +5분, 길은 -5분(최소 0분)
 */
export function applyVariantToChoice(choice: Choice, variant: VariantKind): Choice {
  if (variant === VARIANT_KIND.PLAIN) return choice

  if (!hasJudgment(choice)) {
    const costDelta =
      variant === VARIANT_KIND.ILL
        ? GAME_CONFIG.illTimeDeltaMinutes
        : GAME_CONFIG.blessTimeDeltaMinutes
    return { ...choice, resolve: shiftTimePenalty(choice.resolve, costDelta) }
  }

  if (choice.judgment.kind === JUDGMENT_KIND.HIDDEN) {
    // 비공개 판정의 길은 기준을 같은 폭만큼 내린다 (룰북 §6.2). 하한은 shiftThreshold가 본다
    const step = GAME_CONFIG.illThresholdDelta
    const delta = variant === VARIANT_KIND.ILL ? step : -step
    return { ...choice, judgment: shiftThreshold(choice.judgment, delta) }
  }

  if (variant === VARIANT_KIND.ILL) {
    return {
      ...choice,
      judgment: shiftThreshold(choice.judgment, GAME_CONFIG.illThresholdDelta),
      failure: shiftErosionPenalty(choice.failure, GAME_CONFIG.illPenaltyDeltaPercent),
    }
  }

  // 길
  if (choice.success.some(isBoostableReward)) {
    return {
      ...choice,
      success: choice.success.map((effect) =>
        isBoostableReward(effect) ? boostReward(effect) : effect,
      ),
    }
  }
  return {
    ...choice,
    failure: shiftErosionPenalty(choice.failure, GAME_CONFIG.blessPenaltyDeltaPercent),
  }
}
