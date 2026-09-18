/** 귓속말 종류 (룰북 §16) */
export const WHISPER_KIND = {
  /** T2-2 A 성공/실패 → 이장 이벤트 선택지 1개의 변이 */
  T2_VARIANT: 't2Variant',
  /** 02A·05A·14B 비공개 판정 → 무작위 다른 형제 1명의 잠식 구간. 성공 = 진실 */
  EVENT_WHISPER: 'eventWhisper',
  /** 30%·60% 티어 환청 → 무작위 다른 형제 1명의 잠식 구간. 진실 30% */
  TIER_HALLUCINATION: 'tierHallucination',
  /** 분기 B 실패 → 다음 이벤트 시작 시 무작위 형제 1명에게. 거짓 100% */
  SHRINE_FAIL: 'shrineFail',
  /** Phase 2 진입 환청 → 부적 보유자에게 경고만. 정보 없음 */
  ENTRY_WARNING: 'entryWarning',
} as const

export type WhisperKind = (typeof WHISPER_KIND)[keyof typeof WHISPER_KIND]
