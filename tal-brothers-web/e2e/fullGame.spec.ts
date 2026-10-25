import { expect, test } from '@playwright/test'
import { GAME_STEP } from 'tal-brothers-shared'

import { runGame } from './support/gameRunner'
import { closeAll } from './support/harness'

/**
 * 한 판 전체 (m4-plan 11.3 M4-B, 8절 1~12번).
 *
 * 인간 1·2·3명 구성마다 로비 → 엔딩을 화면 조작만으로 진행하고, 단계마다 은닉 검사를 돌린다.
 * `E2E_FULLGAME=1`(기본)은 세 구성, `E2E_FULLGAME=quick`은 인간 1명만 돌린다 (단위마다의 회귀용).
 */

const QUICK = process.env.E2E_FULLGAME === 'quick'
const CONFIGS = QUICK ? [1] : [1, 2, 3]

for (const humans of CONFIGS) {
  test(`인간 ${humans}명 한 판 — 로비부터 엔딩까지, 은닉 위반 없음`, async ({ browser }) => {
    test.setTimeout(12 * 60_000)
    const result = await runGame(browser, {
      label: `fullGame-${humans}`,
      humans,
      seed: 100 + humans,
      policies: ['seeded', 'useAll', 'risky'],
    })

    try {
      expect(result.reachedEnding, '엔딩 단계에 도달해야 한다').toBe(true)
      for (const device of result.game.controllers.values()) {
        await expect(device.page.locator('[data-step]').first()).toHaveAttribute('data-step', GAME_STEP.ENDING)
      }
      expect(result.violations, result.violations.map((v) => `${v.device} ${v.where} ${v.detail}`).join('\n')).toEqual([])
    } finally {
      await closeAll(result.game.devices)
    }
  })
}
