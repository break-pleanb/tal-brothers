import type { BrotherRole } from '../constants/brotherRole'
import type { ClientFrameType } from '../constants/clientFrameType'
import { CLIENT_FRAME_TYPE } from '../constants/clientFrameType'
import type { CueKind } from '../constants/cueKind'
import type { DeviceRole } from '../constants/deviceRole'
import type { ProtocolErrorCode } from '../constants/protocolErrorCode'
import type { RejectionReason } from '../constants/rejectionReason'
import { SERVER_MESSAGE_TYPE } from '../constants/serverMessageType'
import type { Command } from './command'
import type { DisplaySnapshot, PublicSnapshot, SeatSnapshot } from './projection'

/**
 * ws 프레임 봉투 (아키텍처 §7, M3 계획 3절).
 *
 * - 클라이언트 → 서버는 **명령만** 보낸다. 상태를 고쳐 보내지 않는다
 * - 서버 → 클라이언트는 대상별 스냅샷 + 일회성 cue다
 * - cue는 다시 보내지 않는다. 재접속·재동기화로 받는 것은 스냅샷뿐이다 (아키텍처 §2 원칙 5)
 */

// ─── 클라이언트 → 서버 ───

/** 연결 직후 1회. 토큰은 URL·쿼리스트링이 아니라 이 본문에 싣는다 (아키텍처 §10) */
export type HelloFrame = {
  t: typeof CLIENT_FRAME_TYPE.HELLO
  token: string
  roomCode: string
  deviceRole: DeviceRole
}

/** 게임 명령. `seq`는 클라이언트가 매기고, 거절될 때 그대로 되돌아온다 */
export type CommandFrame = {
  t: typeof CLIENT_FRAME_TYPE.COMMAND
  seq: number
  command: Command
}

/** 받은 상태 버전이 `마지막 + 1`이 아닐 때 전체 스냅샷을 다시 요청한다 */
export type ResyncFrame = {
  t: typeof CLIENT_FRAME_TYPE.RESYNC
  haveVersion: number
}

export type ClientFrame = HelloFrame | CommandFrame | ResyncFrame

// ─── 서버 → 클라이언트 ───

/** 클라이언트로 나가는 cue. 수신 대상(`audience`)은 서버가 판단하므로 싣지 않는다 */
export type CueView = {
  kind: CueKind
  text: string
  data?: Record<string, unknown>
}

export type WelcomeMessage = {
  t: typeof SERVER_MESSAGE_TYPE.WELCOME
  roomCode: string
  deviceRole: DeviceRole
  /** 이 소켓이 붙은 좌석. Display이거나 아직 좌석을 고르지 않았으면 null */
  seat: BrotherRole | null
  protocolVersion: number
}

export type SnapshotMessage = {
  t: typeof SERVER_MESSAGE_TYPE.SNAPSHOT
  stateVersion: number
  /** Display는 `DisplaySnapshot`, 좌석은 `SeatSnapshot`, 좌석을 고르기 전에는 `PublicSnapshot` */
  snapshot: DisplaySnapshot | SeatSnapshot | PublicSnapshot
}

export type CueMessage = {
  t: typeof SERVER_MESSAGE_TYPE.CUE
  stateVersion: number
  cues: CueView[]
}

/** 명령 거절. `seq`는 원인이 된 명령의 번호이고, 명령이 아닌 원인이면 null */
export type RejectedMessage = {
  t: typeof SERVER_MESSAGE_TYPE.REJECTED
  seq: number | null
  reason: RejectionReason
  detail?: string
}

/** 연결이 성립하지 않는 경우. 보낸 뒤 소켓을 닫는다 */
export type ErrorMessage = {
  t: typeof SERVER_MESSAGE_TYPE.ERROR
  code: ProtocolErrorCode
  message: string
}

export type ServerMessage =
  | WelcomeMessage
  | SnapshotMessage
  | CueMessage
  | RejectedMessage
  | ErrorMessage

/** 프레임 종류만 먼저 읽을 때 쓰는 최소 모양 */
export type ClientFrameEnvelope = { t: ClientFrameType }
