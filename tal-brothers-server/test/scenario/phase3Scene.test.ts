import { describe, expect, it } from 'vitest'
import { ASSET_KEY, ENDING_ID, GAME_PHASE, JUDGMENT_KIND, PHASE3_ROUTE } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../src/scenario/gameConfig'
import {
  ENDING_NARRATION_KEY,
  ENDING_NARRATIONS,
  ENDINGS,
  endingOf,
} from '../../src/scenario/endings'
import {
  PHASE3_CHOICE_ID,
  PHASE3_EVENT_ID,
  PHASE3_SCENE,
  buildPhase3Event,
} from '../../src/scenario/phase3Scene'
import { hasJudgment } from '../../src/scenario/scenarioTypes'

/** 룰북 §14·§15의 Phase 3·엔딩 데이터 무결성 (M2 계획 9절) */

describe('Phase 3 장면 구성 (룰북 §14)', () => {
  it('옥비녀가 있으면 B-1 한 개 선택지로 투표를 생략한다 (룰북 §14.1, §14.3)', () => {
    const scene = buildPhase3Event({ purifyRoute: true, soloTargetIsSelf: false })

    expect(scene.id).toBe(PHASE3_EVENT_ID)
    expect(scene.phase).toBe(GAME_PHASE.PHASE_3)
    expect(scene.choices.map((choice) => choice.id)).toEqual([PHASE3_CHOICE_ID.PURIFY])
    expect(scene.skipVoting).toBe(true)
  })

  it('A 루트는 A-1과 A-2 두 선택지를 투표에 올린다 (룰북 §14.4)', () => {
    const scene = buildPhase3Event({ purifyRoute: false, soloTargetIsSelf: false })

    expect(scene.choices.map((choice) => choice.id)).toEqual([
      PHASE3_CHOICE_ID.BAIT,
      PHASE3_CHOICE_ID.BREAK,
    ])
    expect(scene.skipVoting).toBe(false)
  })

  it('1인 플레이에서 본인이 타겟이면 A-1이 빠지고 A-2 문장이 바뀐다 (룰북 §14.5)', () => {
    const scene = buildPhase3Event({ purifyRoute: false, soloTargetIsSelf: true })

    expect(scene.choices.map((choice) => choice.id)).toEqual([PHASE3_CHOICE_ID.BREAK])
    expect(scene.choices[0]?.text).toBe('마지막 이성을 쥐어짜내며, 형제들이 나를 제압하도록 둔다')

    const normal = buildPhase3Event({ purifyRoute: false, soloTargetIsSelf: false })
    const normalBreak = normal.choices.find((choice) => choice.id === PHASE3_CHOICE_ID.BREAK)
    expect(normalBreak?.text).toBe('마지막 힘으로 형제를 물리치고 탈출한다')
  })

  it('B-1은 기준 4로 옥비녀 보유자가, A-2는 기준 5로 타겟 제외 전원이 굴린다 (룰북 §14.3, §14.4)', () => {
    const purify = buildPhase3Event({ purifyRoute: true, soloTargetIsSelf: false }).choices[0]
    const brk = buildPhase3Event({ purifyRoute: false, soloTargetIsSelf: false }).choices[1]

    if (purify === undefined || !hasJudgment(purify)) throw new Error('B-1을 찾지 못했다')
    if (brk === undefined || !hasJudgment(brk)) throw new Error('A-2를 찾지 못했다')
    if (purify.judgment.kind !== JUDGMENT_KIND.CONTEST) throw new Error('B-1은 대립 판정이다')
    if (brk.judgment.kind !== JUDGMENT_KIND.CONTEST) throw new Error('A-2는 대립 판정이다')

    expect(purify.judgment.threshold).toBe(GAME_CONFIG.thresholdBase)
    expect(purify.judgment.teamDice).toBe('jadeHolder')
    expect(purify.judgment.route).toBe(PHASE3_ROUTE.PURIFY)

    expect(brk.judgment.threshold).toBe(GAME_CONFIG.thresholdHard)
    expect(brk.judgment.teamDice).toBe('allExceptTarget')
    expect(brk.judgment.route).toBe(PHASE3_ROUTE.BREAK)
  })

  it('A-1은 판정이 없고 변이와 환경 잠식을 쓰지 않는다 (룰북 §6.3, §14.2, §14.4)', () => {
    const bait = PHASE3_SCENE.choices.find((choice) => choice.id === PHASE3_CHOICE_ID.BAIT)

    expect(bait?.judgment).toBeNull()
    expect(PHASE3_SCENE.variantApplied).toBe(false)
    expect(PHASE3_SCENE.environmentErosion).toBe(false)
    expect(PHASE3_SCENE.backgroundAsset).toBe(ASSET_KEY.BG_BLOOD_TEAR_JANGSEUNG)
  })

  it('결과는 엔딩으로 결정되므로 선택지에 효과 목록이 없다 (룰북 §15)', () => {
    for (const purifyRoute of [true, false]) {
      for (const choice of buildPhase3Event({ purifyRoute, soloTargetIsSelf: false }).choices) {
        if (hasJudgment(choice)) {
          expect(choice.success, choice.id).toEqual([])
          expect(choice.failure, choice.id).toEqual([])
        } else {
          expect(choice.resolve, choice.id).toEqual([])
        }
      }
    }
  })
})

describe('엔딩표 (룰북 §15)', () => {
  it('엔딩 7종이 모두 정의되고 id가 일치한다', () => {
    const ids = Object.values(ENDING_ID)
    expect(ids).toHaveLength(7)
    for (const id of ids) {
      expect(ENDINGS[id]?.id, id).toBe(id)
      expect(endingOf(id).title.length, id).toBeGreaterThan(0)
      expect(endingOf(id).narration.length, id).toBeGreaterThan(0)
    }
  })

  it('배신자 승패가 §15 표와 일치한다', () => {
    expect(endingOf(ENDING_ID.PURIFY).traitorWon).toBe(false)
    expect(endingOf(ENDING_ID.SAFE_RETURN).traitorWon).toBe(false)
    expect(endingOf(ENDING_ID.ESCAPE_PARTING).traitorWon).toBe(false)
    expect(endingOf(ENDING_ID.TRAGIC_ESCAPE).traitorWon).toBe(false)
    expect(endingOf(ENDING_ID.ANNIHILATION).traitorWon).toBe(true)
    expect(endingOf(ENDING_ID.ETERNAL_MAZE).traitorWon).toBe(true)
    expect(endingOf(ENDING_ID.FORCED_EROSION).traitorWon).toBe(true)
  })

  it('연출 에셋이 §18 매핑을 벗어나지 않는다', () => {
    const keys: string[] = Object.values(ASSET_KEY)
    for (const id of Object.values(ENDING_ID)) {
      for (const asset of endingOf(id).assets) {
        expect(keys, id).toContain(asset)
      }
    }

    // 요괴화 탈은 배신자 승리 계열과 비극적 탈출(버린 형제가 배신자일 때)에만 쓴다 (룰북 §15, §18)
    expect(endingOf(ENDING_ID.PURIFY).assets).toContain(ASSET_KEY.ITEM_JADE_HAIRPIN)
    expect(endingOf(ENDING_ID.ANNIHILATION).assets).toContain(ASSET_KEY.MASK_CORRUPTED)
    expect(endingOf(ENDING_ID.ETERNAL_MAZE).assets).toContain(ASSET_KEY.MASK_CORRUPTED)
    expect(endingOf(ENDING_ID.FORCED_EROSION).assets).toContain(ASSET_KEY.MASK_CORRUPTED)
    expect(endingOf(ENDING_ID.SAFE_RETURN).assets).not.toContain(ASSET_KEY.MASK_CORRUPTED)
  })

  it('1인 플레이 전용 내레이션이 정의돼 있다 (룰북 §14.5)', () => {
    expect(ENDING_NARRATIONS[ENDING_NARRATION_KEY.SOLO_SELF_TARGET]).toContain('제압')
  })
})
