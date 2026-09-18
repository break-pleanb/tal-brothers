import { JUDGMENT_KIND } from 'tal-brothers-shared'
import type {
  AssetKey,
  ChoiceView,
  DisplaySnapshot,
  JudgmentView,
  NoticeView,
  Phase3View,
  PublicView,
  VoteView,
} from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'
import { BRANCH_SHRINE_BACKGROUND, BRANCH_SHRINE_CHOICE_ID } from '../../scenario/phase2Events'
import { hasAttribute, hasJudgment } from '../../scenario/scenarioTypes'
import type { Choice, ScenarioEvent } from '../../scenario/scenarioTypes'
import { SEAT_ORDER } from '../state/gameState'
import type { GameState, JudgmentState } from '../state/gameState'
import { findScenarioEvent, judgmentFinalValue } from '../steps/rollStep'

/**
 * Display 투영 (룰북 §17, 아키텍처 §7.3).
 *
 * 화이트리스트로 **새 객체를 만든다.** 상태를 복사한 뒤 지우는 방식은 쓰지 않는다.
 * 잠식도·인벤토리·귓속말·변이·투표자·배신자 여부는 어떤 경로로도 담지 않는다.
 */

/** 진행 중인 이벤트. 이벤트가 없는 단계(로비·엔딩 등)에서는 null */
export function currentEventOrNull(state: GameState): ScenarioEvent | null {
  const eventId = state.currentEvent?.eventId
  if (eventId === undefined) return null
  return findScenarioEvent(state, eventId) ?? null
}

/** 분기 B를 고르면 배경이 핏빛 사당으로 바뀐다 (룰북 §13.2) */
function backgroundOf(state: GameState, event: ScenarioEvent | null): AssetKey | null {
  if (event === null) return null
  if (state.currentEvent?.adoptedChoiceId === BRANCH_SHRINE_CHOICE_ID) {
    return BRANCH_SHRINE_BACKGROUND
  }
  return event.backgroundAsset
}

/**
 * 선택지 투영 (룰북 §6.4).
 * 문장과 판정 유형·속성 태그까지만 담는다. 성공 기준·보상·페널티는 담지 않는다.
 * 비공개 판정의 대가만 예외로 표기한다 (룰북 §5.4).
 */
export function projectChoice(choice: Choice): ChoiceView {
  if (!hasJudgment(choice)) {
    return {
      id: choice.id,
      text: choice.text,
      judgmentKind: null,
      attribute: null,
      hiddenCostPercent: null,
    }
  }

  return {
    id: choice.id,
    text: choice.text,
    judgmentKind: choice.judgment.kind,
    attribute: hasAttribute(choice.judgment) ? choice.judgment.attribute : null,
    hiddenCostPercent:
      choice.judgment.kind === JUDGMENT_KIND.HIDDEN
        ? GAME_CONFIG.hiddenJudgmentCostPercent
        : null,
  }
}

/** 투표 중에는 참여 인원 수만, 마감 후에는 득표 수만 (룰북 §8, 아키텍처 §8) */
function projectVote(state: GameState): VoteView | null {
  const current = state.currentEvent
  if (current === null) return null

  const participantCount = SEAT_ORDER.filter(
    (role) => !state.seats[role].isBot && current.votes[role] !== undefined,
  ).length

  if (current.adoptedChoiceId === null) {
    return { closed: false, participantCount, counts: null }
  }

  const counts: Record<string, number> = {}
  for (const role of SEAT_ORDER) {
    const choiceId = current.votes[role]
    if (choiceId === undefined) continue
    if (state.seats[role].isBot) continue
    counts[choiceId] = (counts[choiceId] ?? 0) + 1
  }
  return { closed: true, participantCount, counts }
}

/**
 * 판정 투영 (룰북 §5.4, §17).
 * 비공개 판정은 주사위·기준·성패를 모두 담지 않는다. 화면에는 "판정 완료"만 남는다.
 */
function projectJudgment(judgment: JudgmentState | null): JudgmentView | null {
  if (judgment === null) return null

  if (judgment.kind === JUDGMENT_KIND.HIDDEN) {
    return {
      kind: judgment.kind,
      contest: false,
      dice: null,
      opponentValue: null,
      finalValue: null,
      threshold: null,
      succeeded: null,
      forcedSuccess: false,
      interventions: [],
    }
  }

  const rolled = judgment.dice.some((die) => die.value !== null)
  return {
    kind: judgment.kind,
    // 대립이면 기준이 아니라 상대값을 넘어야 한다. 고정 기준 판정과 구분해 표기한다 (룰북 §14.3, §14.4)
    contest: judgment.contest,
    dice: judgment.dice.map((die) => ({ seat: die.seat, value: die.value })),
    opponentValue: judgment.opponentDie?.value ?? null,
    finalValue: rolled ? judgmentFinalValue(judgment) : null,
    // 기준은 주사위가 공개된 뒤에만 의미가 있다. 투표 화면에는 나가지 않는다 (룰북 §6.4)
    threshold: rolled ? judgment.threshold : null,
    succeeded: judgment.succeeded,
    forcedSuccess: judgment.forcedSuccess,
    interventions: judgment.interventions.map((record) => ({
      seat: record.seat,
      kind: record.kind,
      finalValueAfter: record.finalValueAfter,
    })),
  }
}

function projectNotices(state: GameState): NoticeView[] {
  return state.notices.map((notice) => ({ kind: notice.kind, text: notice.text }))
}

/** Phase 3 공개 정보 — 타겟과 옥비녀 이동은 Display에 공개한다 (룰북 §17) */
function projectPhase3(state: GameState): Phase3View | null {
  if (state.phase3 === null) return null
  return {
    targetSeat: state.phase3.targetSeat,
    jadeHairpinMovedTo: state.phase3.jadeHairpinMovedTo,
    route: state.phase3.route,
  }
}

/** Display와 좌석이 함께 받는 공개 항목 */
export function projectPublic(state: GameState): PublicView {
  const event = currentEventOrNull(state)

  return {
    stateVersion: state.meta.stateVersion,
    phase: state.progress.phase,
    step: state.progress.step,
    stepDeadlineAt: state.progress.stepDeadlineAt,
    clockDeadlineAt: state.clock.deadlineAt,
    background: backgroundOf(state, event),
    mask: event?.maskAsset ?? null,
    eventTitle: event?.title ?? null,
    narration: event?.narration ?? null,
    choices: event === null ? [] : event.choices.map(projectChoice),
    adoptedChoiceId: state.currentEvent?.adoptedChoiceId ?? null,
    vote: projectVote(state),
    judgment: projectJudgment(state.currentJudgment),
    notices: projectNotices(state),
    grabbedSeat: state.currentEvent?.grabbedSeat ?? null,
    phase3: projectPhase3(state),
    ending:
      state.ending === null
        ? null
        : { id: state.ending.id, narrationKey: state.ending.narrationKey },
  }
}

export function projectDisplay(state: GameState): DisplaySnapshot {
  return projectPublic(state)
}
