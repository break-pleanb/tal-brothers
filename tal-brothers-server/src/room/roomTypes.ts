import type {
  BrotherRole,
  Command,
  DeviceRole,
  GameStep,
  ProtocolErrorCode,
  ServerMessage,
} from 'tal-brothers-shared'

import type { GameState } from '../engine/state/gameState'

/**
 * 런타임이 보는 접속과 방 (M3 계획 2절).
 *
 * 소켓 구현을 직접 알지 않는다. ws 세션이 이 모양으로 자신을 등록하고,
 * 테스트는 나간 메시지를 배열로 모으는 가짜를 넣는다.
 */

/** 같은 계정이 Display와 Controller로 동시에 붙는다. 그래서 키가 (계정, 기기 역할)이다 (아키텍처 §1) */
export function connectionKey(userId: string, deviceRole: DeviceRole): string {
  return `${userId}:${deviceRole}`
}

export type RoomConnection = {
  readonly userId: string
  readonly deviceRole: DeviceRole
  /** 로비에 보여줄 이름. 없으면 null */
  readonly displayName: string | null
  send(message: ServerMessage): void
  /** 사유를 보내고 소켓을 닫는다 */
  close(code: ProtocolErrorCode, message: string): void
}

/** 방 멤버 — 좌석과 별개다. 참가 자격만 뜻한다 (M3 계획 4.2) */
export type RoomMember = {
  userId: string
  displayName: string | null
  joinedAt: number
}

export type Room = {
  readonly code: string
  readonly hostUserId: string
  readonly createdAt: number
  /** 마지막 활동 시각. 방 보관 기간 정리에 쓴다 */
  readonly lastActiveAt: number
  readonly state: GameState
  readonly step: GameStep

  /** 참가 자격을 등록한다. 이미 있으면 그대로 둔다 */
  addMember(userId: string, displayName: string | null, now: number): RoomMember
  hasMember(userId: string): boolean
  members(): RoomMember[]

  /**
   * 접속을 붙인다. 같은 (계정, 기기 역할) 접속이 이미 있으면 **이전 소켓을 밀어낸다** (M3 계획 10절 7번).
   * 연결 사실은 presence 액션으로 큐에 들어간다
   */
  attach(connection: RoomConnection): void
  detach(connection: RoomConnection): void

  /** 이 접속이 지금 붙어 있는 좌석. Display와 좌석 미선택 Controller는 null */
  seatOf(connection: RoomConnection): BrotherRole | null
  /** 이 접속이 받을 스냅샷 메시지 (hello 직후·resync용) */
  snapshotFor(connection: RoomConnection): ServerMessage

  /** 명령을 큐에 넣는다. 거절은 보낸 소켓에만 돌아간다 */
  submitCommand(connection: RoomConnection, seq: number, command: Command): void

  /** 예약된 타이머를 풀고 방을 닫는다 */
  dispose(): void
}
