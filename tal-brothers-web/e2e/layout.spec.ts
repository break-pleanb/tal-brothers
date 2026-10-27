import path from 'node:path'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { GAME_STEP } from 'tal-brothers-shared'

import { runGame } from './support/gameRunner'
import { artifactDir, closeAll, sleep } from './support/harness'
import { startGame } from './support/lobbyFlow'

/**
 * 화면 배치 (m4-plan 2·3절, 11.3 M4-7).
 *
 * Display: 모니터 비율이 달라도 스테이지는 16:9이고, HUD·본문 글자는 **세이프존 안, 캠 자리 밖**에만 있다.
 *          레터박스 띠에는 아무것도 그리지 않는다.
 * Controller: 폭이 달라도 가로 스크롤이 없고, 액션바는 화면 아래에 붙어 있다.
 *
 * 플레이어 대역을 돌리지 않고 투표 단계에 멈춰(투표 3분, 가속 4배로 45초) 창 크기를 바꿔 가며 잰다.
 *
 * 탈이 있는 이벤트의 구도(m5-notes 탈 구도)는 한 판을 끝까지 돌리며 따로 잰다 — T1에는 탈이 없다.
 */

/** 탈이 다가오는 동안 글자를 그리지 않는 시간 (`MOTION_TIMING.maskApproachMs`) */
const MASK_APPROACH_MS = 3_000
/** 탈이 오른쪽 위로 옮겨 가는 시간 (`MOTION_TIMING.maskShiftMs`) */
const MASK_SHIFT_MS = 1_200

const DISPLAY_SIZES = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1080 },
]
const CONTROLLER_WIDTHS = [360, 390, 430]

type Box = { x: number; y: number; width: number; height: number }

async function measureDisplay(page: Page): Promise<{ stage: Box; problems: string[] }> {
  return page.evaluate(() => {
    const stageEl = document.querySelector('.display-stage')
    if (stageEl === null) return { stage: { x: 0, y: 0, width: 0, height: 0 }, problems: ['스테이지가 없다'] }
    const stage = stageEl.getBoundingClientRect()
    const problems: string[] = []
    const safe = {
      left: stage.left + stage.width * 0.04,
      right: stage.right - stage.width * 0.04,
      top: stage.top + stage.height * 0.04,
      bottom: stage.bottom - stage.height * 0.04,
    }
    // 캠 자리: 오른쪽 아래, 한 변이 스테이지 너비의 24% (m4-plan 9절 5번)
    const cam = {
      left: stage.right - stage.width * 0.24,
      top: stage.bottom - stage.width * 0.24,
    }

    // 글자가 있는 잎 요소만 본다 (배경·덮개 레이어는 세이프존을 무시하고 끝까지 채운다)
    const textNodes = [...document.querySelectorAll('.stage-layer--hud *, .stage-layer--body *')].filter(
      (element) =>
        element.children.length === 0 && (element.textContent ?? '').trim() !== '' && element.getClientRects().length > 0,
    )
    for (const element of textNodes) {
      const box = element.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) continue
      const label = (element.textContent ?? '').trim().slice(0, 24)
      const tolerance = 1
      if (
        box.left < safe.left - tolerance ||
        box.right > safe.right + tolerance ||
        box.top < safe.top - tolerance ||
        box.bottom > safe.bottom + tolerance
      ) {
        problems.push(`세이프존 밖: "${label}"`)
      }
      if (box.right > cam.left + tolerance && box.bottom > cam.top + tolerance) {
        problems.push(`캠 자리에 글자: "${label}"`)
      }
    }

    // 레터박스 띠: 스테이지 밖에 보이는 요소가 없어야 한다
    for (const element of document.querySelectorAll('body *')) {
      if (element === stageEl || stageEl.contains(element) || element.contains(stageEl)) continue
      const box = element.getBoundingClientRect()
      if (box.width > 0 && box.height > 0) problems.push(`스테이지 밖 요소: ${element.className || element.tagName}`)
    }

    return { stage: { x: stage.x, y: stage.y, width: stage.width, height: stage.height }, problems }
  })
}

async function measureController(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = []
    const root = document.documentElement
    if (root.scrollWidth > root.clientWidth + 1) problems.push(`가로 스크롤 ${root.scrollWidth} > ${root.clientWidth}`)
    const bar = document.querySelector('.controller-bottom')
    if (bar === null) {
      problems.push('액션바가 없다')
    } else {
      const box = bar.getBoundingClientRect()
      if (Math.abs(box.bottom - window.innerHeight) > 1) problems.push(`액션바가 바닥에 붙어 있지 않다 (${box.bottom} / ${window.innerHeight})`)
    }
    return problems
  })
}

/** 본문 글자 개수. 탈이 다가오는 동안에는 0이어야 한다 */
async function bodyTextLength(page: Page): Promise<number> {
  return page.evaluate(() => (document.querySelector('.stage-layer--body')?.textContent ?? '').trim().length)
}

/**
 * 탈 구도에서 겹치면 안 되는 것.
 * - 본문 글자가 왼쪽 아래 HUD(공개 알림·좌석 줄)와 겹치지 않는다
 * - 내려다보는 구도에서는 선택지 카드가 탈 틀의 왼쪽 끝 앞에서 끝난다
 */
async function measureMaskOverlap(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = []
    const intersects = (a: DOMRect, b: DOMRect): boolean =>
      a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1
    const hudBoxes = [...document.querySelectorAll('[data-testid="notice-feed"] li, .seat-strip')].map((element) =>
      element.getBoundingClientRect(),
    )
    const bodyText = [...document.querySelectorAll('.stage-layer--body *')].filter(
      (element) => element.children.length === 0 && (element.textContent ?? '').trim() !== '' && element.getClientRects().length > 0,
    )
    for (const element of bodyText) {
      const box = element.getBoundingClientRect()
      if (hudBoxes.some((hud) => intersects(box, hud))) {
        problems.push(`왼쪽 아래 HUD와 겹친다: "${(element.textContent ?? '').trim().slice(0, 24)}"`)
      }
    }
    // 탈이 옮겨 가는 도중에도 재도록 틀의 현재 위치가 아니라 최종 자리(왼쪽 끝 72cqw)와 비교한다
    const stage = document.querySelector('.display-stage')?.getBoundingClientRect()
    if (document.querySelector('[data-mask-pose="overlook"]') !== null && stage !== undefined) {
      const faceLeft = stage.left + stage.width * 0.72
      const cards = document.querySelectorAll('[data-testid="choice-card"]')
      if (cards.length === 0) problems.push('선택지 카드가 없다')
      for (const card of cards) {
        const box = card.getBoundingClientRect()
        if (box.right > faceLeft + 1) problems.push(`선택지 카드가 탈 얼굴과 겹친다 (${Math.round(box.right)} > ${Math.round(faceLeft)})`)
      }
    }
    return problems
  })
}

test('Display는 16:9·세이프존·캠 자리를 지키고, Controller는 가로 스크롤이 없다', async ({ browser }) => {
  test.setTimeout(5 * 60_000)
  const dir = artifactDir('layout')
  const game = await startGame(browser, { humans: 1 })
  const problems: string[] = []

  try {
    const displayRoot = game.display.page.locator('[data-step]').first()
    await expect(displayRoot).toHaveAttribute('data-step', GAME_STEP.VOTING, { timeout: 30_000 })

    for (const size of DISPLAY_SIZES) {
      await game.display.page.setViewportSize(size)
      await game.display.page.waitForTimeout(300)
      const { stage, problems: found } = await measureDisplay(game.display.page)
      const ratio = stage.width / stage.height
      if (Math.abs(ratio - 16 / 9) > 0.01) problems.push(`${size.width}×${size.height}: 스테이지 비율 ${ratio.toFixed(3)}`)
      problems.push(...found.map((problem) => `${size.width}×${size.height}: ${problem}`))
      await game.display.page.screenshot({ path: path.join(dir, `display_${size.width}x${size.height}.png`) })
    }

    for (const device of game.controllers.values()) {
      for (const width of CONTROLLER_WIDTHS) {
        await device.page.setViewportSize({ width, height: 800 })
        await device.page.waitForTimeout(300)
        problems.push(...(await measureController(device.page)).map((problem) => `폭 ${width}: ${problem}`))
        await device.page.screenshot({ path: path.join(dir, `controller_${width}.png`) })
      }
    }
  } finally {
    await closeAll(game.devices)
  }

  expect(problems).toEqual([])
})

test('탈이 있는 이벤트: 글자 없이 다가온 뒤 위 제목·아래 자막, 투표부터 탈은 오른쪽 위·선택지는 왼쪽', async ({ browser }) => {
  test.setTimeout(10 * 60_000)
  const dir = artifactDir('layout-mask')
  const problems: string[] = []
  let sawIntro = false
  let sawOverlook = false

  const result = await runGame(browser, {
    label: 'layout-mask',
    humans: 1,
    seed: 1401,
    screenshots: 'none',
    onCheckpoint: async (checkpoint, game) => {
      const page = game.display.page
      const layout = await page.locator('.display-body').getAttribute('data-mask-layout').catch(() => '')
      if (checkpoint.step === GAME_STEP.EVENT_INTRO && layout === 'intro' && !sawIntro) {
        sawIntro = true
        const early = await bodyTextLength(page)
        if (early > 0) problems.push(`${checkpoint.event}: 탈이 다가오는 동안 글자가 있다 (${early}자)`)
        await page.screenshot({ path: path.join(dir, `intro_${checkpoint.event}_approach.png`) })
        await sleep(MASK_APPROACH_MS + 300)
        if ((await page.locator('.narration--split').count()) === 0) problems.push(`${checkpoint.event}: 제목·자막 띠 배치가 아니다`)
        const { problems: found } = await measureDisplay(page)
        problems.push(...found.map((problem) => `${checkpoint.event} 상황 제시: ${problem}`))
        problems.push(...(await measureMaskOverlap(page)).map((problem) => `${checkpoint.event} 상황 제시: ${problem}`))
        await page.screenshot({ path: path.join(dir, `intro_${checkpoint.event}_text.png`) })
      }
      if (checkpoint.step === GAME_STEP.VOTING && layout === 'overlook' && !sawOverlook) {
        sawOverlook = true
        // 가속 판에서는 투표가 금방 끝난다. 선택지가 떠 있는 동안 바로 잰다
        problems.push(...(await measureMaskOverlap(page)).map((problem) => `${checkpoint.event} 투표: ${problem}`))
        await page.screenshot({ path: path.join(dir, `voting_${checkpoint.event}_choices.png`) })
        await sleep(MASK_SHIFT_MS + 300)
        const { problems: found } = await measureDisplay(page)
        problems.push(...found.map((problem) => `${checkpoint.event} 투표: ${problem}`))
        problems.push(...(await measureMaskOverlap(page)).map((problem) => `${checkpoint.event} 투표 이후: ${problem}`).filter((problem) => !problem.endsWith('선택지 카드가 없다')))
        await page.screenshot({ path: path.join(dir, `voting_${checkpoint.event}_after.png`) })
      }
    },
  })

  try {
    expect(sawIntro, '탈이 있는 이벤트의 상황 제시를 보지 못했다').toBe(true)
    expect(sawOverlook, '탈이 있는 이벤트의 투표를 보지 못했다').toBe(true)
    expect(problems).toEqual([])
    expect(result.violations, result.violations.map((v) => v.detail).join('\n')).toEqual([])
  } finally {
    await closeAll(result.game.devices)
  }
})
