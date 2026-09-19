import { GAME_STEP } from 'tal-brothers-shared'
import type { GameStep } from 'tal-brothers-shared'

/**
 * 단계 표기 (아키텍처 §5.3).
 * 화면 구성은 단계로 갈리지만, 플레이어에게는 **지금 무엇을 기다리는지**만 알려 준다.
 */
export const STEP_LABEL: Record<GameStep, string> = {
  [GAME_STEP.LOBBY]: '대기실',
  [GAME_STEP.EVENT_INTRO]: '상황 제시',
  [GAME_STEP.VOTING]: '선택',
  [GAME_STEP.ROLL_WAIT]: '굴림',
  [GAME_STEP.ROLL_REVEAL]: '판정',
  [GAME_STEP.INTERVENTION_REROLL]: '개입 · 재굴림',
  [GAME_STEP.INTERVENTION_TALISMAN]: '개입 · 낡은 부적',
  [GAME_STEP.INTERVENTION_FORCE]: '개입 · 강제 성공',
  [GAME_STEP.PRACTICE_INTERVENTION]: '개입 연습',
  [GAME_STEP.TALISMAN_WINDOW]: '부적 제출',
  [GAME_STEP.RESOLUTION]: '결과',
  [GAME_STEP.PHASE2_ENTRY]: '숲으로',
  [GAME_STEP.P3_TARGETING]: '장승 앞',
  [GAME_STEP.P3_VOTING]: '마지막 선택',
  [GAME_STEP.PAUSED]: '일시정지',
  [GAME_STEP.ENDING]: '엔딩',
}
