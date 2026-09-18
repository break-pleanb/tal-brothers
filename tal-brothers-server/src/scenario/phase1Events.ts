import { ASSET_KEY, ATTRIBUTE, GAME_PHASE, JUDGMENT_KIND } from 'tal-brothers-shared'

import { GAME_CONFIG } from './gameConfig'
import { EFFECT_CATEGORY } from './constants/effectCategory'
import { EFFECT_KIND } from './constants/effectKind'
import { EFFECT_TARGET } from './constants/effectTarget'
import { WHISPER_KIND } from './constants/whisperKind'
import type { ScenarioEvent } from './scenarioTypes'

/**
 * Phase 1 이벤트 4개 (룰북 §12).
 * T1 → T2-1 → T2-2 → 이장 고정 순서. 수치는 룰북 §12 표를 그대로 옮긴 것이다.
 * 배경은 전부 초가 마을 (룰북 §18).
 */

/** T1. 안개 낀 진입로 — 튜토리얼. 변이 없음, 실패 페널티 없음 (룰북 §12) */
const T1: ScenarioEvent = {
  id: 't1',
  phase: GAME_PHASE.PHASE_1,
  title: '안개 낀 진입로',
  narration: '마을 어귀로 들어서는 좁은 길을 쓰러진 고목이 막고 있다.',
  backgroundAsset: ASSET_KEY.BG_THATCHED_VILLAGE,
  choices: [
    {
      id: 't1-a',
      text: '힘으로 고목을 밀어낸다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.STRENGTH,
        threshold: GAME_CONFIG.thresholdBase,
      },
      // 성공·실패 모두 통과, 페널티 없음 (룰북 §12)
      success: [],
      failure: [],
    },
    {
      id: 't1-b',
      text: '틈 사이로 기어 지나간다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.AGILITY,
        threshold: GAME_CONFIG.thresholdBase,
      },
      success: [],
      failure: [],
    },
  ],
  variantApplied: false,
  isTutorial: true,
  skipVoting: false,
  grantsTutorialTalisman: true,
  environmentErosion: false,
  isBoss: false,
  grabsRandomSeat: false,
}

/** T2-1. 빈 주막 ① 무너지는 대들보 — 협동 판정, 선택지 1개라 투표 생략 (룰북 §12) */
const T2_1: ScenarioEvent = {
  id: 't2-1',
  phase: GAME_PHASE.PHASE_1,
  title: '빈 주막 — 무너지는 대들보',
  narration: '기울어진 주막 대들보가 무너져 내린다. 모두 함께 받쳐야 한다.',
  backgroundAsset: ASSET_KEY.BG_THATCHED_VILLAGE,
  choices: [
    {
      id: 't2-1-a',
      text: '다 함께 대들보를 받친다',
      judgment: {
        kind: JUDGMENT_KIND.COOP,
        threshold: GAME_CONFIG.coopThreshold,
      },
      success: [],
      failure: [],
    },
  ],
  variantApplied: false,
  isTutorial: true,
  skipVoting: true,
  grantsTutorialTalisman: false,
  environmentErosion: false,
  isBoss: false,
  grabsRandomSeat: false,
}

/** T2-2. 빈 주막 ② 점괘 항아리 — 비공개 판정. 대가 +10%는 RESOLUTION이 설정값으로 적용 (룰북 §5.4) */
const T2_2: ScenarioEvent = {
  id: 't2-2',
  phase: GAME_PHASE.PHASE_1,
  title: '빈 주막 — 점괘 항아리',
  narration:
    '주막 뒤편에 점괘를 담은 항아리가 놓여 있다. 들여다보면 앞길의 길흉이 비친다고 한다.',
  backgroundAsset: ASSET_KEY.BG_THATCHED_VILLAGE,
  choices: [
    {
      id: 't2-2-a',
      text: '항아리를 들여다본다',
      judgment: {
        kind: JUDGMENT_KIND.HIDDEN,
        attribute: ATTRIBUTE.KNOWLEDGE,
        threshold: GAME_CONFIG.thresholdBase,
      },
      // 성공 = 진실, 실패 = 거짓 (룰북 §12, §16). 내용은 이장 변이 결정 직후 생성한다
      success: [
        {
          category: EFFECT_CATEGORY.REWARD,
          kind: EFFECT_KIND.WHISPER,
          target: EFFECT_TARGET.ROLLER,
          whisperKind: WHISPER_KIND.T2_VARIANT,
          truthful: true,
        },
      ],
      failure: [
        {
          category: EFFECT_CATEGORY.PENALTY,
          kind: EFFECT_KIND.WHISPER,
          target: EFFECT_TARGET.ROLLER,
          whisperKind: WHISPER_KIND.T2_VARIANT,
          truthful: false,
        },
      ],
    },
    {
      id: 't2-2-b',
      text: '그냥 떠난다',
      judgment: null,
      // 페널티 없음 (룰북 §12)
      resolve: [],
    },
  ],
  variantApplied: false,
  isTutorial: true,
  skipVoting: false,
  grantsTutorialTalisman: false,
  environmentErosion: false,
  isBoss: false,
  grabsRandomSeat: false,
}

/** 이장 이벤트 — Phase 1 본 이벤트. 변이 적용 (룰북 §6.3, §12) */
const VILLAGE_CHIEF: ScenarioEvent = {
  id: 'villageChief',
  phase: GAME_PHASE.PHASE_1,
  title: '이장',
  narration:
    '짙은 안개 속, 입이 찢어진 광대탈을 쓴 이장이 소리 없이 다가온다. ' +
    '"밤이 늦었소... 우리 집에서 몸 좀 녹이고 가시지요." ' +
    '그의 발뒤꿈치가 땅에 닿아 있지 않다.',
  backgroundAsset: ASSET_KEY.BG_THATCHED_VILLAGE,
  maskAsset: ASSET_KEY.MASK_CLOWN,
  choices: [
    {
      id: 'chief-a',
      text: '정중히 거절하고 뒷걸음질 친다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.AGILITY,
        threshold: GAME_CONFIG.thresholdBase,
      },
      // 변화 없음
      success: [],
      failure: [
        {
          category: EFFECT_CATEGORY.PENALTY,
          kind: EFFECT_KIND.EROSION,
          target: EFFECT_TARGET.ROLLER,
          deltaPercent: 15,
        },
        {
          category: EFFECT_CATEGORY.PENALTY,
          kind: EFFECT_KIND.TEAM_MODIFIER,
          delta: -1,
        },
      ],
    },
    {
      id: 'chief-b',
      text: '따라가며 약점을 찾는다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.KNOWLEDGE,
        threshold: GAME_CONFIG.thresholdBase,
      },
      success: [
        {
          category: EFFECT_CATEGORY.SIDE_EFFECT,
          kind: EFFECT_KIND.EROSION,
          target: EFFECT_TARGET.ROLLER,
          deltaPercent: 5,
        },
        {
          category: EFFECT_CATEGORY.REWARD,
          kind: EFFECT_KIND.TALISMAN,
          target: EFFECT_TARGET.ROLLER,
          count: 1,
        },
      ],
      failure: [
        {
          category: EFFECT_CATEGORY.PENALTY,
          kind: EFFECT_KIND.EROSION,
          target: EFFECT_TARGET.ROLLER,
          deltaPercent: 20,
        },
      ],
    },
    {
      id: 'chief-c',
      text: '무기를 꺼내 위협한다',
      judgment: {
        kind: JUDGMENT_KIND.SOLO,
        attribute: ATTRIBUTE.STRENGTH,
        threshold: GAME_CONFIG.thresholdBase,
      },
      success: [
        {
          category: EFFECT_CATEGORY.REWARD,
          kind: EFFECT_KIND.TEAM_MODIFIER,
          delta: 1,
        },
        {
          category: EFFECT_CATEGORY.SIDE_EFFECT,
          kind: EFFECT_KIND.EROSION,
          target: EFFECT_TARGET.ALL,
          deltaPercent: 10,
        },
      ],
      failure: [
        {
          category: EFFECT_CATEGORY.PENALTY,
          kind: EFFECT_KIND.EROSION,
          target: EFFECT_TARGET.ROLLER,
          deltaPercent: 25,
        },
      ],
    },
  ],
  variantApplied: true,
  isTutorial: false,
  skipVoting: false,
  grantsTutorialTalisman: false,
  environmentErosion: false,
  isBoss: false,
  grabsRandomSeat: false,
}

/** Phase 1 고정 진행 순서 (룰북 §12) */
export const PHASE1_EVENTS: readonly ScenarioEvent[] = [T1, T2_1, T2_2, VILLAGE_CHIEF]

/** 이벤트 id로 시나리오를 찾는다. 없으면 undefined */
export function findPhase1Event(eventId: string): ScenarioEvent | undefined {
  return PHASE1_EVENTS.find((event) => event.id === eventId)
}
