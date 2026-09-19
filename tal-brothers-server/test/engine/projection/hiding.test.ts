import { describe, expect, it } from 'vitest'
import {
  BROTHER_ROLE,
  CUE_KIND,
  GAME_PHASE,
  GAME_STEP,
  JUDGMENT_KIND,
  SEAT_CONNECTION,
  VARIANT_KIND,
} from 'tal-brothers-shared'
import { WHISPER_KIND } from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../../src/scenario/gameConfig'
import { enterStep, finishDispatch } from '../../../src/engine/dispatch'
import { createStepOutput } from '../../../src/engine/engineTypes'
import type { Rng } from '../../../src/engine/random'
import { projectDisplay } from '../../../src/engine/projection/projectDisplay'
import { projectSeat } from '../../../src/engine/projection/projectSeat'
import { redMessageCue } from '../../../src/engine/rules/traitor'
import { createGame, seatSetupForHumans } from '../../../src/engine/state/createGame'
import { SEAT_ORDER } from '../../../src/engine/state/gameState'
import type { GameState } from '../../../src/engine/state/gameState'

/** 은닉 테스트 (M2 계획 7.2, 룰북 §17, 아키텍처 §7.3) */

const START = 1_700_000_000_000
const LOW: Rng = { nextInt: () => 0 }

/** 중첩 객체의 모든 키를 모은다 */
function allKeys(value: unknown, keys: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) allKeys(item, keys)
    return keys
  }
  if (value === null || typeof value !== 'object') return keys

  for (const [key, child] of Object.entries(value)) {
    keys.add(key)
    allKeys(child, keys)
  }
  return keys
}

function newState(humans = 3): GameState {
  const created = createGame(
    { roomCode: 'TEST', seats: seatSetupForHumans(humans) },
    { now: START, rng: LOW },
  )
  return created.state
}

/** Phase 2의 특정 이벤트 상황 제시 상태를 만든다 */
function phase2State(eventId: string, before?: (state: GameState) => void): GameState {
  const state = newState()
  state.progress.phase = GAME_PHASE.PHASE_2
  state.progress.eventOrder = [eventId, 'p2-02']
  state.progress.eventIndex = 0
  state.currentEvent = null
  state.currentJudgment = null
  for (const role of SEAT_ORDER) state.seats[role].tutorialTalismanCount = 0
  before?.(state)

  const out = createStepOutput()
  enterStep(state, GAME_STEP.EVENT_INTRO, { now: START, rng: LOW }, out)
  finishDispatch(state, out)
  return state
}

describe('Display 투영 (룰북 §17)', () => {
  it('잠식도·인벤토리·귓속말·변이 필드를 담지 않는다', () => {
    const state = phase2State('p2-01', (draft) => {
      draft.seats[BROTHER_ROLE.FIRST].erosionPercent = 65
      draft.seats[BROTHER_ROLE.FIRST].talismanCount = 2
      draft.seats[BROTHER_ROLE.SECOND].whispers.push({
        kind: WHISPER_KIND.TIER_HALLUCINATION,
        text: 'MARKER-SECOND-WHISPER',
        receivedAtEventId: 'p2-01',
      })
    })

    const snapshot = projectDisplay(state)
    const keys = allKeys(snapshot)

    for (const forbidden of [
      'erosionPercent',
      'talismanCount',
      'talismanOverflow',
      'hasJadeHairpin',
      'whispers',
      'variantLabels',
      'variants',
      'fakeLabels',
      'isTraitor',
      'seats',
      'votes',
    ]) {
      expect(keys.has(forbidden), forbidden).toBe(false)
    }
    expect(JSON.stringify(snapshot)).not.toContain('MARKER-SECOND-WHISPER')
  })

  it('Phase 3 타겟과 옥비녀 이동은 공개한다 (룰북 §17)', () => {
    const state = newState(2)
    state.progress.phase = GAME_PHASE.PHASE_2
    state.seats[BROTHER_ROLE.SECOND].erosionPercent = 100
    state.seats[BROTHER_ROLE.SECOND].isTraitor = true
    state.seats[BROTHER_ROLE.SECOND].hasJadeHairpin = true
    state.currentEvent = null

    const out = createStepOutput()
    enterStep(state, GAME_STEP.P3_TARGETING, { now: START, rng: LOW }, out)

    const snapshot = projectDisplay(state)
    expect(snapshot.phase3?.targetSeat).toBe(BROTHER_ROLE.SECOND)
    expect(snapshot.phase3?.jadeHairpinMovedTo).not.toBeNull()
  })

  it('익명 디버프·저주에 출처 좌석이 들어가지 않는다 (룰북 §5.5, §13.5)', () => {
    const state = phase2State('p2-01')
    state.notices.push({ kind: 'anonymousModifier', text: '누군가의 불길한 기운 -1' })
    state.notices.push({ kind: 'anonymousCurse', text: '누군가 탈 조각의 저주를 받았다' })

    const notices = projectDisplay(state).notices
    for (const notice of notices) {
      for (const role of SEAT_ORDER) {
        expect(notice.text, notice.kind).not.toContain(role)
      }
    }
  })
})

describe('좌석 투영 (룰북 §16, §17)', () => {
  it('다른 좌석의 잠식도·인벤토리·귓속말이 들어가지 않는다', () => {
    const state = phase2State('p2-01', (draft) => {
      draft.seats[BROTHER_ROLE.FIRST].erosionPercent = 15
      draft.seats[BROTHER_ROLE.SECOND].erosionPercent = 85
      draft.seats[BROTHER_ROLE.SECOND].talismanCount = 2
      draft.seats[BROTHER_ROLE.SECOND].whispers.push({
        kind: WHISPER_KIND.EVENT_WHISPER,
        text: 'MARKER-SECOND-WHISPER',
        receivedAtEventId: 'p2-01',
      })
    })

    const snapshot = projectSeat(state, BROTHER_ROLE.FIRST)

    expect(snapshot.erosionPercent).toBe(15)
    expect(snapshot.talismanCount).toBe(0)
    expect(snapshot.whispers).toEqual([])
    expect(JSON.stringify(snapshot)).not.toContain('MARKER-SECOND-WHISPER')
    expect(allKeys(snapshot).has('seats')).toBe(false)
  })

  it('어떤 투영에도 isTraitor가 없다 (룰북 §10.2)', () => {
    const state = phase2State('p2-01', (draft) => {
      draft.seats[BROTHER_ROLE.FIRST].isTraitor = true
      draft.seats[BROTHER_ROLE.FIRST].erosionPercent = 100
    })

    expect(allKeys(projectDisplay(state)).has('isTraitor')).toBe(false)
    for (const role of SEAT_ORDER) {
      expect(allKeys(projectSeat(state, role)).has('isTraitor'), role).toBe(false)
    }
  })

  it('본인이 받은 귓속말만 담고 진실 여부는 담지 않는다', () => {
    const state = phase2State('p2-01', (draft) => {
      draft.seats[BROTHER_ROLE.THIRD].whispers.push({
        kind: WHISPER_KIND.TIER_HALLUCINATION,
        text: '속삭임 — 첫째의 잠식은 60~99% 구간이다.',
        receivedAtEventId: 'p2-01',
        tier: { aboutSeat: BROTHER_ROLE.FIRST, tier: 'tier60' },
      })
    })

    const snapshot = projectSeat(state, BROTHER_ROLE.THIRD)
    expect(snapshot.whispers).toHaveLength(1)
    expect(Object.keys(snapshot.whispers[0] ?? {})).toEqual(['kind', 'text'])
  })
})

describe('변이 라벨 (룰북 §3.4, §6.4, §10.2)', () => {
  it('0~29% 좌석은 라벨을 받지 못한다', () => {
    const state = phase2State('p2-01')
    expect(projectSeat(state, BROTHER_ROLE.THIRD).variantLabels).toBeNull()
  })

  it('배신자는 항상 실제 변이를 본다', () => {
    const state = phase2State('p2-01', (draft) => {
      draft.seats[BROTHER_ROLE.FIRST].isTraitor = true
      draft.seats[BROTHER_ROLE.FIRST].erosionPercent = 100
    })

    expect(projectSeat(state, BROTHER_ROLE.FIRST).variantLabels).toEqual(
      state.currentEvent?.variants,
    )
  })

  it('60~99% 좌석의 가짜 라벨은 두 번 투영해도 같다 (아키 §2 원칙 4)', () => {
    const state = phase2State('p2-01', (draft) => {
      draft.seats[BROTHER_ROLE.FIRST].erosionPercent = 60
    })

    const labels = state.currentEvent?.fakeLabels[BROTHER_ROLE.FIRST]
    expect(labels).toBeDefined()

    const first = projectSeat(state, BROTHER_ROLE.FIRST).variantLabels
    const second = projectSeat(state, BROTHER_ROLE.FIRST).variantLabels
    expect(first).toEqual(second)
    expect(first).toEqual(labels)
    // 실제 변이와는 다르다
    expect(first).not.toEqual(state.currentEvent?.variants)
  })

  it('셋째는 60% 이상이어도 절대 시야를 쓰면 진짜를 본다', () => {
    const state = phase2State('p2-01', (draft) => {
      draft.seats[BROTHER_ROLE.THIRD].erosionPercent = 60
    })
    const current = state.currentEvent
    if (current === null) throw new Error('현재 이벤트가 없다')

    // 가짜 라벨이 이미 저장돼 있어도 능력이 우선한다 (룰북 §3.4)
    current.fakeLabels[BROTHER_ROLE.THIRD] = {
      'p2-01-a': VARIANT_KIND.PLAIN,
      'p2-01-b': VARIANT_KIND.PLAIN,
      'p2-01-c': VARIANT_KIND.PLAIN,
    }
    current.trueSightUsed = true

    expect(projectSeat(state, BROTHER_ROLE.THIRD).variantLabels).toEqual(
      state.currentEvent?.variants,
    )
  })
})

describe('판정과 투표 (룰북 §5.4, §6.4, §8)', () => {
  it('비공개 판정은 Display와 판정자 모두 주사위·기준·성패를 받지 못한다', () => {
    const state = phase2State('p2-02')
    if (state.currentEvent !== null) state.currentEvent.adoptedChoiceId = 'p2-02-a'
    state.currentJudgment = {
      kind: JUDGMENT_KIND.HIDDEN,
      threshold: 4,
      dice: [{ seat: BROTHER_ROLE.THIRD, value: 5 }],
      opponentDie: null,
      contest: false,
      teamSeats: [],
      roleBonus: 1,
      teamModifierApplied: 0,
      talismanBonus: 0,
      succeeded: true,
      forcedSuccess: false,
      isPractice: false,
      talismanUsedThisJudgment: false,
      botTalismanDecided: false,
      interventions: [],
    }

    for (const snapshot of [projectDisplay(state), projectSeat(state, BROTHER_ROLE.THIRD)]) {
      expect(snapshot.judgment?.dice).toBeNull()
      expect(snapshot.judgment?.threshold).toBeNull()
      expect(snapshot.judgment?.succeeded).toBeNull()
      expect(snapshot.judgment?.finalValue).toBeNull()
    }
  })

  it('비공개 판정의 대가 표기는 모든 투영에 남는다 (수치 비공개의 유일한 예외)', () => {
    const state = phase2State('p2-02')

    for (const snapshot of [projectDisplay(state), projectSeat(state, BROTHER_ROLE.FIRST)]) {
      const hidden = snapshot.choices.find((choice) => choice.id === 'p2-02-a')
      expect(hidden?.hiddenCostPercent).toBe(GAME_CONFIG.hiddenJudgmentCostPercent)
      expect(hidden?.judgmentKind).toBe(JUDGMENT_KIND.HIDDEN)
    }
  })

  it('시나리오 수치가 선택지 투영에 들어가지 않는다 (아키 §2 원칙 2)', () => {
    const state = phase2State('p2-01')
    const snapshot = projectDisplay(state)

    for (const choice of snapshot.choices) {
      expect(Object.keys(choice).sort()).toEqual([
        'attribute',
        'hiddenCostPercent',
        'id',
        'judgmentKind',
        'text',
      ])
    }
    // 투표 중에는 판정 자체가 없으므로 기준도 나가지 않는다
    expect(snapshot.judgment).toBeNull()
  })

  it('투표 중에는 참여 인원 수만, 마감 후에는 득표 수만 나간다', () => {
    const state = phase2State('p2-01')
    const current = state.currentEvent
    if (current === null) throw new Error('현재 이벤트가 없다')

    current.votes[BROTHER_ROLE.FIRST] = 'p2-01-a'
    const during = projectDisplay(state)
    expect(during.vote).toEqual({ closed: false, participantCount: 1, counts: null })

    current.votes[BROTHER_ROLE.SECOND] = 'p2-01-a'
    current.adoptedChoiceId = 'p2-01-a'
    const closed = projectDisplay(state)
    expect(closed.vote?.closed).toBe(true)
    expect(closed.vote?.counts).toEqual({ 'p2-01-a': 2 })

    // 투표자는 끝까지 나가지 않는다
    expect(JSON.stringify(closed.vote)).not.toContain(BROTHER_ROLE.FIRST)
  })

  it('좌석 투영은 본인 선택만 알려준다', () => {
    const state = phase2State('p2-01')
    const current = state.currentEvent
    if (current === null) throw new Error('현재 이벤트가 없다')

    current.votes[BROTHER_ROLE.FIRST] = 'p2-01-a'
    current.votes[BROTHER_ROLE.SECOND] = 'p2-01-b'

    expect(projectSeat(state, BROTHER_ROLE.FIRST).myVote).toBe('p2-01-a')
    expect(projectSeat(state, BROTHER_ROLE.THIRD).myVote).toBeNull()
  })
})

describe('붉은 메시지 (룰북 §10.1, 아키 §7.2)', () => {
  it('진짜와 가짜가 같은 형식·문장·표시 시간을 쓴다', () => {
    const real = redMessageCue(BROTHER_ROLE.FIRST)
    const fake = redMessageCue(BROTHER_ROLE.FIRST)

    expect(real.kind).toBe(CUE_KIND.RED_MESSAGE)
    expect(real).toEqual(fake)
    expect(real.data).toEqual({ durationSeconds: GAME_CONFIG.redMessageSeconds })
  })
})

describe('좌석 주인과 연결 상태 (룰북 §17, M3 계획 8.4)', () => {
  it('Display·좌석 투영 어디에도 userId가 없다', () => {
    const state = newState(3)
    state.seats[BROTHER_ROLE.FIRST].userId = 'MARKER-USER-ID'
    state.seats[BROTHER_ROLE.FIRST].displayName = '첫째 플레이어'

    const display = JSON.stringify(projectDisplay(state))
    expect(display).not.toContain('MARKER-USER-ID')
    expect(allKeys(projectDisplay(state))).not.toContain('userId')

    for (const role of SEAT_ORDER) {
      const snapshot = projectSeat(state, role)
      expect(JSON.stringify(snapshot)).not.toContain('MARKER-USER-ID')
      expect(allKeys(snapshot)).not.toContain('userId')
    }
  })

  it('좌석 투영에 다른 좌석의 연결 상태가 없다', () => {
    const state = newState(3)
    state.seats[BROTHER_ROLE.THIRD].connection = {
      status: SEAT_CONNECTION.DISCONNECTED,
      disconnectedAt: START,
    }

    const snapshot = projectSeat(state, BROTHER_ROLE.FIRST)
    // 본인 것만 실린다. 값이 하나뿐이라 다른 좌석의 상태를 읽을 수 없다
    expect(snapshot.connection).toBe(SEAT_CONNECTION.CONNECTED)
    expect(allKeys(snapshot)).not.toContain('seatConnections')
  })
})
