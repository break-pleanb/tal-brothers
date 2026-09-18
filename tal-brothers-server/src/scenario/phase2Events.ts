import { ASSET_KEY, ATTRIBUTE, GAME_PHASE, JUDGMENT_KIND } from 'tal-brothers-shared'
import type { AssetKey } from 'tal-brothers-shared'

import { GAME_CONFIG } from './gameConfig'
import { EFFECT_CATEGORY } from './constants/effectCategory'
import { EFFECT_KIND } from './constants/effectKind'
import { EFFECT_TARGET } from './constants/effectTarget'
import type { EffectTarget } from './constants/effectTarget'
import { WHISPER_KIND } from './constants/whisperKind'
import type { WhisperKind } from './constants/whisperKind'
import type {
  Choice,
  ErosionEffect,
  JadeHairpinEffect,
  ScenarioEvent,
  TalismanEffect,
  TimeDeltaEffect,
  WhisperEffect,
} from './scenarioTypes'

/**
 * Phase 2 데이터 (룰북 §13).
 *
 * - 분기 1개(고정) + 랜덤 이벤트 풀 01~14 + 보스 15
 * - 수치는 룰북 §13.2·§13.5 표를 그대로 옮긴 것이다
 * - 슬롯 배치는 엔진(`rules/slots.ts`)이 Phase 2 진입 시 결정한다
 */

// ── 효과 빌더 ────────────────────────────────────────────────────────
// 분류(reward / sideEffect / penalty)를 선택지마다 손으로 적으면 오타를 타입이 잡지 못한다.

/** 실패 잠식 페널티 — 흉·길 변이의 가감 대상 (룰북 §6.2) */
function erosionPenalty(target: EffectTarget, deltaPercent: number): ErosionEffect {
  return { category: EFFECT_CATEGORY.PENALTY, kind: EFFECT_KIND.EROSION, target, deltaPercent }
}

/** 잠식도 회복 보상 — 길 변이에서 +5%p 된다 (룰북 §6.2) */
function erosionHeal(target: EffectTarget, deltaPercent: number): ErosionEffect {
  return { category: EFFECT_CATEGORY.REWARD, kind: EFFECT_KIND.EROSION, target, deltaPercent }
}

/** 성공에 따라오는 부작용 — 강제 성공에도 남는다 (룰북 §3.2) */
function erosionSideEffect(target: EffectTarget, deltaPercent: number): ErosionEffect {
  return { category: EFFECT_CATEGORY.SIDE_EFFECT, kind: EFFECT_KIND.EROSION, target, deltaPercent }
}

/** 낡은 부적 보상 — 길 변이에서 +1개 된다 (룰북 §6.2, §9.1) */
function talismanReward(target: EffectTarget, count: number): TalismanEffect {
  return { category: EFFECT_CATEGORY.REWARD, kind: EFFECT_KIND.TALISMAN, target, count }
}

/** 어머니의 옥비녀 — 증가 대상이 아니고 강제 성공으로는 얻을 수 없다 (룰북 §9.3) */
function jadeHairpinReward(target: EffectTarget): JadeHairpinEffect {
  return { category: EFFECT_CATEGORY.REWARD, kind: EFFECT_KIND.JADE_HAIRPIN, target }
}

/** 우회 시간 비용 — 음수가 시간 소모다 (룰북 §2.1) */
function timePenalty(minutes: number): TimeDeltaEffect {
  return { category: EFFECT_CATEGORY.PENALTY, kind: EFFECT_KIND.TIME_DELTA, minutes }
}

/** 진실 귓속말 (비공개 판정 성공) */
function whisperReward(target: EffectTarget, kind: WhisperKind): WhisperEffect {
  return {
    category: EFFECT_CATEGORY.REWARD,
    kind: EFFECT_KIND.WHISPER,
    target,
    whisperKind: kind,
    truthful: true,
  }
}

/** 거짓 귓속말 (비공개 판정 실패, 사당 실패) */
function whisperPenalty(target: EffectTarget, kind: WhisperKind): WhisperEffect {
  return {
    category: EFFECT_CATEGORY.PENALTY,
    kind: EFFECT_KIND.WHISPER,
    target,
    whisperKind: kind,
    truthful: false,
  }
}

// ── 이벤트 빌더 ──────────────────────────────────────────────────────

type Phase2EventInput = {
  id: string
  title: string
  narration: string
  choices: Choice[]
  backgroundAsset?: AssetKey
  maskAsset?: AssetKey
  /** 분기는 환경 잠식 대상이 아니다 (룰북 §4.2) */
  environmentErosion?: boolean
  isBoss?: boolean
  grabsRandomSeat?: boolean
}

/** Phase 2 이벤트 공통값 — 변이 적용, 투표 있음, 튜토리얼 아님 (룰북 §6.3, §13) */
function phase2Event(input: Phase2EventInput): ScenarioEvent {
  return {
    id: input.id,
    phase: GAME_PHASE.PHASE_2,
    title: input.title,
    narration: input.narration,
    backgroundAsset: input.backgroundAsset ?? ASSET_KEY.BG_DANGSAN_FOREST,
    ...(input.maskAsset === undefined ? {} : { maskAsset: input.maskAsset }),
    choices: input.choices,
    variantApplied: true,
    isTutorial: false,
    skipVoting: false,
    grantsTutorialTalisman: false,
    environmentErosion: input.environmentErosion ?? true,
    isBoss: input.isBoss ?? false,
    grabsRandomSeat: input.grabsRandomSeat ?? false,
  }
}

// ── 분기 (룰북 §13.2) ────────────────────────────────────────────────

/** Phase 2 첫 이벤트. 환경 잠식은 적용하지 않는다 (룰북 §4.2) */
export const PHASE2_BRANCH: ScenarioEvent = phase2Event({
  id: 'branch',
  title: '갈림길',
  narration:
    '끝없는 고목 숲의 갈림길. 한쪽에서는 기괴한 울음소리가, 다른 쪽에서는 짙은 요기가 흘러나온다.',
  environmentErosion: false,
  choices: [
    {
      id: 'branch-a',
      text: '기괴한 울음소리가 나는 오솔길로 돌아간다',
      judgment: null,
      resolve: [timePenalty(-15)],
    },
    {
      id: 'branch-b',
      text: '요기가 가장 짙은 핏빛 사당을 가로지른다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.AGILITY,
        threshold: GAME_CONFIG.thresholdHard,
      },
      success: [jadeHairpinReward(EFFECT_TARGET.ROLLER), erosionSideEffect(EFFECT_TARGET.ALL, 10)],
      failure: [
        erosionPenalty(EFFECT_TARGET.ROLLER, 20),
        whisperPenalty(EFFECT_TARGET.RANDOM_SEAT, WHISPER_KIND.SHRINE_FAIL),
      ],
    },
  ],
})

/** 분기 B를 고르면 배경이 핏빛 사당으로 바뀐다 (룰북 §13.2) */
export const BRANCH_SHRINE_CHOICE_ID = 'branch-b'
export const BRANCH_SHRINE_BACKGROUND: AssetKey = ASSET_KEY.BG_BLOODY_SHRINE

// ── 랜덤 이벤트 풀 01~14 (룰북 §13.5) ────────────────────────────────

const P2_01 = phase2Event({
  id: 'p2-01',
  title: '울부짖는 아귀탈',
  narration:
    '안개 속에서 입이 찢어진 아귀탈을 쓴 아이가 무언가를 파먹고 있다. 옆에 피 묻은 낡은 부적이 떨어져 있다.',
  maskAsset: ASSET_KEY.MASK_COMMON_A,
  choices: [
    {
      id: 'p2-01-a',
      text: '탐욕: 들키지 않게 부적만 채어 온다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.AGILITY,
        threshold: GAME_CONFIG.thresholdBase,
      },
      success: [talismanReward(EFFECT_TARGET.ROLLER, 1)],
      failure: [erosionPenalty(EFFECT_TARGET.ROLLER, 15)],
    },
    {
      id: 'p2-01-b',
      text: '돌파: 몽둥이를 휘둘러 쫓아낸다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.STRENGTH,
        threshold: GAME_CONFIG.thresholdBase,
      },
      success: [],
      failure: [erosionPenalty(EFFECT_TARGET.ROLLER, 20)],
    },
    {
      id: 'p2-01-c',
      text: '우회: 조용히 먼 길로 돌아간다',
      judgment: null,
      resolve: [timePenalty(-5)],
    },
  ],
})

const P2_02 = phase2Event({
  id: 'p2-02',
  title: '핏물 고인 우물',
  narration:
    '썩은 냄새가 진동하는 우물. 들여다본 자는 형제 중 누가 요괴에 씌었는지 진실을 본다는 전설이 있다.',
  choices: [
    {
      id: 'p2-02-a',
      text: '의심: 우물 안을 들여다본다',
      judgment: {
        kind: JUDGMENT_KIND.HIDDEN,
        attribute: ATTRIBUTE.KNOWLEDGE,
        threshold: GAME_CONFIG.thresholdBase,
      },
      success: [whisperReward(EFFECT_TARGET.ROLLER, WHISPER_KIND.EVENT_WHISPER)],
      failure: [whisperPenalty(EFFECT_TARGET.ROLLER, WHISPER_KIND.EVENT_WHISPER)],
    },
    {
      id: 'p2-02-b',
      text: '신뢰: 형제를 의심하지 않고 지나친다',
      judgment: null,
      resolve: [timePenalty(-5)],
    },
  ],
})

const P2_03 = phase2Event({
  id: 'p2-03',
  title: '목을 매단 광대',
  narration: '당산나무 가지에 광대탈을 쓴 시체가 대롱거린다. 품속에 반짝이는 물건이 보인다.',
  maskAsset: ASSET_KEY.MASK_CLOWN,
  choices: [
    {
      id: 'p2-03-a',
      text: '탐색: 시체의 몸을 뒤진다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.AGILITY,
        threshold: GAME_CONFIG.thresholdBase,
      },
      success: [talismanReward(EFFECT_TARGET.ROLLER, 1)],
      failure: [erosionPenalty(EFFECT_TARGET.ROLLER, 20)],
    },
    {
      id: 'p2-03-b',
      text: '합심: 시체를 끌어내려 안식을 준다',
      judgment: { kind: JUDGMENT_KIND.COOP, threshold: GAME_CONFIG.coopThreshold },
      success: [erosionHeal(EFFECT_TARGET.ALL, -5)],
      failure: [erosionPenalty(EFFECT_TARGET.ALL, 10)],
    },
  ],
})

const P2_04 = phase2Event({
  id: 'p2-04',
  title: '길을 막는 상여',
  narration: '핏빛 천을 덮은 낡은 상여가 길을 가로막고, 안에서 곡소리가 들린다.',
  choices: [
    {
      id: 'p2-04-a',
      text: '돌파: 상여를 부수고 지나간다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.STRENGTH,
        threshold: GAME_CONFIG.thresholdBase,
      },
      success: [],
      failure: [erosionPenalty(EFFECT_TARGET.ROLLER, 20)],
    },
    {
      id: 'p2-04-b',
      text: '예의: 상여 앞에 삼배를 올린다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.KNOWLEDGE,
        threshold: GAME_CONFIG.thresholdBase,
      },
      success: [talismanReward(EFFECT_TARGET.ROLLER, 1)],
      failure: [erosionPenalty(EFFECT_TARGET.ROLLER, 15)],
    },
    {
      id: 'p2-04-c',
      text: '우회: 가시덤불 길을 개척한다',
      judgment: null,
      resolve: [timePenalty(-10)],
    },
  ],
})

const P2_05 = phase2Event({
  id: 'p2-05',
  title: '속삭이는 도깨비불',
  narration: '푸른 도깨비불이 일렁이며 형제들의 숨겨진 진심을 속삭인다.',
  choices: [
    {
      id: 'p2-05-a',
      text: '도청: 속삭임에 귀를 기울인다',
      judgment: {
        kind: JUDGMENT_KIND.HIDDEN,
        attribute: ATTRIBUTE.AGILITY,
        threshold: GAME_CONFIG.thresholdBase,
      },
      success: [whisperReward(EFFECT_TARGET.ROLLER, WHISPER_KIND.EVENT_WHISPER)],
      failure: [whisperPenalty(EFFECT_TARGET.ROLLER, WHISPER_KIND.EVENT_WHISPER)],
    },
    {
      id: 'p2-05-b',
      text: '무시: 귀를 막고 달려간다',
      judgment: null,
      resolve: [timePenalty(-5)],
    },
  ],
})

const P2_06 = phase2Event({
  id: 'p2-06',
  title: '끊어진 금줄',
  narration: '요괴를 막던 거대한 금줄이 끊어져, 틈새로 독기가 새어 나온다.',
  choices: [
    {
      id: 'p2-06-a',
      text: '봉인: 다 함께 금줄을 다시 꼰다',
      judgment: { kind: JUDGMENT_KIND.COOP, threshold: GAME_CONFIG.coopThreshold },
      success: [erosionHeal(EFFECT_TARGET.ALL, -10)],
      failure: [erosionPenalty(EFFECT_TARGET.ALL, 15)],
    },
    {
      id: 'p2-06-b',
      text: '회피: 틈으로 빠르게 구른다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.AGILITY,
        threshold: GAME_CONFIG.thresholdBase,
      },
      success: [],
      failure: [erosionPenalty(EFFECT_TARGET.ROLLER, 20)],
    },
  ],
})

const P2_07 = phase2Event({
  id: 'p2-07',
  title: '버려진 성황당',
  narration: '허물어진 성황당 제단에 두고 간 제물이 썩어간다. 정화하면 정신이 맑아질 것 같다.',
  backgroundAsset: ASSET_KEY.BG_BLOODY_SHRINE,
  choices: [
    {
      id: 'p2-07-a',
      text: '정화: 부정을 씻고 제단을 바로 세운다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.KNOWLEDGE,
        threshold: GAME_CONFIG.thresholdHard,
      },
      success: [erosionHeal(EFFECT_TARGET.ALL, -15)],
      failure: [erosionPenalty(EFFECT_TARGET.ROLLER, 25)],
    },
    {
      id: 'p2-07-b',
      text: '탐색: 제단 밑을 뒤진다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.AGILITY,
        threshold: GAME_CONFIG.thresholdBase,
      },
      success: [talismanReward(EFFECT_TARGET.ROLLER, 1)],
      failure: [erosionPenalty(EFFECT_TARGET.ROLLER, 15)],
    },
  ],
})

const P2_08 = phase2Event({
  id: 'p2-08',
  title: '환각 속의 어머니',
  narration: '안개 너머로 어릴 적 돌아가신 어머니가 손짓한다.',
  choices: [
    {
      id: 'p2-08-a',
      text: '통찰: 요괴의 환각임을 꿰뚫어 본다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.KNOWLEDGE,
        threshold: GAME_CONFIG.thresholdBase,
      },
      success: [erosionHeal(EFFECT_TARGET.ROLLER, -10)],
      failure: [erosionPenalty(EFFECT_TARGET.ROLLER, 20)],
    },
    {
      id: 'p2-08-b',
      text: '절단: 눈물을 머금고 환각을 벤다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.STRENGTH,
        threshold: GAME_CONFIG.thresholdBase,
      },
      success: [],
      failure: [erosionPenalty(EFFECT_TARGET.ROLLER, 15)],
    },
  ],
})

const P2_09 = phase2Event({
  id: 'p2-09',
  title: '목 없는 벅수',
  narration:
    '목이 잘린 벅수의 몸통에서 검붉은 진액이 흘러내린다. 잘린 머리는 수풀 어딘가에 굴러가 있다.',
  choices: [
    {
      id: 'p2-09-a',
      text: '위로: 잘린 머리를 찾아 제자리에 올려준다',
      judgment: { kind: JUDGMENT_KIND.COOP, threshold: GAME_CONFIG.coopThreshold },
      success: [talismanReward(EFFECT_TARGET.COOP_TOP_ROLLER, 1)],
      failure: [erosionPenalty(EFFECT_TARGET.ALL, 15)],
    },
    {
      id: 'p2-09-b',
      text: '차단: 몸통에 금줄을 감아 봉한다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.KNOWLEDGE,
        threshold: GAME_CONFIG.thresholdBase,
      },
      success: [],
      failure: [erosionPenalty(EFFECT_TARGET.ROLLER, 20)],
    },
  ],
})

const P2_10 = phase2Event({
  id: 'p2-10',
  title: '춤추는 무당탈',
  narration:
    '허공에 뜬 무당탈이 미친 듯 춤추며 길을 막는다. 장단에 맞춰주지 않으면 해코지할 기세다.',
  maskAsset: ASSET_KEY.MASK_COMMON_B,
  choices: [
    {
      id: 'p2-10-a',
      text: '동조: 장단에 맞춰 춤을 춘다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.AGILITY,
        threshold: GAME_CONFIG.thresholdBase,
      },
      success: [erosionHeal(EFFECT_TARGET.ROLLER, -10)],
      failure: [erosionPenalty(EFFECT_TARGET.ROLLER, 20)],
    },
    {
      id: 'p2-10-b',
      text: '파괴: 춤이 끝나기 전에 탈을 박살 낸다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.STRENGTH,
        threshold: GAME_CONFIG.thresholdBase,
      },
      success: [],
      failure: [erosionPenalty(EFFECT_TARGET.ROLLER, 15)],
    },
  ],
})

const P2_11 = phase2Event({
  id: 'p2-11',
  title: '짙어지는 핏빛 안개',
  narration: '안개가 핏빛으로 물들며 숨을 쉴 수 없을 만큼 짙어진다.',
  choices: [
    {
      id: 'p2-11-a',
      text: '탈출: 안개를 뚫고 달린다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.STRENGTH,
        threshold: GAME_CONFIG.thresholdBase,
      },
      success: [],
      // 실패 시 시간 페널티는 흉·길 가감 대상이 아니다 (룰북 §6.2)
      failure: [erosionPenalty(EFFECT_TARGET.ROLLER, 20), timePenalty(-5)],
    },
    {
      id: 'p2-11-b',
      text: '은거: 바위 밑에서 안개가 걷히길 기다린다',
      judgment: null,
      resolve: [timePenalty(-15)],
    },
  ],
})

const P2_12 = phase2Event({
  id: 'p2-12',
  title: '두 갈래의 짐승 길',
  narration: '한쪽은 피 냄새가 진동하고, 다른 쪽은 고요하지만 기분 나쁜 한기가 흐른다.',
  choices: [
    {
      id: 'p2-12-a',
      text: '추적: 흔적과 기류를 읽어 길을 고른다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.AGILITY,
        threshold: GAME_CONFIG.thresholdBase,
      },
      success: [],
      failure: [erosionPenalty(EFFECT_TARGET.ROLLER, 15)],
    },
    {
      id: 'p2-12-b',
      text: '점술: 흙과 피로 점을 친다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.KNOWLEDGE,
        threshold: GAME_CONFIG.thresholdBase,
      },
      success: [talismanReward(EFFECT_TARGET.ROLLER, 1)],
      failure: [erosionPenalty(EFFECT_TARGET.ROLLER, 20)],
    },
  ],
})

const P2_13 = phase2Event({
  id: 'p2-13',
  title: '원귀의 손아귀',
  narration: '진흙탕을 지날 때 썩은 손들이 튀어나와 무작위 형제 1명의 발목을 쥐고 끌어당긴다.',
  grabsRandomSeat: true,
  choices: [
    {
      id: 'p2-13-a',
      text: '완력: 손아귀를 뜯어낸다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.STRENGTH,
        threshold: GAME_CONFIG.thresholdBase,
      },
      success: [],
      failure: [erosionPenalty(EFFECT_TARGET.ROLLER, 20)],
    },
    {
      id: 'p2-13-b',
      text: '구출: 다 함께 팔을 당겨 구해낸다',
      judgment: { kind: JUDGMENT_KIND.COOP, threshold: GAME_CONFIG.coopThreshold },
      success: [erosionHeal(EFFECT_TARGET.ALL, -5)],
      failure: [erosionPenalty(EFFECT_TARGET.ALL, 10)],
    },
  ],
})

const P2_14 = phase2Event({
  id: 'p2-14',
  title: '찢어진 탈 조각',
  narration: '길바닥의 탈 조각이 저주를 중얼거린다. 두면 주변이 모두 오염될 것이다.',
  choices: [
    {
      id: 'p2-14-a',
      text: '봉인: 부적을 태워 저주를 정화한다',
      // 주사위 판정이 없어 개입 창이 없고 변이도 적용하지 않는다 (룰북 §6.3, §13.5)
      judgment: { kind: JUDGMENT_KIND.ITEM },
      variantExempt: true,
      // 제출 시
      success: [erosionHeal(EFFECT_TARGET.SUBMITTER, -15)],
      // 미제출 시 — 무작위 1명(봇 포함)
      failure: [erosionPenalty(EFFECT_TARGET.RANDOM_SEAT, 10)],
    },
    {
      id: 'p2-14-b',
      text: '사이코메트리: 조각을 만져 기억을 훔쳐본다',
      judgment: {
        kind: JUDGMENT_KIND.HIDDEN,
        attribute: ATTRIBUTE.KNOWLEDGE,
        threshold: GAME_CONFIG.thresholdBase,
      },
      success: [whisperReward(EFFECT_TARGET.ROLLER, WHISPER_KIND.EVENT_WHISPER)],
      failure: [whisperPenalty(EFFECT_TARGET.ROLLER, WHISPER_KIND.EVENT_WHISPER)],
    },
  ],
})

/** 14A 부적 제출 선택지 — 제출 창 처리기가 찾아 쓴다 (룰북 §13.5) */
export const TALISMAN_SUBMIT_EVENT_ID = 'p2-14'
export const TALISMAN_SUBMIT_CHOICE_ID = 'p2-14-a'

/** 중간 보스 — 슬롯 7 고정 (룰북 §13.3, §13.5) */
export const PHASE2_BOSS: ScenarioEvent = phase2Event({
  id: 'p2-15',
  title: '중간 보스: 굶주린 백정탈',
  narration:
    '숲의 출구로 가는 유일한 다리 한가운데, 거대한 식칼을 든 3미터짜리 백정탈 요괴가 버티고 서 있다. 우회할 길은 없다.',
  maskAsset: ASSET_KEY.MASK_BOSS,
  isBoss: true,
  choices: [
    {
      id: 'p2-15-a',
      text: '총력전: 전원이 일제히 덤벼든다',
      judgment: { kind: JUDGMENT_KIND.COOP, threshold: GAME_CONFIG.coopBossThreshold },
      success: [talismanReward(EFFECT_TARGET.COOP_TOP_ROLLER, 2)],
      failure: [erosionPenalty(EFFECT_TARGET.ALL, 25)],
    },
    {
      // 속성이 근력/보호라 판정자는 언제나 첫째다 (룰북 §3.1, §13.5)
      id: 'p2-15-b',
      text: '희생: 한 명이 시선을 끄는 사이 건넌다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.STRENGTH,
        threshold: GAME_CONFIG.thresholdHard,
      },
      success: [erosionHeal(EFFECT_TARGET.ALL_EXCEPT_ROLLER, -10)],
      failure: [erosionPenalty(EFFECT_TARGET.ROLLER, 30)],
    },
  ],
})

/** 랜덤 이벤트 풀 01~14. 여기서 7개를 중복 없이 뽑는다 (룰북 §13.3) */
export const PHASE2_POOL: readonly ScenarioEvent[] = [
  P2_01,
  P2_02,
  P2_03,
  P2_04,
  P2_05,
  P2_06,
  P2_07,
  P2_08,
  P2_09,
  P2_10,
  P2_11,
  P2_12,
  P2_13,
  P2_14,
]

/** Phase 2 전체 이벤트 (분기 + 풀 + 보스) */
export const PHASE2_EVENTS: readonly ScenarioEvent[] = [PHASE2_BRANCH, ...PHASE2_POOL, PHASE2_BOSS]

export function findPhase2Event(eventId: string): ScenarioEvent | undefined {
  return PHASE2_EVENTS.find((event) => event.id === eventId)
}
