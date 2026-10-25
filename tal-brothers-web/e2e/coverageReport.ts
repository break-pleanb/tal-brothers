import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { COMMAND_TYPE, ENDING_ID, GAME_STEP, PHASE3_ROUTE } from 'tal-brothers-shared'

/**
 * 커버리지 보고서 (m4-plan 11.3 M4-7).
 *
 * `npm run test:e2e`가 남긴 `e2e-artifacts/`를 모아 **무엇을 한 번 이상 봤는지** 정리한다.
 * 스펙이 아니라 보고서다 — 확률로 나오는 장면(엔딩 종류, 루트)은 판 수에 따라 달라지므로 실패로 다루지 않고,
 * 못 본 것을 목록으로 남겨 notes에 옮긴다.
 *
 * 실행: `npm run e2e:coverage -w tal-brothers-web` (테스트를 먼저 돌린다)
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'e2e-artifacts')

type Message = { t: string } & Record<string, unknown>

/**
 * 서버가 머물지 않는 단계는 스냅샷에 남지 않는다 (m4-notes 자동 확인).
 * 이 둘은 cue(`phaseEntered`·`targetRevealed`)로 확인한다
 */
const PASS_THROUGH: string[] = [GAME_STEP.PHASE2_ENTRY, GAME_STEP.P3_TARGETING]

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

const runs = fs.existsSync(ROOT)
  ? fs.readdirSync(ROOT, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  : []

const steps = new Set<string>()
const endings = new Set<string>()
const routes = new Set<string>()
const interventions = new Set<string>()
const notices = new Set<string>()
const cues = new Set<string>()
let talismanRaceRejections = 0
let talismanRaces = 0
/** 서로 다른 좌석이 이만큼 안에 부적을 누르면 경합으로 본다 (개입 단계 4초, 가속 4배로 실제 1초) */
const RACE_WINDOW_MS = 1_500
let games = 0

for (const run of runs) {
  const dir = path.join(ROOT, run)
  const files = fs.readdirSync(dir).filter((name) => name.startsWith('frames_'))
  if (files.length === 0) continue
  games += 1
  const presses: { seat: string; at: number }[] = []

  for (const file of files) {
    const frames = readJson<Message[]>(path.join(dir, file)) ?? []
    const isDisplay = file === 'frames_display.json'
    for (const message of frames) {
      if (message.t === 'snapshot') {
        const snapshot = message['snapshot'] as Record<string, unknown>
        if (isDisplay) {
          steps.add(String(snapshot['step']))
          const ending = snapshot['ending'] as { id: string } | null
          if (ending) endings.add(ending.id)
          const phase3 = snapshot['phase3'] as { route: string | null } | null
          if (phase3?.route) routes.add(phase3.route)
          const judgment = snapshot['judgment'] as { interventions: { kind: string }[] } | null
          for (const record of judgment?.interventions ?? []) interventions.add(record.kind)
          for (const notice of (snapshot['notices'] as { kind: string }[] | undefined) ?? []) notices.add(notice.kind)
        }
      } else if (message.t === 'cue') {
        for (const cue of message['cues'] as { kind: string }[]) cues.add(cue.kind)
      } else if (message.t === 'command') {
        const command = message['command'] as { type: string }
        if (command.type === COMMAND_TYPE.INTERVENTION_TALISMAN) {
          presses.push({ seat: file.replace(/^frames_|\.json$/g, ''), at: Number(message['_at'] ?? 0) })
        }
      } else if (message.t === 'rejected') {
        // 부적 선착순에서 진 쪽: 이미 적용됐거나, 수단이 소모돼 단계가 넘어갔다 (룰북 §7.2, §7.4)
        const detail = String(message['detail'] ?? '')
        if (detail.includes('부적은 이미 적용') || detail === COMMAND_TYPE.INTERVENTION_TALISMAN) {
          talismanRaceRejections += 1
        }
      }
    }
  }

  presses.sort((a, b) => a.at - b.at)
  for (let index = 1; index < presses.length; index += 1) {
    const before = presses[index - 1]
    const now = presses[index]
    if (before && now && before.seat !== now.seat && now.at - before.at <= RACE_WINDOW_MS) talismanRaces += 1
  }
}

const allSteps = Object.values(GAME_STEP) as string[]
const missingSteps = allSteps.filter((step) => !steps.has(step) && !PASS_THROUGH.includes(step))
const missingEndings = (Object.values(ENDING_ID) as string[]).filter((id) => !endings.has(id))
const missingRoutes = (Object.values(PHASE3_ROUTE) as string[]).filter((route) => !routes.has(route))

const lines = [
  '# e2e 커버리지',
  '',
  `- 판 수: ${games}`,
  `- Display가 지나간 단계: ${[...steps].sort().join(', ')}`,
  `- 못 본 단계: ${missingSteps.join(', ') || '없음'} (머물지 않는 ${PASS_THROUGH.join('·')}는 cue로 확인: ${PASS_THROUGH.length > 0 && cues.has('phaseEntered') && cues.has('targetRevealed') ? '봤음' : '못 봄'})`,
  `- 엔딩: ${[...endings].sort().join(', ')} / 못 본 엔딩: ${missingEndings.join(', ') || '없음'}`,
  `- Phase 3 루트: ${[...routes].sort().join(', ')} / 못 본 루트: ${missingRoutes.join(', ') || '없음'}`,
  `- 개입 수단: ${[...interventions].sort().join(', ')}`,
  `- 공개 알림 종류: ${[...notices].sort().join(', ')}`,
  `- cue 종류: ${[...cues].sort().join(', ')}`,
  `- 부적 선착순 경합(서로 다른 좌석이 ${RACE_WINDOW_MS}ms 안에 누름): ${talismanRaces}건, 진 쪽의 거절: ${talismanRaceRejections}건`,
]

fs.writeFileSync(path.join(ROOT, 'coverage.md'), lines.join('\n'))
console.info(lines.join('\n'))
