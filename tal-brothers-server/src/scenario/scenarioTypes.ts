import { JUDGMENT_KIND } from 'tal-brothers-shared'
import type { AssetKey, Attribute, GamePhase } from 'tal-brothers-shared'

import { EFFECT_KIND } from './constants/effectKind'
import type { EffectCategory } from './constants/effectCategory'
import type { EffectTarget } from './constants/effectTarget'
import type { WhisperKind } from './constants/whisperKind'

/**
 * 시나리오 데이터 모델 (아키텍처 §5.4).
 * 선택지의 결과는 효과 목록으로 표현하고, 모든 효과에 분류를 붙인다.
 * 성공 기준·보상·페널티는 서버 전용이므로 이 모듈은 shared로 내보내지 않는다.
 * 분류 값 자체는 `constants/`에 상수 파일로 나눠 둔다 (상수 파일명 ↔ export명 1:1).
 */

export type ErosionEffect = {
  category: EffectCategory
  kind: typeof EFFECT_KIND.EROSION
  target: EffectTarget
  /** 5% 단위 (룰북 §4.1) */
  deltaPercent: number
}

export type TalismanEffect = {
  category: EffectCategory
  kind: typeof EFFECT_KIND.TALISMAN
  target: EffectTarget
  count: number
}

export type TeamModifierEffect = {
  category: EffectCategory
  kind: typeof EFFECT_KIND.TEAM_MODIFIER
  delta: number
}

export type TimeDeltaEffect = {
  category: EffectCategory
  kind: typeof EFFECT_KIND.TIME_DELTA
  minutes: number
}

export type WhisperEffect = {
  category: EffectCategory
  kind: typeof EFFECT_KIND.WHISPER
  target: EffectTarget
  whisperKind: WhisperKind
  /** 내용의 진실 여부. 발생 시점에 확정한다 (아키텍처 §2) */
  truthful: boolean
}

export type Effect =
  | ErosionEffect
  | TalismanEffect
  | TeamModifierEffect
  | TimeDeltaEffect
  | WhisperEffect
// M2 확장 지점: kind 'jadeHairpin' (어머니의 옥비녀)

/** 개인 판정 — 담당 속성 +1, 공개, 개입 창 O (룰북 §5.2) */
export type SoloJudgmentSpec = {
  kind: typeof JUDGMENT_KIND.SOLO
  attribute: Attribute
  threshold: number
}

/** 협동 판정 — 전원 굴림, 보정 없음, 최고값 (룰북 §5.3) */
export type CoopJudgmentSpec = {
  kind: typeof JUDGMENT_KIND.COOP
  threshold: number
}

/** 비공개 판정 — 담당 속성 +1, 결과 비공개, 개입 창 X (룰북 §5.4) */
export type HiddenJudgmentSpec = {
  kind: typeof JUDGMENT_KIND.HIDDEN
  attribute: Attribute
  threshold: number
}

export type JudgmentSpec = SoloJudgmentSpec | CoopJudgmentSpec | HiddenJudgmentSpec

/** 판정이 있는 선택지 */
export type JudgmentChoice = {
  id: string
  text: string
  judgment: JudgmentSpec
  success: Effect[]
  failure: Effect[]
}

/** 판정이 없는 선택지 — 결과가 곧바로 적용된다 */
export type PlainChoice = {
  id: string
  text: string
  judgment: null
  resolve: Effect[]
}

export type Choice = JudgmentChoice | PlainChoice

export type ScenarioEvent = {
  id: string
  phase: GamePhase
  title: string
  narration: string
  backgroundAsset: AssetKey
  maskAsset?: AssetKey
  choices: Choice[]
  /** 흉/평/길 변이를 적용하는 이벤트인지 (룰북 §6.3) */
  variantApplied: boolean
  /** 튜토리얼 이벤트 — 성공 시 연습 창, 능력 횟수 미소모 (룰북 §12) */
  isTutorial: boolean
  /** 선택지가 1개라 투표를 생략하는 이벤트 (룰북 §12) */
  skipVoting: boolean
  /** 진입 시 인간 1명에게 튜토리얼 부적 지급 (룰북 §9.2) */
  grantsTutorialTalisman: boolean
}

/** 판정이 있는 선택지인지 좁힌다 */
export function hasJudgment(choice: Choice): choice is JudgmentChoice {
  return choice.judgment !== null
}
