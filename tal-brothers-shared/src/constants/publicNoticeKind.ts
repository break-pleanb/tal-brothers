/**
 * Display 공개 알림의 종류 (룰북 §17).
 * `NoticeView.kind`로 나가므로 화면이 분기할 수 있게 shared에 둔다.
 */
export const PUBLIC_NOTICE_KIND = {
  /** 고유 능력 사용 — 형제 이름과 함께 공개 (룰북 §3.5) */
  ABILITY_USED: 'abilityUsed',
  /** 부적 사용 — 이름과 함께 공개 (룰북 §7.4) */
  TALISMAN_USED: 'talismanUsed',
  /** 익명 디버프 — 출처 없이 표시 (룰북 §5.5) */
  ANONYMOUS_MODIFIER: 'anonymousModifier',
  /** 익명 저주 — 14A 미제출 (룰북 §13.5) */
  ANONYMOUS_CURSE: 'anonymousCurse',
  /** 귓속말 발송 알림 — 대상은 밝히지 않는다 (룰북 §16) */
  WHISPER_SENT: 'whisperSent',
  /** 마감 후 득표 수 공개 (룰북 §8) */
  VOTE_TALLY: 'voteTally',
  /** 13번 발목 대상 공개 (룰북 §13.5) */
  SEAT_GRABBED: 'seatGrabbed',
  /** Phase 3 타겟 공개 (룰북 §14.1) */
  PHASE3_TARGET: 'phase3Target',
  /** 옥비녀 이동 공개 (룰북 §14.1) */
  JADE_HAIRPIN_MOVED: 'jadeHairpinMoved',
  /** 엔딩 (룰북 §15) */
  ENDING: 'ending',
} as const

export type PublicNoticeKind = (typeof PUBLIC_NOTICE_KIND)[keyof typeof PUBLIC_NOTICE_KIND]
