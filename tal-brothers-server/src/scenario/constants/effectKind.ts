/** 효과 종류 (아키텍처 §5.4) */
export const EFFECT_KIND = {
  /** 잠식도 증감. +는 상승, -는 회복 (룰북 §4.1) */
  EROSION: 'erosion',
  /** 낡은 부적 획득 (룰북 §9.1) */
  TALISMAN: 'talisman',
  /** 어머니의 옥비녀 획득 — 비소모성, 강제 성공으로는 얻을 수 없다 (룰북 §9.3) */
  JADE_HAIRPIN: 'jadeHairpin',
  /** 팀 플래그 — 다음 1회 판정에 적용되고 소멸 (룰북 §5.5) */
  TEAM_MODIFIER: 'teamModifier',
  /** 게임 시계 증감. -는 시간 소모 (룰북 §2.1) */
  TIME_DELTA: 'timeDelta',
  /** 귓속말 (룰북 §16) */
  WHISPER: 'whisper',
} as const

export type EffectKind = (typeof EFFECT_KIND)[keyof typeof EFFECT_KIND]
