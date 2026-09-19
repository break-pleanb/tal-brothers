import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * `rooms` 테이블 (아키텍처 §10, M3 계획 4.2).
 *
 * **방 상태의 원본은 서버 메모리다.** 이 테이블은 초대 코드 조회와 이력용이라
 * 게임 진행 중에는 읽지 않는다. 쓰기는 service role만 한다.
 */

export type RoomRecord = {
  code: string
  hostUserId: string
  /** epoch ms */
  createdAt: number
  closedAt: number | null
}

export type RoomRepository = {
  insert(record: Omit<RoomRecord, 'closedAt'>): Promise<void>
  findByCode(code: string): Promise<RoomRecord | null>
  markClosed(code: string, at: number): Promise<void>
}

type RoomRow = {
  code: string
  host_user_id: string
  created_at: string
  closed_at: string | null
}

function toRecord(row: RoomRow): RoomRecord {
  return {
    code: row.code,
    hostUserId: row.host_user_id,
    createdAt: Date.parse(row.created_at),
    closedAt: row.closed_at === null ? null : Date.parse(row.closed_at),
  }
}

export function createRoomRepository(client: SupabaseClient): RoomRepository {
  return {
    async insert(record): Promise<void> {
      const { error } = await client.from('rooms').insert({
        code: record.code,
        host_user_id: record.hostUserId,
        created_at: new Date(record.createdAt).toISOString(),
      })
      if (error !== null) throw new Error(`방 기록 실패: ${error.message}`)
    },

    async findByCode(code): Promise<RoomRecord | null> {
      const { data, error } = await client
        .from('rooms')
        .select('code, host_user_id, created_at, closed_at')
        .eq('code', code)
        .maybeSingle()

      if (error !== null) throw new Error(`방 조회 실패: ${error.message}`)
      return data === null ? null : toRecord(data as RoomRow)
    },

    async markClosed(code, at): Promise<void> {
      const { error } = await client
        .from('rooms')
        .update({ closed_at: new Date(at).toISOString() })
        .eq('code', code)
      if (error !== null) throw new Error(`방 종료 기록 실패: ${error.message}`)
    },
  }
}
