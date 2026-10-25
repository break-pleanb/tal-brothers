import { expect } from '@playwright/test'
import type { Browser } from '@playwright/test'
import { BROTHER_ROLE } from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

import { GUEST_USERS, HOST_USER, openController, openDisplay } from './harness'
import type { Device } from './harness'

/**
 * 로비 진행 — **화면 조작만으로** 방을 만들고 앉고 시작한다 (m4-plan 11.3 M4-A).
 *
 * ws에 직접 명령을 쓰지 않는다. 메뉴·초대·로비 화면 자체가 함께 검증된다.
 * 인간 좌석 순서는 첫째 → 둘째 → 셋째에서 앞에서부터 채우고, 빈 좌석은 시작할 때 서버가 봇으로 돌린다.
 */

export const SEAT_ORDER: BrotherRole[] = [BROTHER_ROLE.FIRST, BROTHER_ROLE.SECOND, BROTHER_ROLE.THIRD]

/** 로비 좌석 보드의 버튼 이름 (`SeatBoard.vue`의 SEAT_LABEL) */
const SEAT_BUTTON: Record<BrotherRole, RegExp> = {
  [BROTHER_ROLE.FIRST]: /첫째 · 근력\/보호/,
  [BROTHER_ROLE.SECOND]: /둘째 · 민첩\/눈치/,
  [BROTHER_ROLE.THIRD]: /셋째 · 지식\/도술/,
}

export type GameOptions = {
  /** 인간 수 1~3 */
  humans: number
  /** 인간이 앉을 좌석. 생략하면 앞에서부터 */
  seats?: BrotherRole[]
  /** 개발용 시계 단축(분). 타임오버 시나리오 전용 */
  clockMinutes?: number
}

export type StartedGame = {
  roomCode: string
  display: Device
  /** 좌석별 Controller */
  controllers: Map<BrotherRole, Device>
  devices: Device[]
}

export async function startGame(browser: Browser, options: GameOptions): Promise<StartedGame> {
  const seats = options.seats ?? SEAT_ORDER.slice(0, options.humans)
  if (seats.length !== options.humans) throw new Error('인간 수와 좌석 수가 다르다')

  const display = await openDisplay(browser)
  const query = options.clockMinutes === undefined ? '' : `?clock=${options.clockMinutes}`
  await display.page.goto(`/menu${query}`)
  await display.page.getByRole('button', { name: /방 만들기/ }).click()
  await display.page.waitForURL(/\/lobby\/[A-Z0-9]+$/)
  const roomCode = display.page.url().split('/').pop() ?? ''
  await expect(display.page.getByRole('button', { name: /게임 시작|참가자를 기다리는 중/ })).toBeVisible()

  const users = [HOST_USER, ...GUEST_USERS]
  const controllers = new Map<BrotherRole, Device>()
  for (const [index, seat] of seats.entries()) {
    const user = users[index]
    if (user === undefined) throw new Error('사용자가 부족하다')
    const device = await openController(browser, seat, user)
    await device.page.goto(`/join/${roomCode}`)
    await device.page.getByRole('button', { name: '이 방에 참가하기' }).click()
    await device.page.waitForURL(new RegExp(`/lobby/${roomCode}$`))
    const seatButton = device.page.getByRole('button', { name: SEAT_BUTTON[seat] })
    await seatButton.click()
    await expect(seatButton).toContainText('내 자리')
    controllers.set(seat, device)
  }

  const startButton = display.page.getByRole('button', { name: '게임 시작' })
  await expect(startButton).toBeEnabled()
  await startButton.click()

  await display.page.waitForURL(new RegExp(`/display/${roomCode}`))
  for (const device of controllers.values()) {
    await device.page.waitForURL(new RegExp(`/play/${roomCode}`))
  }

  return { roomCode, display, controllers, devices: [display, ...controllers.values()] }
}
