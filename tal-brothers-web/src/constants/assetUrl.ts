import { ASSET_KEY } from 'tal-brothers-shared'
import type { AssetKey } from 'tal-brothers-shared'

import bloodTearJangseung from '@/assets/images/backgrounds/bloodTearJangseung.jpg'
import bloodyShrine from '@/assets/images/backgrounds/bloodyShrine.jpg'
import dangsanForest from '@/assets/images/backgrounds/dangsanForest.jpg'
import thatchedVillage from '@/assets/images/backgrounds/thatchedVillage.jpg'
import jadeHairpin from '@/assets/images/items/jadeHairpin.jpg'
import talisman from '@/assets/images/items/talisman.jpg'
import bossMask from '@/assets/images/masks/bossMask.jpg'
import clownMask from '@/assets/images/masks/clownMask.jpg'
import commonMaskA from '@/assets/images/masks/commonMaskA.jpg'
import commonMaskB from '@/assets/images/masks/commonMaskB.jpg'
import corruptedMask from '@/assets/images/masks/corruptedMask.jpg'

/**
 * 에셋 키 → 이미지 주소 (아키텍처 §9.1·§9.3, 룰북 §18, m5-plan M5-1).
 *
 * 어느 화면에 어떤 키를 쓸지는 **서버가 보낸 키**(`background`·`mask`·`EndingView.assets`)가 정한다.
 * 여기서는 키를 파일로 바꾸기만 한다. Vite가 빌드 때 해시가 붙은 주소로 바꾼다.
 *
 * M4의 임시 표현(`assetPlaceholder.ts`)을 이 파일이 대체했다.
 */
export const ASSET_URL: Record<AssetKey, string> = {
  [ASSET_KEY.BG_THATCHED_VILLAGE]: thatchedVillage,
  [ASSET_KEY.BG_DANGSAN_FOREST]: dangsanForest,
  [ASSET_KEY.BG_BLOODY_SHRINE]: bloodyShrine,
  [ASSET_KEY.BG_BLOOD_TEAR_JANGSEUNG]: bloodTearJangseung,

  [ASSET_KEY.ITEM_JADE_HAIRPIN]: jadeHairpin,
  [ASSET_KEY.ITEM_TALISMAN]: talisman,

  [ASSET_KEY.MASK_CLOWN]: clownMask,
  [ASSET_KEY.MASK_COMMON_A]: commonMaskA,
  [ASSET_KEY.MASK_COMMON_B]: commonMaskB,
  [ASSET_KEY.MASK_BOSS]: bossMask,
  [ASSET_KEY.MASK_CORRUPTED]: corruptedMask,
}
