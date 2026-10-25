import fs from 'node:fs'
import path from 'node:path'

import type { Browser } from '@playwright/test'
import { GAME_STEP } from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

import { appendCoverage, collectCoverage } from './coverage'
import type { GameCoverage } from './coverage'
import { artifactDir, pinNextSeed } from './harness'
import type { Device } from './harness'
import {
  checkControllerDom,
  checkControllerFrames,
  checkDisplayDom,
  checkDisplayFrames,
  checkStorage,
  testIdsOf,
  whisperTextsOf,
} from './hidingChecks'
import type { Violation } from './hidingChecks'
import { startGame } from './lobbyFlow'
import type { StartedGame } from './lobbyFlow'
import { startPlayer } from './playerPolicy'
import type { Player, PolicyName } from './playerPolicy'

/**
 * 한 판을 로비부터 엔딩까지 자동으로 돌린다 (m4-plan 11.3 M4-B).
 *
 * - Controller마다 플레이어 대역이 화면 버튼을 누른다 (`playerPolicy`)
 * - **Display의 단계가 바뀔 때마다** 모든 기기 스크린샷을 찍고 은닉 검사를 돌린다
 * - 판이 끝나면 ws 프레임 전체를 검사하고 요약·커버리지를 남긴다
 */

export type ScreenshotMode = 'all' | 'display' | 'none'

export type RunOptions = {
  label: string
  humans: number
  seats?: BrotherRole[]
  clockMinutes?: number
  /** 서버 시드. 플레이어 시드도 여기서 끌어낸다 */
  seed: number
  /** 인간 좌석 순서대로의 정책. 모자라면 마지막 값을 쓴다 */
  policies?: PolicyName[]
  screenshots?: ScreenshotMode
  /** 엔딩까지 기다리는 실제 시간 */
  timeoutMs?: number
  /** 단계가 바뀔 때마다 불린다. 시나리오 스펙이 중간에 끼어드는 자리 */
  onCheckpoint?: (checkpoint: Checkpoint, game: StartedGame) => Promise<void>
}

export type Checkpoint = {
  index: number
  /** 실행 시작부터 실제 경과(ms) */
  elapsedMs: number
  event: string
  step: string
}

export type RunResult = {
  game: StartedGame
  dir: string
  timeline: Checkpoint[]
  violations: Violation[]
  coverage: GameCoverage
  reachedEnding: boolean
  players: Map<BrotherRole, Player>
}

type DisplayPosition = { step: string; event: string }

async function displayPosition(display: Device): Promise<DisplayPosition | null> {
  return display.page
    .evaluate(() => {
      const root = document.querySelector('[data-step]')
      if (root === null) return null
      return { step: root.getAttribute('data-step') ?? '', event: root.getAttribute('data-event') ?? '' }
    })
    .catch(() => null)
}

async function screenshotAll(
  game: StartedGame,
  dir: string,
  checkpoint: Checkpoint,
  mode: ScreenshotMode,
): Promise<void> {
  if (mode === 'none') return
  const targets = mode === 'display' ? [game.display] : game.devices
  const base = `${String(checkpoint.index).padStart(3, '0')}_e${checkpoint.event || '0'}_${checkpoint.step}`
  for (const device of targets) {
    await device.page
      .screenshot({ path: path.join(dir, `${base}_${device.label}.jpg`), type: 'jpeg', quality: 70 })
      .catch(() => undefined)
  }
}

async function checkpointChecks(game: StartedGame, checkpoint: Checkpoint): Promise<Violation[]> {
  const where = `#${checkpoint.index} ${checkpoint.event}:${checkpoint.step}`
  const whispers = new Map<BrotherRole, string[]>()
  for (const [seat, device] of game.controllers) whispers.set(seat, whisperTextsOf(device))
  const everyWhisper = [...whispers.values()].flat()

  const violations = await checkDisplayDom(game.display, { where, step: checkpoint.step, whisperTexts: everyWhisper })
  for (const [seat, device] of game.controllers) {
    const own = whispers.get(seat) ?? []
    const others = [...whispers.entries()].filter(([other]) => other !== seat).flatMap(([, texts]) => texts)
    violations.push(...(await checkControllerDom(device, { where, ownWhispers: own, othersWhispers: others })))
  }
  return violations
}

function writeSummary(result: Omit<RunResult, 'players'>, options: RunOptions): void {
  const lines = [
    `# ${options.label}`,
    '',
    `- 인간 ${options.humans}명, 시드 ${options.seed}, 정책 ${(options.policies ?? ['seeded']).join('/')}`,
    `- 엔딩 도달: ${result.reachedEnding ? '예' : '아니오'} (${result.coverage.endingId ?? '없음'})`,
    `- 배신자: ${result.coverage.traitorSeats.join(', ') || '없음'}, Phase 3 루트: ${result.coverage.phase3Route ?? '없음'}`,
    `- 은닉 위반: ${result.violations.length}건`,
    `- 걸린 시간: ${Math.round((result.timeline.at(-1)?.elapsedMs ?? 0) / 1000)}초`,
    '',
    '## 위반',
    ...(result.violations.length === 0
      ? ['없음']
      : result.violations.map((v) => `- [${v.device}] ${v.where} — ${v.detail}`)),
    '',
    '## 진행',
    ...result.timeline.map((c) => `- ${String(c.index).padStart(3, '0')} ${(c.elapsedMs / 1000).toFixed(1)}s 진행 ${c.event} · ${c.step}`),
  ]
  fs.writeFileSync(path.join(result.dir, 'summary.md'), lines.join('\n'))
  fs.writeFileSync(path.join(result.dir, 'coverage.json'), JSON.stringify(result.coverage, null, 2))
  for (const device of result.game.devices) {
    fs.writeFileSync(
      path.join(result.dir, `frames_${device.label}.json`),
      JSON.stringify(device.frames.map((frame) => frame.message)),
    )
  }
}

export async function runGame(browser: Browser, options: RunOptions): Promise<RunResult> {
  const dir = artifactDir(options.label)
  const mode = options.screenshots ?? 'all'
  const timeoutMs = options.timeoutMs ?? 8 * 60_000

  await pinNextSeed(options.seed)
  const game = await startGame(browser, {
    humans: options.humans,
    ...(options.seats === undefined ? {} : { seats: options.seats }),
    ...(options.clockMinutes === undefined ? {} : { clockMinutes: options.clockMinutes }),
  })

  const policies = options.policies ?? ['seeded']
  const players = new Map<BrotherRole, Player>()
  let order = 0
  for (const [seat, device] of game.controllers) {
    const policy = policies[Math.min(order, policies.length - 1)] ?? 'seeded'
    players.set(seat, startPlayer(device, { policy, seed: options.seed * 31 + order }))
    order += 1
  }

  const startedAt = Date.now()
  const timeline: Checkpoint[] = []
  const violations: Violation[] = []
  const controllerTestIds = new Map<BrotherRole, Set<string>>()
  let last = ''
  let reachedEnding = false

  while (Date.now() - startedAt < timeoutMs) {
    const position = await displayPosition(game.display)
    if (position !== null && position.step !== '') {
      const key = `${position.event}:${position.step}`
      if (key !== last) {
        last = key
        const checkpoint: Checkpoint = {
          index: timeline.length,
          elapsedMs: Date.now() - startedAt,
          event: position.event,
          step: position.step,
        }
        timeline.push(checkpoint)
        await screenshotAll(game, dir, checkpoint, mode)
        violations.push(...(await checkpointChecks(game, checkpoint)))
        for (const [seat, device] of game.controllers) {
          const set = controllerTestIds.get(seat) ?? new Set<string>()
          for (const id of await testIdsOf(device)) set.add(id)
          controllerTestIds.set(seat, set)
        }
        if (options.onCheckpoint !== undefined) await options.onCheckpoint(checkpoint, game)
        if (position.step === GAME_STEP.ENDING) {
          reachedEnding = true
          break
        }
      }
    }
    await game.display.page.waitForTimeout(100).catch(() => undefined)
  }

  // 마지막 스냅샷·cue가 도착할 시간을 준다
  await game.display.page.waitForTimeout(1_500).catch(() => undefined)
  for (const player of players.values()) await player.stop()

  violations.push(...checkDisplayFrames(game.display))
  for (const [seat, device] of game.controllers) violations.push(...checkControllerFrames(device, seat))
  for (const device of game.devices) violations.push(...(await checkStorage(device)))

  const coverage = collectCoverage(options.label, game.display, game.devices)

  // 배신자 화면에만 있는 요소가 없어야 한다 (룰북 §17). 좌석마다 다른 개입 버튼은 비교에서 뺀다.
  // 변이 라벨은 배신자가 늘 보지만(룰북 §10.2) 일반 좌석도 가짜 라벨(§4.3)·절대 시야(§3.4)로 같은 요소를 본다.
  // 한 판에서 일반 좌석에 우연히 안 나왔을 뿐 배신자 전용 요소가 아니므로 뺀다
  const SHARED_BY_RULE = new Set(['variant-label'])
  const traitorSeats = new Set(coverage.traitorSeats)
  const ordinaryIds = new Set<string>()
  for (const [seat, ids] of controllerTestIds) {
    if (!traitorSeats.has(seat)) for (const id of ids) ordinaryIds.add(id)
  }
  if (ordinaryIds.size > 0) {
    for (const seat of traitorSeats) {
      for (const id of controllerTestIds.get(seat as BrotherRole) ?? []) {
        if (id.startsWith('intervention-') || SHARED_BY_RULE.has(id) || ordinaryIds.has(id)) continue
        violations.push({ device: seat, where: 'traitor', detail: `배신자 화면에만 있는 요소 ${id}` })
      }
    }
  }

  appendCoverage(coverage)
  const result = { game, dir, timeline, violations, coverage, reachedEnding }
  writeSummary(result, options)
  return { ...result, players }
}
