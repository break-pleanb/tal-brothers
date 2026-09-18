import { GAME_PHASE } from 'tal-brothers-shared'

import { SEAT_ORDER } from '../engine/state/gameState'
import type { GameState } from '../engine/state/gameState'
import { runGame } from './playGame'
import type { GameRunResult, SimEventRecord } from './playGame'

/**
 * Phase 1 콘솔 시뮬레이션 (로드맵 M1-5).
 * 진행은 `playGame`이 하고, 여기서는 Phase 1까지만 돌려 출력한다.
 */

export type SimOptions = {
  seed: number
  humans: number
  startedAt?: number
  onStep?: Parameters<typeof runGame>[0]['onStep']
}

export type SimResult = {
  seed: number
  humans: number
  finalState: GameState
  events: SimEventRecord[]
  lines: string[]
}

export type { SimEventRecord, SimIntervention, SimTally } from './playGame'

export function runPhase1(options: SimOptions): SimResult {
  const run: GameRunResult = runGame({
    seed: options.seed,
    humans: options.humans,
    ...(options.startedAt === undefined ? {} : { startedAt: options.startedAt }),
    ...(options.onStep === undefined ? {} : { onStep: options.onStep }),
    withLines: true,
    // Phase 2로 넘어가는 순간 멈춘다
    stopWhen: (state) => state.progress.phase !== GAME_PHASE.PHASE_1,
  })

  if (run.finalState.progress.phase === GAME_PHASE.PHASE_1) {
    throw new Error(`Phase 1이 끝나지 않았다: ${run.finalState.progress.step}`)
  }

  const events = run.events.filter((event) => event.phase === GAME_PHASE.PHASE_1)
  const lines = [
    `# Phase 1 시뮬레이션 — seed ${options.seed}, 인간 ${options.humans}명`,
    '',
    ...run.lines,
    'Phase 1 종료',
  ]

  return { seed: options.seed, humans: options.humans, finalState: run.finalState, events, lines }
}

// ── CLI ──────────────────────────────────────────────────────────────

export function parseArgs(argv: string[]): { seed: number; humans: number } {
  let seed = 1
  let humans = 3

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg === '--seed' && next !== undefined) {
      seed = Number.parseInt(next, 10)
      i += 1
    } else if (arg === '--humans' && next !== undefined) {
      humans = Number.parseInt(next, 10)
      i += 1
    }
  }

  if (!Number.isInteger(seed)) throw new Error('--seed는 정수여야 한다')
  if (!Number.isInteger(humans) || humans < 1 || humans > SEAT_ORDER.length) {
    throw new Error(`--humans는 1~${SEAT_ORDER.length} 사이의 정수여야 한다`)
  }
  return { seed, humans }
}

function main(): void {
  const { seed, humans } = parseArgs(process.argv.slice(2))
  const result = runPhase1({ seed, humans })
  console.log(result.lines.join('\n'))
}

// tsx로 직접 실행할 때만 CLI로 동작한다
if (process.argv[1] !== undefined && process.argv[1].includes('playPhase1')) {
  main()
}
