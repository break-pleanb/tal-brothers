import { createCryptoRng } from '../engine/random'
import type { Rng } from '../engine/random'
import { createRoom } from './roomRuntime'
import type { Scheduler } from './scheduler'
import type { Room } from './roomTypes'

/**
 * 메모리 내 방 목록 (아키텍처 §6, M3 계획 4.2).
 *
 * **방 상태의 원본은 메모리다.** `rooms` 테이블은 초대 코드 조회와 이력용이다 (아키텍처 §10).
 * 서버 인스턴스는 1대를 전제한다.
 */

/** 혼동하기 쉬운 0/O/1/I/L을 뺀 대문자·숫자 (M3 계획 10절 6번) */
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

export const DEFAULT_ROOM_CODE_LENGTH = 6
/** 방 보관 기간 — 마지막 활동 후 6시간 (M3 계획 10절 6번) */
export const DEFAULT_ROOM_TTL_MS = 6 * 60 * 60 * 1000

export type RoomRegistryOptions = {
  scheduler: Scheduler
  /** 방마다 새 난수를 만든다 (아키텍처 §5.5). 테스트는 시드 고정 난수를 넣는다 */
  createRng?: () => Rng
  /** 방 코드 발급. 테스트는 고정 코드를 넣는다 */
  generateCode?: () => string
  codeLength?: number
  roomTtlMs?: number
}

export type CreateRoomRequest = {
  hostUserId: string
  hostDisplayName?: string | null
}

export type RoomRegistry = {
  create(request: CreateRoomRequest): Room
  get(code: string): Room | null
  list(): Room[]
  remove(code: string): void
  /** 마지막 활동 후 보관 기간이 지난 방을 정리하고, 지운 코드를 돌려준다 */
  sweep(now: number): string[]
}

function randomCode(rng: Rng, length: number): string {
  let code = ''
  for (let index = 0; index < length; index += 1) {
    code += ROOM_CODE_ALPHABET[rng.nextInt(ROOM_CODE_ALPHABET.length)]
  }
  return code
}

export function createRoomRegistry(options: RoomRegistryOptions): RoomRegistry {
  const rooms = new Map<string, Room>()
  const codeLength = options.codeLength ?? DEFAULT_ROOM_CODE_LENGTH
  const ttlMs = options.roomTtlMs ?? DEFAULT_ROOM_TTL_MS
  const createRng = options.createRng ?? createCryptoRng
  const codeRng = createRng()
  const generateCode = options.generateCode ?? (() => randomCode(codeRng, codeLength))

  /** 같은 코드가 두 번 발급되지 않게 빈 코드를 찾을 때까지 다시 뽑는다 */
  function nextFreeCode(): string {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const code = generateCode()
      if (!rooms.has(code)) return code
    }
    throw new Error('빈 방 코드를 찾지 못했다')
  }

  return {
    create(request): Room {
      const code = nextFreeCode()
      const room = createRoom({
        code,
        hostUserId: request.hostUserId,
        hostDisplayName: request.hostDisplayName ?? null,
        scheduler: options.scheduler,
        rng: createRng(),
      })
      rooms.set(code, room)
      return room
    },

    get(code): Room | null {
      return rooms.get(code) ?? null
    },

    list(): Room[] {
      return [...rooms.values()]
    },

    remove(code): void {
      const room = rooms.get(code)
      if (room === undefined) return
      room.dispose()
      rooms.delete(code)
    },

    sweep(now): string[] {
      const removed: string[] = []
      for (const [code, room] of rooms) {
        if (now - room.lastActiveAt < ttlMs) continue
        room.dispose()
        rooms.delete(code)
        removed.push(code)
      }
      return removed
    },
  }
}
