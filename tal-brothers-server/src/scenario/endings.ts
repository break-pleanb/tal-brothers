import { ASSET_KEY, ENDING_ID } from 'tal-brothers-shared'
import type { AssetKey, EndingId } from 'tal-brothers-shared'

/**
 * 엔딩 7종 (룰북 §15).
 * 엔딩 연출은 게임 시계 밖(최대 20분)에서 진행한다.
 */

export type EndingDefinition = {
  id: EndingId
  title: string
  /** 조건 요약 — 판정은 `phase3Step`·`endingStep`이 하고, 여기서는 기록만 한다 */
  condition: string
  narration: string
  /** 배신자 승패 (룰북 §15) */
  traitorWon: boolean
  assets: AssetKey[]
}

/** 1인 플레이에서 본인이 타겟인 A-2 성공의 전용 내레이션 (룰북 §14.5) */
export const ENDING_NARRATION_KEY = {
  SOLO_SELF_TARGET: 'soloSelfTarget',
} as const

export type EndingNarrationKey =
  (typeof ENDING_NARRATION_KEY)[keyof typeof ENDING_NARRATION_KEY]

export const ENDING_NARRATIONS: Record<EndingNarrationKey, string> = {
  [ENDING_NARRATION_KEY.SOLO_SELF_TARGET]:
    '형제들에게 제압당한 채 끌려 나와 함께 경계를 넘는다.',
}

export const ENDINGS: Record<EndingId, EndingDefinition> = {
  [ENDING_ID.PURIFY]: {
    id: ENDING_ID.PURIFY,
    title: '진엔딩: 정화',
    condition: '옥비녀 + B-1 성공',
    narration: '옥비녀가 요기를 걷어내고, 형제는 제 얼굴을 되찾아 함께 경계를 넘는다.',
    // 정화되어 함께 귀환한다 (룰북 §15)
    traitorWon: false,
    assets: [ASSET_KEY.ITEM_JADE_HAIRPIN, ASSET_KEY.BG_BLOOD_TEAR_JANGSEUNG],
  },
  [ENDING_ID.SAFE_RETURN]: {
    id: ENDING_ID.SAFE_RETURN,
    title: '굿엔딩: 무사귀환',
    condition: 'Phase 3 진입 시 타겟 없음',
    narration: '누구의 눈에서도 피눈물이 흐르지 않는다. 삼형제는 그대로 장승을 지나친다.',
    // 타겟이 없다는 것은 100%가 없다는 뜻이라 배신자가 존재할 수 없다 (룰북 §15)
    traitorWon: false,
    assets: [ASSET_KEY.BG_BLOOD_TEAR_JANGSEUNG],
  },
  [ENDING_ID.ESCAPE_PARTING]: {
    id: ENDING_ID.ESCAPE_PARTING,
    title: '탈출: 결별',
    condition: 'A-2 성공',
    narration: '형제를 제압하고 경계를 넘지만, 넘어온 자리에 남은 것은 침묵뿐이다.',
    traitorWon: false,
    assets: [ASSET_KEY.BG_BLOOD_TEAR_JANGSEUNG],
  },
  [ENDING_ID.TRAGIC_ESCAPE]: {
    id: ENDING_ID.TRAGIC_ESCAPE,
    title: '비극적 탈출',
    condition: 'A-1 채택',
    narration: '뒤돌아보지 않고 달린다. 등 뒤의 비명은 형제의 목소리였다.',
    traitorWon: false,
    assets: [ASSET_KEY.BG_BLOOD_TEAR_JANGSEUNG, ASSET_KEY.MASK_CORRUPTED],
  },
  [ENDING_ID.ANNIHILATION]: {
    id: ENDING_ID.ANNIHILATION,
    title: '전멸',
    condition: 'A-2 실패',
    narration: '형제를 이기지 못한 채, 추격대의 탈들이 셋을 모두 덮는다.',
    traitorWon: true,
    assets: [ASSET_KEY.MASK_CORRUPTED],
  },
  [ENDING_ID.ETERNAL_MAZE]: {
    id: ENDING_ID.ETERNAL_MAZE,
    title: '영원한 미로',
    condition: 'B-1 실패',
    narration: '옥비녀가 빛을 잃는다. 장승 너머의 길은 다시 숲으로 이어진다.',
    traitorWon: true,
    assets: [ASSET_KEY.MASK_CORRUPTED],
  },
  [ENDING_ID.FORCED_EROSION]: {
    id: ENDING_ID.FORCED_EROSION,
    title: '강제 잠식',
    condition: '타임오버 / Phase 3 유효표 0 / 인간 전원 배신자',
    narration: '모든 화면이 노이즈로 덮인다. 마을은 형제를 놓아주지 않았다.',
    traitorWon: true,
    assets: [ASSET_KEY.MASK_CORRUPTED],
  },
}

export function endingOf(id: EndingId): EndingDefinition {
  return ENDINGS[id]
}
