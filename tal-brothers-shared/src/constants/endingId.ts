/** 엔딩 7종 (룰북 §15). 조건과 배신자 승패는 서버의 `ENDINGS`가 들고 있다 */
export const ENDING_ID = {
  /** 진엔딩: 정화 — 옥비녀 + B-1 성공 */
  PURIFY: 'purify',
  /** 굿엔딩: 무사귀환 — Phase 3 진입 시 타겟 없음 */
  SAFE_RETURN: 'safeReturn',
  /** 탈출: 결별 — A-2 성공 */
  ESCAPE_PARTING: 'escapeParting',
  /** 비극적 탈출 — A-1 채택 */
  TRAGIC_ESCAPE: 'tragicEscape',
  /** 전멸 — A-2 실패 */
  ANNIHILATION: 'annihilation',
  /** 영원한 미로 — B-1 실패 */
  ETERNAL_MAZE: 'eternalMaze',
  /** 강제 잠식 — 타임오버, Phase 3 유효표 0, 인간 전원 배신자 */
  FORCED_EROSION: 'forcedErosion',
} as const

export type EndingId = (typeof ENDING_ID)[keyof typeof ENDING_ID]
