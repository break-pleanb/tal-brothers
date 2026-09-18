import {
  BROTHER_ROLE,
  COMMAND_TYPE,
  CUE_KIND,
  GAME_PHASE,
  GAME_STEP,
  JUDGMENT_KIND,
  PUBLIC_NOTICE_KIND,
} from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'
import { botTalismanUser, shouldBotForceSuccess, shouldBotReroll } from '../bots/botPolicy'
import type { StepHandler } from '../dispatch'
import { CUE_AUDIENCE, LOG_CODE, REJECTION_REASON, reject } from '../engineTypes'
import type { EngineContext, Rejection, StepOutput } from '../engineTypes'
import { rollD6 } from '../random'
import { applySeatErosion } from '../rules/erosion'
import { INTERVENTION_KIND } from '../state/gameState'
import type { GameState, InterventionKind, InterventionRecord, JudgmentState } from '../state/gameState'
import {
  baseDiceValue,
  currentScenarioEvent,
  evaluateJudgment,
  judgmentFinalValue,
} from './rollStep'

/**
 * 개입 창 (룰북 §7) + 연습 개입 창 (룰북 §12).
 *
 * - 공개 판정이 실패했을 때만 열린다. 순서는 둘째 재굴림 → 낡은 부적 → 첫째 강제 성공, 각 4초
 * - 각 단계의 수단이 쓰이면 곧바로 재판정한다. 성공으로 바뀌면 창을 즉시 종료한다 (§7.2)
 * - 부적 단계는 보유자가 없어도 스킵하지 않는다 (§7.3)
 * - 튜토리얼 성공 시에는 단일 12초 연습 창이 열리고, 입력은 설명만 띄우며 상태를 바꾸지 않는다 (§12)
 */

function requireJudgment(state: GameState): JudgmentState {
  if (state.currentJudgment === null) throw new Error('진행 중인 판정이 없다')
  return state.currentJudgment
}

function usedKind(judgment: JudgmentState, kind: string): boolean {
  return judgment.interventions.some((record) => record.kind === kind)
}

/**
 * 개입 1건을 판정에 기록한다 (룰북 §7.2).
 * 적용 전후 주사위와 재판정 최종값·성패를 함께 남겨, 로그만 보고 룰을 검산할 수 있게 한다.
 * 호출 시점에는 수단이 이미 판정에 반영돼 있어야 한다.
 */
function recordIntervention(
  judgment: JudgmentState,
  entry: {
    step: GameStepValue
    seat: BrotherRole
    kind: InterventionKind
    dieSeat?: BrotherRole
    diceBefore?: number | null
    diceAfter?: number | null
    finalValueBefore: number
  },
): InterventionRecord {
  const record: InterventionRecord = {
    step: entry.step,
    seat: entry.seat,
    kind: entry.kind,
    dieSeat: entry.dieSeat ?? null,
    diceBefore: entry.diceBefore ?? null,
    diceAfter: entry.diceAfter ?? null,
    finalValueBefore: entry.finalValueBefore,
    finalValueAfter: judgmentFinalValue(judgment),
    succeeded: evaluateJudgment(judgment),
  }
  judgment.interventions.push(record)
  return record
}

/**
 * 개입 로그에 실을 구조화된 값.
 * 이벤트 전환과 같은 처리 안에서 개입이 끝나면 상태로는 관찰할 수 없으므로 로그에도 남긴다.
 */
function interventionLogData(
  draft: GameState,
  judgment: JudgmentState,
  record: InterventionRecord,
  byBot: boolean,
): Record<string, unknown> {
  return {
    eventId: draft.currentEvent?.eventId ?? null,
    threshold: judgment.threshold,
    byBot,
    intervention: record,
  }
}

/** 개입 후 재판정. 성공으로 바뀌면 `RESOLUTION`, 아니면 다음 단계로 (룰북 §7.2) */
function reevaluate(
  draft: GameState,
  judgment: JudgmentState,
  nextStep: GameStepValue,
  out: StepOutput,
): void {
  judgment.succeeded = evaluateJudgment(judgment)
  out.next = judgment.succeeded ? GAME_STEP.RESOLUTION : nextStep
}

type GameStepValue = (typeof GAME_STEP)[keyof typeof GAME_STEP]

// ── 1단계: 둘째 재굴림 ────────────────────────────────────────────────

/**
 * 둘째가 다시 굴릴 주사위 (룰북 §3.3, §14.2).
 * 개인은 유일 주사위, 협동은 본인 주사위.
 * 대립 판정은 팀 측 주사위에만 쓰므로 B-1은 옥비녀 보유자의 주사위, A-2는 본인 주사위다.
 */
function rerollTargetDie(judgment: JudgmentState) {
  if (judgment.kind === JUDGMENT_KIND.CONTEST) {
    if (judgment.dice.length === 1) return judgment.dice[0]
    return judgment.dice.find((die) => die.seat === BROTHER_ROLE.SECOND)
  }
  if (judgment.kind === JUDGMENT_KIND.COOP) {
    return judgment.dice.find((die) => die.seat === BROTHER_ROLE.SECOND)
  }
  return judgment.dice[0]
}

function applyReroll(
  draft: GameState,
  context: EngineContext,
  out: StepOutput,
  isTutorial: boolean,
  byBot: boolean,
): boolean {
  const judgment = requireJudgment(draft)
  const die = rerollTargetDie(judgment)
  if (die === undefined) return false

  const finalValueBefore = judgmentFinalValue(judgment)
  const before = die.value
  die.value = rollD6(context.rng)
  const record = recordIntervention(judgment, {
    step: GAME_STEP.INTERVENTION_REROLL,
    seat: BROTHER_ROLE.SECOND,
    kind: INTERVENTION_KIND.REROLL,
    dieSeat: die.seat,
    diceBefore: before,
    diceAfter: die.value,
    finalValueBefore,
  })

  // T1·T2 중 사용은 횟수를 소모하지 않는다. 봇 좌석도 같다 (룰북 §3.5)
  if (!isTutorial) {
    draft.seats[BROTHER_ROLE.SECOND].abilityUsed = true
  }

  draft.notices.push({
    kind: PUBLIC_NOTICE_KIND.ABILITY_USED,
    text: '둘째가 재굴림을 사용했다',
  })
  out.cues.push({
    kind: CUE_KIND.INTERVENTION_USED,
    audience: CUE_AUDIENCE.DISPLAY,
    text: `둘째 재굴림 ${before ?? '-'} → ${die.value}`,
  })
  out.logs.push({
    at: context.now,
    code: LOG_CODE.INTERVENTION_USED,
    message: `둘째${byBot ? '(봇)' : ''} 재굴림 ${before ?? '-'} → ${die.value} (최종값 ${
      record.finalValueBefore
    } → ${record.finalValueAfter}, 기준 ${judgment.threshold} ${
      record.succeeded ? '성공' : '실패'
    })`,
    data: interventionLogData(draft, judgment, record, byBot),
  })
  return true
}

export const INTERVENTION_REROLL_HANDLER: StepHandler = {
  enter(draft, context, out) {
    const judgment = requireJudgment(draft)
    const event = currentScenarioEvent(draft)
    const second = draft.seats[BROTHER_ROLE.SECOND]

    // 능력을 이미 썼거나 이번 판정에 쓸 수 없으면 조기 스킵 (룰북 §7.3, §14.2)
    if (
      second.abilityUsed ||
      usedKind(judgment, INTERVENTION_KIND.REROLL) ||
      rerollTargetDie(judgment) === undefined
    ) {
      out.logs.push({
        at: context.now,
        code: LOG_CODE.INTERVENTION_SKIPPED,
        message: '둘째 단계 조기 스킵 (능력 사용 완료)',
      })
      out.next = GAME_STEP.INTERVENTION_TALISMAN
      return
    }

    draft.progress.stepDeadlineAt = context.now + GAME_CONFIG.interventionRerollSeconds * 1000

    // 둘째가 봇이면 진입 즉시 판단한다 (룰북 §11)
    if (shouldBotReroll(draft, judgment, baseDiceValue(judgment))) {
      applyReroll(draft, context, out, event.isTutorial, true)
      reevaluate(draft, judgment, GAME_STEP.INTERVENTION_TALISMAN, out)
    }
  },

  command(draft, context, out, seat, command): Rejection | undefined {
    if (command.type !== COMMAND_TYPE.INTERVENTION_REROLL) {
      return reject(REJECTION_REASON.WRONG_STEP, command.type)
    }
    if (seat !== BROTHER_ROLE.SECOND) {
      return reject(REJECTION_REASON.WRONG_SEAT, '재굴림은 둘째만 쓴다')
    }

    const judgment = requireJudgment(draft)
    if (usedKind(judgment, INTERVENTION_KIND.REROLL)) {
      return reject(REJECTION_REASON.NOT_ALLOWED, '이 판정에서 이미 재굴림을 썼다')
    }
    // 대립 판정에서 팀 측에 본인 주사위가 없으면 쓸 수 없다 (룰북 §14.2, §14.5)
    if (rerollTargetDie(judgment) === undefined) {
      return reject(REJECTION_REASON.NOT_ALLOWED, '다시 굴릴 팀 측 주사위가 없다')
    }
    if (draft.seats[seat].abilityUsed) {
      return reject(REJECTION_REASON.NOT_ALLOWED, '고유 능력을 이미 썼다')
    }

    applyReroll(draft, context, out, currentScenarioEvent(draft).isTutorial, false)
    reevaluate(draft, judgment, GAME_STEP.INTERVENTION_TALISMAN, out)
    return undefined
  },

  timeout(_draft, _context, out) {
    out.next = GAME_STEP.INTERVENTION_TALISMAN
  },
}

// ── 2단계: 낡은 부적 +1 ───────────────────────────────────────────────

/**
 * 부적 1개를 소모한다 (룰북 §7.4, §9.2).
 * 실전 창에서는 튜토리얼 부적도 실제로 소모된다. 튜토리얼 부적을 먼저 쓴다.
 */
function consumeTalisman(draft: GameState, seat: BrotherRole): boolean {
  const holder = draft.seats[seat]
  if (holder.tutorialTalismanCount > 0) {
    holder.tutorialTalismanCount -= 1
    return true
  }
  if (holder.talismanCount > 0) {
    holder.talismanCount -= 1
    return true
  }
  return false
}

function applyTalisman(
  draft: GameState,
  context: EngineContext,
  out: StepOutput,
  seat: BrotherRole,
  byBot: boolean,
): boolean {
  const judgment = requireJudgment(draft)
  if (!consumeTalisman(draft, seat)) return false

  // 최종값 +1. 협동 판정은 현재 최고값 주사위에 걸리므로 주사위 순위는 바뀌지 않는다
  const finalValueBefore = judgmentFinalValue(judgment)
  judgment.talismanBonus += 1
  judgment.talismanUsedThisJudgment = true
  const record = recordIntervention(judgment, {
    step: GAME_STEP.INTERVENTION_TALISMAN,
    seat,
    kind: INTERVENTION_KIND.TALISMAN,
    finalValueBefore,
  })

  draft.notices.push({
    kind: PUBLIC_NOTICE_KIND.TALISMAN_USED,
    text: `${seat}가 낡은 부적을 사용했다`,
  })
  out.cues.push({
    kind: CUE_KIND.INTERVENTION_USED,
    audience: CUE_AUDIENCE.DISPLAY,
    text: `${seat} 부적 +1`,
  })
  out.logs.push({
    at: context.now,
    code: LOG_CODE.INTERVENTION_USED,
    message: `${seat}${byBot ? '(봇)' : ''} 부적 +1 (최종값 ${record.finalValueBefore} → ${
      record.finalValueAfter
    }, 기준 ${judgment.threshold} ${record.succeeded ? '성공' : '실패'})`,
    data: interventionLogData(draft, judgment, record, byBot),
  })
  return true
}

export const INTERVENTION_TALISMAN_HANDLER: StepHandler = {
  enter(draft, context, out) {
    const judgment = requireJudgment(draft)
    judgment.botTalismanDecided = false

    // 스킵 금지. 보유자가 아무도 없어도 4초 대기한다 (룰북 §7.3)
    const deadline = context.now + GAME_CONFIG.interventionTalismanSeconds * 1000
    draft.progress.stepDeadlineAt = deadline
    // 봇은 마감 1초 전에 판단한다 (룰북 §11 확정)
    out.timerAt = deadline - GAME_CONFIG.botTalismanDelaySeconds * 1000
  },

  command(draft, context, out, seat, command): Rejection | undefined {
    if (command.type !== COMMAND_TYPE.INTERVENTION_TALISMAN) {
      return reject(REJECTION_REASON.WRONG_STEP, command.type)
    }

    const judgment = requireJudgment(draft)
    // 서버에 먼저 도달한 1명만 적용하고, 나머지 부적은 소모되지 않는다 (룰북 §7.4)
    if (judgment.talismanUsedThisJudgment) {
      return reject(REJECTION_REASON.NOT_ALLOWED, '이 판정의 부적은 이미 적용됐다')
    }

    const holder = draft.seats[seat]
    if (holder.talismanCount + holder.tutorialTalismanCount < 1) {
      return reject(REJECTION_REASON.NOT_ALLOWED, '부적이 없다')
    }

    applyTalisman(draft, context, out, seat, false)
    reevaluate(draft, judgment, GAME_STEP.INTERVENTION_FORCE, out)
    return undefined
  },

  timeout(draft, context, out) {
    const judgment = requireJudgment(draft)

    // 첫 만료: 마감 1초 전의 봇 판단
    if (!judgment.botTalismanDecided) {
      judgment.botTalismanDecided = true

      const user = botTalismanUser(draft, judgment, judgmentFinalValue(judgment))
      if (user !== null && applyTalisman(draft, context, out, user, true)) {
        reevaluate(draft, judgment, GAME_STEP.INTERVENTION_FORCE, out)
        return
      }

      // 아무도 쓰지 않았으면 남은 1초는 인간 보유자에게 남겨 둔다
      out.timerAt =
        (draft.progress.stepDeadlineAt ?? context.now) + GAME_CONFIG.inputGraceMs
      return
    }

    // 두 번째 만료: 단계 마감
    out.next = GAME_STEP.INTERVENTION_FORCE
  },
}

// ── 3단계: 첫째 강제 성공 ─────────────────────────────────────────────

/** 첫째가 이 판정에 강제 성공을 쓸 수 있는지 (룰북 §3.2, §14.2) */
export function canForceSuccess(draft: GameState): boolean {
  const judgment = requireJudgment(draft)
  const first = draft.seats[BROTHER_ROLE.FIRST]

  if (first.abilityUsed) return false
  if (judgment.forcedSuccess) return false
  // Phase 3 전체에서 사용 불가 (룰북 §14.2)
  if (draft.progress.phase === GAME_PHASE.PHASE_3) return false
  // 본인 판정, 비공개 판정, 14A 아이템 사용에는 쓸 수 없다 (룰북 §3.2)
  if (judgment.kind === JUDGMENT_KIND.HIDDEN) return false
  if (judgment.kind === JUDGMENT_KIND.ITEM) return false
  if (draft.currentEvent?.rollerSeat === BROTHER_ROLE.FIRST) return false
  return true
}

export const INTERVENTION_FORCE_HANDLER: StepHandler = {
  enter(draft, context, out) {
    const event = currentScenarioEvent(draft)

    if (!canForceSuccess(draft)) {
      // 튜토리얼에서는 조기 스킵하지 않고 설명용으로 4초를 유지한다 (룰북 §12 우선)
      if (event.isTutorial) {
        draft.progress.stepDeadlineAt = context.now + GAME_CONFIG.interventionForceSeconds * 1000
        out.cues.push({
          kind: CUE_KIND.FORCE_SUCCESS_EXPLAIN,
          audience: BROTHER_ROLE.FIRST,
          text: '형제의 판정이 실패했을 때 이렇게 성공으로 바꿀 수 있다',
        })
        out.logs.push({
          at: context.now,
          code: LOG_CODE.INTERVENTION_SKIPPED,
          message: '첫째 단계 설명 표시 (튜토리얼, 스킵 없음)',
        })
        return
      }

      out.logs.push({
        at: context.now,
        code: LOG_CODE.INTERVENTION_SKIPPED,
        message: '첫째 단계 조기 스킵 (사용 불가)',
      })
      out.next = GAME_STEP.RESOLUTION
      return
    }

    draft.progress.stepDeadlineAt = context.now + GAME_CONFIG.interventionForceSeconds * 1000

    // 첫째 봇은 보스 이벤트 실패 시에만 쓴다 → Phase 1에서는 사용하지 않는다 (룰북 §11)
    if (draft.seats[BROTHER_ROLE.FIRST].isBot && shouldBotForceSuccess(event.isBoss)) {
      applyForceSuccess(draft, context, out, event.isTutorial)
      out.next = GAME_STEP.RESOLUTION
    }
  },

  command(draft, context, out, seat, command): Rejection | undefined {
    if (command.type !== COMMAND_TYPE.INTERVENTION_FORCE_SUCCESS) {
      return reject(REJECTION_REASON.WRONG_STEP, command.type)
    }
    if (seat !== BROTHER_ROLE.FIRST) {
      return reject(REJECTION_REASON.WRONG_SEAT, '강제 성공은 첫째만 쓴다')
    }
    if (!canForceSuccess(draft)) {
      return reject(REJECTION_REASON.NOT_ALLOWED, '이 판정에는 강제 성공을 쓸 수 없다')
    }

    applyForceSuccess(draft, context, out, currentScenarioEvent(draft).isTutorial)
    out.next = GAME_STEP.RESOLUTION
    return undefined
  },

  timeout(_draft, _context, out) {
    out.next = GAME_STEP.RESOLUTION
  },
}

function applyForceSuccess(
  draft: GameState,
  context: EngineContext,
  out: StepOutput,
  isTutorial: boolean,
): void {
  const judgment = requireJudgment(draft)
  const first = draft.seats[BROTHER_ROLE.FIRST]

  // 본인 잠식도 +15%. 튜토리얼에서도 대가는 적용한다 (룰북 §3.2, §3.5)
  applySeatErosion(draft, BROTHER_ROLE.FIRST, GAME_CONFIG.forceSuccessCostPercent, context, out)
  if (!isTutorial) {
    first.abilityUsed = true
  }

  const finalValueBefore = judgmentFinalValue(judgment)
  judgment.forcedSuccess = true
  judgment.succeeded = true
  const record = recordIntervention(judgment, {
    step: GAME_STEP.INTERVENTION_FORCE,
    seat: BROTHER_ROLE.FIRST,
    kind: INTERVENTION_KIND.FORCE_SUCCESS,
    finalValueBefore,
  })

  draft.notices.push({
    kind: PUBLIC_NOTICE_KIND.ABILITY_USED,
    text: '첫째가 자신의 영혼을 깎아 형제를 구원합니다',
  })
  out.cues.push({
    kind: CUE_KIND.INTERVENTION_USED,
    audience: CUE_AUDIENCE.DISPLAY,
    text: '첫째 강제 성공',
  })
  out.logs.push({
    at: context.now,
    code: LOG_CODE.INTERVENTION_USED,
    message: `첫째 강제 성공 (최종값 ${record.finalValueBefore}, 기준 ${
      judgment.threshold
    }, 잠식 +${GAME_CONFIG.forceSuccessCostPercent}%)`,
    data: interventionLogData(draft, judgment, record, false),
  })
}

// ── 연습 개입 창 (단일 12초) ──────────────────────────────────────────

const PRACTICE_COMMANDS: string[] = [
  COMMAND_TYPE.INTERVENTION_REROLL,
  COMMAND_TYPE.INTERVENTION_TALISMAN,
  COMMAND_TYPE.INTERVENTION_FORCE_SUCCESS,
]

export const PRACTICE_INTERVENTION_HANDLER: StepHandler = {
  enter(draft, context, _out) {
    requireJudgment(draft).isPractice = true
    draft.progress.stepDeadlineAt =
      context.now + GAME_CONFIG.practiceInterventionSeconds * 1000
  },

  command(_draft, context, out, seat, command): Rejection | undefined {
    if (!PRACTICE_COMMANDS.includes(command.type)) {
      return reject(REJECTION_REASON.WRONG_STEP, command.type)
    }

    // 효과는 설명 팝업으로만 보여준다. 부적·능력 횟수·잠식도 모두 불변 (룰북 §12)
    out.cues.push({
      kind: CUE_KIND.PRACTICE_EXPLAIN,
      audience: seat,
      text: `연습: ${command.type}은 실전에서 이렇게 쓴다`,
    })
    out.logs.push({
      at: context.now,
      code: LOG_CODE.INTERVENTION_SKIPPED,
      message: `연습 개입 창 입력 ${command.type} (상태 변화 없음)`,
    })
    return undefined
  },

  timeout(_draft, _context, out) {
    out.next = GAME_STEP.RESOLUTION
  },
}
