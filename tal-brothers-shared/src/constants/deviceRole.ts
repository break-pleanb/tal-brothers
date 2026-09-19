/**
 * 기기 역할 (아키텍처 §1).
 * 좌석은 `계정 + Controller` 조합으로 연결한다. 호스트는 같은 계정으로 두 역할에 동시 접속한다.
 */
export const DEVICE_ROLE = {
  /** 호스트 PC — 공용 중계 화면. 게임 조작은 하지 않고 로비 운영 명령만 보낸다 */
  DISPLAY: 'display',
  /** 각 플레이어 폰 — 좌석 조작 */
  CONTROLLER: 'controller',
} as const

export type DeviceRole = (typeof DEVICE_ROLE)[keyof typeof DEVICE_ROLE]
