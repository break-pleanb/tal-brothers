import { expect, test } from '@playwright/test'

import { runGame } from './support/gameRunner'
import { closeAll } from './support/harness'
import type { Device } from './support/harness'

/**
 * 에셋과 프리로드 (m5-plan M5-1·M5-2).
 *
 * - Display는 로비에서 에셋 11종(룰북 §18)을 모두 받아 실제로 그릴 수 있다 (`naturalWidth > 0`)
 * - **게임이 시작된 뒤 처음 받는 이미지가 없다.** 로비에서 받은 것만 다시 쓴다
 *
 * 로비 → 게임 화면은 같은 문서 안의 라우트 이동이라 Resource Timing 항목이 이어진다.
 * 시작 시점의 목록과 끝난 시점의 목록을 비교한다.
 */

type ImageLog = { mark: number; before: string[] }

const IMAGE = /\.(jpe?g|png|webp)(\?|$)/

async function imageEntries(device: Device): Promise<{ name: string; startTime: number }[]> {
  return device.page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => ({ name: entry.name, startTime: entry.startTime })),
  )
}

test('에셋 11종을 로비에서 받고, 게임 중에는 새 이미지를 받지 않는다', async ({ browser }) => {
  test.setTimeout(8 * 60_000)
  const logs = new Map<string, ImageLog>()

  const result = await runGame(browser, {
    label: 'assets',
    humans: 2,
    seed: 1201,
    policies: ['risky'],
    screenshots: 'display',
    onCheckpoint: async (checkpoint, game) => {
      if (checkpoint.index !== 0) return
      for (const device of game.devices) {
        const entries = await imageEntries(device)
        const mark = await device.page.evaluate(() => performance.now())
        logs.set(device.label, { mark, before: entries.filter((entry) => IMAGE.test(entry.name)).map((entry) => entry.name) })
      }
    },
  })

  try {
    expect(result.reachedEnding).toBe(true)

    // Display는 시작 전에 11종을 모두 받았다
    const displayLog = logs.get('display')
    const jpgs = new Set((displayLog?.before ?? []).filter((name) => /\.jpe?g/.test(name)))
    expect(jpgs.size, [...jpgs].join('\n')).toBeGreaterThanOrEqual(11)

    // 받은 그림이 실제로 디코드된다
    const broken = await result.game.display.page.evaluate(async (urls) => {
      const bad: string[] = []
      for (const url of urls) {
        const image = new Image()
        image.src = url
        try {
          await image.decode()
          if (image.naturalWidth === 0) bad.push(url)
        } catch {
          bad.push(url)
        }
      }
      return bad
    }, [...jpgs])
    expect(broken).toEqual([])

    // 시작 뒤 처음 받은 이미지가 없다
    const lateLoads: string[] = []
    for (const device of result.game.devices) {
      const log = logs.get(device.label)
      if (log === undefined) continue
      const known = new Set(log.before)
      for (const entry of await imageEntries(device)) {
        if (entry.startTime > log.mark && IMAGE.test(entry.name) && !known.has(entry.name)) {
          lateLoads.push(`${device.label}: ${entry.name}`)
        }
      }
    }
    expect(lateLoads).toEqual([])
    expect(result.violations, result.violations.map((v) => v.detail).join('\n')).toEqual([])
  } finally {
    await closeAll(result.game.devices)
  }
})
