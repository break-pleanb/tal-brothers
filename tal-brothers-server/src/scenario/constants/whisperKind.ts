/** 귓속말 종류 (룰북 §16). M1 범위는 T2 귓속말 1종이고 나머지는 M2 */
export const WHISPER_KIND = {
  /** T2-2 A 성공/실패 → 이장 이벤트 선택지 1개의 변이 */
  T2_VARIANT: 't2Variant',
} as const

export type WhisperKind = (typeof WHISPER_KIND)[keyof typeof WHISPER_KIND]
