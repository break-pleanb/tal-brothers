import path from 'node:path'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { BROTHER_ROLE, ENDING_ID, GAME_STEP, PAUSE_REASON } from 'tal-brothers-shared'

import { runGame } from './support/gameRunner'
import type { Checkpoint } from './support/gameRunner'
import { closeAll, reopenPage, sleep } from './support/harness'
import type { StartedGame } from './support/lobbyFlow'

/**
 * 비상 상황 (m4-plan 11.3 M4-6b, 8절 13~15번, 아키텍처 §8).
 *
 * 판을 돌리다 정해진 시점에 기기를 끊고 다시 붙여, 화면이 서버 상태를 따라가는지 본다.
 * 시간은 가속 4배라 봇 대행 30초는 실제 7.5초다.
 */

/** 장면을 한 번만 끼워 넣는다 — 처음 만나는 투표 단계에서 */
function onceAtVoting(scene: (game: StartedGame) => Promise<void>) {
  let done = false
  return async (checkpoint: Checkpoint, game: StartedGame): Promise<void> => {
    if (done || checkpoint.step !== GAME_STEP.VOTING) return
    done = true
    await scene(game)
  }
}

async function displayStep(page: Page): Promise<string> {
  return (await page.locator('[data-step]').first().getAttribute('data-step').catch(() => null)) ?? ''
}

/** Display의 단계가 `count`번 바뀔 때까지 기다린다 — 그동안 게임이 멈추지 않았다는 뜻이다 */
async function waitForProgress(game: StartedGame, count: number, timeoutMs = 60_000): Promise<number> {
  let last = await displayStep(game.display.page)
  let changes = 0
  const started = Date.now()
  while (changes < count && Date.now() - started < timeoutMs) {
    await sleep(150)
    const now = await displayStep(game.display.page)
    if (now !== '' && now !== last) {
      changes += 1
      last = now
    }
  }
  return changes
}

test('조작 기기가 끊기면 Display에 "연결 끊김"만 뜨고 게임이 이어지며, 다시 붙으면 풀린다', async ({ browser }) => {
  test.setTimeout(10 * 60_000)
  const record: string[] = []

  const result = await runGame(browser, {
    label: 'emergency-disconnect',
    humans: 2,
    seed: 701,
    screenshots: 'display',
    onCheckpoint: onceAtVoting(async (game) => {
      const guest = game.controllers.get(BROTHER_ROLE.SECOND)
      if (guest === undefined) throw new Error('둘째 Controller가 없다')
      const strip = game.display.page.locator('.seat-strip__seat', { hasText: '둘째' })

      // 네트워크를 끊어 본다. 소켓이 그대로 살아 있으면 페이지를 닫는 것으로 대신한다
      await guest.context.setOffline(true)
      let method = 'offline'
      try {
        await expect(strip).toContainText('연결 끊김', { timeout: 20_000 })
      } catch {
        method = 'close'
        await guest.page.close()
        await expect(strip).toContainText('연결 끊김', { timeout: 20_000 })
      }
      record.push(`끊는 방법: ${method}`)
      await game.display.page.screenshot({ path: path.join('e2e-artifacts', 'emergency-disconnect', 'disconnected_display.png') })

      // 끊긴 동안에도 게임은 흐른다 (봇 대행·자동 굴림·기권, 아키텍처 §8)
      const progressed = await waitForProgress(game, 3)
      record.push(`끊긴 동안 단계 변화 ${progressed}회`)
      expect(progressed).toBeGreaterThanOrEqual(3)

      if (method === 'offline') {
        await guest.context.setOffline(false)
        await expect(guest.page.getByTestId('reconnect-notice')).toBeVisible({ timeout: 30_000 })
        record.push('다시 연결 안내 확인')
      } else {
        await guest.context.setOffline(false)
        await reopenPage(guest, `/play/${game.roomCode}`)
      }
      await expect(strip).not.toContainText('연결 끊김', { timeout: 30_000 })
      await guest.page.screenshot({ path: path.join('e2e-artifacts', 'emergency-disconnect', 'reconnected_second.png') })
    }),
  })

  try {
    test.info().annotations.push({ type: 'scenario', description: record.join(' / ') })
    expect(result.reachedEnding).toBe(true)
    expect(result.violations, result.violations.map((v) => v.detail).join('\n')).toEqual([])
  } finally {
    await closeAll(result.game.devices)
  }
})

test('Display가 끊기면 폰이 잠기고, 다시 열면 이어진다', async ({ browser }) => {
  test.setTimeout(10 * 60_000)
  const result = await runGame(browser, {
    label: 'emergency-display',
    humans: 2,
    seed: 702,
    screenshots: 'display',
    onCheckpoint: onceAtVoting(async (game) => {
      await game.display.page.close()
      for (const device of game.controllers.values()) {
        await expect(device.page.getByText('중계 화면 연결 끊김')).toBeVisible({ timeout: 20_000 })
      }
      const host = game.controllers.get(BROTHER_ROLE.FIRST)
      await host?.page.screenshot({ path: path.join('e2e-artifacts', 'emergency-display', 'locked_first.png') })

      await reopenPage(game.display, `/display/${game.roomCode}`)
      for (const device of game.controllers.values()) {
        await expect(device.page.getByText('중계 화면 연결 끊김')).toBeHidden({ timeout: 30_000 })
      }
      expect(await waitForProgress(game, 2)).toBeGreaterThanOrEqual(2)
    }),
  })
  try {
    expect(result.reachedEnding).toBe(true)
    expect(result.violations, result.violations.map((v) => v.detail).join('\n')).toEqual([])
  } finally {
    await closeAll(result.game.devices)
  }
})

test('조작 기기가 모두 끊기면 자동 일시정지, 다시 붙으면 이어진다', async ({ browser }) => {
  test.setTimeout(10 * 60_000)
  const result = await runGame(browser, {
    label: 'emergency-no-human',
    humans: 2,
    seed: 703,
    screenshots: 'display',
    onCheckpoint: onceAtVoting(async (game) => {
      for (const device of game.controllers.values()) await device.page.close()
      const curtain = game.display.page.getByTestId('pause-curtain')
      await expect(curtain).toHaveAttribute('data-reason', PAUSE_REASON.NO_HUMAN_CONTROLLER, { timeout: 20_000 })
      await game.display.page.screenshot({ path: path.join('e2e-artifacts', 'emergency-no-human', 'paused_display.png') })

      for (const device of game.controllers.values()) await reopenPage(device, `/play/${game.roomCode}`)
      await expect(curtain).toBeHidden({ timeout: 30_000 })
      expect(await waitForProgress(game, 2)).toBeGreaterThanOrEqual(2)
    }),
  })
  try {
    expect(result.reachedEnding).toBe(true)
    expect(result.violations, result.violations.map((v) => v.detail).join('\n')).toEqual([])
  } finally {
    await closeAll(result.game.devices)
  }
})

test('호스트 바로 상황 제시 중에 멈추고 다시 시작한다', async ({ browser }) => {
  test.setTimeout(10 * 60_000)
  let done = false
  const result = await runGame(browser, {
    label: 'emergency-host-pause',
    humans: 1,
    seed: 704,
    screenshots: 'display',
    onCheckpoint: async (checkpoint, game) => {
      if (done || checkpoint.step !== GAME_STEP.EVENT_INTRO || checkpoint.event !== '2') return
      done = true
      const page = game.display.page
      await page.mouse.move(400, 300)
      await page.mouse.move(420, 320)
      await page.getByTestId('host-pause').click()
      await expect(page.getByTestId('pause-curtain')).toHaveAttribute('data-reason', PAUSE_REASON.HOST)
      const host = game.controllers.get(BROTHER_ROLE.FIRST)
      if (host === undefined) throw new Error('첫째 Controller가 없다')
      await expect(host.page.getByText('호스트가 다시 시작할 때까지')).toBeVisible()
      await page.screenshot({ path: path.join('e2e-artifacts', 'emergency-host-pause', 'paused_display.png') })

      // 멈춘 동안에는 단계가 바뀌지 않는다
      expect(await waitForProgress(game, 1, 4_000)).toBe(0)

      await page.mouse.move(500, 300)
      await page.getByTestId('host-resume').click()
      await expect(page.getByTestId('pause-curtain')).toBeHidden()
      expect(await waitForProgress(game, 1)).toBe(1)
    },
  })
  try {
    expect(done, '두 번째 이벤트의 상황 제시를 만나지 못했다').toBe(true)
    expect(result.reachedEnding).toBe(true)
    expect(result.violations, result.violations.map((v) => v.detail).join('\n')).toEqual([])
  } finally {
    await closeAll(result.game.devices)
  }
})

test('시계가 0이 되면 모든 화면이 노이즈로 덮이고 강제 잠식으로 끝난다', async ({ browser }) => {
  test.setTimeout(6 * 60_000)
  const result = await runGame(browser, {
    label: 'emergency-timeout',
    humans: 1,
    seed: 705,
    clockMinutes: 1,
    screenshots: 'all',
  })
  try {
    expect(result.reachedEnding).toBe(true)
    expect(result.coverage.endingId).toBe(ENDING_ID.FORCED_EROSION)
    await expect(result.game.display.page.getByTestId('noise')).toBeVisible()
    await expect(result.game.display.page.getByTestId('ending-sequence')).toBeVisible()
    for (const device of result.game.controllers.values()) {
      await expect(device.page.getByTestId('noise')).toBeVisible()
      await expect(device.page.getByTestId('ending-summary')).toBeVisible()
    }
    expect(result.violations, result.violations.map((v) => v.detail).join('\n')).toEqual([])
  } finally {
    await closeAll(result.game.devices)
  }
})
