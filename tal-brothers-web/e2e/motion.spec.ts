import path from 'node:path'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { GAME_STEP } from 'tal-brothers-shared'

import { runGame } from './support/gameRunner'
import { closeAll } from './support/harness'

/**
 * 연출 시간 (m5-plan M5-3·M5-4).
 *
 * 연출은 서버 단계 시간 안에서 끝나야 한다 — 화면이 단계를 늘리지 않는다 (룰북 §19).
 * 단계에 들어선 순간 Display에서 돌고 있는 **끝이 있는** 애니메이션의 남은 시간(지연 + 길이 × 반복)이
 * 그 단계의 룰북 시간보다 짧은지 본다. 숨 쉬기처럼 끝없이 반복하는 표시는 단계와 무관해 뺀다.
 *
 * 둘째 판은 `prefers-reduced-motion`을 켜고 돌린다. 끝이 있는 움직임이 하나도 없어야 한다.
 */

/** 룰북 §19의 단계 시간(ms). 표에 없는 단계는 재지 않는다 */
const STEP_LIMIT_MS: Record<string, number> = {
  [GAME_STEP.EVENT_INTRO]: 30_000,
  [GAME_STEP.ROLL_REVEAL]: 3_000,
  [GAME_STEP.RESOLUTION]: 3_000,
  [GAME_STEP.INTERVENTION_REROLL]: 4_000,
  [GAME_STEP.INTERVENTION_TALISMAN]: 4_000,
  [GAME_STEP.INTERVENTION_FORCE]: 4_000,
  [GAME_STEP.PRACTICE_INTERVENTION]: 12_000,
}

async function longestFiniteAnimation(page: Page): Promise<{ ms: number; name: string }> {
  return page
    .evaluate(() => {
      let longest = { ms: 0, name: '' }
      for (const animation of document.getAnimations()) {
        const timing = animation.effect?.getComputedTiming()
        if (timing === undefined || timing.iterations === Infinity) continue
        const end = Number(timing.endTime ?? 0)
        const current = Number(animation.currentTime ?? 0)
        const remaining = Math.max(0, end - current)
        if (remaining > longest.ms) {
          longest = { ms: remaining, name: (animation as CSSAnimation).animationName ?? 'transition' }
        }
      }
      return longest
    })
    .catch(() => ({ ms: 0, name: '' }))
}

test('연출은 단계 시간 안에서 끝난다', async ({ browser }) => {
  test.setTimeout(8 * 60_000)
  const over: string[] = []
  const result = await runGame(browser, {
    label: 'motion',
    humans: 1,
    seed: 1301,
    policies: ['useAll'],
    screenshots: 'display',
    onCheckpoint: async (checkpoint, game) => {
      const limit = STEP_LIMIT_MS[checkpoint.step]
      if (limit === undefined) return
      const longest = await longestFiniteAnimation(game.display.page)
      if (longest.ms > limit) over.push(`${checkpoint.event}:${checkpoint.step} ${longest.name} ${Math.round(longest.ms)}ms > ${limit}ms`)
    },
  })
  try {
    expect(result.reachedEnding).toBe(true)
    expect(over).toEqual([])
    expect(result.violations, result.violations.map((v) => v.detail).join('\n')).toEqual([])
  } finally {
    await closeAll(result.game.devices)
  }
})

test('움직임 줄이기를 켜면 끝이 있는 움직임이 없다', async ({ browser }) => {
  test.setTimeout(8 * 60_000)
  const moving: string[] = []
  let emulated = false
  const result = await runGame(browser, {
    label: 'motion-reduced',
    humans: 1,
    seed: 1302,
    screenshots: 'display',
    onCheckpoint: async (checkpoint, game) => {
      if (!emulated) {
        for (const device of game.devices) await device.page.emulateMedia({ reducedMotion: 'reduce' })
        emulated = true
        return
      }
      for (const device of game.devices) {
        const longest = await longestFiniteAnimation(device.page)
        // Vue 전환(배경 교차)은 transition이라 reduce에서 0이 된다. 남은 시간이 있으면 움직이고 있는 것이다
        if (longest.ms > 50) moving.push(`${device.label} ${checkpoint.event}:${checkpoint.step} ${longest.name}`)
      }
      if (checkpoint.step === GAME_STEP.ROLL_REVEAL && moving.length === 0) {
        await game.display.page.screenshot({ path: path.join('e2e-artifacts', 'motion-reduced', 'reveal_reduced.png') })
      }
    },
  })
  try {
    expect(result.reachedEnding).toBe(true)
    expect(moving).toEqual([])
  } finally {
    await closeAll(result.game.devices)
  }
})
