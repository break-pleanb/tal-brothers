/** 게임 단계 (아키텍처 §5.3). 각 단계의 마감 시각은 상태가 절대 시각으로 들고 있다 */
export const GAME_STEP = {
  /** 로비 — 좌석 선택, 봇 토글, 시작. 처리기는 M3 */
  LOBBY: 'lobby',
  /** 상황 제시 30초 */
  EVENT_INTRO: 'eventIntro',
  /** 투표 3분, 인간 전원 투표 시 조기 마감 */
  VOTING: 'voting',
  /** 굴림 대기 10초, 미굴림 주사위는 자동 굴림 */
  ROLL_WAIT: 'rollWait',
  /** 판정 연출 3초 */
  ROLL_REVEAL: 'rollReveal',
  /** 개입 창 1단계 — 둘째 재굴림 4초 */
  INTERVENTION_REROLL: 'interventionReroll',
  /** 개입 창 2단계 — 낡은 부적 +1, 4초. 스킵 금지 */
  INTERVENTION_TALISMAN: 'interventionTalisman',
  /** 개입 창 3단계 — 첫째 강제 성공 4초 */
  INTERVENTION_FORCE: 'interventionForce',
  /** 연습 개입 창 — 튜토리얼 판정 성공 시, 단일 단계 12초 (룰북 §12) */
  PRACTICE_INTERVENTION: 'practiceIntervention',
  /** 14A 부적 제출 창 8초 (룰북 §13.5) */
  TALISMAN_WINDOW: 'talismanWindow',
  /** 결과 적용 — 타이머 없이 즉시 전이 */
  RESOLUTION: 'resolution',
  /** Phase 2 진입 환청과 슬롯 배치 (룰북 §13.1, §13.3) */
  PHASE2_ENTRY: 'phase2Entry',
  /** Phase 3 타겟 지정 (룰북 §14.1) */
  P3_TARGETING: 'p3Targeting',
  /** Phase 3 A 루트 투표 — 마감 = 시계 0 (룰북 §14.4) */
  P3_VOTING: 'p3Voting',
  /** 일시정지. M3 */
  PAUSED: 'paused',
  /** 엔딩 — 종료 상태 (룰북 §15) */
  ENDING: 'ending',
} as const

export type GameStep = (typeof GAME_STEP)[keyof typeof GAME_STEP]
