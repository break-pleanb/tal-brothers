import { CUE_KIND, SERVER_MESSAGE_TYPE } from 'tal-brothers-shared'

import { sleep } from './harness'
import type { Device } from './harness'

/**
 * 붉은 메시지 포착 (m4-plan 11.4 붉은 메시지 동일성).
 *
 * 붉은 메시지는 3초만 뜬다. Controller마다 짧은 간격으로 지켜보다가 나타나면
 * 정규화한 DOM, 하위 요소 전부의 계산 스타일, 일정 시점의 픽셀, 표시 시간을 남긴다.
 * 진짜·가짜 구분은 화면이 할 수 없으므로 판이 끝난 뒤 `classify`가 한다.
 */

export type RedCapture = {
  seat: string
  appearedAt: number
  /** 나타나서 사라질 때까지(ms). 판이 끝날 때까지 안 사라지면 null */
  durationMs: number | null
  html: string
  styles: string
  /** 나타난 뒤 `SETTLE_MS` 시점의 요소 스크린샷 */
  pixels: Buffer
}

/** 등장 연출이 끝난 뒤 같은 시점을 비교한다 */
const SETTLE_MS = 1_200
const POLL_MS = 60

type Watcher = { stop(): Promise<RedCapture[]> }

async function readOverlay(device: Device): Promise<{ html: string; styles: string } | null> {
  return device.page
    .evaluate(() => {
      const root = document.querySelector('[data-testid="red-message"]')
      if (root === null) return null
      // Vue scoped 속성(data-v-*)은 빌드마다 같지만 비교에 의미가 없어 지운다
      const html = root.outerHTML.replace(/\sdata-v-[0-9a-f]+=""/g, '')
      const props = ['color', 'background-color', 'background-image', 'font-size', 'font-weight', 'opacity', 'transform', 'animation-name', 'animation-duration', 'filter', 'mix-blend-mode']
      const nodes = [root, ...root.querySelectorAll('*')]
      const styles = nodes
        .map((node) => {
          const style = getComputedStyle(node)
          return props.map((prop) => `${prop}:${style.getPropertyValue(prop)}`).join(';')
        })
        .join('\n')
      return { html, styles }
    })
    .catch(() => null)
}

export function watchRedMessages(seat: string, device: Device): Watcher {
  const captures: RedCapture[] = []
  let running = true
  let open: RedCapture | null = null

  const loop = (async () => {
    while (running && !device.page.isClosed()) {
      const reading = await readOverlay(device)
      if (reading !== null && open === null) {
        const appearedAt = Date.now()
        await sleep(SETTLE_MS)
        // 등장 애니메이션이 끝난 뒤의 모습을 비교한다 — 도중에 읽으면 값이 찍는 순간에 따라 달라진다.
        // 덮개는 화면 전체를 덮으므로 페이지 전체를 찍는다. 그 사이 사라졌으면 처음 읽은 값과 빈 픽셀을 남긴다
        const settled = await readOverlay(device)
        const pixels =
          settled !== null
            ? await device.page.screenshot({ timeout: 3_000 }).catch(() => Buffer.alloc(0))
            : Buffer.alloc(0)
        const final = settled ?? reading
        open = { seat, appearedAt, durationMs: null, html: final.html, styles: final.styles, pixels }
        captures.push(open)
      } else if (reading === null && open !== null) {
        open.durationMs = Date.now() - open.appearedAt
        open = null
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

/** 이 좌석이 받은 붉은 메시지 cue 수 — 포착을 하나도 놓치지 않았는지 확인한다 */
export function redCueCount(device: Device): number {
  let count = 0
  for (const frame of device.frames) {
    if (frame.message.t !== SERVER_MESSAGE_TYPE.CUE) continue
    for (const cue of frame.message['cues'] as { kind: string }[]) {
      if (cue.kind === CUE_KIND.RED_MESSAGE) count += 1
    }
  }
  return count
}

/**
 * 진짜·가짜 가르기 (룰북 §4.3, §10.1).
 * 배신자 좌석이 받은 **마지막** 붉은 메시지가 진짜다 — 100%가 되면 가짜 대상에서 빠진다.
 * 그 밖은 모두 가짜다.
 */
export function classify(
  captures: RedCapture[],
  traitorSeats: string[],
): { real: RedCapture[]; fake: RedCapture[] } {
  const real: RedCapture[] = []
  const fake: RedCapture[] = []
  const bySeat = new Map<string, RedCapture[]>()
  for (const capture of captures) bySeat.set(capture.seat, [...(bySeat.get(capture.seat) ?? []), capture])
  for (const [seat, list] of bySeat) {
    if (traitorSeats.includes(seat)) {
      fake.push(...list.slice(0, -1))
      const last = list.at(-1)
      if (last !== undefined) real.push(last)
    } else {
      fake.push(...list)
    }
  }
  return { real, fake }
}
