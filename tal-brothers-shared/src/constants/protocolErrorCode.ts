/**
 * ws `error` 메시지의 코드 (M3 계획 3.1).
 * 명령 거절(`rejected`)과 달리 **연결 자체가 성립하지 않는 경우**에 쓰고, 보낸 뒤 소켓을 닫는다.
 */
export const PROTOCOL_ERROR_CODE = {
  /** JSON이 아니거나 프레임 모양이 어긋남 */
  BAD_FRAME: 'badFrame',
  /** hello 전에 다른 프레임이 왔다 */
  NOT_AUTHENTICATED: 'notAuthenticated',
  /** hello가 두 번 왔다 */
  ALREADY_AUTHENTICATED: 'alreadyAuthenticated',
  /** 토큰 검증 실패·만료 */
  INVALID_TOKEN: 'invalidToken',
  /** 방 코드로 방을 찾지 못함 */
  ROOM_NOT_FOUND: 'roomNotFound',
  /** Display로 접속했으나 방의 호스트가 아님 */
  NOT_HOST: 'notHost',
  /** Controller로 접속했으나 방 멤버가 아님 */
  NOT_MEMBER: 'notMember',
  /** hello 타임아웃 안에 인증 프레임이 오지 않음 */
  HELLO_TIMEOUT: 'helloTimeout',
  /** 같은 (계정, 기기 역할)로 새 소켓이 들어와 밀려남 (M3 계획 10절 7번) */
  REPLACED_BY_NEW_SESSION: 'replacedByNewSession',
} as const

export type ProtocolErrorCode = (typeof PROTOCOL_ERROR_CODE)[keyof typeof PROTOCOL_ERROR_CODE]
