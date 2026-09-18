/** 클라이언트 → 서버 명령 이름 (아키텍처 §7.1). 값이 그대로 전송 이름이다 */
export const COMMAND_TYPE = {
  /** 연결 직후 인증 — 토큰, 방 코드, 기기 역할. M3 */
  SESSION_HELLO: 'session.hello',
  /** 로비 좌석 선택. M3 */
  LOBBY_PICK_SEAT: 'lobby.pickSeat',
  /** 로비 봇 토글. M3 */
  LOBBY_TOGGLE_BOT: 'lobby.toggleBot',
  /** 로비 시작. M3 */
  LOBBY_START: 'lobby.start',
  /** 투표 — 마감 전 재전송으로 변경 */
  VOTE_SUBMIT: 'vote.submit',
  /** 주사위 굴림 */
  ROLL_REQUEST: 'roll.request',
  /** 셋째 절대 시야 */
  ABILITY_TRUE_SIGHT: 'ability.trueSight',
  /** 둘째 재굴림 */
  INTERVENTION_REROLL: 'intervention.reroll',
  /** 부적 판정 보정 +1 */
  INTERVENTION_TALISMAN: 'intervention.talisman',
  /** 첫째 강제 성공 */
  INTERVENTION_FORCE_SUCCESS: 'intervention.forceSuccess',
  /** 부적 잠식도 회복 -10% */
  TALISMAN_HEAL: 'talisman.heal',
  /** 14A 부적 제출. M2 */
  TALISMAN_SUBMIT: 'talisman.submit',
  /** 보유 상한 초과 시 양도. M2 */
  TALISMAN_TRANSFER: 'talisman.transfer',
  /** 보유 상한 초과 시 버림. M2 */
  TALISMAN_DISCARD: 'talisman.discard',
  /** 호스트 수동 저장. M3 */
  HOST_SAVE: 'host.save',
  /** 호스트 수동 일시정지. M3 */
  HOST_PAUSE: 'host.pause',
  /** 호스트 재개. M3 */
  HOST_RESUME: 'host.resume',
} as const

export type CommandType = (typeof COMMAND_TYPE)[keyof typeof COMMAND_TYPE]
