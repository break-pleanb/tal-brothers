import fs from 'node:fs'
import path from 'node:path'

import { SERVER_MESSAGE_TYPE } from 'tal-brothers-shared'

import { ARTIFACT_ROOT } from './harness'
import type { Device } from './harness'

/**
 * 커버리지 — 판마다 무엇을 봤는지 모은다 (m4-plan 11.3 M4-B, M4-7).
 *
 * 시드를 바꿔 여러 판을 돌리는 스펙이 "아직 못 본 것"을 판단하는 근거다.
 * `e2e-artifacts/coverage.json`에 실행이 끝날 때마다 누적한다.
 */

export type GameCoverage = {
  label: string
  /** Display가 지나간 단계 */
  steps: string[]
  /** 공개 알림 종류 */
  notices: string[]
  /** 모든 기기가 받은 cue 종류 */
  cues: string[]
  endingId: string | null
  traitorSeats: string[]
  phase3Route: string | null
  /** 사용된 개입 수단 (`InterventionView.kind`) */
  interventions: string[]
}

type Snapshot = Record<string, unknown>

function snapshots(device: Device): Snapshot[] {
  return device.frames
    .filter((frame) => frame.message.t === SERVER_MESSAGE_TYPE.SNAPSHOT)
    .map((frame) => frame.message['snapshot'] as Snapshot)
}

export function collectCoverage(label: string, display: Device, devices: Device[]): GameCoverage {
  const steps = new Set<string>()
  const notices = new Set<string>()
  const interventions = new Set<string>()
  let endingId: string | null = null
  let traitorSeats: string[] = []
  let phase3Route: string | null = null

  for (const snapshot of snapshots(display)) {
    steps.add(String(snapshot['step']))
    for (const notice of (snapshot['notices'] as { kind: string }[] | undefined) ?? []) notices.add(notice.kind)
    const judgment = snapshot['judgment'] as { interventions?: { kind: string }[] } | null
    for (const record of judgment?.interventions ?? []) interventions.add(record.kind)
    const ending = snapshot['ending'] as { id: string; traitorSeats: string[] } | null
    if (ending !== null && ending !== undefined) {
      endingId = ending.id
      traitorSeats = ending.traitorSeats
    }
    const phase3 = snapshot['phase3'] as { route: string | null } | null
    if (phase3?.route) phase3Route = phase3.route
  }

  const cues = new Set<string>()
  for (const device of devices) {
    for (const frame of device.frames) {
      if (frame.message.t !== SERVER_MESSAGE_TYPE.CUE) continue
      for (const cue of frame.message['cues'] as { kind: string }[]) cues.add(cue.kind)
    }
  }

  return {
    label,
    steps: [...steps].sort(),
    notices: [...notices].sort(),
    cues: [...cues].sort(),
    endingId,
    traitorSeats,
    phase3Route,
    interventions: [...interventions].sort(),
  }
}

const COVERAGE_FILE = path.join(ARTIFACT_ROOT, 'coverage.json')

export function appendCoverage(entry: GameCoverage): void {
  fs.mkdirSync(ARTIFACT_ROOT, { recursive: true })
  let all: GameCoverage[] = []
  try {
    all = JSON.parse(fs.readFileSync(COVERAGE_FILE, 'utf8')) as GameCoverage[]
  } catch {
    all = []
  }
  all.push(entry)
  fs.writeFileSync(COVERAGE_FILE, JSON.stringify(all, null, 2))
}
