import { ENDING_ID } from 'tal-brothers-shared'
import type { EndingId } from 'tal-brothers-shared'

/** 엔딩 7종 이름 (룰북 §15). 내레이션 문장은 서버가 cue로 실어 보낸다 */
export const ENDING_LABEL: Record<EndingId, string> = {
  [ENDING_ID.PURIFY]: '진엔딩: 정화',
  [ENDING_ID.SAFE_RETURN]: '굿엔딩: 무사귀환',
  [ENDING_ID.ESCAPE_PARTING]: '탈출: 결별',
  [ENDING_ID.TRAGIC_ESCAPE]: '비극적 탈출',
  [ENDING_ID.ANNIHILATION]: '전멸',
  [ENDING_ID.ETERNAL_MAZE]: '영원한 미로',
  [ENDING_ID.FORCED_EROSION]: '강제 잠식',
}
