import { expect, test } from '@playwright/test'
import { COMMAND_TYPE, SERVER_MESSAGE_TYPE } from 'tal-brothers-shared'

import { runGame } from './support/gameRunner'
import { closeAll } from './support/harness'
import type { Device } from './support/harness'
import type { Violation } from './support/hidingChecks'

/**
 * 부적 선착순 (룰북 §7.4, m4-plan 8절 18번 중 자동으로 볼 수 있는 부분).
 *
 * 인간 3명이 모두 개입 창에서 부적을 쓰는 판을 돌려, **서로 다른 좌석이 거의 동시에 부적을 누른 장면**을 찾는다.
 * 그때 판정에 적용된 부적은 하나뿐이어야 하고(판정당 1개), 진 쪽 화면이 깨지지 않아야 한다(은닉·진행 검사).
 */

const MAX_GAMES = 8
const RACE_WINDOW_MS = 1_500

function talismanPresses(device: Device): number[] {
  return device.frames
    .filter((frame) => frame.direction === 'sent' && frame.message.t === 'command')
    .filter((frame) => (frame.message['command'] as { type: string }).type === COMMAND_TYPE.INTERVENTION_TALISMAN)
    .map((frame) => frame.at)
}

function maxTalismansInOneJudgment(display: Device): number {
  let most = 0
  for (const frame of display.frames) {
    if (frame.message.t !== SERVER_MESSAGE_TYPE.SNAPSHOT) continue
    const judgment = (frame.message['snapshot'] as { judgment: { interventions: { kind: string }[] } | null }).judgment
    const count = judgment?.interventions.filter((record) => record.kind === 'talisman').length ?? 0
    most = Math.max(most, count)
  }
  return most
}

test('두 좌석이 거의 동시에 부적을 눌러도 판정에는 하나만 적용된다', async ({ browser }) => {
  test.setTimeout(30 * 60_000)
  let races = 0
  const violations: Violation[] = []

  for (let attempt = 0; attempt < MAX_GAMES && races === 0; attempt += 1) {
    const result = await runGame(browser, {
      label: `talismanRace-${attempt}`,
      humans: 3,
      seed: 1100 + attempt,
      // 회복에 쓰지 않고 개입 창에서만 부적을 쓰는 정책이라야 여럿이 부적을 든 채 같은 판정을 만난다
      policies: ['risky'],
      screenshots: 'none',
    })
    try {
      expect(result.reachedEnding).toBe(true)
      violations.push(...result.violations)
      expect(maxTalismansInOneJudgment(result.game.display)).toBeLessThanOrEqual(1)

      const presses = [...result.game.controllers.entries()]
        .flatMap(([seat, device]) => talismanPresses(device).map((at) => ({ seat, at })))
        .sort((a, b) => a.at - b.at)
      for (let index = 1; index < presses.length; index += 1) {
        const before = presses[index - 1]
        const now = presses[index]
        if (before && now && before.seat !== now.seat && now.at - before.at <= RACE_WINDOW_MS) races += 1
      }
    } finally {
      await closeAll(result.game.devices)
    }
  }

  expect(violations, violations.map((v) => `${v.device} ${v.where} ${v.detail}`).join('\n')).toEqual([])
  expect(races, '부적 경합 장면을 만들지 못했다').toBeGreaterThan(0)
})
