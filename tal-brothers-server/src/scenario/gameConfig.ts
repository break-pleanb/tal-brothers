/**
 * 설정값 단일 출처 (룰북 §19 + 아키텍처 §8).
 * 룰북에 `[설정값]`으로 표시된 수치는 모두 여기서만 읽는다.
 */
export const GAME_CONFIG = {
  /** 게임 시계 (룰북 §2.1) */
  gameClockMinutes: 100,
  /** 엔딩 연출 버퍼 — 시계 밖 (룰북 §2.1) */
  endingBufferMinutes: 20,
  /** 상황 제시 (룰북 §2.2) */
  eventIntroSeconds: 30,
  /** 투표 (룰북 §8) */
  votingSeconds: 180,
  /** 판정 연출 (룰북 §19) */
  rollRevealSeconds: 3,
  /** 연습 개입 창 — 단일 단계 (룰북 §12) */
  practiceInterventionSeconds: 12,
  /** 개입 창 1단계 — 둘째 재굴림 (룰북 §7.2) */
  interventionRerollSeconds: 4,
  /** 개입 창 2단계 — 낡은 부적 (룰북 §7.2) */
  interventionTalismanSeconds: 4,
  /** 개입 창 3단계 — 첫째 강제 성공 (룰북 §7.2) */
  interventionForceSeconds: 4,
  /** 서버 입력 유예 (룰북 §7.5) */
  inputGraceMs: 300,
  /** 14A 부적 제출 창 (룰북 §19). M2 */
  talismanWindowSeconds: 8,
  /** 붉은 메시지 표시 (룰북 §10.1). M2 */
  redMessageSeconds: 3,
  /** Phase 3 절삭 (룰북 §19). M2 */
  phase3TruncateMinutes: 10,

  /** 환경 잠식 — Phase 2 랜덤 이벤트마다 전원 (룰북 §4.2). M2 */
  environmentErosionPercent: 5,
  /** Phase 2 진입 환청 — 부적 미보유자 (룰북 §13.1). M2 */
  phase2EntryNoTalismanPercent: 20,
  /** 비공개 판정 대가 — 성패 무관 고정 (룰북 §5.4) */
  hiddenJudgmentCostPercent: 10,
  /** 첫째 강제 성공 대가 (룰북 §3.2) */
  forceSuccessCostPercent: 15,
  /** 부적 잠식도 회복 (룰북 §9.1) */
  talismanHealPercent: 10,
  /** Phase 3 타겟 임계 (룰북 §19). M2 */
  phase3TargetThresholdPercent: 30,

  /** 기본 성공 기준 (룰북 §19) */
  thresholdBase: 4,
  /** 고난도 성공 기준 (룰북 §19) */
  thresholdHard: 5,
  /** 협동 판정 기준 — 일반 (룰북 §5.3) */
  coopThreshold: 5,
  /** 협동 판정 기준 — 보스 (룰북 §5.3). M2 */
  coopBossThreshold: 6,
  /** 디버프 합계 하한 (룰북 §5.5) */
  debuffFloor: -2,

  /** 부적 보유 상한 (룰북 §9.1). 검사는 M2 */
  talismanLimit: 2,

  /** 변이 발생 비율 흉/평/길 (룰북 §6.1) */
  variantWeights: { ill: 30, plain: 50, bless: 20 },
  /** 흉 — 성공 기준 가산 (룰북 §6.2) */
  illThresholdDelta: 1,
  /** 흉 — 실패 잠식 페널티 가산 (룰북 §6.2) */
  illPenaltyDeltaPercent: 10,
  /** 흉 — 시간 페널티 가산 (룰북 §6.2) */
  illTimeDeltaMinutes: 5,
  /** 길 — 실패 잠식 페널티 감산 (룰북 §6.2) */
  blessPenaltyDeltaPercent: -10,
  /** 길 — 시간 페널티 감산 (룰북 §6.2) */
  blessTimeDeltaMinutes: -5,
  /** 길 — 보상 +1단계 중 부적 (룰북 §6.2) */
  blessTalismanStep: 1,
  /** 길 — 보상 +1단계 중 회복 (룰북 §6.2) */
  blessHealStepPercent: 5,
  /** 성공 기준 상한 (룰북 §6.2) */
  thresholdMax: 6,
  /** 비공개 판정 길 변이의 성공 기준 하한 (룰북 §6.2) */
  hiddenThresholdMin: 2,

  /** 30% 티어 환청 확률 (룰북 §4.3). M2 */
  tier30HallucinationChance: 50,
  /** 30% 티어 환청의 진실 비율 (룰북 §4.3). M2 */
  tier30TruthRatio: 30,
  /** 60% 티어 가짜 라벨 확률 (룰북 §4.3). M2 */
  tier60FakeLabelChance: 30,
  /** 가짜 붉은 메시지 확률 (룰북 §19). M2 */
  fakeRedMessageChance: 20,

  /** 봇 부적 판단 시각 = 부적 단계 마감 시각 - 이 값 (룰북 §11) */
  botTalismanDelaySeconds: 1,

  /** 판정자 자동 굴림 대기 (아키텍처 §8) */
  autoRollSeconds: 10,
  /** Controller 봇 대행 전환 (아키텍처 §8). M3 */
  botTakeoverSeconds: 30,
  /** 자동 일시정지 누적 한도 (아키텍처 §8). M3 */
  autoPauseLimitMinutes: 5,
} as const

export type GameConfig = typeof GAME_CONFIG
