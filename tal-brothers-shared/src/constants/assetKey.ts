/**
 * 서버가 지정하는 인게임 에셋 키 11종 (룰북 §18).
 * 값은 web의 이미지 파일명(확장자 제외)과 1:1이며, 경로 매핑은 web이 담당한다.
 * 랜딩·메뉴용 브랜드 이미지(introMask)는 web 전용이라 포함하지 않는다.
 */
export const ASSET_KEY = {
  /** 배경 — 초가 마을. Phase 1 (T1, T2, 이장) */
  BG_THATCHED_VILLAGE: 'thatchedVillage',
  /** 배경 — 당산나무 숲. Phase 2 기본, 분기 A */
  BG_DANGSAN_FOREST: 'dangsanForest',
  /** 배경 — 핏빛 사당. 분기 B, 07 성황당 */
  BG_BLOODY_SHRINE: 'bloodyShrine',
  /** 배경 — 피눈물 장승. Phase 3, 탈출 계열 엔딩 */
  BG_BLOOD_TEAR_JANGSEUNG: 'bloodTearJangseung',
  /** 아이템 — 어머니의 옥비녀 */
  ITEM_JADE_HAIRPIN: 'jadeHairpin',
  /** 아이템 — 낡은 부적 (튜토리얼 부적 공용) */
  ITEM_TALISMAN: 'talisman',
  /** 탈 — 기본 광대탈. 이장, 03 */
  MASK_CLOWN: 'clownMask',
  /** 탈 — 일반 탈 1. 01 아귀탈 */
  MASK_COMMON_A: 'commonMaskA',
  /** 탈 — 일반 탈 2. 10 무당탈 */
  MASK_COMMON_B: 'commonMaskB',
  /** 탈 — 보스 탈. 15 백정탈 */
  MASK_BOSS: 'bossMask',
  /** 탈 — 요괴화 탈. 붉은 메시지, 배신자 승리 계열 엔딩 */
  MASK_CORRUPTED: 'corruptedMask',
} as const

export type AssetKey = (typeof ASSET_KEY)[keyof typeof ASSET_KEY]
