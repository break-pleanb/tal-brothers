import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Browser, BrowserContext, Page } from '@playwright/test'

/**
 * 통합 테스트의 기기 구성 (m4-plan 11.4).
 *
 * 브라우저 하나에 **컨텍스트를 기기마다 하나씩** 만든다. 컨텍스트는 저장소·쿠키가 분리되므로
 * 서로 다른 폰처럼 동작한다. Display는 PC 화면, Controller는 모바일 에뮬레이션이다.
 *
 * 로그인은 가짜 Supabase 모듈(`e2e/fakes/supabase.ts`)이 읽는 `localStorage` 값으로 대신한다.
 * 페이지 스크립트보다 먼저 넣어야 하므로 `addInitScript`를 쓴다.
 */

export const E2E_USER_KEY = 'tal:e2e:user'

export const SERVER_URL = 'http://localhost:3100'

export const ARTIFACT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'e2e-artifacts')

export type E2eUser = { id: string; name: string }

/** 이 기기가 ws로 받은 서버 메시지 하나 */
export type FrameRecord = {
  /** 받은 순간(실제 시각, ms) */
  at: number
  message: { t: string } & Record<string, unknown>
}

export type Device = {
  label: string
  user: E2eUser
  context: BrowserContext
  page: Page
  /** 받은 서버 메시지 전부. 은닉 검사가 화면 밖에서 새는 값을 본다 (m4-plan 11.4) */
  frames: FrameRecord[]
}

/** 페이지가 여는 ws의 수신 프레임을 모은다. 페이지를 새로 열면 다시 불러야 한다 */
export function captureFrames(page: Page, frames: FrameRecord[]): void {
  page.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => {
      if (typeof payload !== 'string') return
      try {
        const message = JSON.parse(payload) as FrameRecord['message']
        if (typeof message.t === 'string') frames.push({ at: Date.now(), message })
      } catch {
        // 서버는 JSON만 보낸다. 못 읽는 프레임은 검사 대상이 아니다
      }
    })
  })
}

/** 호스트는 Display와 폰에 **같은 계정**으로 동시에 접속한다 (아키텍처 §1) */
export const HOST_USER: E2eUser = { id: 'e2e-host', name: '호스트' }
export const GUEST_USERS: E2eUser[] = [
  { id: 'e2e-guest-1', name: '손님하나' },
  { id: 'e2e-guest-2', name: '손님둘' },
]

export const DISPLAY_VIEWPORT = { width: 1920, height: 1080 }
export const CONTROLLER_VIEWPORT = { width: 390, height: 844 }

async function newDevice(
  browser: Browser,
  label: string,
  user: E2eUser,
  options: Parameters<Browser['newContext']>[0],
): Promise<Device> {
  const context = await browser.newContext(options)
  await context.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value)
    },
    [E2E_USER_KEY, JSON.stringify(user)] as const,
  )
  const page = await context.newPage()
  const frames: FrameRecord[] = []
  captureFrames(page, frames)
  return { label, user, context, page, frames }
}

export async function openDisplay(browser: Browser, viewport = DISPLAY_VIEWPORT): Promise<Device> {
  return newDevice(browser, 'display', HOST_USER, { viewport, deviceScaleFactor: 1 })
}

export async function openController(browser: Browser, label: string, user: E2eUser): Promise<Device> {
  return newDevice(browser, label, user, {
    viewport: CONTROLLER_VIEWPORT,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  })
}

export async function closeAll(devices: Device[]): Promise<void> {
  for (const device of devices) {
    await device.context.close().catch(() => undefined)
  }
}

/** 이번 실행의 결과물 폴더. 테스트 이름별로 나눈다 */
export function artifactDir(name: string): string {
  const safe = name.replace(/[^\p{L}\p{N}_-]+/gu, '_')
  const dir = path.join(ARTIFACT_ROOT, safe)
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // Windows는 다른 프로세스가 연 폴더를 지우지 못한다(EPERM). 그때는 안의 파일만 비운다
    for (const entry of fs.readdirSync(dir)) fs.rmSync(path.join(dir, entry), { recursive: true, force: true })
  }
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * 실제 시간으로 잠깐 쉰다. 페이지가 닫혀 있어도 동작해야 해서 `page.waitForTimeout`을 쓰지 않는다 —
 * 비상 시나리오는 페이지를 닫았다 다시 연다
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 기기의 페이지를 새로 연다 (닫혔다 다시 접속하는 상황). 같은 컨텍스트라 저장소(로그인·기기 역할)는 남는다.
 * `device.page`를 바꿔 끼우므로 플레이어·기록기 루프가 다음 틱부터 새 페이지를 본다
 */
export async function reopenPage(device: Device, url: string): Promise<void> {
  if (!device.page.isClosed()) await device.page.close()
  const page = await device.context.newPage()
  captureFrames(page, device.frames)
  device.page = page
  await page.goto(url)
}

/** 다음에 만들 방의 시드를 고정한다 (테스트 서버 전용 경로) */
export async function pinNextSeed(seed: number): Promise<void> {
  const response = await fetch(`${SERVER_URL}/__e2e/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seed }),
  })
  if (!response.ok) throw new Error(`시드 고정 실패: ${response.status}`)
}
