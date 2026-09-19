import { REJECTION_REASON } from 'tal-brothers-shared'
import type { RejectionReason } from 'tal-brothers-shared'

/**
 * 거절 사유의 안내 문구.
 *
 * 서버가 보내는 `detail`은 개발자용 설명이라 화면에 그대로 쓰지 않는다.
 * 사유는 7종뿐이고 클라이언트가 분기하는 값이라 shared 상수를 그대로 키로 쓴다.
 */
export const REJECTION_LABEL: Record<RejectionReason, string> = {
  [REJECTION_REASON.UNKNOWN_COMMAND]: '알 수 없는 조작입니다.',
  [REJECTION_REASON.WRONG_STEP]: '지금은 할 수 없는 조작입니다.',
  [REJECTION_REASON.WRONG_SEAT]: '이 자리에서 할 수 없는 조작입니다.',
  [REJECTION_REASON.NOT_ALLOWED]: '조건이 맞지 않아 처리되지 않았습니다.',
  [REJECTION_REASON.STALE_TIMER]: '이미 지난 차례입니다.',
  [REJECTION_REASON.GAME_FINISHED]: '게임이 끝났습니다.',
  [REJECTION_REASON.UNHANDLED_STEP]: '지금은 조작을 받지 않습니다.',
}
