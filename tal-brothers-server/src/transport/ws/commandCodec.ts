import { BROTHER_ROLE, CLIENT_FRAME_TYPE, COMMAND_TYPE, DEVICE_ROLE } from 'tal-brothers-shared'
import type { BrotherRole, ClientFrame, Command, DeviceRole } from 'tal-brothers-shared'

/**
 * 들어온 프레임 검증 — 3겹 중 1겹 (M3 계획 3.3).
 *
 * 여기서 보는 것은 **모양뿐이다.** JSON인지, `t`가 아는 값인지, 필드 타입이 맞는지.
 * 단계·좌석·조건 판정은 엔진이 한다. 의존성 없이 손으로 쓴다.
 */

export type FrameDecodeResult =
  /** 읽어낸 프레임 */
  | { kind: 'frame'; frame: ClientFrame }
  /** 프레임 자체를 읽지 못했다 → `error(badFrame)` */
  | { kind: 'badFrame'; detail: string }
  /** 프레임은 읽었지만 명령을 모른다 → `rejected(unknownCommand)`. 요청의 `seq`를 돌려줄 수 있다 */
  | { kind: 'badCommand'; seq: number; detail: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSeat(value: unknown): value is BrotherRole {
  return (
    value === BROTHER_ROLE.FIRST || value === BROTHER_ROLE.SECOND || value === BROTHER_ROLE.THIRD
  )
}

function isDeviceRole(value: unknown): value is DeviceRole {
  return value === DEVICE_ROLE.DISPLAY || value === DEVICE_ROLE.CONTROLLER
}

/** 명령 본문 검증. 모르는 종류나 필드 타입 불일치는 null */
export function decodeCommand(value: unknown): Command | null {
  if (!isRecord(value)) return null

  switch (value.type) {
    case COMMAND_TYPE.LOBBY_PICK_SEAT:
      return isSeat(value.seat) ? { type: value.type, seat: value.seat } : null

    case COMMAND_TYPE.LOBBY_TOGGLE_BOT:
      return isSeat(value.seat) && typeof value.isBot === 'boolean'
        ? { type: value.type, seat: value.seat, isBot: value.isBot }
        : null

    case COMMAND_TYPE.VOTE_SUBMIT:
      return typeof value.choiceId === 'string' && value.choiceId.length > 0
        ? { type: value.type, choiceId: value.choiceId }
        : null

    case COMMAND_TYPE.TALISMAN_TRANSFER:
      return isSeat(value.toSeat) ? { type: value.type, toSeat: value.toSeat } : null

    // 본문이 없는 명령
    case COMMAND_TYPE.LOBBY_START:
    case COMMAND_TYPE.HOST_PAUSE:
    case COMMAND_TYPE.HOST_RESUME:
    case COMMAND_TYPE.ROLL_REQUEST:
    case COMMAND_TYPE.ABILITY_TRUE_SIGHT:
    case COMMAND_TYPE.INTERVENTION_REROLL:
    case COMMAND_TYPE.INTERVENTION_TALISMAN:
    case COMMAND_TYPE.INTERVENTION_FORCE_SUCCESS:
    case COMMAND_TYPE.TALISMAN_HEAL:
    case COMMAND_TYPE.TALISMAN_SUBMIT:
    case COMMAND_TYPE.TALISMAN_DISCARD:
      return { type: value.type }

    default:
      return null
  }
}

/** 원문 한 줄을 클라이언트 프레임으로 읽는다 */
export function decodeClientFrame(raw: string): FrameDecodeResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: 'badFrame', detail: 'JSON이 아니다' }
  }

  if (!isRecord(parsed)) return { kind: 'badFrame', detail: '객체가 아니다' }

  switch (parsed.t) {
    case CLIENT_FRAME_TYPE.HELLO: {
      if (
        typeof parsed.token !== 'string' ||
        parsed.token.length === 0 ||
        typeof parsed.roomCode !== 'string' ||
        parsed.roomCode.length === 0 ||
        !isDeviceRole(parsed.deviceRole)
      ) {
        return { kind: 'badFrame', detail: 'hello 본문이 어긋난다' }
      }
      return {
        kind: 'frame',
        frame: {
          t: CLIENT_FRAME_TYPE.HELLO,
          token: parsed.token,
          roomCode: parsed.roomCode,
          deviceRole: parsed.deviceRole,
        },
      }
    }

    case CLIENT_FRAME_TYPE.COMMAND: {
      if (!Number.isInteger(parsed.seq)) {
        return { kind: 'badFrame', detail: 'command 프레임에 seq가 없다' }
      }
      const seq = parsed.seq as number

      const command = decodeCommand(parsed.command)
      if (command === null) {
        return { kind: 'badCommand', seq, detail: '모르는 명령이거나 필드가 어긋난다' }
      }
      return { kind: 'frame', frame: { t: CLIENT_FRAME_TYPE.COMMAND, seq, command } }
    }

    case CLIENT_FRAME_TYPE.RESYNC: {
      if (!Number.isInteger(parsed.haveVersion)) {
        return { kind: 'badFrame', detail: 'resync 본문이 어긋난다' }
      }
      return {
        kind: 'frame',
        frame: { t: CLIENT_FRAME_TYPE.RESYNC, haveVersion: parsed.haveVersion as number },
      }
    }

    default:
      return { kind: 'badFrame', detail: `모르는 프레임 종류다: ${String(parsed.t)}` }
  }
}
