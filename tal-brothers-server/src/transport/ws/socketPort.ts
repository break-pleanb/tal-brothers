/**
 * 세션이 쓰는 소켓 인터페이스 (M3 계획 9절).
 *
 * 세션은 `ws` 구현을 직접 알지 않는다. 테스트는 나간 문자열을 배열로 모으는 가짜를 넣는다.
 * 프레임은 모두 JSON 문자열이다.
 */
export type SocketPort = {
  send(payload: string): void
  /** 사유를 남기고 닫는다. 이미 닫혀 있으면 아무것도 하지 않는다 */
  close(reason: string): void
}
