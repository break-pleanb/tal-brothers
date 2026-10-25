import { PAUSE_REASON } from 'tal-brothers-shared'
import type { PauseReason } from 'tal-brothers-shared'

/**
 * 일시정지 사유 표기 (아키텍처 §8).
 * 누가 끊겼는지는 적지 않는다 — 좌석별 연결 상태는 Display의 좌석 줄이 "연결 끊김"으로만 알린다 (룰북 §17).
 */
export const PAUSE_REASON_LABEL: Record<PauseReason, { title: string; detail: string }> = {
  [PAUSE_REASON.HOST]: {
    title: '일시정지',
    detail: '호스트가 다시 시작할 때까지 기다려 주세요.',
  },
  [PAUSE_REASON.DISPLAY_GONE]: {
    title: '중계 화면 연결 끊김',
    detail: '중계 화면이 다시 연결되면 이어집니다.',
  },
  [PAUSE_REASON.NO_HUMAN_CONTROLLER]: {
    title: '조작 기기 연결 끊김',
    detail: '조작 기기가 다시 연결되면 이어집니다.',
  },
}
