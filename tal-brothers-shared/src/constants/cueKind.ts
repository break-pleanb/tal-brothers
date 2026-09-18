/**
 * 일회성 연출 신호 (아키텍처 §7.2).
 * 클라이언트가 cue를 분기해야 하므로 종류는 shared에 둔다. 본문과 대상은 서버의 `Cue`가 들고 있다.
 */
export const CUE_KIND = {
  /** 이벤트 진입 */
  EVENT_INTRO: 'eventIntro',
  /** Phase 진입 연출 (룰북 §13.1) */
  PHASE_ENTERED: 'phaseEntered',
  /** 튜토리얼 부적 지급 (룰북 §9.2) */
  TUTORIAL_TALISMAN_GRANTED: 'tutorialTalismanGranted',
  /** 귓속말 수신 — 수신 좌석에만 (룰북 §16) */
  WHISPER_RECEIVED: 'whisperReceived',
  /** 절대 시야 열람 결과 — 셋째에게만 (룰북 §3.4) */
  TRUE_SIGHT_RESULT: 'trueSightResult',
  /** 주사위 굴림 연출 */
  DICE_ROLLED: 'diceRolled',
  /** 공개 판정 결과 */
  JUDGMENT_RESULT: 'judgmentResult',
  /** 비공개 판정 — "판정 완료"만 표시 (룰북 §5.4) */
  HIDDEN_JUDGMENT_DONE: 'hiddenJudgmentDone',
  /** 개입 수단 사용 (룰북 §7.2) */
  INTERVENTION_USED: 'interventionUsed',
  /** 연습 개입 창의 설명 팝업 — 상태 변화 없음 (룰북 §12) */
  PRACTICE_EXPLAIN: 'practiceExplain',
  /** 튜토리얼에서 첫째가 본인 판정이라 강제 성공을 쓸 수 없을 때의 설명 (룰북 §12) */
  FORCE_SUCCESS_EXPLAIN: 'forceSuccessExplain',
  /**
   * 붉은 메시지 — 배신자 전환과 가짜 붉은 메시지가 **같은 형식**을 쓴다 (룰북 §10.1, 아키텍처 §7.2).
   * 종류를 나누면 "붉은 화면 = 배신자"가 성립해 은닉이 깨진다.
   */
  RED_MESSAGE: 'redMessage',
  /** 14A 부적 제출 창 시작 (룰북 §13.5) */
  TALISMAN_WINDOW: 'talismanWindow',
  /** Phase 3 타겟 공개 (룰북 §17) */
  TARGET_REVEALED: 'targetRevealed',
  /** 옥비녀 이동 공개 (룰북 §14.1) */
  JADE_HAIRPIN_MOVED: 'jadeHairpinMoved',
  /** 결과 적용 */
  RESOLUTION: 'resolution',
  /** 타임오버 — 화면이 노이즈로 덮이고 조작이 잠긴다 (룰북 §2.1) */
  NOISE_LOCK: 'noiseLock',
  /** 엔딩 시작 (룰북 §15) */
  ENDING: 'ending',
} as const

export type CueKind = (typeof CUE_KIND)[keyof typeof CUE_KIND]
