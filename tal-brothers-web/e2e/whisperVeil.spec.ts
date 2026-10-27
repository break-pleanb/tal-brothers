import fs from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'
import type { BrotherRole } from 'tal-brothers-shared'

import { runGame } from './support/gameRunner'
import { ARTIFACT_ROOT, closeAll } from './support/harness'
import { whisperTextsOf } from './support/hidingChecks'
import { watchWhisperVeils, whisperSentCount } from './support/whisperVeilWatcher'
import type { VeilCapture } from './support/whisperVeilWatcher'

/**
 * 귓속말 덮개는 받은 좌석과 받지 않은 좌석이 문장만 다르다 (룰북 §16, §17, m5-notes 귓속말 연출).
 *
 * 인간 3명 판을 돌려 귓속말이 발송될 때마다 **모든** Controller의 덮개를 잡는다. 받은 좌석과 받지 않은 좌석의
 * 포착이 각각 하나 이상 모일 때까지 시드를 바꾼다. 붉은 메시지 동일성 검사(`redMessage.spec`)와 같은 방식으로
 * DOM·계산 스타일·표시 시간을 비교하고, 덮개와 문장 상자의 크기까지 같아야 한다.
 *
 * - 받은 좌석의 문장은 그 좌석이 실제로 받은 귓속말이어야 한다
 * - 받지 않은 좌석의 문장은 정해진 한 문장뿐이다
 * - 좌석마다 덮개 수가 같다 — 받지 않은 좌석도 빠짐없이 덮개를 본다. 가속 판에서는 끝 무렵 덮개가 대기열에 밀린 채
 *   엔딩에 닿으므로 발송 알림 수와는 "넘지 않는다"만 본다
 */

const MAX_GAMES = 4
const UNHEARD_TEXT = '무언가 속삭였지만 알아들을 수 없다'
/** 표시 시간은 실제 시간으로 `whisperVeilMs`(4.5초)다. 폴링 간격만큼의 오차를 허용한다 */
const DURATION_TOLERANCE_MS = 400

test('귓속말 덮개는 받은 좌석과 받지 않은 좌석이 문장만 다르다', async ({ browser }) => {
  test.setTimeout(30 * 60_000)
  const heard: VeilCapture[] = []
  const unheard: VeilCapture[] = []
  const problems: string[] = []

  for (let attempt = 0; attempt < MAX_GAMES && (heard.length === 0 || unheard.length === 0); attempt += 1) {
    const watchers = new Map<BrotherRole, ReturnType<typeof watchWhisperVeils>>()
    const result = await runGame(browser, {
      label: `whisperVeil-${attempt}`,
      humans: 3,
      seed: 1700 + attempt,
      // 잠식도를 빨리 올려 티어 환청이 나오게 한다 (룰북 §4.3, §16)
      policies: ['risky', 'hoard', 'useAll'],
      screenshots: 'none',
      onCheckpoint: async (_checkpoint, game) => {
        if (watchers.size > 0) return
        for (const [seat, device] of game.controllers) watchers.set(seat, watchWhisperVeils(seat, device))
      },
    })
    try {
      const sent = whisperSentCount(result.game.display)
      const counts = new Map<BrotherRole, number>()
      for (const [seat, watcher] of watchers) {
        const list = await watcher.stop()
        const device = result.game.controllers.get(seat)
        if (device === undefined) continue
        counts.set(seat, list.length)
        if (list.length > sent) problems.push(`${attempt}판 ${seat}: 덮개 ${list.length}장이 발송 알림 ${sent}건보다 많다`)
        const own = whisperTextsOf(device)
        for (const capture of list) {
          if (capture.text === UNHEARD_TEXT) {
            unheard.push(capture)
          } else if (own.includes(capture.text)) {
            heard.push(capture)
          } else {
            problems.push(`${attempt}판 ${seat}: 받지 않은 문장이 덮개에 있다 "${capture.text}"`)
          }
        }
      }
      // 받지 않은 좌석도 발송마다 덮개를 봐야 한다 — 좌석끼리 덮개 수가 같다
      if (new Set(counts.values()).size > 1) {
        problems.push(`${attempt}판 좌석별 덮개 수가 다르다: ${[...counts].map(([seat, count]) => `${seat} ${count}`).join(', ')}`)
      }
    } finally {
      await closeAll(result.game.devices)
    }
  }

  const dir = path.join(ARTIFACT_ROOT, 'whisperVeil')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'captures.json'),
    JSON.stringify({ heard, unheard }, null, 2),
  )

  expect(problems).toEqual([])
  expect(heard.length, '받은 좌석의 덮개를 잡지 못했다').toBeGreaterThan(0)
  expect(unheard.length, '받지 않은 좌석의 덮개를 잡지 못했다').toBeGreaterThan(0)

  const reference = heard[0] as VeilCapture
  for (const capture of [...heard, ...unheard]) {
    expect(capture.html, `${capture.seat} "${capture.text}"의 DOM이 다르다`).toBe(reference.html)
    expect(capture.styles, `${capture.seat} "${capture.text}"의 스타일이 다르다`).toBe(reference.styles)
    expect(capture.boxes, `${capture.seat} "${capture.text}"의 상자 크기가 다르다`).toBe(reference.boxes)
    if (capture.durationMs !== null && reference.durationMs !== null) {
      expect(Math.abs(capture.durationMs - reference.durationMs)).toBeLessThanOrEqual(DURATION_TOLERANCE_MS)
    }
  }
})
