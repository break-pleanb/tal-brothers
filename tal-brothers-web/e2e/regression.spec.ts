import path from 'node:path'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { GAME_STEP } from 'tal-brothers-shared'

import { lowContrastButtons } from './support/contrast'
import type { ContrastIssue } from './support/contrast'
import { GUEST_USERS, artifactDir, closeAll, openController, openDisplay } from './support/harness'

/**
 * 전 화면 회귀 (m4-plan 11.3 M4-C).
 *
 * 랜딩·메뉴·초대·로비(Display/Controller)·Display·Controller를 차례로 열어 스크린샷을 남기고,
 * 보이는 활성 버튼의 글자 대비비가 4.5 이상인지 본다 (흰 바탕에 흰 글자 같은 사고를 잡는다).
 */

test('전 화면 스크린샷과 버튼 대비', async ({ browser }) => {
  test.setTimeout(5 * 60_000)
  const dir = artifactDir('regression')
  const issues: (ContrastIssue & { screen: string })[] = []

  async function capture(page: Page, screen: string): Promise<void> {
    // 등장 연출이 끝난 뒤의 모습을 본다
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(dir, `${screen}.png`) })
    for (const issue of await lowContrastButtons(page)) issues.push({ ...issue, screen })
  }

  // 로그인하지 않은 기기 — 랜딩
  const anonymous = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const landing = await anonymous.newPage()
  await landing.goto('/')
  await expect(landing.getByRole('button', { name: /Google/ })).toBeVisible()
  await capture(landing, '01_landing')
  await anonymous.close()

  const display = await openDisplay(browser)
  const guest = await openController(browser, 'second', GUEST_USERS[0] ?? { id: 'g', name: 'g' })
  const host = await openController(browser, 'first', { id: 'e2e-host', name: '호스트' })
  const devices = [display, guest, host]

  try {
    await display.page.goto('/menu')
    await expect(display.page.getByRole('button', { name: /방 만들기/ })).toBeVisible()
    await capture(display.page, '02_menu')

    await display.page.getByRole('button', { name: /방 만들기/ }).click()
    await display.page.waitForURL(/\/lobby\/[A-Z0-9]+$/)
    const roomCode = display.page.url().split('/').pop() ?? ''

    await guest.page.goto(`/join/${roomCode}`)
    await expect(guest.page.getByRole('button', { name: '이 방에 참가하기' })).toBeVisible()
    await capture(guest.page, '03_join')
    await guest.page.getByRole('button', { name: '이 방에 참가하기' }).click()
    await guest.page.waitForURL(/\/lobby\//)
    await guest.page.getByRole('button', { name: /둘째 · 민첩\/눈치/ }).click()

    await host.page.goto(`/join/${roomCode}`)
    await host.page.getByRole('button', { name: '이 방에 참가하기' }).click()
    await host.page.waitForURL(/\/lobby\//)
    await host.page.getByRole('button', { name: /첫째 · 근력\/보호/ }).click()
    await expect(host.page.getByRole('button', { name: /첫째 · 근력\/보호/ })).toContainText('내 자리')
    await capture(host.page, '04_lobby_controller')

    await expect(display.page.getByRole('button', { name: '게임 시작' })).toBeEnabled()
    await capture(display.page, '05_lobby_display')
    await display.page.getByRole('button', { name: '게임 시작' }).click()

    await display.page.waitForURL(/\/display\//)
    await host.page.waitForURL(/\/play\//)
    await expect(display.page.locator('[data-step]').first()).toHaveAttribute('data-step', GAME_STEP.EVENT_INTRO)
    await capture(display.page, '06_display_intro')
    await capture(host.page, '07_controller_intro')

    await expect(display.page.locator('[data-step]').first()).toHaveAttribute('data-step', GAME_STEP.VOTING, {
      timeout: 30_000,
    })
    await capture(display.page, '08_display_voting')
    await capture(host.page, '09_controller_voting')
  } finally {
    await closeAll(devices)
  }

  expect(issues, issues.map((i) => `${i.screen} "${i.text}" ${i.ratio} (${i.foreground} on ${i.background})`).join('\n')).toEqual([])
})
