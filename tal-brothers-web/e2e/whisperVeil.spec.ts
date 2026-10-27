import fs from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'
import type { BrotherRole } from 'tal-brothers-shared'

import { runGame } from './support/gameRunner'
import { ARTIFACT_ROOT, closeAll } from './support/harness'
import { whisperTextsOf } from './support/hidingChecks'
import { INJECTED_WHISPER_TEXT, injectSecondWhisper } from './support/whisperBatchInjector'
import { watchWhisperVeils, whisperBatchCount } from './support/whisperVeilWatcher'
import type { VeilCapture } from './support/whisperVeilWatcher'

/**
 * 귓속말 덮개는 받은 좌석과 받지 않은 좌석이 문장만 다르다 (룰북 §16, §17, m5-notes 귓속말 연출).
 *
 * 인간 3명 판을 돌려 귓속말이 발송될 때마다 **모든** Controller의 덮개를 잡는다. 붉은 메시지 동일성 검사
 * (`redMessage.spec`)와 같은 방식으로 DOM·계산 스타일·표시 시간을 비교하고, 덮개와 문장 상자의 크기까지 같아야 한다.
 * 다음 세 가지가 모두 모일 때까지 시드를 바꾼다.
 *
 * - 받은 좌석의 덮개 — 문장은 그 좌석이 실제로 받은 귓속말이어야 한다
 * - 받지 않은 좌석의 덮개 — 정해진 한 문장뿐이다
 * - **한 좌석이 같은 묶음에서 두 건 이상 받은 덮개** — 문장이 여러 줄이어도 크기가 같고 상자를 넘치지 않는다.
 *   이 경우는 판의 흐름에 달려 시드로 고정할 수 없어(6판을 돌려 한 번도 나오지 않은 적이 있다), **첫 판은 각 Controller가
 *   처음 귓속말을 받는 스냅샷에 가장 긴 실제 문장 길이의 문장을 하나 덧붙여** 반드시 만든다 (`whisperBatchInjector`).
 *   서버는 건드리지 않는다. 둘째 판부터는 덧붙이지 않고 실제 흐름만 본다
 *
 * 한 스냅샷에서 발송된 귓속말은 몇 건이든 덮개 한 장이다. 좌석마다 덮개 수가 같고 발송 묶음 수와 같아야 한다 —
 * 받지 않은 좌석도 빠짐없이 덮개를 본다.
 */

const MAX_GAMES = 6
const UNHEARD_TEXT = '무언가 속삭였지만 알아들을 수 없다'
/** 표시 시간은 실제 시간으로 `whisperVeilMs`(4.5초)다. 폴링 간격만큼의 오차를 허용한다 */
const DURATION_TOLERANCE_MS = 400

test('귓속말 덮개는 받은 좌석과 받지 않은 좌석이 문장만 다르다', async ({ browser }) => {
  test.setTimeout(40 * 60_000)
  const heard: VeilCapture[] = []
  const unheard: VeilCapture[] = []
  const problems: string[] = []

  const multiple = (): VeilCapture[] => heard.filter((capture) => capture.lines.length >= 2)
  const done = (): boolean => heard.length > 0 && unheard.length > 0 && multiple().length > 0

  for (let attempt = 0; attempt < MAX_GAMES && !done(); attempt += 1) {
    const watchers = new Map<BrotherRole, ReturnType<typeof watchWhisperVeils>>()
    const result = await runGame(browser, {
      label: `whisperVeil-${attempt}`,
      humans: 3,
      seed: 1700 + attempt,
      // 잠식도를 빨리 올려 티어 환청이 나오게 한다 (룰북 §4.3, §16)
      policies: ['risky', 'hoard', 'useAll'],
      screenshots: 'none',
      ...(attempt === 0 ? { prepareController: (_seat: BrotherRole, device: Parameters<typeof injectSecondWhisper>[0]) => injectSecondWhisper(device) } : {}),
      onCheckpoint: async (_checkpoint, game) => {
        if (watchers.size > 0) return
        for (const [seat, device] of game.controllers) watchers.set(seat, watchWhisperVeils(seat, device))
      },
    })
    try {
      const batches = whisperBatchCount(result.game.display)
      for (const [seat, watcher] of watchers) {
        const list = await watcher.stop()
        const device = result.game.controllers.get(seat)
        if (device === undefined) continue
        // 받지 않은 좌석도 발송 묶음마다 덮개 한 장을 봐야 한다
        if (list.length !== batches) problems.push(`${attempt}판 ${seat}: 덮개 ${list.length}장 / 발송 묶음 ${batches}건`)
        // 덧붙인 문장은 화면만 받으므로 그 좌석이 받은 문장으로 친다
        const own = [...whisperTextsOf(device), ...(attempt === 0 ? [INJECTED_WHISPER_TEXT] : [])]
        for (const capture of list) {
          if (capture.overflow) problems.push(`${attempt}판 ${seat}: 문장이 상자를 넘쳤다 ${JSON.stringify(capture.lines)}`)
          if (capture.lines.length === 1 && capture.lines[0] === UNHEARD_TEXT) {
            unheard.push(capture)
          } else if (capture.lines.length > 0 && capture.lines.every((line) => own.includes(line))) {
            heard.push(capture)
          } else {
            problems.push(`${attempt}판 ${seat}: 받지 않은 문장이 덮개에 있다 ${JSON.stringify(capture.lines)}`)
          }
        }
      }
    } finally {
      await closeAll(result.game.devices)
    }
  }

  const dir = path.join(ARTIFACT_ROOT, 'whisperVeil')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'captures.json'), JSON.stringify({ heard, unheard }, null, 2))

  expect(problems).toEqual([])
  expect(heard.length, '받은 좌석의 덮개를 잡지 못했다').toBeGreaterThan(0)
  expect(unheard.length, '받지 않은 좌석의 덮개를 잡지 못했다').toBeGreaterThan(0)
  expect(multiple().length, '한 묶음에서 두 건 이상 받은 덮개를 잡지 못했다').toBeGreaterThan(0)

  const reference = heard[0] as VeilCapture
  for (const capture of [...heard, ...unheard]) {
    const label = `${capture.seat} ${JSON.stringify(capture.lines)}`
    expect(capture.html, `${label}의 DOM이 다르다`).toBe(reference.html)
    expect(capture.styles, `${label}의 스타일이 다르다`).toBe(reference.styles)
    expect(capture.boxes, `${label}의 상자 크기가 다르다`).toBe(reference.boxes)
    if (capture.durationMs !== null && reference.durationMs !== null) {
      expect(Math.abs(capture.durationMs - reference.durationMs)).toBeLessThanOrEqual(DURATION_TOLERANCE_MS)
    }
  }
})
