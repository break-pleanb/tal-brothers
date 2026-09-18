import { describe, expect, it } from 'vitest'
import {
  BROTHER_ROLE,
  EROSION_TIER,
  VARIANT_KIND,
  WHISPER_KIND,
} from 'tal-brothers-shared'
import type { VariantKind } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../../src/scenario/gameConfig'
import { findPhase1Event } from '../../../src/scenario/phase1Events'
import { hasJudgment } from '../../../src/scenario/scenarioTypes'
import type { ScenarioEvent } from '../../../src/scenario/scenarioTypes'
import { createStepOutput } from '../../../src/engine/engineTypes'
import { createSeededRng } from '../../../src/engine/random'
import { applyEffects } from '../../../src/engine/rules/effects'
import { pickFalseVariant } from '../../../src/engine/rules/variant'
import {
  T2_WHISPER_TARGET_EVENT_ID,
  TIER_LABEL,
  buildEntryWarningWhisper,
  buildTierWhisper,
  deliverPendingWhispers,
  pickWhisperSubject,
  rollTierWhisperTruth,
  shouldReceiveTierWhisper,
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

  applyEffects(
    state,
    succeeded ? choice.success : choice.failure,
    {
      rollerSeat: BROTHER_ROLE.THIRD,
      coopTopSeat: null,
      submitterSeat: null,
      eventId: 't2-2',
      nextEventId: null,
    },
    { now: NOW, rng: createSeededRng(3) },
    createStepOutput(),
  )
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

describe('잠식 구간 귓속말 (룰북 §13.4, §16)', () => {
  it('진실 귓속말은 대상의 실제 구간을 말한다', () => {
    const state = makeState()
    state.seats[BROTHER_ROLE.FIRST].erosionPercent = 65
    state.seats[BROTHER_ROLE.SECOND].erosionPercent = 65

    const whisper = buildTierWhisper(
      state,
      BROTHER_ROLE.THIRD,
      WHISPER_KIND.TIER_HALLUCINATION,
      true,
      createSeededRng(3),
      'p2-01',
    )

    expect(whisper.tier?.tier).toBe(EROSION_TIER.TIER60)
    expect(whisper.text).toContain(TIER_LABEL[EROSION_TIER.TIER60])
  })

  it('거짓 귓속말은 실제와 다른 구간을 말한다', () => {
    const state = makeState()
    state.seats[BROTHER_ROLE.FIRST].erosionPercent = 0
    state.seats[BROTHER_ROLE.SECOND].erosionPercent = 0

    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const whisper = buildTierWhisper(
        state,
        BROTHER_ROLE.THIRD,
        WHISPER_KIND.TIER_HALLUCINATION,
        false,
        createSeededRng(seed),
        'p2-01',
      )
      expect(whisper.tier?.tier, `seed ${seed}`).not.toBe(EROSION_TIER.NORMAL)
    }
  })

  it('귓속말 대상은 자기 자신이 아니다', () => {
    const state = makeState()
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const subject = pickWhisperSubject(BROTHER_ROLE.SECOND, createSeededRng(seed))
      expect(subject, `seed ${seed}`).not.toBe(BROTHER_ROLE.SECOND)
      expect(state.seats[subject]).toBeDefined()
    }
  })

  it('배신자는 100% 구간으로 말한다 (M2 계획 10절 4번)', () => {
    const state = makeState()
    state.seats[BROTHER_ROLE.FIRST].erosionPercent = 100
    state.seats[BROTHER_ROLE.FIRST].isTraitor = true
    state.seats[BROTHER_ROLE.SECOND].erosionPercent = 100
    state.seats[BROTHER_ROLE.SECOND].isTraitor = true

    const whisper = buildTierWhisper(
      state,
      BROTHER_ROLE.THIRD,
      WHISPER_KIND.TIER_HALLUCINATION,
      true,
      createSeededRng(1),
      'p2-01',
    )
    expect(whisper.tier?.tier).toBe(EROSION_TIER.TRAITOR)
  })
})

describe('티어 환청 발동 (룰북 §4.3)', () => {
  it('30% 미만에는 발동하지 않는다', () => {
    const rng = createSeededRng(1)
    for (const percent of [0, 10, 25, 29]) {
      expect(shouldReceiveTierWhisper(percent, rng), `${percent}%`).toBe(false)
    }
  })

  it('60% 이상은 확률 100%로 발동한다', () => {
    const rng = createSeededRng(1)
    for (const percent of [60, 75, 99]) {
      expect(shouldReceiveTierWhisper(percent, rng), `${percent}%`).toBe(true)
    }
  })

  it('100%(배신자) 구간은 티어 환청 대상이 아니다 (룰북 §4.3 표)', () => {
    expect(shouldReceiveTierWhisper(100, createSeededRng(1))).toBe(false)
  })

  it('30~59%는 설정값 확률로 발동한다', () => {
    const rng = createSeededRng(99)
    let hit = 0
    for (let i = 0; i < 4000; i += 1) {
      if (shouldReceiveTierWhisper(45, rng)) hit += 1
    }
    const ratio = (hit / 4000) * 100
    expect(Math.abs(ratio - GAME_CONFIG.tier30HallucinationChance)).toBeLessThan(3)
  })

  it('진실 비율이 설정값과 같다 (룰북 §4.3)', () => {
    const rng = createSeededRng(11)
    let truthful = 0
    for (let i = 0; i < 4000; i += 1) {
      if (rollTierWhisperTruth(rng)) truthful += 1
    }
    const ratio = (truthful / 4000) * 100
    expect(Math.abs(ratio - GAME_CONFIG.tier30TruthRatio)).toBeLessThan(3)
  })
})

describe('Phase 2 진입 경고 (룰북 §13.1)', () => {
  it('정보가 없는 서사 텍스트만 담는다', () => {
    const whisper = buildEntryWarningWhisper('branch')

    expect(whisper.kind).toBe(WHISPER_KIND.ENTRY_WARNING)
    expect(whisper.tier).toBeUndefined()
    expect(whisper.t2Variant).toBeUndefined()
    expect(whisper.receivedAtEventId).toBe('branch')
  })
})
