import { PHASE2_BOSS, PHASE2_BRANCH, PHASE2_POOL } from '../../scenario/phase2Events'
import type { Rng } from '../random'

/**
 * Phase 2 슬롯 배치 (룰북 §13.3).
 *
 * ```
 * eventOrder = [ 분기, s1, s2, s3, s4, s5, s6, 보스(슬롯 7), s8 ]
 * s1..s6, s8 ← 풀 01~14에서 7개 비복원 추출
 * ```
 *
 * Phase 2 진입 시 1회만 굴려 `progress.eventOrder`에 확정 저장한다.
 */

/** 보스를 뺀 랜덤 슬롯 수 (룰북 §13.3) */
const RANDOM_SLOT_COUNT = 7

/** 보스가 고정으로 들어가는 슬롯 번호 (1부터 셈) */
export const BOSS_SLOT_NUMBER = 7

/** 비복원 추출 — 같은 이벤트가 두 번 나오지 않는다 */
function sampleWithoutReplacement<T>(rng: Rng, pool: readonly T[], count: number): T[] {
  if (count > pool.length) {
    throw new Error(`풀(${pool.length})보다 많이 뽑을 수 없다: ${count}`)
  }

  const rest = [...pool]
  const picked: T[] = []
  for (let i = 0; i < count; i += 1) {
    const index = rng.nextInt(rest.length)
    const [taken] = rest.splice(index, 1)
    if (taken === undefined) throw new Error('추출에 실패했다')
    picked.push(taken)
  }
  return picked
}

/** Phase 2 이벤트 순서표를 만든다 (룰북 §13.3) */
export function buildPhase2EventOrder(rng: Rng): string[] {
  const picked = sampleWithoutReplacement(rng, PHASE2_POOL, RANDOM_SLOT_COUNT).map(
    (event) => event.id,
  )

  const slots = picked.slice(0, BOSS_SLOT_NUMBER - 1)
  const afterBoss = picked.slice(BOSS_SLOT_NUMBER - 1)

  return [PHASE2_BRANCH.id, ...slots, PHASE2_BOSS.id, ...afterBoss]
}
