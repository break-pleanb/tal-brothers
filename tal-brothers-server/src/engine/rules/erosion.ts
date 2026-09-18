/**
 * 잠식도 (룰북 §4.1).
 * 개인값, 0~100%, 5% 단위. 100% 초과분은 버리고 0% 미만으로 내려가지 않는다.
 * 100% 도달 시 배신자 전환은 M2.
 */

const EROSION_MIN = 0
const EROSION_MAX = 100
const EROSION_STEP = 5

/** 5% 단위인지 검사한다. 시나리오 데이터와 설정값은 모두 5의 배수여야 한다 */
export function isErosionStep(deltaPercent: number): boolean {
  return Number.isInteger(deltaPercent) && deltaPercent % EROSION_STEP === 0
}

/**
 * 잠식도를 증감한다. `+`는 상승, `-`는 회복.
 * 5의 배수가 아닌 값은 데이터 오류이므로 조용히 넘기지 않고 예외를 던진다.
 */
export function applyErosionDelta(currentPercent: number, deltaPercent: number): number {
  if (!isErosionStep(deltaPercent)) {
    throw new Error(`잠식도 증감은 5% 단위여야 한다: ${deltaPercent}`)
  }
  return clampErosion(currentPercent + deltaPercent)
}

/** 0~100 범위로 자른다. 초과분은 버린다 (룰북 §4.1) */
export function clampErosion(percent: number): number {
  if (percent < EROSION_MIN) return EROSION_MIN
  if (percent > EROSION_MAX) return EROSION_MAX
  return percent
}
