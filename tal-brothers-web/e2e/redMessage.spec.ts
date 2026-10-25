import fs from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'
import type { BrotherRole } from 'tal-brothers-shared'

import { runGame } from './support/gameRunner'
import { ARTIFACT_ROOT, closeAll } from './support/harness'
import { classify, redCueCount, watchRedMessages } from './support/redMessageWatcher'
import type { RedCapture } from './support/redMessageWatcher'

/**
 * 진짜·가짜 붉은 메시지는 완전히 같은 모양이다 (룰북 §10.1, §17, m4-plan 6.4·11.4, 8절 9·10번).
 *
 * 잠식도를 빨리 올리는 정책(`risky`)으로 인간 2~3명 판을 돌려, 진짜와 가짜를 각각 하나 이상 잡을 때까지
 * 시드를 바꾼다(최대 15판). 잡은 것끼리 DOM·계산 스타일·픽셀·표시 시간이 모두 같아야 한다.
 */

const MAX_GAMES = 15
/** 표시 시간은 실제 시간으로 3초다(룰북 §19). 폴링 간격만큼의 오차를 허용한다 */
const DURATION_TOLERANCE_MS = 400

test('진짜와 가짜 붉은 메시지가 구분되지 않는다', async ({ browser }) => {
  test.setTimeout(45 * 60_000)
  const real: RedCapture[] = []
  const fake: RedCapture[] = []

  for (let attempt = 0; attempt < MAX_GAMES && (real.length === 0 || fake.length === 0); attempt += 1) {
    const watchers = new Map<BrotherRole, ReturnType<typeof watchRedMessages>>()
    const result = await runGame(browser, {
      label: `redMessage-${attempt}`,
      humans: attempt % 2 === 0 ? 3 : 2,
      seed: 900 + attempt,
      policies: ['risky'],
      screenshots: 'none',
      onCheckpoint: async (_checkpoint, game) => {
        if (watchers.size > 0) return
        for (const [seat, device] of game.controllers) watchers.set(seat, watchRedMessages(seat, device))
      },
    })
    try {
      const captures: RedCapture[] = []
      for (const [seat, watcher] of watchers) {
        const list = await watcher.stop()
        const device = result.game.controllers.get(seat)
        // 하나라도 놓쳤으면 진짜·가짜를 가를 수 없다. 그 좌석은 비교에서 뺀다
        if (device !== undefined && redCueCount(device) === list.length) captures.push(...list)
      }
      const split = classify(captures, result.coverage.traitorSeats)
      real.push(...split.real)
      fake.push(...split.fake)
    } finally {
      await closeAll(result.game.devices)
    }
  }

  const dir = path.join(ARTIFACT_ROOT, 'redMessage')
  fs.mkdirSync(dir, { recursive: true })
  for (const [index, capture] of [...real.map((c) => ['real', c] as const), ...fake.map((c) => ['fake', c] as const)].entries()) {
    fs.writeFileSync(path.join(dir, `${index}_${capture[0]}_${capture[1].seat}.png`), capture[1].pixels)
  }

  expect(real.length, '진짜 붉은 메시지를 잡지 못했다').toBeGreaterThan(0)
  expect(fake.length, '가짜 붉은 메시지를 잡지 못했다').toBeGreaterThan(0)

  const reference = real[0] as RedCapture
  for (const capture of [...real, ...fake]) {
    expect(capture.html).toBe(reference.html)
    expect(capture.styles).toBe(reference.styles)
    expect(capture.pixels.equals(reference.pixels), `${capture.seat}의 픽셀이 다르다`).toBe(true)
    if (capture.durationMs !== null && reference.durationMs !== null) {
      expect(Math.abs(capture.durationMs - reference.durationMs)).toBeLessThanOrEqual(DURATION_TOLERANCE_MS)
    }
  }
})
