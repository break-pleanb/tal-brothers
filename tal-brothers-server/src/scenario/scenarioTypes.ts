import { JUDGMENT_KIND } from 'tal-brothers-shared'
import type { AssetKey, Attribute, GamePhase, Phase3Route } from 'tal-brothers-shared'

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

/** 어머니의 옥비녀 — 개수가 아니라 보유 여부다 (룰북 §9.3) */
export type JadeHairpinEffect = {
  category: EffectCategory
  kind: typeof EFFECT_KIND.JADE_HAIRPIN
  target: EffectTarget
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
  | JadeHairpinEffect
  | TeamModifierEffect
  | TimeDeltaEffect
  | WhisperEffect

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

/** 팀 측 주사위를 누가 굴리는지 (룰북 §14.3, §14.4) */
export const CONTEST_TEAM_DICE = {
  /** B-1 — 옥비녀 보유자 1명 */
  JADE_HOLDER: 'jadeHolder',
  /** A-2 — 타겟을 제외한 전원, 최고값 */
  ALL_EXCEPT_TARGET: 'allExceptTarget',
} as const

export type ContestTeamDice = (typeof CONTEST_TEAM_DICE)[keyof typeof CONTEST_TEAM_DICE]

/**
 * 대립 판정 — Phase 3 (룰북 §14.3, §14.4).
 * 타겟이 인간 배신자면 상대 D6와 비교하고(동점은 배신자 승), 그 외에는 `threshold` 고정 기준이다.
 */
export type ContestJudgmentSpec = {
  kind: typeof JUDGMENT_KIND.CONTEST
  threshold: number
  teamDice: ContestTeamDice
  route: Phase3Route
}

/** 아이템 사용 판정 — 14A. 주사위가 없어 성공 기준도 없다 (룰북 §13.5) */
export type ItemJudgmentSpec = {
  kind: typeof JUDGMENT_KIND.ITEM
}

/** 주사위를 굴리는 판정 사양 — 성공 기준을 가진다 */
export type RollJudgmentSpec =
  | SoloJudgmentSpec
  | CoopJudgmentSpec
  | HiddenJudgmentSpec
  | ContestJudgmentSpec

export type JudgmentSpec = RollJudgmentSpec | ItemJudgmentSpec

/** 주사위를 굴리는 판정인지 좁힌다 (14A만 예외) */
export function isRollJudgment(judgment: JudgmentSpec): judgment is RollJudgmentSpec {
  return judgment.kind !== JUDGMENT_KIND.ITEM
}

/** 속성 태그가 있는 판정인지 좁힌다 (개인·비공개) */
export function hasAttribute(
  judgment: JudgmentSpec,
): judgment is SoloJudgmentSpec | HiddenJudgmentSpec {
  return judgment.kind === JUDGMENT_KIND.SOLO || judgment.kind === JUDGMENT_KIND.HIDDEN
}

/** 판정이 있는 선택지. 14A는 `success`가 제출 시, `failure`가 미제출 시 효과다 */
export type JudgmentChoice = {
  id: string
  text: string
  judgment: JudgmentSpec
  success: Effect[]
  failure: Effect[]
  /** 이벤트는 변이 적용 대상이지만 이 선택지만 예외 — 14A (룰북 §6.3) */
  variantExempt?: boolean
}

/** 판정이 없는 선택지 — 결과가 곧바로 적용된다 */
export type PlainChoice = {
  id: string
  text: string
  judgment: null
  resolve: Effect[]
  variantExempt?: boolean
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
  /** Phase 2 랜덤 이벤트 — 종료 시 환경 잠식 전원 +5%, 시작 시 티어 효과 (룰북 §4.2, §4.3) */
  environmentErosion: boolean
  /** 중간 보스 — 협동 기준 6, 첫째 봇의 강제 성공 조건 (룰북 §11, §13.5) */
  isBoss: boolean
  /** 진입 시 무작위 형제 1명을 지목해 Display에 공개 — 13번 (룰북 §13.5) */
  grabsRandomSeat: boolean
}

/** 판정이 있는 선택지인지 좁힌다 */
export function hasJudgment(choice: Choice): choice is JudgmentChoice {
  return choice.judgment !== null
}

/** 변이를 적용할 선택지인지 (룰북 §6.3) */
export function variantApplies(event: ScenarioEvent, choice: Choice): boolean {
  return event.variantApplied && choice.variantExempt !== true
}
