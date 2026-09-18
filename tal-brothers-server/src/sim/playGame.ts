import {
  ATTRIBUTE,
  BROTHER_ROLE,
  EROSION_TIER,
  GAME_STEP,
  JUDGMENT_KIND,
  PUBLIC_NOTICE_KIND,
  VARIANT_KIND,
  WHISPER_KIND,
} from 'tal-brothers-shared'
import type {
  Attribute,
  BrotherRole,
  ErosionTier,
  GamePhase,
  GameStep,
  JudgmentKind,
  VariantKind,
  WhisperKind,
} from 'tal-brothers-shared'

import { GAME_CONFIG } from '../scenario/gameConfig'
import { hasAttribute, hasJudgment } from '../scenario/scenarioTypes'
import { dispatch } from '../engine/dispatch'
import { ACTION_KIND, LOG_CODE } from '../engine/engineTypes'
import type { DispatchSuccess, LogEntry } from '../engine/engineTypes'
import { createSeededRng } from '../engine/random'
import { createGame, seatSetupForHumans } from '../engine/state/createGame'
import { BOT_SABOTAGE_KIND } from '../engine/bots/botPolicy'
import { INTERVENTION_KIND, SEAT_ORDER } from '../engine/state/gameState'
import type { GameState, InterventionRecord } from '../engine/state/gameState'
import { traitorOutcomeLabel } from '../engine/steps/endingStep'
import { findScenarioEvent } from '../engine/steps/rollStep'
import { DEFAULT_HUMAN_POLICY, planHumanInputs } from './humanPolicy'
import type { HumanPolicyConfig, PlannedInput } from './humanPolicy'

/**
 * 한 판을 엔딩까지 진행하는 가상 시계 루프 (로드맵 M2-7).
 *
 * - 인간 좌석 입력은 시드 기반 정책이 대신하고, **가상 입력 지연**을 거쳐 도착한다 (M2 계획 10.3)
 * - 시간은 가상 시계로 진행한다. 다음 입력 시각과 단계 마감 중 이른 쪽으로 시계를 옮긴다
 * - 투표 집계·개입처럼 한 처리 안에서 끝나는 값은 상태가 아니라 엔진 로그에서 읽는다
 */

export const ROLE_LABEL: Record<BrotherRole, string> = {
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

/**
 * Phase 3 판정 표기 (룰북 §14.3, §14.4).
 * 타겟이 인간 배신자일 때만 상대 D6와 겨루는 **대립**이고,
 * 봇이거나 배신자가 아닌 인간이면 **고정 기준** 판정이다.
 */
const CONTEST_THRESHOLD_LABEL = '고정 기준'

export const VARIANT_LABEL: Record<VariantKind, string> = {
  [VARIANT_KIND.ILL]: '흉',
  [VARIANT_KIND.PLAIN]: '평',
  [VARIANT_KIND.BLESS]: '길',
}

const INTERVENTION_LABEL: Record<string, string> = {
  [INTERVENTION_KIND.REROLL]: '재굴림',
  [INTERVENTION_KIND.TALISMAN]: '부적 +1',
  [INTERVENTION_KIND.FORCE_SUCCESS]: '강제 성공',
}

const WHISPER_LABEL: Record<string, string> = {
  [WHISPER_KIND.T2_VARIANT]: 'T2 귓속말',
  [WHISPER_KIND.EVENT_WHISPER]: '이벤트 귓속말',
  [WHISPER_KIND.TIER_HALLUCINATION]: '티어 환청',
  [WHISPER_KIND.SHRINE_FAIL]: '분기 실패 귓속말',
  [WHISPER_KIND.ENTRY_WARNING]: '진입 경고',
}

const TIER_LABEL: Record<string, string> = {
  [EROSION_TIER.NORMAL]: '0~29%',
  [EROSION_TIER.TIER30]: '30~59%',
  [EROSION_TIER.TIER60]: '60~99%',
  [EROSION_TIER.TRAITOR]: '100%',
}

/** 익명 표기의 실제 원인 (룰북 §5.5, §13.5) */
const ANONYMOUS_SOURCE_LABEL: Record<string, string> = {
  choiceEffect: '채택 선택지 결과',
  phase2Entry: 'Phase 2 진입 환청 — 부적 미보유',
  botSabotage: '봇 100% 방해',
  randomSeat: '14A 미제출 저주 — 무작위 대상',
}

/**
 * 좌석에만 전달된 귓속말 1건 (룰북 §16).
 * 진실 여부와 주장한 값은 서버만 아는 정보라 엔진 감사 로그에서만 읽을 수 있다.
 */
export type SimWhisper = {
  /** 수신 좌석 */
  seat: BrotherRole
  kind: WhisperKind
  /** 진입 경고는 정보가 없어 null */
  truthful: boolean | null
  /** 잠식 구간 귓속말이 말한 대상 좌석 */
  aboutSeat: BrotherRole | null
  claimedTier: ErosionTier | null
  /** T2 귓속말이 말한 이장 선택지 */
  choiceId: string | null
  claimedVariant: VariantKind | null
  text: string
}

/** 60~99% 좌석의 폰에만 표시되는 가짜 변이 라벨 (룰북 §4.3) */
export type SimFakeLabels = {
  seat: BrotherRole
  labels: Record<string, VariantKind>
}

/** Display에 출처 없이 나가는 표기와 실제 원인 (룰북 §5.5, §13.5, §17) */
export type SimAnonymousNotice = {
  /** Display 문구 */
  text: string
  /** 실제 원인·대상 좌석. 선택지 결과에서 온 것은 좌석이 없다 */
  seat: BrotherRole | null
  source: string
  detail: string
}

/** 부적 1건의 이동 — 획득·사용·회복·양도·폐기 (룰북 §9.1) */
export type SimTalismanMove = {
  seat: BrotherRole | null
  text: string
  /** 이동 직후의 보유 수. 좌석이 없는 이동(튜토리얼 부적 지급·소멸)에는 없다 */
  held: { talisman: number; overflow: number } | null
}

/** 이면의 형제 전환 (룰북 §10.1) */
export type SimTraitorTurn = {
  seat: BrotherRole
  /** 전환이 일어난 처리 지점 */
  during: string
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
  phase: GamePhase
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
    opponentValue: number | null
    contest: boolean
    roleBonus: number
    teamModifierApplied: number
    talismanBonus: number
    succeeded: boolean | null
  } | null
  interventions: SimIntervention[]
  /** 이 이벤트에서 좌석에 전달된 귓속말 (룰북 §16) */
  whispers: SimWhisper[]
  /** 이 이벤트의 좌석별 가짜 라벨 (룰북 §4.3) */
  fakeLabels: SimFakeLabels[]
  /** 가짜 붉은 메시지를 받은 좌석 (룰북 §4.3, §10.1) */
  fakeRedMessageSeats: BrotherRole[]
  /** 이 이벤트에서 이면의 형제가 된 좌석 (룰북 §10.1) */
  traitorTurns: SimTraitorTurn[]
  /** 익명 표기와 실제 원인 (룰북 §5.5, §13.5) */
  anonymousNotices: SimAnonymousNotice[]
  /** 부적 이동 (룰북 §9.1) */
  talismanMoves: SimTalismanMove[]
  visitedSteps: GameStep[]
}

export type GameRunOptions = {
  seed: number
  humans: number
  startedAt?: number
  /** 진행 상황 관찰용. 각 액션 처리 뒤에 불린다 */
  onStep?: (result: DispatchSuccess) => void
  /** 참이면 루프를 멈춘다 (Phase 1 전용 시뮬레이터가 쓴다) */
  stopWhen?: (state: GameState) => boolean
  policy?: Partial<HumanPolicyConfig>
  /** 사람이 읽는 이벤트 블록을 함께 만든다. 봇 자동 대전에서는 끈다 */
  withLines?: boolean
}

export type GameRunResult = {
  seed: number
  humans: number
  finalState: GameState
  events: SimEventRecord[]
  /** 판 전체의 엔진 로그. 봇 자동 대전 지표는 여기서 뽑는다 */
  logs: LogEntry[]
  /** `withLines`일 때만 채워진다 */
  lines: string[]
  startedAt: number
  endedAt: number
}

const MAX_ACTIONS = 4000

function snapshotEvent(state: GameState, index: number, now: number): SimEventRecord {
  const current = state.currentEvent
  if (current === null) throw new Error('현재 이벤트가 없다')
  const event = findScenarioEvent(state, current.eventId)

  return {
    index,
    eventId: current.eventId,
    title: event?.title ?? current.eventId,
    phase: state.progress.phase,
    startedAt: now,
    variants: { ...current.variants },
    tally: null,
    adoptedChoiceId: current.adoptedChoiceId,
    rollerSeat: current.rollerSeat,
    tutorialTalismanSeat:
      SEAT_ORDER.find((role) => state.seats[role].tutorialTalismanCount > 0) ?? null,
    judgment: null,
    interventions: [],
    whispers: [],
    fakeLabels: [],
    fakeRedMessageSeats: [],
    traitorTurns: [],
    anonymousNotices: [],
    talismanMoves: [],
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
      opponentValue: judgment.opponentDie?.value ?? null,
      contest: judgment.contest,
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

function seatOf(value: unknown): BrotherRole | null {
  return typeof value === 'string' ? (value as BrotherRole) : null
}

/** 부적 이동 1건을 기록한다. 보유 수는 **그 처리 직후** 값이라 이벤트 끝의 값과 다를 수 있다 */
function pushTalismanMove(
  record: SimEventRecord,
  state: GameState,
  seat: BrotherRole,
  text: string,
): void {
  const held = state.seats[seat]
  record.talismanMoves.push({
    seat,
    text,
    held: { talisman: held.talismanCount, overflow: held.talismanOverflow },
  })
}

/**
 * 한 번의 처리 안에서 끝나 상태로는 볼 수 없는 값을 로그에서 읽는다.
 *
 * 한 dispatch가 앞 이벤트의 결과 적용과 다음 이벤트의 진입을 이어서 처리하므로,
 * `eventId`가 붙은 로그는 그 이벤트의 기록으로 보낸다.
 * `eventId`가 없는 로그(부적 이동, 봇 방해 등)는 그 시점에 진행 중이던 기록에만 담는다.
 */
function readLogs(
  record: SimEventRecord,
  result: DispatchSuccess,
  includeUnscoped: boolean,
): void {
  for (const log of result.logs) {
    const data = log.data
    if (data === undefined) continue

    const scoped = data.eventId === record.eventId
    const unscoped = data.eventId === undefined || data.eventId === null
    if (!scoped && !(unscoped && includeUnscoped)) continue

    switch (log.code) {
      case LOG_CODE.VOTE_TALLIED: {
        record.adoptedChoiceId =
          data.adoptedChoiceId === null ? null : String(data.adoptedChoiceId)
        record.tally = {
          counts: { ...((data.counts ?? {}) as Record<string, number>) },
          earlyClosed: data.earlyClosed === true,
        }
        break
      }

      case LOG_CODE.INTERVENTION_USED: {
        const intervention = data.intervention as InterventionRecord
        record.interventions.push({
          ...intervention,
          threshold: Number(data.threshold),
          byBot: data.byBot === true,
        })
        if (intervention.kind === INTERVENTION_KIND.TALISMAN) {
          pushTalismanMove(
            record,
            result.state,
            intervention.seat,
            '판정 보정에 1개 사용 (개입 창 2단계)',
          )
        }
        break
      }

      case LOG_CODE.WHISPER_DELIVERED: {
        const seat = seatOf(data.seat)
        if (seat === null) break
        record.whispers.push({
          seat,
          kind: data.kind as WhisperKind,
          truthful: typeof data.truthful === 'boolean' ? data.truthful : null,
          aboutSeat: seatOf(data.aboutSeat),
          claimedTier: (data.claimedTier as ErosionTier | null) ?? null,
          choiceId: typeof data.choiceId === 'string' ? data.choiceId : null,
          claimedVariant: (data.claimedVariant as VariantKind | null) ?? null,
          text: String(data.text ?? ''),
        })
        break
      }

      case LOG_CODE.VARIANTS_DECIDED: {
        const seat = seatOf(data.seat)
        const labels = data.fakeLabels as Record<string, VariantKind> | undefined
        if (seat === null || labels === undefined) break
        record.fakeLabels.push({ seat, labels: { ...labels } })
        break
      }

      case LOG_CODE.FAKE_RED_MESSAGE: {
        const seat = seatOf(data.seat)
        if (seat !== null) record.fakeRedMessageSeats.push(seat)
        break
      }

      case LOG_CODE.TRAITOR_TURNED: {
        const seat = seatOf(data.seat)
        if (seat === null) break
        record.traitorTurns.push({
          seat,
          during: unscoped ? 'Phase 2 진입 환청' : '이벤트 진행 중',
        })
        break
      }

      case LOG_CODE.ANONYMOUS_NOTICE: {
        const source = String(data.source ?? '-')
        record.anonymousNotices.push({
          text: String(data.text ?? ''),
          seat: seatOf(data.seat),
          source,
          detail: anonymousDetail(data),
        })
        break
      }

      case LOG_CODE.TALISMAN_GAINED: {
        const seat = seatOf(data.seat)
        if (seat === null) break
        const stored = Number(data.stored ?? 0)
        const overflow = Number(data.overflow ?? 0)
        pushTalismanMove(
          record,
          result.state,
          seat,
          `획득 +${Number(data.count ?? 0)}개 (인벤토리 +${stored}${
            overflow > 0 ? `, 보류함 +${overflow}` : ''
          })`,
        )
        break
      }

      case LOG_CODE.TALISMAN_HEALED: {
        const seat = seatOf(data.seat)
        if (seat === null) break
        pushTalismanMove(
          record,
          result.state,
          seat,
          `회복에 1개 사용 (잠식 -${Number(data.healPercent ?? 0)}%)`,
        )
        break
      }

      case LOG_CODE.TALISMAN_OVERFLOW: {
        const seat = seatOf(data.seat)
        if (seat === null) break
        pushTalismanMove(record, result.state, seat, overflowText(data))
        break
      }

      case LOG_CODE.TALISMAN_SUBMITTED: {
        const seat = seatOf(data.seat)
        if (data.submitted !== true || seat === null) break
        pushTalismanMove(record, result.state, seat, '14A 제출로 1개 소모')
        break
      }

      case LOG_CODE.BOT_SABOTAGE: {
        // 팀 디버프는 익명 표기 로그가 따로 남으므로 여기서는 부적 소멸만 읽는다
        const seat = seatOf(data.seat)
        const victim = seatOf(data.victim)
        if (data.kind !== BOT_SABOTAGE_KIND.TALISMAN_BURN || victim === null) break
        pushTalismanMove(
          record,
          result.state,
          victim,
          `${seat === null ? '봇' : ROLE_LABEL[seat]}의 100% 방해로 1개 소멸`,
        )
        break
      }

      case LOG_CODE.TUTORIAL_TALISMAN_EXPIRED: {
        record.talismanMoves.push({ seat: null, text: String(log.message), held: null })
        break
      }

      default:
        break
    }
  }
}

/** 익명 표기 1건의 실제 내용 */
function anonymousDetail(data: Record<string, unknown>): string {
  if (data.notice === PUBLIC_NOTICE_KIND.ANONYMOUS_CURSE) {
    const delta = Number(data.deltaPercent ?? 0)
    return `잠식 ${delta >= 0 ? '+' : ''}${delta}%`
  }
  const delta = Number(data.delta ?? 0)
  return `팀 다음 판정 ${delta >= 0 ? '+' : ''}${delta}`
}

function overflowText(data: Record<string, unknown>): string {
  const toSeat = seatOf(data.toSeat)
  if (data.reason === 'transfer' && toSeat !== null) {
    return `보류함 1개를 ${ROLE_LABEL[toSeat]}에게 양도`
  }
  const discarded = Number(data.discarded ?? 1)
  if (data.reason === 'discard') return `보류함 ${discarded}개 버림`
  return `보류함 ${discarded}개 자동 폐기 (투표 마감)`
}

function isFinished(state: GameState): boolean {
  return state.progress.step === GAME_STEP.ENDING
}

/** 계획한 입력 중 가장 이른 것 */
function nextInput(pending: PlannedInput[], now: number): PlannedInput | null {
  let best: PlannedInput | null = null
  for (const input of pending) {
    const at = Math.max(input.at, now)
    if (best === null || at < Math.max(best.at, now)) best = input
  }
  return best
}

/** 같은 단계에 머무는 동안에는 입력 계획을 다시 짜지 않는다 */
function planKey(state: GameState): string {
  return [
    state.progress.phase,
    state.progress.step,
    state.progress.eventIndex,
    state.currentEvent?.eventId ?? '-',
    state.currentJudgment?.interventions.length ?? 0,
  ].join('|')
}

export function runGame(options: GameRunOptions): GameRunResult {
  const policy: HumanPolicyConfig = { ...DEFAULT_HUMAN_POLICY, ...options.policy }
  const engineRng = createSeededRng(options.seed)
  // 인간 정책은 별도 수열을 써서 엔진 난수와 섞이지 않게 한다
  const policyRng = createSeededRng(options.seed + 1)

  const startedAt = options.startedAt ?? Date.UTC(2026, 0, 1, 20, 0, 0)
  let now = startedAt
  let last: DispatchSuccess = createGame(
    { roomCode: 'SIM', seats: seatSetupForHumans(options.humans) },
    { now, rng: engineRng },
  )
  options.onStep?.(last)

  const events: SimEventRecord[] = []
  const logs: LogEntry[] = [...last.logs]
  const lines: string[] = []
  let record = snapshotEvent(last.state, 0, now)

  function closeRecord(state: GameState): void {
    events.push(record)
    if (options.withLines === true) {
      lines.push(...formatEvent(record, state, events.length, now))
    }
  }

  function observe(result: DispatchSuccess): void {
    logs.push(...result.logs)
    // 진행 중이던 기록이 먼저 자기 로그를 가져간다 (eventId 없는 로그 포함)
    readLogs(record, result, true)

    const eventId = result.state.currentEvent?.eventId
    if (eventId === undefined) return

    if (eventId !== record.eventId) {
      closeRecord(result.state)
      record = snapshotEvent(result.state, events.length, now)
      // 같은 처리 안에서 다음 이벤트 진입까지 끝난 경우, 새 이벤트의 로그를 이어 담는다
      readLogs(record, result, false)
      return
    }
    updateRecord(record, result.state)
  }

  let pending: PlannedInput[] = []
  let plannedKey: string | null = null

  for (let guard = 0; guard < MAX_ACTIONS; guard += 1) {
    if (isFinished(last.state)) break
    if (options.stopWhen?.(last.state) === true) break

    const key = planKey(last.state)
    if (key !== plannedKey) {
      plannedKey = key
      pending = planHumanInputs(last.state, policyRng, now, policy)
    }

    const deadline = last.nextDeadline
    const input = nextInput(pending, now)
    const useInput =
      input !== null && (deadline === null || Math.max(input.at, now) <= deadline.at)

    if (useInput && input !== null) {
      pending = pending.filter((candidate) => candidate !== input)
      now = Math.max(input.at, now)
      const result = dispatch(
        last.state,
        { kind: ACTION_KIND.COMMAND, seat: input.seat, command: input.command },
        { now, rng: engineRng },
      )
      // 거절된 명령은 조용히 버린다 (조기 마감 뒤에 도착한 표 등)
      if (!result.rejected) {
        last = result
        observe(result)
        options.onStep?.(result)
      }
      continue
    }

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
    observe(result)
    options.onStep?.(result)
  }

  // 마지막 이벤트 기록은 루프가 어디서 끝나도 한 번만 확정한다
  if (events[events.length - 1] !== record) {
    closeRecord(last.state)
  }

  return {
    seed: options.seed,
    humans: options.humans,
    finalState: last.state,
    events,
    logs,
    lines,
    startedAt,
    endedAt: now,
  }
}

// ── 출력 ─────────────────────────────────────────────────────────────

/** 한글을 2칸으로 세어 라벨 폭을 맞춘다 */
function padLabel(label: string, columns: number): string {
  let width = 0
  for (const char of label) {
    width += char.charCodeAt(0) > 0x2e80 ? 2 : 1
  }
  return label + ' '.repeat(Math.max(1, columns - width))
}

export function row(label: string, value: string): string {
  return `  ${padLabel(label, 12)}${value}`
}

/** 밀리초를 `3분 30초` 꼴로 적는다 */
export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}초`
  if (seconds === 0) return `${minutes}분`
  return `${minutes}분 ${seconds}초`
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`
}

function eventOf(state: GameState, eventId: string) {
  return findScenarioEvent(state, eventId)
}

function voteLine(record: SimEventRecord, state: GameState): string {
  const event = eventOf(state, record.eventId)
  if (event === undefined) return '알 수 없음'
  if (event.skipVoting) return '생략 (선택지 1개)'

  const counts = record.tally?.counts ?? {}
  const tally = event.choices
    .map((choice) => `${choice.text} ${counts[choice.id] ?? 0}표`)
    .join(' · ')
  const adopted = event.choices.find((choice) => choice.id === record.adoptedChoiceId)
  const closing = record.tally?.earlyClosed === true ? '조기 마감' : '마감 시각 만료'

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

function judgmentLine(record: SimEventRecord, state: GameState): string {
  if (record.judgment === null) return '없음 (판정 없는 선택지)'

  const event = eventOf(state, record.eventId)
  const choice = event?.choices.find((candidate) => candidate.id === record.adoptedChoiceId)
  const attribute =
    choice !== undefined && hasJudgment(choice) && hasAttribute(choice.judgment)
      ? ` [${ATTRIBUTE_LABEL[choice.judgment.attribute]}]`
      : ''
  const cost =
    record.judgment.kind === JUDGMENT_KIND.HIDDEN
      ? ` (대가 +${GAME_CONFIG.hiddenJudgmentCostPercent}%)`
      : ''
  const roller = record.rollerSeat === null ? '' : ` · 판정자 ${ROLE_LABEL[record.rollerSeat]}`

  // 대립은 상대값을 넘어야 하고(동점은 배신자 승), 고정 기준은 기준 이상이면 성공이다
  const contestKind = record.judgment.kind === JUDGMENT_KIND.CONTEST
  const label =
    contestKind && !record.judgment.contest
      ? CONTEST_THRESHOLD_LABEL
      : JUDGMENT_LABEL[record.judgment.kind]
  const criterion = record.judgment.contest
    ? ` · 상대 주사위 ${record.judgment.opponentValue ?? '-'} 초과`
    : ` · 기준 ${record.judgment.threshold}`

  return `${label}${attribute}${criterion}${roller}${cost}`
}

function diceLine(record: SimEventRecord, state: GameState): string {
  if (record.judgment === null) return '없음'

  const dice = record.judgment.dice
    .map(
      (die) =>
        `${ROLE_LABEL[die.seat]} ${die.value ?? '-'}${state.seats[die.seat].isBot ? '(봇)' : ''}`,
    )
    .join(' · ')

  const values = record.judgment.dice
    .map((die) => die.value)
    .filter((value): value is number => value !== null)
  const base =
    record.judgment.kind === JUDGMENT_KIND.COOP || record.judgment.kind === JUDGMENT_KIND.CONTEST
      ? Math.max(0, ...values)
      : (values[0] ?? 0)

  const parts = [`주사위 ${base}`]
  if (record.judgment.roleBonus !== 0) parts.push(`직업 ${signed(record.judgment.roleBonus)}`)
  if (record.judgment.teamModifierApplied !== 0) {
    parts.push(`팀 ${signed(record.judgment.teamModifierApplied)}`)
  }
  if (record.judgment.talismanBonus !== 0) {
    parts.push(`부적 ${signed(record.judgment.talismanBonus)}`)
  }

  const final =
    base +
    record.judgment.roleBonus +
    record.judgment.teamModifierApplied +
    record.judgment.talismanBonus

  return `${dice} → ${parts.join(' ')} = 최종값 ${final}`
}

/** 개입까지 반영한 최종 성패 */
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
    // 대립 판정은 기준이 아니라 상대값을 넘어야 한다 (룰북 §14.3, §14.4)
    const criterion =
      record.judgment?.contest === true
        ? `상대 ${record.judgment.opponentValue ?? '-'} 초과`
        : `기준 ${used.threshold}`
    const verdict = ` · ${criterion} ${used.succeeded ? '성공' : '실패'}`

    return row(index === 0 ? '개입' : '', `${who} ${means}${dice}${value}${verdict}`)
  })
}

/** 귓속말 — 수신 좌석·내용·진실 여부를 좌석별로 적는다 (룰북 §16) */
function whisperLines(record: SimEventRecord): string[] {
  return record.whispers.map((whisper, index) => {
    const kind = WHISPER_LABEL[whisper.kind] ?? whisper.kind
    const truth =
      whisper.truthful === null ? '정보 없음' : whisper.truthful ? '진실' : '거짓'

    let content = whisper.text
    if (whisper.aboutSeat !== null && whisper.claimedTier !== null) {
      content = `${ROLE_LABEL[whisper.aboutSeat]}의 잠식은 ${TIER_LABEL[whisper.claimedTier]} 구간`
    } else if (whisper.choiceId !== null && whisper.claimedVariant !== null) {
      content = `${whisper.choiceId}의 기운은 ${VARIANT_LABEL[whisper.claimedVariant]}`
    }

    return row(
      index === 0 ? '귓속말' : '',
      `${ROLE_LABEL[whisper.seat]} ← ${kind} · ${content} [${truth}]`,
    )
  })
}

/** 가짜 라벨 — 그 좌석의 폰에 보이는 값과 실제 값을 나란히 적는다 (룰북 §4.3) */
function fakeLabelLines(record: SimEventRecord): string[] {
  return record.fakeLabels.map((entry, index) => {
    const shown = Object.entries(entry.labels)
      .map(([choiceId, fake]) => {
        const actual = record.variants[choiceId]
        const actualText = actual === undefined ? '-' : VARIANT_LABEL[actual]
        return `${choiceId} ${VARIANT_LABEL[fake]}(실제 ${actualText})`
      })
      .join(' · ')
    return row(index === 0 ? '가짜 라벨' : '', `${ROLE_LABEL[entry.seat]} — ${shown}`)
  })
}

/** 가짜 붉은 메시지 — 진짜 전환과 cue가 같아 로그로만 구분된다 (룰북 §4.3, §10.1) */
function fakeRedMessageLines(record: SimEventRecord): string[] {
  if (record.fakeRedMessageSeats.length === 0) return []
  const seats = record.fakeRedMessageSeats.map((seat) => ROLE_LABEL[seat]).join(' · ')
  return [row('붉은 메시지', `${seats} — 가짜 (진짜 전환과 같은 연출)`)]
}

/** 익명 표기 — Display 문구와 서버만 아는 실제 원인 (룰북 §5.5, §13.5, §17) */
function anonymousLines(record: SimEventRecord): string[] {
  return record.anonymousNotices.map((notice, index) => {
    const source = ANONYMOUS_SOURCE_LABEL[notice.source] ?? notice.source
    const who = notice.seat === null ? '' : `${ROLE_LABEL[notice.seat]} · `
    return row(
      index === 0 ? '익명 표기' : '',
      `Display "${notice.text}" ← 실제 ${who}${source} (${notice.detail})`,
    )
  })
}

/** 이면의 형제 전환 (룰북 §10.1) */
function traitorLines(record: SimEventRecord): string[] {
  return record.traitorTurns.map((turn, index) =>
    row(
      index === 0 ? '배신자' : '',
      `${ROLE_LABEL[turn.seat]} 잠식 100% 도달 → 이면의 형제 전환 (${turn.during})`,
    ),
  )
}

/** 부적 이동 — 획득·사용·회복·양도·폐기 (룰북 §9.1) */
function talismanLines(record: SimEventRecord): string[] {
  const moves: SimTalismanMove[] = [...record.talismanMoves]
  if (record.tutorialTalismanSeat !== null) {
    // 튜토리얼 부적은 본게임 인벤토리와 따로 세므로 보유 수를 붙이지 않는다 (룰북 §9.2)
    moves.unshift({
      seat: null,
      text: `튜토리얼 부적 1개 → ${ROLE_LABEL[record.tutorialTalismanSeat]} (T1 종료 시 소멸)`,
      held: null,
    })
  }

  return moves.map((move, index) => {
    if (move.seat === null || move.held === null) {
      return row(index === 0 ? '부적' : '', move.text)
    }
    const after = ` → 보유 ${move.held.talisman}${
      move.held.overflow > 0 ? `, 보류 ${move.held.overflow}` : ''
    }`
    return row(index === 0 ? '부적' : '', `${ROLE_LABEL[move.seat]} ${move.text}${after}`)
  })
}

function seatLine(state: GameState): string {
  return SEAT_ORDER.map((role) => {
    const seat = state.seats[role]
    const items = [`부적 ${seat.talismanCount}`]
    if (seat.talismanOverflow > 0) items.push(`보류 ${seat.talismanOverflow}`)
    if (seat.tutorialTalismanCount > 0) items.push(`튜토리얼 ${seat.tutorialTalismanCount}`)
    if (seat.hasJadeHairpin) items.push('옥비녀')
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

const PHASE_LABEL: Record<GamePhase, string> = {
  phase1: 'Phase 1',
  phase2: 'Phase 2',
  phase3: 'Phase 3',
}

/** 이벤트 1개를 사람이 읽을 블록으로 만든다 */
export function formatEvent(
  record: SimEventRecord,
  state: GameState,
  index: number,
  now: number,
): string[] {
  return [
    `[이벤트 ${index}] ${record.title} (${PHASE_LABEL[record.phase]})`,
    row('투표', voteLine(record, state)),
    row('변이', variantLine(record)),
    row('판정', judgmentLine(record, state)),
    row('주사위', diceLine(record, state)),
    row('결과', resultLine(record)),
    ...interventionLines(record),
    ...anonymousLines(record),
    ...talismanLines(record),
    ...whisperLines(record),
    ...fakeLabelLines(record),
    ...fakeRedMessageLines(record),
    ...traitorLines(record),
    row('좌석', seatLine(state)),
    row('시계', clockLine(record, state, now)),
    '',
  ]
}

// ── CLI ──────────────────────────────────────────────────────────────

export function parseGameArgs(argv: string[]): { seed: number; humans: number } {
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
  if (!Number.isInteger(humans) || humans < 0 || humans > SEAT_ORDER.length) {
    throw new Error(`--humans는 0~${SEAT_ORDER.length} 사이의 정수여야 한다`)
  }
  return { seed, humans }
}

/** 한 판 전체를 사람이 읽는 형식으로 출력한다 */
export function formatRun(run: GameRunResult): string[] {
  const ending = run.finalState.ending
  return [
    `# 한 판 시뮬레이션 — seed ${run.seed}, 인간 ${run.humans}명`,
    '',
    ...run.lines,
    `엔딩: ${ending?.id ?? '없음'} (배신자 ${traitorOutcomeLabel(ending?.traitorWon ?? null)})`,
    row('소요', formatDuration(run.endedAt - run.startedAt)),
    row('좌석', seatLine(run.finalState)),
  ]
}

function gameMain(): void {
  const { seed, humans } = parseGameArgs(process.argv.slice(2))
  const run = runGame({ seed, humans, withLines: true })
  console.log(formatRun(run).join('\n'))
}

// tsx로 직접 실행할 때만 CLI로 동작한다
if (process.argv[1] !== undefined && process.argv[1].includes('playGame')) {
  gameMain()
}
