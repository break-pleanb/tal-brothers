import { describe, expect, it } from 'vitest'

import { PHASE2_BOSS, PHASE2_BRANCH, PHASE2_POOL } from '../../../src/scenario/phase2Events'
import { createSeededRng } from '../../../src/engine/random'
import { BOSS_SLOT_NUMBER, buildPhase2EventOrder } from '../../../src/engine/rules/slots'

/** Phase 2 슬롯 배치 (룰북 §13.3) */

describe('슬롯 배치', () => {
  it('분기 + 랜덤 8칸으로 이벤트 9개를 만든다', () => {
    const order = buildPhase2EventOrder(createSeededRng(42))

    expect(order).toHaveLength(9)
    expect(order[0]).toBe(PHASE2_BRANCH.id)
  })

  it('슬롯 7이 보스 고정이다', () => {
    for (const seed of [1, 2, 3, 42, 777]) {
      const order = buildPhase2EventOrder(createSeededRng(seed))
      // order[0]은 분기라 슬롯 번호는 1칸 뒤다
      expect(order[BOSS_SLOT_NUMBER], `seed ${seed}`).toBe(PHASE2_BOSS.id)
      expect(order.filter((id) => id === PHASE2_BOSS.id), `seed ${seed}`).toHaveLength(1)
    }
  })

  it('나머지 7칸은 풀 01~14에서 중복 없이 뽑는다', () => {
    const poolIds = PHASE2_POOL.map((event) => event.id)

    for (const seed of [1, 5, 42, 100, 2026]) {
      const order = buildPhase2EventOrder(createSeededRng(seed))
      const randomSlots = order.filter(
        (id) => id !== PHASE2_BRANCH.id && id !== PHASE2_BOSS.id,
      )

      expect(randomSlots, `seed ${seed}`).toHaveLength(7)
      expect(new Set(randomSlots).size, `seed ${seed}`).toBe(7)
      for (const id of randomSlots) {
        expect(poolIds, `seed ${seed}`).toContain(id)
      }
    }
  })

  it('같은 시드면 같은 배치가 나온다 (아키 §5.5)', () => {
    expect(buildPhase2EventOrder(createSeededRng(7))).toEqual(
      buildPhase2EventOrder(createSeededRng(7)),
    )
    expect(buildPhase2EventOrder(createSeededRng(7))).not.toEqual(
      buildPhase2EventOrder(createSeededRng(8)),
    )
  })
})
