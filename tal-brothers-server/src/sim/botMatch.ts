import { BROTHER_ROLE, VARIANT_KIND } from 'tal-brothers-shared'
import type { BrotherRole, EndingId, JudgmentKind, VariantKind } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../scenario/gameConfig'
import { ENDINGS } from '../scenario/endings'
import { LOG_CODE } from '../engine/engineTypes'
import type { LogEntry } from '../engine/engineTypes'
import { SEAT_ORDER } from '../engine/state/gameState'
import { VARIANT_LABEL, formatDuration, runGame } from './playGame'
import type { GameRunResult } from './playGame'

/**
 * 봇 자동 대전 (로드맵 M2-7, M2 계획 8절).
 *
 * - 판마다 `MatchSummary` 1건을 만들고, 원자료는 **상태 스냅샷과 엔진 로그의 구조화된 값**에서만 읽는다
 * - 시드는 `--seed`부터 1씩 올린다. 같은 `--seed`·`--games`·`--humans`면 결과가 완전히 재현된다
 * - 구성별(인간 0~3명) 비교를 위해 `--humans`에 쉼표 목록이나 `all`을 넣을 수 있다 (M2 계획 10.3)
 */

export type ErosionBySeat = Record<BrotherRole, number>

export type MatchSummary = {
  seed: number
  humans: number
  endingId: EndingId | null
  /** 배신자 승패. 배신자가 한 명도 없는 판은 승패를 판정하지 않아 null이다 (룰북 §15) */
  traitorWon: boolean | null
  /** Phase 3 진입 시점(= Phase 2 종료 시) 잠식도. Phase 3에 못 갔으면 null */
  erosionAtPhase2End: ErosionBySeat | null
  finalErosion: ErosionBySeat
  traitorCount: number
  traitorTurnedAt: { seat: BrotherRole; eventIndex: number; eventId: string }[]
  /** 엔딩 시점의 남은 시간. Phase 3 절삭 뒤라 최대 10분이다 (룰북 §14.4) */
  clockRemainingMs: number
  /** Phase 3 진입 시점의 남은 시간 — 절삭 전 값이라 시계 여유를 보여준다 */
  remainingAtPhase3Ms: number | null
  /** 시계가 0을 지났는지 (Phase 3는 지나도 계속 진행한다) */
  clockExpired: boolean
  /** Phase 1~2에서 시계 0으로 강제 종료됐는지 (룰북 §2.1) */
  forcedTimeout: boolean
  elapsedMs: number
  reachedPhase3: boolean
  eventsPlayed: string[]
  judgments: { kind: JudgmentKind; variant: VariantKind | null; succeeded: boolean; forced: boolean }[]
  interventions: { kind: string; succeeded: boolean }[]
  talisman: {
    gained: number
    overflow: number
    spentForRoll: number
    spentForHeal: number
    submitted: number
    overflowDiscarded: number
  }
  variants: Record<VariantKind, number>
  botSabotage: number
}

function emptyVariantCounts(): Record<VariantKind, number> {
  return { [VARIANT_KIND.ILL]: 0, [VARIANT_KIND.PLAIN]: 0, [VARIANT_KIND.BLESS]: 0 }
}

function erosionOf(state: GameRunResult['finalState']): ErosionBySeat {
  return {
    [BROTHER_ROLE.FIRST]: state.seats[BROTHER_ROLE.FIRST].erosionPercent,
    [BROTHER_ROLE.SECOND]: state.seats[BROTHER_ROLE.SECOND].erosionPercent,
    [BROTHER_ROLE.THIRD]: state.seats[BROTHER_ROLE.THIRD].erosionPercent,
  }
}

function readErosionData(log: LogEntry): ErosionBySeat | null {
  const raw = log.data?.erosion
  if (raw === undefined || raw === null || typeof raw !== 'object') return null
  const record = raw as Record<string, number>
  return {
    [BROTHER_ROLE.FIRST]: record[BROTHER_ROLE.FIRST] ?? 0,
    [BROTHER_ROLE.SECOND]: record[BROTHER_ROLE.SECOND] ?? 0,
    [BROTHER_ROLE.THIRD]: record[BROTHER_ROLE.THIRD] ?? 0,
  }
}

/** 한 판의 로그와 최종 상태에서 지표를 뽑는다 */
export function summarize(run: GameRunResult): MatchSummary {
  const summary: MatchSummary = {
    seed: run.seed,
    humans: run.humans,
    endingId: run.finalState.ending?.id ?? null,
    traitorWon: run.finalState.ending?.traitorWon ?? null,
    erosionAtPhase2End: null,
    finalErosion: erosionOf(run.finalState),
    traitorCount: 0,
    traitorTurnedAt: [],
    clockRemainingMs: 0,
    remainingAtPhase3Ms: null,
    clockExpired: run.finalState.clock.expiredAt !== null,
    forcedTimeout: false,
    elapsedMs: run.endedAt - run.startedAt,
    reachedPhase3: false,
    eventsPlayed: [],
    judgments: [],
    interventions: [],
    talisman: {
      gained: 0,
      overflow: 0,
      spentForRoll: 0,
      spentForHeal: 0,
      submitted: 0,
      overflowDiscarded: 0,
    },
    variants: emptyVariantCounts(),
    botSabotage: 0,
  }

  /** 이벤트별 실제 변이 — 판정 성공률을 변이별로 가르는 데 쓴다 */
  const variantsByEvent = new Map<string, Record<string, VariantKind>>()

  for (const log of run.logs) {
    const data = log.data ?? {}

    switch (log.code) {
      case LOG_CODE.EVENT_ENTERED: {
        if (typeof data.eventId === 'string') summary.eventsPlayed.push(data.eventId)
        break
      }
      case LOG_CODE.VARIANTS_DECIDED: {
        const variants = data.variants as Record<string, VariantKind> | undefined
        if (variants === undefined || typeof data.eventId !== 'string') break
        variantsByEvent.set(data.eventId, variants)
        for (const variant of Object.values(variants)) {
          summary.variants[variant] += 1
        }
        break
      }
      case LOG_CODE.PHASE_ENTERED: {
        if (data.phase !== 'phase3') break
        summary.reachedPhase3 = true
        summary.erosionAtPhase2End = readErosionData(log)
        summary.remainingAtPhase3Ms = Number(data.clockRemainingMs ?? 0)
        break
      }
      case LOG_CODE.CLOCK_TIMEOUT: {
        // Phase 1~2의 시계 0은 그 자리에서 강제 잠식으로 끝난다 (룰북 §2.1)
        summary.forcedTimeout = true
        break
      }
      case LOG_CODE.TRAITOR_TURNED: {
        const seat = data.seat as BrotherRole | undefined
        if (seat === undefined) break
        summary.traitorCount += 1
        summary.traitorTurnedAt.push({
          seat,
          eventIndex: summary.eventsPlayed.length,
          eventId: typeof data.eventId === 'string' ? data.eventId : '-',
        })
        break
      }
      case LOG_CODE.BOT_SABOTAGE: {
        summary.botSabotage += 1
        break
      }
      case LOG_CODE.EFFECTS_APPLIED: {
        const kind = data.judgmentKind as JudgmentKind | null
        if (kind === null || kind === undefined) break
        const eventId = typeof data.eventId === 'string' ? data.eventId : ''
        const choiceId = typeof data.adoptedChoiceId === 'string' ? data.adoptedChoiceId : ''
        summary.judgments.push({
          kind,
          variant: variantsByEvent.get(eventId)?.[choiceId] ?? null,
          succeeded: data.succeeded === true || data.forcedSuccess === true,
          forced: data.forcedSuccess === true,
        })
        break
      }
      case LOG_CODE.CONTEST_RESOLVED: {
        summary.judgments.push({
          kind: 'contest',
          variant: null,
          succeeded: data.succeeded === true,
          forced: false,
        })
        break
      }
      case LOG_CODE.INTERVENTION_USED: {
        const record = data.intervention as { kind: string; succeeded: boolean } | undefined
        if (record === undefined) break
        summary.interventions.push({ kind: record.kind, succeeded: record.succeeded })
        if (record.kind === 'talisman') summary.talisman.spentForRoll += 1
        break
      }
      case LOG_CODE.TALISMAN_GAINED: {
        summary.talisman.gained += Number(data.stored ?? 0)
        summary.talisman.overflow += Number(data.overflow ?? 0)
        break
      }
      case LOG_CODE.TALISMAN_HEALED: {
        summary.talisman.spentForHeal += 1
        break
      }
      case LOG_CODE.TALISMAN_SUBMITTED: {
        if (data.submitted === true) summary.talisman.submitted += 1
        break
      }
      case LOG_CODE.TALISMAN_OVERFLOW: {
        if (data.reason !== 'transfer') {
          summary.talisman.overflowDiscarded += Number(data.discarded ?? 1)
        }
        break
      }
      case LOG_CODE.ENDING_DECIDED: {
        summary.clockRemainingMs = Number(data.clockRemainingMs ?? 0)
        if (data.timedOut === true) summary.clockExpired = true
        break
      }
      default:
        break
    }
  }

  return summary
}

// ── 집계 ─────────────────────────────────────────────────────────────

export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] as number
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
}

/** 0~100을 10% 구간으로 나눈 히스토그램. 마지막 칸이 100%를 담는다 */
export function histogram10(values: number[]): number[] {
  const bins = new Array<number>(11).fill(0)
  for (const value of values) {
    const index = Math.min(10, Math.max(0, Math.floor(value / 10)))
    bins[index] = (bins[index] ?? 0) + 1
  }
  return bins
}

export function countBy<T extends string>(values: T[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1
  }
  return counts
}

export type Aggregate = {
  humans: number
  games: number
  /** Phase 2 종료 시 좌석별 잠식도 (판×3) */
  erosionAtPhase2End: number[]
  erosionMean: number
  erosionMedian: number
  erosionHistogram: number[]
  traitorCountDistribution: Record<string, number>
  traitorMean: number
  traitorTurnEventIndexes: number[]
  endings: Record<string, number>
  /** 배신자 승패를 판정한 판수 = 배신자가 1명 이상인 판 (룰북 §15) */
  traitorDecidedGames: number
  /** 배신자 승률. 모집단은 `traitorDecidedGames`다 */
  traitorWinRate: number
  /** Phase 1~2 타임오버로 강제 종료된 비율 */
  forcedTimeoutRate: number
  /** 시계 0을 지난 비율 (Phase 3 포함) */
  clockExpiredRate: number
  elapsedMeanMs: number
  remainingMeanMs: number
  remainingAtPhase3MeanMs: number
  reachedPhase3Rate: number
  judgmentRate: Record<string, { total: number; success: number }>
  variantJudgmentRate: Record<string, { total: number; success: number }>
  interventionRate: Record<string, { used: number; flipped: number }>
  talisman: MatchSummary['talisman']
  variants: Record<VariantKind, number>
}

export function aggregate(summaries: MatchSummary[]): Aggregate {
  const erosion: number[] = []
  for (const summary of summaries) {
    if (summary.erosionAtPhase2End === null) continue
    for (const role of SEAT_ORDER) erosion.push(summary.erosionAtPhase2End[role])
  }

  const judgmentRate: Record<string, { total: number; success: number }> = {}
  const variantJudgmentRate: Record<string, { total: number; success: number }> = {}
  const interventionRate: Record<string, { used: number; flipped: number }> = {}
  const talisman: MatchSummary['talisman'] = {
    gained: 0,
    overflow: 0,
    spentForRoll: 0,
    spentForHeal: 0,
    submitted: 0,
    overflowDiscarded: 0,
  }
  const variants = emptyVariantCounts()

  for (const summary of summaries) {
    for (const judgment of summary.judgments) {
      const slot = (judgmentRate[judgment.kind] ??= { total: 0, success: 0 })
      slot.total += 1
      if (judgment.succeeded) slot.success += 1

      if (judgment.variant !== null) {
        const byVariant = (variantJudgmentRate[judgment.variant] ??= { total: 0, success: 0 })
        byVariant.total += 1
        if (judgment.succeeded) byVariant.success += 1
      }
    }

    for (const intervention of summary.interventions) {
      const slot = (interventionRate[intervention.kind] ??= { used: 0, flipped: 0 })
      slot.used += 1
      if (intervention.succeeded) slot.flipped += 1
    }

    talisman.gained += summary.talisman.gained
    talisman.overflow += summary.talisman.overflow
    talisman.spentForRoll += summary.talisman.spentForRoll
    talisman.spentForHeal += summary.talisman.spentForHeal
    talisman.submitted += summary.talisman.submitted
    talisman.overflowDiscarded += summary.talisman.overflowDiscarded

    for (const variant of Object.values(VARIANT_KIND)) {
      variants[variant] += summary.variants[variant]
    }
  }

  const games = summaries.length
  const decidedGames = summaries.filter((summary) => summary.traitorWon !== null).length
  return {
    humans: summaries[0]?.humans ?? 0,
    games,
    erosionAtPhase2End: erosion,
    erosionMean: mean(erosion),
    erosionMedian: median(erosion),
    erosionHistogram: histogram10(erosion),
    traitorCountDistribution: countBy(summaries.map((summary) => String(summary.traitorCount))),
    traitorMean: mean(summaries.map((summary) => summary.traitorCount)),
    traitorTurnEventIndexes: summaries.flatMap((summary) =>
      summary.traitorTurnedAt.map((turn) => turn.eventIndex),
    ),
    endings: countBy(summaries.map((summary) => summary.endingId ?? 'none')),
    // 배신자가 없는 판은 승패 자체를 판정하지 않으므로 모집단에서 뺀다 (룰북 §15)
    traitorDecidedGames: decidedGames,
    traitorWinRate:
      decidedGames === 0
        ? 0
        : summaries.filter((s) => s.traitorWon === true).length / decidedGames,
    forcedTimeoutRate: games === 0 ? 0 : summaries.filter((s) => s.forcedTimeout).length / games,
    clockExpiredRate: games === 0 ? 0 : summaries.filter((s) => s.clockExpired).length / games,
    elapsedMeanMs: mean(summaries.map((summary) => summary.elapsedMs)),
    remainingMeanMs: mean(summaries.map((summary) => summary.clockRemainingMs)),
    remainingAtPhase3MeanMs: mean(
      summaries
        .map((summary) => summary.remainingAtPhase3Ms)
        .filter((value): value is number => value !== null),
    ),
    reachedPhase3Rate:
      games === 0 ? 0 : summaries.filter((s) => s.reachedPhase3).length / games,
    judgmentRate,
    variantJudgmentRate,
    interventionRate,
    talisman,
    variants,
  }
}

// ── 출력 ─────────────────────────────────────────────────────────────

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function rate(slot: { total: number; success: number } | undefined): string {
  if (slot === undefined || slot.total === 0) return '-'
  return `${percent(slot.success / slot.total)} (${slot.success}/${slot.total})`
}

const JUDGMENT_LABEL: Record<string, string> = {
  solo: '개인',
  coop: '협동',
  hidden: '비공개',
  item: '아이템',
  contest: '대립',
}

const INTERVENTION_LABEL: Record<string, string> = {
  reroll: '둘째 재굴림',
  talisman: '부적 +1',
  forceSuccess: '첫째 강제 성공',
}

export function formatAggregate(result: Aggregate): string[] {
  const lines: string[] = []
  const games = result.games

  lines.push(`## 인간 ${result.humans}명 — ${games}판`, '')

  lines.push('### Phase 2 종료 시 잠식도 (룰북 §19 최우선 검증 대상)')
  lines.push(
    `- 평균 ${result.erosionMean.toFixed(1)}% · 중앙값 ${result.erosionMedian.toFixed(1)}% · 표본 ${result.erosionAtPhase2End.length}좌석`,
  )
  lines.push(
    `- Phase 3 도달률 ${percent(result.reachedPhase3Rate)} (나머지는 Phase 1~2에서 강제 잠식)`,
  )
  lines.push('- 10% 구간 히스토그램')
  for (const [index, count] of result.erosionHistogram.entries()) {
    const label = index === 10 ? '100%' : `${index * 10}~${index * 10 + 9}%`
    const share = result.erosionAtPhase2End.length === 0 ? 0 : count / result.erosionAtPhase2End.length
    lines.push(`    ${label.padStart(8)} ${'█'.repeat(Math.round(share * 40))} ${count} (${percent(share)})`)
  }
  lines.push('')

  lines.push('### 배신자 (룰북 §10)')
  lines.push(`- 판당 평균 ${result.traitorMean.toFixed(2)}명`)
  for (const count of ['0', '1', '2', '3']) {
    const value = result.traitorCountDistribution[count] ?? 0
    lines.push(`    ${count}명 ${value}판 (${percent(games === 0 ? 0 : value / games)})`)
  }
  if (result.traitorTurnEventIndexes.length > 0) {
    lines.push(
      `- 전환 시점(진행한 이벤트 수) 평균 ${mean(result.traitorTurnEventIndexes).toFixed(1)}번째 · 최소 ${Math.min(...result.traitorTurnEventIndexes)} · 최대 ${Math.max(...result.traitorTurnEventIndexes)}`,
    )
  }
  lines.push('')

  lines.push('### 엔딩 분포 (룰북 §15)')
  for (const [id, count] of Object.entries(result.endings).sort((a, b) => b[1] - a[1])) {
    const title = id === 'none' ? '엔딩 없음' : (ENDINGS[id as EndingId]?.title ?? id)
    lines.push(`    ${title.padEnd(14)} ${count}판 (${percent(games === 0 ? 0 : count / games)})`)
  }
  lines.push(
    result.traitorDecidedGames === 0
      ? '- 배신자 승률 — (배신자가 나온 판이 없어 승패를 판정하지 않았다)'
      : `- 배신자 승률 ${percent(result.traitorWinRate)} (배신자 1명 이상 ${result.traitorDecidedGames}판 기준)`,
  )
  lines.push('')

  lines.push('### 시계 (룰북 §2.1, §14.4)')
  lines.push(
    `- 평균 소요 ${formatDuration(result.elapsedMeanMs)} / 게임 시계 ${GAME_CONFIG.gameClockMinutes}분`,
  )
  lines.push(
    `- Phase 3 진입 시 남은 시간 평균 ${formatDuration(Math.max(0, result.remainingAtPhase3MeanMs))} (절삭 전)`,
  )
  lines.push(`- 엔딩 시점 남은 시간 평균 ${formatDuration(Math.max(0, result.remainingMeanMs))} (10분 절삭 뒤)`)
  lines.push(`- **타임오버(Phase 1~2 강제 잠식) 비율 ${percent(result.forcedTimeoutRate)}**`)
  lines.push(`- 시계 0 도달 비율 ${percent(result.clockExpiredRate)} (Phase 3는 0을 지나도 진행)`)
  lines.push('')

  lines.push('### 판정 성공률 (룰북 §5, §6)')
  for (const [kind, slot] of Object.entries(result.judgmentRate)) {
    lines.push(`    ${(JUDGMENT_LABEL[kind] ?? kind).padEnd(6)} ${rate(slot)}`)
  }
  for (const [variant, slot] of Object.entries(result.variantJudgmentRate)) {
    lines.push(
      `    ${(VARIANT_LABEL[variant as VariantKind] ?? variant).padEnd(6)} ${rate(slot)}`,
    )
  }
  lines.push('')

  lines.push('### 개입 창 (룰북 §7)')
  for (const [kind, slot] of Object.entries(result.interventionRate)) {
    const flip = slot.used === 0 ? '-' : percent(slot.flipped / slot.used)
    lines.push(
      `    ${(INTERVENTION_LABEL[kind] ?? kind).padEnd(14)} ${slot.used}회 · 성공 전환 ${flip}`,
    )
  }
  lines.push('')

  lines.push('### 부적 경제 (룰북 §9.1)')
  lines.push(
    `- 획득 ${result.talisman.gained}개 · 판정 보정 ${result.talisman.spentForRoll}회 · 회복 ${result.talisman.spentForHeal}회 · 14A 제출 ${result.talisman.submitted}회`,
  )
  lines.push(
    `- 상한 초과 ${result.talisman.overflow}개 · 보류함 폐기 ${result.talisman.overflowDiscarded}개`,
  )
  lines.push('')

  lines.push('### 변이 실제 비율 (룰북 §6.1, 목표 30/50/20)')
  const totalVariants = Object.values(result.variants).reduce((sum, value) => sum + value, 0)
  for (const [variant, count] of Object.entries(result.variants)) {
    const share = totalVariants === 0 ? 0 : count / totalVariants
    lines.push(
      `    ${VARIANT_LABEL[variant as VariantKind]} ${count}회 (${percent(share)})`,
    )
  }
  lines.push('')

  return lines
}

/** 구성별 비교표 (M2 계획 8.2) */
export function formatComparison(results: Aggregate[]): string[] {
  const lines = [
    '## 구성별 비교',
    '',
    '| 인간 | 판수 | 평균 소요 | 타임오버 | 시계 0 도달 | Phase 3 도달 | Phase 2 종료 평균 잠식 | 배신자 평균 |',
    '|---|---|---|---|---|---|---|---|',
  ]
  for (const result of results) {
    lines.push(
      `| ${result.humans}명 | ${result.games} | ${formatDuration(result.elapsedMeanMs)} | ${percent(result.forcedTimeoutRate)} | ${percent(result.clockExpiredRate)} | ${percent(result.reachedPhase3Rate)} | ${result.erosionMean.toFixed(1)}% | ${result.traitorMean.toFixed(2)}명 |`,
    )
  }
  lines.push('')
  return lines
}

// ── CLI ──────────────────────────────────────────────────────────────

export type BotMatchArgs = {
  games: number
  seed: number
  /** 돌릴 구성 목록 (인간 좌석 수) */
  humans: number[]
  json: boolean
}

export function parseBotMatchArgs(argv: string[]): BotMatchArgs {
  let games = 100
  let seed = 1
  let humans = [3]
  let json = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg === '--games' && next !== undefined) {
      games = Number.parseInt(next, 10)
      i += 1
    } else if (arg === '--seed' && next !== undefined) {
      seed = Number.parseInt(next, 10)
      i += 1
    } else if (arg === '--humans' && next !== undefined) {
      humans =
        next === 'all'
          ? [0, 1, 2, 3]
          : next.split(',').map((value) => Number.parseInt(value, 10))
      i += 1
    } else if (arg === '--json') {
      json = true
    }
  }

  if (!Number.isInteger(games) || games < 1) throw new Error('--games는 1 이상의 정수여야 한다')
  if (!Number.isInteger(seed)) throw new Error('--seed는 정수여야 한다')
  for (const count of humans) {
    if (!Number.isInteger(count) || count < 0 || count > SEAT_ORDER.length) {
      throw new Error(`--humans는 0~${SEAT_ORDER.length} 사이의 정수여야 한다`)
    }
  }
  return { games, seed, humans, json }
}

/** 한 구성을 지정한 판수만큼 돌린다 */
export function runMatches(games: number, seed: number, humans: number): MatchSummary[] {
  const summaries: MatchSummary[] = []
  for (let index = 0; index < games; index += 1) {
    const run = runGame({ seed: seed + index, humans })
    summaries.push(summarize(run))
  }
  return summaries
}

function main(): void {
  const args = parseBotMatchArgs(process.argv.slice(2))
  const byComposition = args.humans.map((humans) => ({
    humans,
    summaries: runMatches(args.games, args.seed, humans),
  }))

  if (args.json) {
    console.log(JSON.stringify(byComposition, null, 2))
    return
  }

  const results = byComposition.map((entry) => aggregate(entry.summaries))
  const lines = [
    `# 봇 자동 대전 — 구성 ${args.humans.join(', ')}명 · 각 ${args.games}판 · seed ${args.seed}부터`,
    '',
    ...results.flatMap(formatAggregate),
    ...(results.length > 1 ? formatComparison(results) : []),
  ]
  console.log(lines.join('\n'))
}

// tsx로 직접 실행할 때만 CLI로 동작한다
if (process.argv[1] !== undefined && process.argv[1].includes('botMatch')) {
  main()
}
