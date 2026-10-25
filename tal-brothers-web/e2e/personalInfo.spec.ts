import { expect, test } from '@playwright/test'
import { BROTHER_ROLE, SERVER_MESSAGE_TYPE } from 'tal-brothers-shared'

import { runGame } from './support/gameRunner'
import { closeAll, sleep } from './support/harness'
import type { Device } from './support/harness'
import type { Violation } from './support/hidingChecks'

/**
 * 개인 정보와 보조 동작 (m4-plan 11.3 M4-5a, 8절 6·7번).
 *
 * 인간 3명이 능력·부적을 기회마다 쓰는 판을 돌려 다음이 **화면 조작으로** 일어나는지 본다.
 * 14A는 이벤트 풀에서 뽑혀야 나오므로 시드를 바꿔 가며 최대 8판까지 돈다.
 *
 * - 셋째의 절대 시야 → Display에 사용 알림 (룰북 §3.5)
 * - 투표 중 부적 회복 → Display에 사용 알림 (룰북 §9.1)
 * - 14A 부적 제출 → Display에 봉인 알림 (룰북 §13.5)
 * - 절대 시야 결과는 셋째 Controller에만 뜬다 (룰북 §3.4, §17)
 * - 절대 시야 결과에는 라벨과 **최종 적용값**이 함께 적힌다 — `[흉] 성공 6 이상 · …` (룰북 §6.4)
 */

/** 룰북 §6.4의 표기 형식. 판정 선택지면 성공 기준, 판정 없는 선택지면 시간이 붙는다 */
const DETAIL_TEXT = /\[(흉|평|길)\] (성공 \d 이상|시간)/

const TARGETS = {
  trueSight: /절대 시야를 사용했다/,
  heal: /잠식을 씻었다/,
  submit: /탈 조각을 봉인했다/,
} as const

type Target = keyof typeof TARGETS

/** 14A는 풀 14개 중 7개를 뽑을 때 나와야 하고, 채택되고, 누군가 부적을 갖고 있어야 한다. 그래서 판을 넉넉히 준다 */
const MAX_GAMES = 12

function noticeTexts(display: Device): string[] {
  const texts = new Set<string>()
  for (const frame of display.frames) {
    if (frame.message.t !== SERVER_MESSAGE_TYPE.SNAPSHOT) continue
    const snapshot = frame.message['snapshot'] as { notices?: { text: string }[] }
    for (const notice of snapshot.notices ?? []) texts.add(notice.text)
  }
  return [...texts]
}

test('절대 시야·부적 회복·14A 제출이 화면 조작으로 일어나고 공개 알림에 뜬다', async ({ browser }) => {
  test.setTimeout(45 * 60_000)
  const seen = new Set<Target>()
  const violations: Violation[] = []
  let detailText = ''

  const allSeen = (): boolean => seen.size === Object.keys(TARGETS).length && detailText !== ''
  for (let attempt = 0; attempt < MAX_GAMES && !allSeen(); attempt += 1) {
    const result = await runGame(browser, {
      label: `personalInfo-${attempt}`,
      humans: 3,
      seed: 500 + attempt,
      // 첫째는 부적을 모아 14A에 내고, 셋째는 절대 시야와 회복을 쓴다
      policies: ['hoard', 'risky', 'useAll'],
      screenshots: attempt === 0 ? 'all' : 'none',
      onCheckpoint: async (checkpoint, game) => {
        // 절대 시야 결과는 대역이 곧바로 닫는다. 판이 도는 동안 셋째 화면을 짧은 간격으로 지켜본다
        if (checkpoint.index === 0 && detailText === '') {
          const third = game.controllers.get(BROTHER_ROLE.THIRD)
          if (third !== undefined) {
            void (async () => {
              while (detailText === '' && !third.page.isClosed()) {
                const text = await third.page
                  .locator('[data-testid="true-sight"]')
                  .innerText({ timeout: 200 })
                  .catch(() => '')
                if (DETAIL_TEXT.test(text)) detailText = text
                await sleep(80)
              }
            })()
          }
        }
        for (const [seat, device] of game.controllers) {
          if (seat === BROTHER_ROLE.THIRD) continue
          if ((await device.page.locator('[data-testid="true-sight"]').count()) > 0) {
            violations.push({ device: seat, where: `${checkpoint.event}:${checkpoint.step}`, detail: '셋째가 아닌 좌석에 절대 시야 결과' })
          }
        }
      },
    })
    try {
      expect(result.reachedEnding).toBe(true)
      violations.push(...result.violations)
      const texts = noticeTexts(result.game.display)
      for (const [target, pattern] of Object.entries(TARGETS) as [Target, RegExp][]) {
        if (texts.some((text) => pattern.test(text))) seen.add(target)
      }
    } finally {
      await closeAll(result.game.devices)
    }
  }

  expect(violations, violations.map((v) => `${v.device} ${v.where} ${v.detail}`).join('\n')).toEqual([])
  expect([...seen].sort()).toEqual(Object.keys(TARGETS).sort())
  expect(detailText, '절대 시야 결과에 최종 적용값이 없다').toMatch(DETAIL_TEXT)
})
