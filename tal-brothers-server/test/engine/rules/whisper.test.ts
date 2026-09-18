import { describe, expect, it } from 'vitest'
import { BROTHER_ROLE, VARIANT_KIND } from 'tal-brothers-shared'
import type { VariantKind } from 'tal-brothers-shared'

import { findPhase1Event } from '../../../src/scenario/phase1Events'
import { WHISPER_KIND } from '../../../src/scenario/constants/whisperKind'
import { hasJudgment } from '../../../src/scenario/scenarioTypes'
import type { ScenarioEvent } from '../../../src/scenario/scenarioTypes'
import { createSeededRng } from '../../../src/engine/random'
import { applyEffects } from '../../../src/engine/rules/effects'
import {
  T2_WHISPER_TARGET_EVENT_ID,
  deliverPendingWhispers,
  pickFalseVariant,
} from '../../../src/engine/rules/whisper'
import { createGame, seatSetupForHumans } from '../../../src/engine/state/createGame'
import type { GameState } from '../../../src/engine/state/gameState'

const NOW = 1_700_000_000_000

function makeState(): GameState {
  const result = createGame(
    { roomCode: 'TEST', seats: seatSetupForHumans(3) },
    { now: NOW, rng: createSeededRng(1) },
  )
  if (result.rejected) throw new Error('게임 생성 실패')
  return result.state
}

function chiefEvent(): ScenarioEvent {
  const event = findPhase1Event('villageChief')
  if (event === undefined) throw new Error('villageChief')
  return event
}

/** t2-2-a의 성공/실패 효과를 적용해 귓속말을 예약한다 */
function scheduleT2Whisper(state: GameState, succeeded: boolean): void {
  const choice = findPhase1Event('t2-2')?.choices.find((candidate) => candidate.id === 't2-2-a')
  if (choice === undefined || !hasJudgment(choice)) throw new Error('t2-2-a')

  applyEffects(state, succeeded ? choice.success : choice.failure, {
    rollerSeat: BROTHER_ROLE.THIRD,
    coopTopSeat: null,
    eventId: 't2-2',
  })
}

const VARIANTS_FIXTURE: Record<string, VariantKind> = {
  'chief-a': VARIANT_KIND.ILL,
  'chief-b': VARIANT_KIND.PLAIN,
  'chief-c': VARIANT_KIND.BLESS,
}

describe('T2 귓속말 예약 (룰북 §12, §16)', () => {
  it('성공은 진실, 실패는 거짓으로 판정 직후 확정 저장한다', () => {
    const success = makeState()
    scheduleT2Whisper(success, true)
    expect(success.pendingWhispers).toEqual([
      {
        kind: WHISPER_KIND.T2_VARIANT,
        targetSeat: BROTHER_ROLE.THIRD,
        truthful: true,
        deliverAtEventId: T2_WHISPER_TARGET_EVENT_ID,
      },
    ])

    const failure = makeState()
    scheduleT2Whisper(failure, false)
    expect(failure.pendingWhispers[0]?.truthful).toBe(false)
  })

  it('예약 시점에는 아직 수신 좌석에 저장되지 않는다', () => {
    const state = makeState()
    scheduleT2Whisper(state, true)
    expect(state.seats[BROTHER_ROLE.THIRD].whispers).toEqual([])
  })
})

describe('T2 귓속말 발송 (룰북 §12)', () => {
  it('이장 이벤트가 아니면 발송하지 않는다', () => {
    const state = makeState()
    scheduleT2Whisper(state, true)

    const t2 = findPhase1Event('t2-2')
    if (t2 === undefined) throw new Error('t2-2')
    const delivered = deliverPendingWhispers(state, t2, {}, createSeededRng(3))

    expect(delivered).toEqual([])
    expect(state.pendingWhispers).toHaveLength(1)
  })

  it('이장 변이 결정 직후 내용을 만들어 발송하고 예약을 비운다', () => {
    const state = makeState()
    scheduleT2Whisper(state, true)

    const delivered = deliverPendingWhispers(
      state,
      chiefEvent(),
      VARIANTS_FIXTURE,
      createSeededRng(3),
    )

    expect(delivered).toHaveLength(1)
    expect(state.pendingWhispers).toEqual([])
    expect(state.seats[BROTHER_ROLE.THIRD].whispers).toHaveLength(1)
    expect(state.notices.some((notice) => notice.kind === 'whisperSent')).toBe(true)
  })

  it('진실이면 이장 선택지 1개의 실제 변이와 일치한다', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const state = makeState()
      scheduleT2Whisper(state, true)
      deliverPendingWhispers(state, chiefEvent(), VARIANTS_FIXTURE, createSeededRng(seed))

      const whisper = state.seats[BROTHER_ROLE.THIRD].whispers[0]
      const payload = whisper?.t2Variant
      if (payload === undefined) throw new Error('귓속말 내용이 없다')
      expect(payload.variant).toBe(VARIANTS_FIXTURE[payload.choiceId])
    }
  })

  it('거짓이면 실제 변이를 제외한 나머지 두 값 중 하나다', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const state = makeState()
      scheduleT2Whisper(state, false)
      deliverPendingWhispers(state, chiefEvent(), VARIANTS_FIXTURE, createSeededRng(seed))

      const payload = state.seats[BROTHER_ROLE.THIRD].whispers[0]?.t2Variant
      if (payload === undefined) throw new Error('귓속말 내용이 없다')

      const actual = VARIANTS_FIXTURE[payload.choiceId]
      expect(payload.variant).not.toBe(actual)
      expect(Object.values(VARIANT_KIND)).toContain(payload.variant)
    }
  })

  it('귓속말은 수신 좌석에만 저장되고 다른 좌석에는 남지 않는다 (룰북 §17)', () => {
    const state = makeState()
    scheduleT2Whisper(state, true)
    deliverPendingWhispers(state, chiefEvent(), VARIANTS_FIXTURE, createSeededRng(3))

    expect(state.seats[BROTHER_ROLE.THIRD].whispers).toHaveLength(1)
    expect(state.seats[BROTHER_ROLE.FIRST].whispers).toEqual([])
    expect(state.seats[BROTHER_ROLE.SECOND].whispers).toEqual([])
  })

  it('저장된 귓속말에는 진실 여부가 들어 있지 않다 (룰북 §17)', () => {
    const state = makeState()
    scheduleT2Whisper(state, false)
    deliverPendingWhispers(state, chiefEvent(), VARIANTS_FIXTURE, createSeededRng(3))

    const whisper = state.seats[BROTHER_ROLE.THIRD].whispers[0]
    expect(whisper).toBeDefined()
    expect(Object.keys(whisper ?? {}).sort()).toEqual([
      'kind',
      'receivedAtEventId',
      't2Variant',
      'text',
    ])
  })
})

describe('거짓 변이 선택', () => {
  it('실제 변이를 제외한 두 값 중에서만 고른다', () => {
    const rng = createSeededRng(77)
    for (let i = 0; i < 60; i += 1) {
      const picked = pickFalseVariant(VARIANT_KIND.PLAIN, rng)
      expect(picked).not.toBe(VARIANT_KIND.PLAIN)
      expect([VARIANT_KIND.ILL, VARIANT_KIND.BLESS]).toContain(picked)
    }
  })
})
