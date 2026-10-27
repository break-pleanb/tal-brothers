import { PUBLIC_NOTICE_KIND, SERVER_MESSAGE_TYPE } from 'tal-brothers-shared'

import { sleep } from './harness'
import type { Device } from './harness'

/**
 * 귓속말 덮개 포착 (m5-notes 귓속말 연출).
 *
 * 붉은 메시지 포착(`redMessageWatcher`)과 같은 방식이다. Controller마다 짧은 간격으로 지켜보다가 덮개가
 * 나타나면 정규화한 DOM, 하위 요소의 계산 스타일, 덮개·문장 상자의 크기, 표시 시간을 남긴다.
 *
 * - 덮개는 연달아 뜰 수 있다(한 상태 전이에 귓속말 여러 건). 요소에 표시를 붙여 새 덮개인지 가른다
 * - **문장은 비교에서 뺀다.** 문장 요소 안(글자 span 묶음)을 자리표시로 바꾼다. 글자마다의 지연은
 *   문장 길이에서 나오는 값이라 문장의 일부로 본다. 첫 글자 span의 스타일만 비교에 넣는다(지연 0)
 */

export type VeilCapture = {
  seat: string
  appearedAt: number
  /** 나타나서 사라지거나 다음 덮개로 바뀔 때까지(ms). 판이 끝날 때까지 안 사라지면 null */
  durationMs: number | null
  text: string
  html: string
  styles: string
  /** 덮개 바깥 상자와 문장 상자의 크기 */
  boxes: string
}

/** 글자가 모두 나타난 뒤(`whisperRevealMs` 1.6초 + 글자 등장 0.42초) 같은 시점을 비교한다 */
const SETTLE_MS = 2_100
const POLL_MS = 60

type Reading = { fresh: boolean; text: string; html: string; styles: string; boxes: string }

async function readVeil(device: Device): Promise<Reading | null> {
  return device.page
    .evaluate(() => {
      const root = document.querySelector('[data-testid="whisper-veil"]') as (HTMLElement & { __veilSeen?: boolean }) | null
      if (root === null) return null
      const fresh = root.__veilSeen !== true
      root.__veilSeen = true

      const textEl = root.querySelector('.whisper-veil__text')
      const box = root.querySelector('.whisper-veil__box')
      const html = root.outerHTML
        .replace(/\sdata-v-[0-9a-f]+=""/g, '')
        .replace(/(<p class="whisper-veil__text">)[\s\S]*?(<\/p>)/, '$1#TEXT#$2')

      const props = ['color', 'background-color', 'background-image', 'font-size', 'font-weight', 'line-height', 'opacity', 'transform', 'animation-name', 'animation-duration', 'animation-delay', 'filter', 'mix-blend-mode', 'pointer-events', 'width', 'height']
      const firstChar = root.querySelector('.whisper-veil__char')
      const nodes = [...root.querySelectorAll('*')].filter((node) => !node.classList.contains('whisper-veil__char'))
      const styles = [root, ...nodes, ...(firstChar === null ? [] : [firstChar])]
        .map((node) => {
          const style = getComputedStyle(node)
          return props.map((prop) => `${prop}:${style.getPropertyValue(prop)}`).join(';')
        })
        .join('\n')

      const sizeOf = (element: Element | null): string => {
        if (element === null) return 'none'
        const rect = element.getBoundingClientRect()
        return `${rect.x.toFixed(1)},${rect.y.toFixed(1)},${rect.width.toFixed(1)}x${rect.height.toFixed(1)}`
      }
      const boxes = `veil ${sizeOf(root)} | box ${sizeOf(box)}`

      return { fresh, text: (textEl?.textContent ?? '').trim(), html, styles, boxes }
    })
    .catch(() => null)
}

type Watcher = { stop(): Promise<VeilCapture[]> }

export function watchWhisperVeils(seat: string, device: Device): Watcher {
  const captures: VeilCapture[] = []
  let running = true
  let open: VeilCapture | null = null

  const loop = (async () => {
    while (running && !device.page.isClosed()) {
      const reading = await readVeil(device)
      const now = Date.now()
      if (open !== null && (reading === null || reading.fresh)) {
        open.durationMs = now - open.appearedAt
        open = null
      }
      if (reading !== null && reading.fresh) {
        open = { seat, appearedAt: now, durationMs: null, text: reading.text, html: '', styles: '', boxes: '' }
        captures.push(open)
        const opened = open
        // 글자가 다 나타난 뒤의 모습을 비교한다. 그 사이 다음 덮개로 바뀌면 처음 읽은 값을 남긴다
        await sleep(SETTLE_MS)
        const settled = await readVeil(device)
        const final = settled !== null && !settled.fresh ? settled : reading
        opened.html = final.html
        opened.styles = final.styles
        opened.boxes = final.boxes
        if (settled === null || settled.fresh) {
          opened.durationMs = Date.now() - opened.appearedAt
          open = null
        }
      }
      await sleep(POLL_MS)
    }
  })()

  return {
    async stop() {
      running = false
      await loop
      return captures
    },
  }
}

/** 판 전체의 귓속말 발송 알림 수 — 마지막 스냅샷 기준. 좌석마다 덮개가 이만큼 떠야 한다 */
export function whisperSentCount(device: Device): number {
  let count = 0
  for (const frame of device.frames) {
    if (frame.message.t !== SERVER_MESSAGE_TYPE.SNAPSHOT) continue
    const snapshot = frame.message['snapshot'] as { notices?: { kind: string }[] }
    count = (snapshot.notices ?? []).filter((notice) => notice.kind === PUBLIC_NOTICE_KIND.WHISPER_SENT).length
  }
  return count
}
