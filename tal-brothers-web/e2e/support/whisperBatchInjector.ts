import { SERVER_MESSAGE_TYPE } from 'tal-brothers-shared'

import type { Device } from './harness'

/**
 * 한 묶음에 귓속말 두 건 만들기 (m5-notes 귓속말 연출).
 *
 * 한 좌석이 한 스냅샷에서 두 건을 받는 경우(Phase 2 진입 경고 + 티어 환청, 사당 실패 + 티어 환청)는 판의 흐름에 달려 있어
 * 시드만으로 고정할 수 없다. 덮개 크기가 줄 수에 흔들리지 않는지 매번 확인하려고, 이 기기가 **처음 귓속말을 받는 스냅샷**에
 * 문장 하나를 덧붙여 화면으로 넘긴다. 서버와 다른 기기는 건드리지 않는다.
 *
 * - 덧붙인 문장은 이후 스냅샷에도 같은 자리에 계속 넣는다. 빠지면 화면이 받은 귓속말이 줄어든 것으로 본다
 * - 문장은 가장 긴 실제 귓속말(진입 경고, 약 45자)과 같은 길이다. 실제 문장과 겹치지 않게 끝 한 글자를 바꿨다 —
 *   다른 좌석의 문장이 보이는지 보는 은닉 검사가 헷갈리지 않게 한다
 * - 덮개는 발송 알림이 늘어난 스냅샷마다 한 장이라 알림 수는 손대지 않는다
 */

export const INJECTED_WHISPER_TEXT = '품속의 부적이 뜨겁게 달아오른다 — "너희들 중 누군가는 이미 껍데기만 남았다."'

type Whisper = { kind: string; text: string }

export async function injectSecondWhisper(device: Device): Promise<void> {
  /** 덧붙인 자리(서버 `whispers` 기준 위치). 아직 덧붙이지 않았으면 null */
  let insertAt: number | null = null
  let seen = 0

  function transform(raw: string): string {
    let message: { t?: string; snapshot?: { whispers?: Whisper[] } }
    try {
      message = JSON.parse(raw) as typeof message
    } catch {
      return raw
    }
    const whispers = message.snapshot?.whispers
    if (message.t !== SERVER_MESSAGE_TYPE.SNAPSHOT || whispers === undefined) return raw

    const serverCount = whispers.length
    // 처음 귓속말을 받은 스냅샷 — 서버가 준 문장들 바로 뒤에 덧붙인다
    if (insertAt === null && serverCount > seen) insertAt = serverCount
    seen = serverCount
    if (insertAt === null || serverCount < insertAt) return raw

    const kind = whispers[insertAt - 1]?.kind ?? ''
    whispers.splice(insertAt, 0, { kind, text: INJECTED_WHISPER_TEXT })
    return JSON.stringify(message)
  }

  // 테스트 서버의 ws 경로 (`:3100/ws`)
  await device.context.routeWebSocket(/:3100\/ws/, (ws) => {
    const server = ws.connectToServer()
    ws.onMessage((message) => server.send(message))
    server.onMessage((message) => ws.send(typeof message === 'string' ? transform(message) : message))
  })
}
