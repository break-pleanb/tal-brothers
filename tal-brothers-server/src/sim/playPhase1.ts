import {
  ATTRIBUTE,
  BROTHER_ROLE,
  COMMAND_TYPE,
  GAME_STEP,
  JUDGMENT_KIND,
  VARIANT_KIND,
} from 'tal-brothers-shared'
import type { Attribute, BrotherRole, Command, GameStep, JudgmentKind, VariantKind } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../scenario/gameConfig'
import { findPhase1Event } from '../scenario/phase1Events'
import { hasJudgment } from '../scenario/scenarioTypes'
import { dispatch } from '../engine/dispatch'
import { ACTION_KIND, LOG_CODE } from '../engine/engineTypes'
import type { DispatchSuccess } from '../engine/engineTypes'
import { createSeededRng, rollChance } from '../engine/random'
import type { Rng } from '../engine/random'
import { createGame, seatSetupForHumans } from '../engine/state/createGame'
import { INTERVENTION_KIND, SEAT_ORDER } from '../engine/state/gameState'
import type { GameState, InterventionRecord } from '../engine/state/gameState'

/**
 * Phase 1 콘솔 시뮬레이션 (로드맵 M1-5).
 *
 * - 인간 좌석 입력은 시드 기반 랜덤 정책으로 대신한다 (대화형 입력 없음)
 * - 시간은 가상 시계로 진행한다. 다음 마감 시각으로 시계를 옮기고 타이머 만료 액션을 넣는다
 * - 이벤트마다 채택 선택지, 변이, 판정자, 주사위, 개입 내역, 결과, 좌석 상태를 한국어로 출력한다
 *
 * 투표 집계와 개입은 이벤트 전환과 같은 처리 안에서 끝날 수 있어 상태로는 관찰되지 않는다.
 * 그래서 이 둘은 상태가 아니라 엔진 로그의 구조화된 값에서 읽는다.
 */

const ROLE_LABEL: Record<BrotherRole, string> = {
  [BROTHER_ROLE.FIRST]: '첫째',
  [BROTHER_ROLE.SECOND]: '둘째',
  [BROTHER_ROLE.THIRD]: '셋째',
}

const ATTRIBUTE_LABEL: Record<Attribute, string> = {
  [ATTRIBUTE.STRENGTH]: '근력/보호',
  [ATTRIBUTE.AGILITY]: '민첩/눈치',
  [ATTRIBUTE.KNOWLEDGE]: '지식/도술',
}

const JUDGMENT_LABEL: Record<JudgmentKind, string> = {
  [JUDGMENT_KIND.SOLO]: '개인',
  [JUDGMENT_KIND.COOP]: '협동',
  [JUDGMENT_KIND.HIDDEN]: '비공개',
  [JUDGMENT_KIND.ITEM]: '아이템',
  [JUDGMENT_KIND.CONTEST]: '대립',
}

const VARIANT_LABEL: Record<VariantKind, string> = {
  [VARIANT_KIND.ILL]: '흉',
  [VARIANT_KIND.PLAIN]: '평',
  [VARIANT_KIND.BLESS]: '길',
}

const INTERVENTION_LABEL: Record<string, string> = {
  [INTERVENTION_KIND.REROLL]: '재굴림',
  [INTERVENTION_KIND.TALISMAN]: '부적 +1',
  [INTERVENTION_KIND.FORCE_SUCCESS]: '강제 성공',
}

/** 인간 좌석 정책의 확률 (시뮬레이션 전용 값이며 게임 규칙이 아니다) */
const POLICY = {
  /** 기권 10% — 조기 마감 경로가 충분히 실행되도록 둔다 */
  votePercent: 90,
  trueSightPercent: 50,
  healPercent: 40,
  rollPercent: 70,
  rerollPercent: 70,
  talismanPercent: 60,
  forceSuccessPercent: 50,
  practicePressPercent: 50,
} as const

export type SimOptions = {
  seed: number
  humans: number
  startedAt?: number
  /** 진행 상황 관찰용. 각 액션 처리 뒤에 불린다 */
  onStep?: (result: DispatchSuccess) => void
}

/** 개입 1건 — 엔진 로그에서 읽은 값 */
export type SimIntervention = InterventionRecord & {
  /** 재판정 기준 (변이 적용 후) */
  threshold: number
  byBot: boolean
}

/** 마감 후 공개되는 득표 수 (룰북 §8) */
export type SimTally = {
  counts: Record<string, number>
  /** 인간 전원이 투표해 마감 시각 전에 끝났는지 */
  earlyClosed: boolean
}

/** 이벤트 1개의 진행 기록 */
export type SimEventRecord = {
  index: number
  eventId: string
  title: string
  /** 이벤트 진입 시각 (가상 시계) */
  startedAt: number
  variants: Record<string, VariantKind>
  tally: SimTally | null
  adoptedChoiceId: string | null
  rollerSeat: BrotherRole | null
  /** 이 이벤트에서 튜토리얼 부적을 받은 좌석 (룰북 §9.2) */
  tutorialTalismanSeat: BrotherRole | null
  /** 개입 전 최초 판정 — `ROLL_REVEAL` 시점 스냅샷 */
  judgment: {
    kind: JudgmentKind
    threshold: number
    dice: { seat: BrotherRole; value: number | null }[]
    roleBonus: number
    teamModifierApplied: number
    talismanBonus: number
    succeeded: boolean | null
  } | null
  interventions: SimIntervention[]
  visitedSteps: GameStep[]
}

export type SimResult = {
  seed: number
  humans: number
  finalState: GameState
  events: SimEventRecord[]
  lines: string[]
}

const MAX_ACTIONS = 500

function snapshotEvent(state: GameState, index: number, now: number): SimEventRecord {
  const current = state.currentEvent
  if (current === null) throw new Error('현재 이벤트가 없다')
  const event = findPhase1Event(current.eventId)

  return {
    index,
    eventId: current.eventId,
    title: event?.title ?? current.eventId,
    startedAt: now,
    variants: { ...current.variants },
    tally: null,
    adoptedChoiceId: current.adoptedChoiceId,
    rollerSeat: current.rollerSeat,
    tutorialTalismanSeat:
      SEAT_ORDER.find((role) => state.seats[role].tutorialTalismanCount > 0) ?? null,
    judgment: null,
    interventions: [],
    visitedSteps: [state.progress.step],
  }
}

function updateRecord(record: SimEventRecord, state: GameState): void {
  const current = state.currentEvent
  if (current === null) return

  record.variants = { ...current.variants }
  record.adoptedChoiceId = current.adoptedChoiceId ?? record.adoptedChoiceId
  record.rollerSeat = current.rollerSeat ?? record.rollerSeat

  const step = state.progress.step
  const judgment = state.currentJudgment
  // 개입 전 최초 판정만 담는다. 개입 뒤의 변화는 `interventions`가 들고 있다
  if (step === GAME_STEP.ROLL_REVEAL && judgment !== null) {
    record.judgment = {
      kind: judgment.kind,
      threshold: judgment.threshold,
      dice: judgment.dice.map((die) => ({ ...die })),
      roleBonus: judgment.roleBonus,
      teamModifierApplied: judgment.teamModifierApplied,
      talismanBonus: judgment.talismanBonus,
      succeeded: judgment.succeeded,
    }
  }

  if (record.visitedSteps[record.visitedSteps.length - 1] !== step) {
    record.visitedSteps.push(step)
  }
}

/** 한 번의 처리 안에서 끝나 상태로는 볼 수 없는 값을 로그에서 읽는다 */
function readLogs(record: SimEventRecord, result: DispatchSuccess): void {
  for (const log of result.logs) {
    const data = log.data
    if (data === undefined) continue
    if (data.eventId !== record.eventId) continue

    if (log.code === LOG_CODE.VOTE_TALLIED) {
      record.adoptedChoiceId = String(data.adoptedChoiceId)
      record.tally = {
        counts: { ...(data.counts as Record<string, number>) },
        earlyClosed: data.earlyClosed === true,
      }
      continue
    }

    if (log.code === LOG_CODE.INTERVENTION_USED) {
      record.interventions.push({
        ...(data.intervention as InterventionRecord),
        threshold: Number(data.threshold),
        byBot: data.byBot === true,
      })
    }
  }
}

// ── 인간 좌석 정책 ────────────────────────────────────────────────────

type Runner = {
  state: GameState
  send(seat: BrotherRole, command: Command): void
}

function humanSeats(state: GameState): BrotherRole[] {
  return SEAT_ORDER.filter((role) => !state.seats[role].isBot)
}

function actVoting(runner: Runner, rng: Rng): void {
  const event = findPhase1Event(runner.state.currentEvent?.eventId ?? '')
  if (event === undefined) return

  const third = runner.state.seats[BROTHER_ROLE.THIRD]
  if (
    !third.isBot &&
    !(runner.state.currentEvent?.trueSightUsed ?? true) &&
    !third.abilityUsed &&
    rollChance(rng, POLICY.trueSightPercent)
  ) {
    runner.send(BROTHER_ROLE.THIRD, { type: COMMAND_TYPE.ABILITY_TRUE_SIGHT })
  }

  for (const role of humanSeats(runner.state)) {
    const seat = runner.state.seats[role]
    if (
      seat.talismanCount > 0 &&
      seat.erosionPercent >= GAME_CONFIG.talismanHealPercent &&
      rollChance(rng, POLICY.healPercent)
    ) {
      runner.send(role, { type: COMMAND_TYPE.TALISMAN_HEAL })
    }
  }

  for (const role of humanSeats(runner.state)) {
    if (runner.state.progress.step !== GAME_STEP.VOTING) return
    if (runner.state.currentEvent?.votes[role] !== undefined) continue
    if (!rollChance(rng, POLICY.votePercent)) continue

    const choice = event.choices[rng.nextInt(event.choices.length)]
    if (choice === undefined) continue
    runner.send(role, { type: COMMAND_TYPE.VOTE_SUBMIT, choiceId: choice.id })
  }
}

function actRollWait(runner: Runner, rng: Rng): void {
  const judgment = runner.state.currentJudgment
  if (judgment === null) return

  for (const die of judgment.dice.map((candidate) => ({ ...candidate }))) {
    if (runner.state.progress.step !== GAME_STEP.ROLL_WAIT) return
    if (die.value !== null) continue
    if (runner.state.seats[die.seat].isBot) continue
    if (!rollChance(rng, POLICY.rollPercent)) continue

    runner.send(die.seat, { type: COMMAND_TYPE.ROLL_REQUEST })
  }
}

function actIntervention(runner: Runner, rng: Rng): void {
  const step = runner.state.progress.step

  if (step === GAME_STEP.INTERVENTION_REROLL) {
    const second = runner.state.seats[BROTHER_ROLE.SECOND]
    if (!second.isBot && !second.abilityUsed && rollChance(rng, POLICY.rerollPercent)) {
      runner.send(BROTHER_ROLE.SECOND, { type: COMMAND_TYPE.INTERVENTION_REROLL })
    }
    return
  }

  if (step === GAME_STEP.INTERVENTION_TALISMAN) {
    for (const role of humanSeats(runner.state)) {
      if (runner.state.progress.step !== GAME_STEP.INTERVENTION_TALISMAN) return
      const seat = runner.state.seats[role]
      if (seat.talismanCount + seat.tutorialTalismanCount < 1) continue
      if (!rollChance(rng, POLICY.talismanPercent)) continue

      runner.send(role, { type: COMMAND_TYPE.INTERVENTION_TALISMAN })
    }
    return
  }

  if (step === GAME_STEP.INTERVENTION_FORCE) {
    const first = runner.state.seats[BROTHER_ROLE.FIRST]
    if (!first.isBot && !first.abilityUsed && rollChance(rng, POLICY.forceSuccessPercent)) {
      runner.send(BROTHER_ROLE.FIRST, { type: COMMAND_TYPE.INTERVENTION_FORCE_SUCCESS })
    }
    return
  }

  if (step === GAME_STEP.PRACTICE_INTERVENTION) {
    const humans = humanSeats(runner.state)
    const seat = humans[rng.nextInt(humans.length)]
    if (seat !== undefined && rollChance(rng, POLICY.practicePressPercent)) {
      runner.send(seat, { type: COMMAND_TYPE.INTERVENTION_TALISMAN })
    }
  }
}

// ── 진행 루프 ────────────────────────────────────────────────────────

export function runPhase1(options: SimOptions): SimResult {
  const engineRng = createSeededRng(options.seed)
  // 인간 정책은 별도 수열을 써서 엔진 난수와 섞이지 않게 한다
  const policyRng = createSeededRng(options.seed + 1)

  let now = options.startedAt ?? Date.UTC(2026, 0, 1, 20, 0, 0)
  let last: DispatchSuccess = createGame(
    { roomCode: 'SIM', seats: seatSetupForHumans(options.humans) },
    { now, rng: engineRng },
  )
  options.onStep?.(last)

  const events: SimEventRecord[] = []
  let record = snapshotEvent(last.state, 0, now)

  const lines: string[] = [
    `# Phase 1 시뮬레이션 — seed ${options.seed}, 인간 ${options.humans}명`,
    '',
  ]
  const totalEvents = last.state.progress.eventOrder.length

  /** 액션 처리 뒤마다 기록을 갱신하고, 이벤트가 넘어갔으면 직전 기록을 출력한다 */
  function observe(): void {
    readLogs(record, last)

    const eventId = last.state.currentEvent?.eventId
    if (eventId === undefined) return

    if (eventId !== record.eventId) {
      events.push(record)
      lines.push(...formatEvent(record, last.state, events.length, totalEvents, now))
      record = snapshotEvent(last.state, events.length, now)
      return
    }
    updateRecord(record, last.state)
  }

  const runner: Runner = {
    get state(): GameState {
      return last.state
    },
    send(seat, command) {
      const result = dispatch(
        last.state,
        { kind: ACTION_KIND.COMMAND, seat, command },
        { now, rng: engineRng },
      )
      if (result.rejected) return
      last = result
      observe()
      options.onStep?.(last)
    },
  }

  // `last`는 클로저 안에서 갱신되므로 단계는 그때그때 함수로 읽는다
  const stepNow = (): GameStep => last.state.progress.step

  for (let guard = 0; guard < MAX_ACTIONS; guard += 1) {
    if (stepNow() === GAME_STEP.PHASE2_ENTRY) break

    const step = stepNow()
    if (step === GAME_STEP.VOTING) actVoting(runner, policyRng)
    else if (step === GAME_STEP.ROLL_WAIT) actRollWait(runner, policyRng)
    else actIntervention(runner, policyRng)

    if (stepNow() === GAME_STEP.PHASE2_ENTRY) break

    const deadline = last.nextDeadline
    if (deadline === null) {
      throw new Error(`타이머가 없는 단계에서 멈췄다: ${last.state.progress.step}`)
    }

    now = deadline.at
    const result = dispatch(
      last.state,
      {
        kind: ACTION_KIND.TIMER_EXPIRY,
        step: deadline.step,
        stateVersion: deadline.stateVersion,
      },
      { now, rng: engineRng },
    )
    if (result.rejected) {
      throw new Error(`타이머가 거절됐다: ${result.reason} ${result.detail ?? ''}`)
    }
    last = result
    observe()
    options.onStep?.(last)
  }

  // 마지막 이벤트 기록은 루프가 어디서 끝나도 한 번만 확정한다
  if (events[events.length - 1] !== record) {
    events.push(record)
    lines.push(...formatEvent(record, last.state, events.length, totalEvents, now))
  }

  if (stepNow() !== GAME_STEP.PHASE2_ENTRY) {
    throw new Error(`Phase 1이 끝나지 않았다: ${stepNow()}`)
  }

  lines.push('Phase 1 종료')

  return {
    seed: options.seed,
    humans: options.humans,
    finalState: last.state,
    events,
    lines,
  }
}

// ── 출력 ─────────────────────────────────────────────────────────────

/** 한글을 2칸으로 세어 라벨 폭을 맞춘다 */
function padLabel(label: string, columns: number): string {
  let width = 0
  for (const char of label) {
    width += char.codePointAt(0) !== undefined && char.charCodeAt(0) > 0x2e80 ? 2 : 1
  }
  return label + ' '.repeat(Math.max(1, columns - width))
}

function row(label: string, value: string): string {
  return `  ${padLabel(label, 10)}${value}`
}

/** 밀리초를 `3분 30초` 꼴로 적는다. 분 단위로 반올림하면 30초 차이가 보이지 않는다 */
function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}초`
  if (seconds === 0) return `${minutes}분`
  return `${minutes}분 ${seconds}초`
}

function voteLine(record: SimEventRecord): string {
  const event = findPhase1Event(record.eventId)
  if (event === undefined) return '알 수 없음'
  if (event.skipVoting) return '생략 (선택지 1개)'

  const counts = record.tally?.counts ?? {}
  const tally = event.choices
    .map((choice) => `${choice.text} ${counts[choice.id] ?? 0}표`)
    .join(' · ')
  const adopted = event.choices.find((choice) => choice.id === record.adoptedChoiceId)
  const closing = record.tally?.earlyClosed === true ? '조기 마감' : '3분 만료'

  return `${tally} → 채택 「${adopted?.text ?? '-'}」 (${closing})`
}

function variantLine(record: SimEventRecord): string {
  const entries = Object.entries(record.variants)
  if (entries.length === 0) return '미적용'
  return entries
    .map(([choiceId, variant]) => {
      const mark = choiceId === record.adoptedChoiceId ? '*' : ''
      return `${choiceId}${mark} ${VARIANT_LABEL[variant]}`
    })
    .join(' · ')
}

function judgmentLine(record: SimEventRecord): string {
  if (record.judgment === null) return '없음 (판정 없는 선택지)'

  const event = findPhase1Event(record.eventId)
  const choice = event?.choices.find((candidate) => candidate.id === record.adoptedChoiceId)
  const attribute =
    choice !== undefined && hasJudgment(choice) && choice.judgment.kind !== JUDGMENT_KIND.COOP
      ? ` [${ATTRIBUTE_LABEL[choice.judgment.attribute]}]`
      : ''
  const cost =
    record.judgment.kind === JUDGMENT_KIND.HIDDEN
      ? ` (대가 +${GAME_CONFIG.hiddenJudgmentCostPercent}%)`
      : ''
  const roller = record.rollerSeat === null ? '' : ` · 판정자 ${ROLE_LABEL[record.rollerSeat]}`

  return `${JUDGMENT_LABEL[record.judgment.kind]}${attribute} · 기준 ${record.judgment.threshold}${roller}${cost}`
}

function diceLine(record: SimEventRecord, state: GameState): string {
  if (record.judgment === null) return '없음'

  const dice = record.judgment.dice
    .map((die) => `${ROLE_LABEL[die.seat]} ${die.value ?? '-'}${state.seats[die.seat].isBot ? '(봇)' : ''}`)
    .join(' · ')

  const values = record.judgment.dice
    .map((die) => die.value)
    .filter((value): value is number => value !== null)
  const base =
    record.judgment.kind === JUDGMENT_KIND.COOP
      ? Math.max(0, ...values)
      : (values[0] ?? 0)

  const parts = [`주사위 ${base}`]
  if (record.judgment.roleBonus !== 0) parts.push(`직업 ${signed(record.judgment.roleBonus)}`)
  if (record.judgment.teamModifierApplied !== 0) {
    parts.push(`팀 ${signed(record.judgment.teamModifierApplied)}`)
  }
  if (record.judgment.talismanBonus !== 0) parts.push(`부적 ${signed(record.judgment.talismanBonus)}`)

  const final =
    base +
    record.judgment.roleBonus +
    record.judgment.teamModifierApplied +
    record.judgment.talismanBonus

  return `${dice} → ${parts.join(' ')} = 최종값 ${final}`
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`
}

/** 개입까지 반영한 최종 성패. 개입이 없으면 최초 판정 그대로다 */
function finalOutcome(record: SimEventRecord): boolean | null {
  const last = record.interventions[record.interventions.length - 1]
  if (last !== undefined) return last.succeeded
  return record.judgment?.succeeded ?? null
}

function outcomeLabel(succeeded: boolean | null): string {
  if (succeeded === null) return '판정 없음'
  return succeeded ? '성공' : '실패'
}

function resultLine(record: SimEventRecord): string {
  if (record.judgment === null) return '판정 없음'

  const first = outcomeLabel(record.judgment.succeeded)
  const final = outcomeLabel(finalOutcome(record))
  const forced = record.interventions.some(
    (used) => used.kind === INTERVENTION_KIND.FORCE_SUCCESS,
  )

  const text = record.interventions.length === 0 ? final : `${first} → ${final}`
  if (record.judgment.kind === JUDGMENT_KIND.HIDDEN) {
    return `${text} — 비공개 판정이라 화면에는 "판정 완료"만 표시된다`
  }
  return forced ? `${text} (강제 성공)` : text
}

/** 개입 창 내역 — 수단마다 적용 전후 주사위와 재판정 최종값·성패를 한 줄로 적는다 (룰북 §7.2) */
function interventionLines(record: SimEventRecord): string[] {
  if (record.visitedSteps.includes(GAME_STEP.PRACTICE_INTERVENTION)) {
    return [row('개입', `연습 개입 창 (${GAME_CONFIG.practiceInterventionSeconds}초, 변화 없음)`)]
  }

  if (record.interventions.length === 0) {
    const realWindowSteps: GameStep[] = [
      GAME_STEP.INTERVENTION_REROLL,
      GAME_STEP.INTERVENTION_TALISMAN,
      GAME_STEP.INTERVENTION_FORCE,
    ]
    const opened = record.visitedSteps.some((step) => realWindowSteps.includes(step))
    return [row('개입', opened ? '창은 열렸으나 아무도 쓰지 않음' : '없음')]
  }

  return record.interventions.map((used, index) => {
    const who = `${ROLE_LABEL[used.seat]}${used.byBot ? '(봇)' : ''}`
    const means = INTERVENTION_LABEL[used.kind] ?? used.kind
    const dice =
      used.dieSeat === null || used.diceBefore === null
        ? ''
        : ` · ${ROLE_LABEL[used.dieSeat]} 주사위 ${used.diceBefore} → ${used.diceAfter ?? '-'}`
    const value = ` · 최종값 ${used.finalValueBefore} → ${used.finalValueAfter}`
    const verdict = ` · 기준 ${used.threshold} ${used.succeeded ? '성공' : '실패'}`

    return row(index === 0 ? '개입' : '', `${who} ${means}${dice}${value}${verdict}`)
  })
}

function seatLine(state: GameState): string {
  return SEAT_ORDER.map((role) => {
    const seat = state.seats[role]
    const items = [`부적 ${seat.talismanCount}`]
    if (seat.tutorialTalismanCount > 0) items.push(`튜토리얼 ${seat.tutorialTalismanCount}`)
    const bot = seat.isBot ? '(봇)' : ''
    return `${ROLE_LABEL[role]}${bot} ${seat.erosionPercent}% [${items.join(', ')}]`
  }).join(' · ')
}

function clockLine(record: SimEventRecord, state: GameState, now: number): string {
  const remaining = state.clock.deadlineAt - now
  const clock =
    remaining >= 0 ? `남은 ${formatDuration(remaining)}` : `초과 ${formatDuration(-remaining)}`
  const spent = `이벤트 소요 ${formatDuration(now - record.startedAt)}`
  const team = state.teamModifier === 0 ? '' : ` · 팀 플래그 ${signed(state.teamModifier)}`
  return `${clock} (${spent})${team}`
}

function formatEvent(
  record: SimEventRecord,
  state: GameState,
  index: number,
  total: number,
  now: number,
): string[] {
  return [
    `[이벤트 ${index}/${total}] ${record.title}`,
    row('투표', voteLine(record)),
    row('변이', variantLine(record)),
    row('판정', judgmentLine(record)),
    row('주사위', diceLine(record, state)),
    row('결과', resultLine(record)),
    ...interventionLines(record),
    row('좌석', seatLine(state)),
    ...(record.tutorialTalismanSeat === null
      ? []
      : [row('부적', `튜토리얼 부적 → ${ROLE_LABEL[record.tutorialTalismanSeat]} (T1 종료 시 소멸)`)]),
    row('시계', clockLine(record, state, now)),
    '',
  ]
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
