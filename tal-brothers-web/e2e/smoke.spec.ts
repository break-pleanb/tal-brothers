import path from 'node:path'

import { expect, test } from '@playwright/test'
import { GAME_STEP } from 'tal-brothers-shared'

import { artifactDir, closeAll } from './support/harness'
import { startGame } from './support/lobbyFlow'

/**
 * 장치가 살아 있는지 보는 가장 짧은 확인 (m4-plan 11.3 M4-A).
 * 로비에서 시작하면 Display와 Controller가 첫 이벤트의 상황 제시(`EVENT_INTRO`)로 넘어간다.
 */

test('로비에서 시작하면 첫 이벤트가 Display와 Controller에 뜬다', async ({ browser }) => {
  const dir = artifactDir('smoke')
  const game = await startGame(browser, { humans: 2 })

  try {
    const displayRoot = game.display.page.locator('[data-step]').first()
    await expect(displayRoot).toHaveAttribute('data-step', GAME_STEP.EVENT_INTRO)
    await expect(displayRoot).toHaveAttribute('data-event', '1')

    for (const [seat, device] of game.controllers) {
      const root = device.page.locator('[data-step]').first()
      await expect(root).toHaveAttribute('data-step', GAME_STEP.EVENT_INTRO)
      await expect(root).toHaveAttribute('data-seat', seat)
    }

    for (const device of game.devices) {
      await device.page.screenshot({ path: path.join(dir, `eventIntro_${device.label}.png`) })
    }
  } finally {
    await closeAll(game.devices)
  }
})
