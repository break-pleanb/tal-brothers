import { GAME_STEP } from 'tal-brothers-shared'

import type { Device } from './harness'
import { createTestRng } from './random'
import type { TestRng } from './random'

/**
 * 플레이어 대역 (m4-plan 11.3 M4-B).
 *
 * Controller 한 대마다 루프 하나가 돈다. `data-step`을 읽고 **화면의 버튼만 눌러서** 진행한다.
 * ws에 직접 명령을 쓰지 않으므로 Controller 화면 자체가 함께 검증된다.
 *
 * 정책
 * - `first`  — 언제나 첫 선택지. 개입은 하지 않는다
 * - `seeded` — 시드 무작위 선택지. 개입은 반반
 * - `risky`  — 비공개 판정·아이템 사용 선택지를 먼저 고른다. 개입은 쓸 수 있으면 쓴다 (잠식도를 빨리 올려 심리전 장면을 만든다)
 * - `useAll` — 시드 무작위 선택지. 능력·부적·개입을 기회마다 쓴다
 */

export type PolicyName = 'first' | 'seeded' | 'risky' | 'useAll'

export type PlayerOptions = {
  policy: PolicyName
  seed: number
  /** 한 번 볼 때마다 쉬는 시간(ms) */
  tickMs?: number
}

export type Player = {
  /** 루프를 멈추고 끝날 때까지 기다린다 */
  stop(): Promise<void>
  /** 이 플레이어가 한 행동 기록 (요약용) */
  actions: string[]
}

type ChoiceInfo = { id: string; text: string; tags: string; mine: boolean; disabled: boolean }

type ScreenState = {
  step: string
  event: string
  choices: ChoiceInfo[]
  canRoll: boolean
  /** 누를 수 있는 testid 목록 */
  enabled: string[]
}

/** 한 번의 `evaluate`로 지금 화면에서 필요한 것을 모두 읽는다 */
async function readScreen(device: Device): Promise<ScreenState | null> {
  return device.page
    .evaluate(() => {
      const root = document.querySelector('[data-step]')
      if (root === null) return null
      const choices = [...document.querySelectorAll<HTMLButtonElement>('[data-testid="vote-choice"]')].map(
        (button) => ({
          id: button.dataset.choice ?? '',
          text: button.querySelector('.vote-panel__text')?.textContent ?? '',
          tags: button.querySelector('.vote-panel__tags')?.textContent ?? '',
          mine: button.classList.contains('vote-panel__choice--mine'),
          disabled: button.disabled,
        }),
      )
      const enabled = [...document.querySelectorAll<HTMLButtonElement>('button[data-testid]')]
        .filter((button) => !button.disabled)
        .map((button) => button.dataset.testid ?? '')
      return {
        step: root.getAttribute('data-step') ?? '',
        event: root.getAttribute('data-event') ?? '',
        choices,
        canRoll: enabled.includes('roll-button'),
        enabled,
      }
    })
    .catch(() => null)
}

function pickChoice(policy: PolicyName, rng: TestRng, choices: ChoiceInfo[]): ChoiceInfo | null {
  const open = choices.filter((choice) => !choice.disabled)
  if (open.length === 0) return null
  switch (policy) {
    case 'first':
      return open[0] ?? null
    case 'risky': {
      const risky = open.filter((choice) => /비공개|아이템/.test(choice.tags))
      const pool = risky.length > 0 ? risky : open
      return pool[rng.int(pool.length)] ?? null
    }
    case 'seeded':
    case 'useAll':
      return open[rng.int(open.length)] ?? null
  }
}

function wantsIntervention(policy: PolicyName, rng: TestRng): boolean {
  switch (policy) {
    case 'first':
      return false
    case 'seeded':
      return rng.chance(0.5)
    case 'risky':
    case 'useAll':
      return true
  }
}

const INTERVENTION_STEPS: string[] = [
  GAME_STEP.INTERVENTION_REROLL,
  GAME_STEP.INTERVENTION_TALISMAN,
  GAME_STEP.INTERVENTION_FORCE,
  GAME_STEP.PRACTICE_INTERVENTION,
]

async function click(device: Device, testId: string, nth = 0): Promise<boolean> {
  try {
    await device.page.locator(`[data-testid="${testId}"]`).nth(nth).click({ timeout: 1_500 })
    return true
  } catch {
    // 단계가 넘어가 버튼이 사라졌다. 다음 틱에 다시 본다
    return false
  }
}

export function startPlayer(device: Device, options: PlayerOptions): Player {
  const rng = createTestRng(options.seed)
  const tickMs = options.tickMs ?? 120
  const actions: string[] = []
  /**
   * 같은 단계에서 같은 일을 두 번 하지 않도록 `이벤트:단계:행동`을 기억한다.
   * 진행 번호는 Phase마다 1부터 다시 세므로, **단계가 바뀌면 기억을 비운다** — 키가 Phase를 넘어 겹치지 않게
   */
  const done = new Set<string>()
  let lastKey = ''
  let running = true

  const loop = (async () => {
    while (running) {
      if (device.page.isClosed()) break
      const screen = await readScreen(device)
      if (screen !== null) {
        const key = `${screen.event}:${screen.step}`
        if (key !== lastKey) {
          lastKey = key
          done.clear()
        }

        if (screen.step === GAME_STEP.ENDING) break

        if (
          (screen.step === GAME_STEP.VOTING || screen.step === GAME_STEP.P3_VOTING) &&
          !done.has(`${key}:vote`)
        ) {
          const choice = pickChoice(options.policy, rng, screen.choices)
          if (choice !== null) {
            const index = screen.choices.indexOf(choice)
            if (await click(device, 'vote-choice', index)) {
              done.add(`${key}:vote`)
              actions.push(`${key} 투표 ${choice.id}`)
            }
          }
        }

        if (screen.step === GAME_STEP.ROLL_WAIT && screen.canRoll && !done.has(`${key}:roll`)) {
          if (await click(device, 'roll-button')) {
            done.add(`${key}:roll`)
            actions.push(`${key} 굴림`)
          }
        }

        if (INTERVENTION_STEPS.includes(screen.step) && !done.has(`${key}:intervene`)) {
          const available = screen.enabled.filter((id) => id.startsWith('intervention-'))
          if (available.length > 0) {
            done.add(`${key}:intervene`)
            if (wantsIntervention(options.policy, rng)) {
              for (const id of available) {
                if (await click(device, id)) actions.push(`${key} ${id}`)
              }
            }
          }
        }
      }
      await device.page.waitForTimeout(tickMs).catch(() => undefined)
    }
  })()

  return {
    actions,
    async stop() {
      running = false
      await loop
    },
  }
}
