import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { DEVICE_ROLE, GAME_STEP } from 'tal-brothers-shared'
import type {
  BrotherRole,
  CueView,
  DeviceRole,
  DisplaySnapshot,
  LobbyView,
  PublicSnapshot,
  SeatSnapshot,
} from 'tal-brothers-shared'

import type { SocketStatus } from '@/services/roomSocket'

/**
 * 로비 스토어 (아키텍처 §9.3).
 *
 * **받은 스냅샷을 그대로 그린다.** 공개/비공개로 스토어를 나누지 않는다.
 * 서버가 대상별로 투영해 보내므로, 여기 없는 값은 이 기기가 알 수 없는 값이다.
 */

export type AnySnapshot = DisplaySnapshot | SeatSnapshot | PublicSnapshot

function hasSeatConnections(snapshot: AnySnapshot): snapshot is DisplaySnapshot {
  return 'seatConnections' in snapshot
}

function hasSeat(snapshot: AnySnapshot): snapshot is SeatSnapshot {
  return 'seat' in snapshot
}

export const useLobbyStore = defineStore('lobby', () => {
  const roomCode = ref<string | null>(null)
  const deviceRole = ref<DeviceRole | null>(null)
  const status = ref<SocketStatus>('idle')
  const snapshot = ref<AnySnapshot | null>(null)
  /** welcome이 알려 준 좌석. 이후에는 스냅샷이 더 최신이다 */
  const welcomeSeat = ref<BrotherRole | null>(null)
  const cues = ref<CueView[]>([])
  const message = ref<string | null>(null)

  /** 내 좌석 — 좌석 투영이 오면 그 값이 원본이다 */
  const mySeat = computed<BrotherRole | null>(() => {
    const current = snapshot.value
    if (current !== null && hasSeat(current)) return current.seat
    return welcomeSeat.value
  })

  const isDisplay = computed(() => deviceRole.value === DEVICE_ROLE.DISPLAY)
  const step = computed(() => snapshot.value?.step ?? null)
  const inLobby = computed(() => step.value === GAME_STEP.LOBBY)
  const lobby = computed<LobbyView | null>(() => snapshot.value?.lobby ?? null)

  /** 좌석별 연결 상태는 Display에만 온다 (룰북 §17) */
  const seatConnections = computed(() => {
    const current = snapshot.value
    if (current === null || !hasSeatConnections(current)) return null
    return current.seatConnections
  })

  function reset(code: string, role: DeviceRole): void {
    roomCode.value = code
    deviceRole.value = role
    status.value = 'idle'
    snapshot.value = null
    welcomeSeat.value = null
    cues.value = []
    message.value = null
  }

  function applySnapshot(next: AnySnapshot): void {
    snapshot.value = next
  }

  function pushCues(next: CueView[]): void {
    cues.value = [...cues.value, ...next].slice(-20)
  }

  return {
    roomCode,
    deviceRole,
    status,
    snapshot,
    welcomeSeat,
    mySeat,
    cues,
    message,
    isDisplay,
    step,
    inLobby,
    lobby,
    seatConnections,
    reset,
    applySnapshot,
    pushCues,
  }
})
