import { ASSET_KEY } from 'tal-brothers-shared'
import type { AssetKey } from 'tal-brothers-shared'

/**
 * 에셋 키 → **임시 표현** (M4 계획 7절).
 *
 * 에셋 11종(룰북 §18)의 이미지는 이미 저장소에 있지만 **M4에서는 붙이지 않는다**.
 * 프리로드가 없으면 첫 노출마다 화면이 끊기기 때문이다 (9절 11번).
 * M5가 이 파일을 `assetUrl.ts`(키 → 이미지 경로)로 바꾼다 — 그때 자리·크기·레이어는 그대로 둔다.
 *
 * 색은 룰북에 없는 화면 전용 값이다. Tailwind neutral 계열 어두운 바탕 위에
 * 배경마다 다른 색조를 얹는다 (9절 13번).
 */
export type AssetPlaceholder = {
  /** 화면에 띄울 한국어 이름 */
  label: string
  /** 바탕색 */
  base: string
  /** 가장자리로 갈수록 섞이는 색 */
  edge: string
}

export const ASSET_PLACEHOLDER: Record<AssetKey, AssetPlaceholder> = {
  [ASSET_KEY.BG_THATCHED_VILLAGE]: { label: '초가 마을', base: '#2a2118', edge: '#120e0a' },
  [ASSET_KEY.BG_DANGSAN_FOREST]: { label: '당산나무 숲', base: '#14211d', edge: '#080f0d' },
  [ASSET_KEY.BG_BLOODY_SHRINE]: { label: '핏빛 사당', base: '#241214', edge: '#0f0708' },
  [ASSET_KEY.BG_BLOOD_TEAR_JANGSEUNG]: { label: '피눈물 장승', base: '#171b22', edge: '#080a0e' },

  [ASSET_KEY.ITEM_JADE_HAIRPIN]: { label: '어머니의 옥비녀', base: '#1b2a26', edge: '#0c1512' },
  [ASSET_KEY.ITEM_TALISMAN]: { label: '낡은 부적', base: '#2b2415', edge: '#14100a' },

  [ASSET_KEY.MASK_CLOWN]: { label: '광대탈', base: '#3a3128', edge: '#171310' },
  [ASSET_KEY.MASK_COMMON_A]: { label: '아귀탈', base: '#33282a', edge: '#151011' },
  [ASSET_KEY.MASK_COMMON_B]: { label: '무당탈', base: '#2e2b38', edge: '#131218' },
  [ASSET_KEY.MASK_BOSS]: { label: '백정탈', base: '#3a2422', edge: '#170e0d' },
  [ASSET_KEY.MASK_CORRUPTED]: { label: '요괴화 탈', base: '#3d1a1c', edge: '#170a0b' },
}
