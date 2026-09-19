import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { DEVICE_ROLE, GAME_STEP } from 'tal-brothers-shared'
import type {
  BrotherRole,
  Command,
  CueView,
  DeviceRole,
  DisplaySnapshot,
  LobbyView,
  PublicSnapshot,
  SeatPrivateView,
  SeatSnapshot,
  SnapshotMessage,
} from 'tal-brothers-shared'

import { CUE_CHANNEL } from '@/constants/cueChannel'
import type { CueChannel } from '@/constants/cueChannel'
import { REJECTION_LABEL } from '@/constants/rejectionLabel'
import { createRoomSocket } from '@/services/roomSocket'
import type { RoomSocket, SocketStatus } from '@/services/roomSocket'

/**
 * 방 세션 스토어 (아키텍처 §9.1, §9.3, M4 계획 4절).
 *
 * - **받은 스냅샷을 그대로 그린다.** 공개/비공개로 스토어를 나누지 않는다.
 *   서버가 대상별로 투영해 보내므로, 여기 없는 값은 이 기기가 알 수 없는 값이다
 * - **소켓 수명은 라우트가 아니라 방에 묶는다** (M4 계획 4.1).
 *   로비 → 게임 화면 이동에서 끊겼다 붙으면 서버가 자동 일시정지 조건으로 볼 수 있다 (아키텍처 §8)
 * - 화면에서 하는 유일한 계산은 마감 시각 → 남은 시간이다. 그 밖의 룰 계산은 없다 (아키텍처 §9.3)
 */

export type AnySnapshot = DisplaySnapshot | SeatSnapshot | PublicSnapshot

/** 큐에 들어간 cue 1건. 어느 자리에 연출할지와 언제 온 것인지를 함께 들고 있다 */
export type QueuedCue = {
  /** 소비·폐기를 가리키는 일련번호 */
  id: number
  channel: CueChannel
  cue: CueView
  /** 이 cue가 실려 온 상태 버전. 폐기 판단의 근거다 (M4 계획 4.3) */
  stateVersion: number
}

/** 현재 스냅샷보다 이만큼 오래된 cue는 버린다 (M4 계획 9절 8번) */
const CUE_STALE_VERSIONS = 2

/**
 * 연결 감시 (M4 실기 2차).
 *
 * 단계 마감이 지나면 서버는 **반드시** 다음 스냅샷을 보낸다. 그런데도 오지 않으면
 * 소켓이 죽었는데 양쪽 다 모르는 상태다 — 실기에서 Display가 조용히 멈춘 증상이 그것이다.
 */
const STALE_GRACE_MS = 5_000
/** 감시 주기 */
const WATCHDOG_TICK_MS = 1_000
/** 소켓을 다시 여는 간격. 한 번 열어 보고도 조용하면 다시 연다 */
const REOPEN_INTERVAL_MS = 5_000

function hasSeatConnections(snapshot: AnySnapshot): snapshot is DisplaySnapshot {
  return 'seatConnections' in snapshot
}

function hasSeat(snapshot: AnySnapshot): snapshot is SeatSnapshot {
  return 'seat' in snapshot
}

export const usePlayStore = defineStore('play', () => {
  const roomCode = ref<string | null>(null)
  const deviceRole = ref<DeviceRole | null>(null)
  const status = ref<SocketStatus>('idle')
  const snapshot = ref<AnySnapshot | null>(null)
  /** welcome이 알려 준 좌석. 이후에는 스냅샷이 더 최신이다 */
  const welcomeSeat = ref<BrotherRole | null>(null)
  const cueQueue = ref<QueuedCue[]>([])
  const message = ref<string | null>(null)
  /**
   * 서버 시각 − 이 기기 시각 (M4 계획 4.4).
   * 마감 시각이 모두 서버 기준이라 이 값으로 보정한다. 전송 지연만큼 실제보다 작게 잡히지만,
   * 같은 Wi-Fi에서 수십 ms라 1초 단위 표시에는 영향이 없다
   */
  const clockOffsetMs = ref(0)
  /** 단계 마감이 지났는데도 새 스냅샷이 오지 않는 상태 (M4 실기 2차) */
  const stale = ref(false)

  let socket: RoomSocket | null = null
  let nextCueId = 1
  let watchdog: ReturnType<typeof setInterval> | null = null
  let lastReopenAt = 0

  // ── 파생 ───────────────────────────────────────────────────────────

  /** 내 좌석 — 좌석 투영이 오면 그 값이 원본이다 */
  const mySeat = computed<BrotherRole | null>(() => {
    const current = snapshot.value
    if (current !== null && hasSeat(current)) return current.seat
    return welcomeSeat.value
  })

  /** 본인 좌석 정보. 좌석이 없는 기기(Display, 좌석 미선택)는 null이다 (룰북 §17) */
  const privateView = computed<SeatPrivateView | null>(() => {
    const current = snapshot.value
    return current !== null && hasSeat(current) ? current : null
  })

  const isDisplay = computed(() => deviceRole.value === DEVICE_ROLE.DISPLAY)
  const stateVersion = computed(() => snapshot.value?.stateVersion ?? 0)
  const step = computed(() => snapshot.value?.step ?? null)
  const phase = computed(() => snapshot.value?.phase ?? null)
  const inLobby = computed(() => step.value === GAME_STEP.LOBBY)
  const isPaused = computed(() => step.value === GAME_STEP.PAUSED)
  const lobby = computed<LobbyView | null>(() => snapshot.value?.lobby ?? null)
  const stepDeadlineAt = computed<number | null>(() => snapshot.value?.stepDeadlineAt ?? null)
  const clockDeadlineAt = computed<number | null>(() => snapshot.value?.clockDeadlineAt ?? null)

  /** 좌석별 연결 상태는 Display에만 온다 (룰북 §17) */
  const seatConnections = computed(() => {
    const current = snapshot.value
    if (current === null || !hasSeatConnections(current)) return null
    return current.seatConnections
  })

  /** 좌석 표시 이름. 이름이 없는 좌석은 형제 이름으로 부른다 (룰북 §17) */
  const seatNames = computed(() => snapshot.value?.seatNames ?? [])

  // ── 스냅샷과 cue ───────────────────────────────────────────────────

  function applySnapshot(received: SnapshotMessage): void {
    // 늦게 도착한 옛 스냅샷이 화면을 과거로 되돌리지 않게 한다.
    // 재동기화 응답과 밀린 스냅샷이 섞이면 순서가 뒤집힐 수 있다
    const current = snapshot.value
    if (current !== null && received.stateVersion <= current.stateVersion) return

    clockOffsetMs.value = received.serverNow - Date.now()
    snapshot.value = received.snapshot
    stale.value = false
    pruneCues()
  }

  /**
   * 단계 마감이 지났는데 새 스냅샷이 없으면 소켓을 다시 연다 (M4 실기 2차).
   *
   * 마감이 없는 단계(로비·일시정지·엔딩)에서는 아무것도 하지 않는다.
   * 서버가 보내지 않는 것이 정상인 시간에 괜히 소켓을 흔들면 안 된다.
   */
  function checkStale(): void {
    const current = snapshot.value
    if (socket === null || current === null || current.stepDeadlineAt === null) {
      stale.value = false
      return
    }

    const serverNow = Date.now() + clockOffsetMs.value
    if (serverNow - current.stepDeadlineAt < STALE_GRACE_MS) {
      stale.value = false
      return
    }

    stale.value = true
    if (Date.now() - lastReopenAt < REOPEN_INTERVAL_MS) return
    lastReopenAt = Date.now()
    socket.reopen()
  }

  /**
   * 밀린 cue를 버린다 (M4 계획 4.3, 9절 8번).
   * 탭이 백그라운드였다 돌아오면 지난 cue가 쌓여 있다. 오래된 것은 연출하지 않는다.
   */
  function pruneCues(): void {
    const fresh = cueQueue.value.filter(
      (queued) => stateVersion.value - queued.stateVersion < CUE_STALE_VERSIONS,
    )

    // 덮개는 최신 1건만 연출한다. 겹쳐 띄우면 앞의 것을 읽을 수 없다
    const lastOverlay = fresh.map((queued) => queued.channel).lastIndexOf('overlay')
    cueQueue.value = fresh.filter(
      (queued, index) => queued.channel !== 'overlay' || index === lastOverlay,
    )
  }

  function pushCues(cues: CueView[], version: number): void {
    for (const cue of cues) {
      cueQueue.value.push({
        id: nextCueId,
        channel: CUE_CHANNEL[cue.kind],
        cue,
        stateVersion: version,
      })
      nextCueId += 1
    }
    pruneCues()
  }

  /** 이 자리에서 다음에 연출할 cue. 없으면 null */
  function nextCue(channel: CueChannel): QueuedCue | null {
    return cueQueue.value.find((queued) => queued.channel === channel) ?? null
  }

  /** 연출이 끝난 cue를 큐에서 뺀다 */
  function consumeCue(id: number): void {
    cueQueue.value = cueQueue.value.filter((queued) => queued.id !== id)
  }

  // ── 소켓 수명 ──────────────────────────────────────────────────────

  function reset(code: string, role: DeviceRole): void {
    roomCode.value = code
    deviceRole.value = role
    status.value = 'idle'
    snapshot.value = null
    welcomeSeat.value = null
    cueQueue.value = []
    message.value = null
    clockOffsetMs.value = 0
    stale.value = false
    lastReopenAt = 0
  }

  /**
   * 방에 붙는다. **같은 방·같은 역할이면 이미 열린 연결을 그대로 쓴다.**
   * 로비에서 게임 화면으로 옮겨 갈 때 소켓이 끊기지 않아야 한다 (M4 계획 4.1).
   */
  function connect(code: string, role: DeviceRole): void {
    if (socket !== null && roomCode.value === code && deviceRole.value === role) return

    disconnect()
    reset(code, role)

    socket = createRoomSocket({
      roomCode: code,
      deviceRole: role,
      handlers: {
        onStatus(next) {
          status.value = next
        },
        onWelcome(received) {
          welcomeSeat.value = received.seat
          message.value = null
        },
        onSnapshot(received) {
          applySnapshot(received)
        },
        onCue(cues, version) {
          pushCues(cues, version)
        },
        onRejected(received) {
          message.value = REJECTION_LABEL[received.reason]
        },
        onError(_code, text) {
          message.value = text
        },
      },
    })
    socket.connect()

    if (watchdog === null) watchdog = setInterval(checkStale, WATCHDOG_TICK_MS)
  }

  /** 방을 떠난다. 라우트 이동이 아니라 **방을 벗어날 때만** 부른다 */
  function disconnect(): void {
    if (watchdog !== null) clearInterval(watchdog)
    watchdog = null
    socket?.close()
    socket = null
    stale.value = false
    roomCode.value = null
    deviceRole.value = null
    status.value = 'idle'
    snapshot.value = null
    welcomeSeat.value = null
    cueQueue.value = []
    message.value = null
  }

  /** 명령을 보낸다. 상태를 고쳐 보내지 않는다 (아키텍처 §7) */
  function send(command: Command): void {
    socket?.send(command)
  }

  return {
    roomCode,
    deviceRole,
    status,
    snapshot,
    welcomeSeat,
    cueQueue,
    message,
    clockOffsetMs,
    stale,

    mySeat,
    privateView,
    isDisplay,
    stateVersion,
    step,
    phase,
    inLobby,
    isPaused,
    lobby,
    stepDeadlineAt,
    clockDeadlineAt,
    seatConnections,
    seatNames,

    nextCue,
    consumeCue,
    connect,
    disconnect,
    send,
  }
})
