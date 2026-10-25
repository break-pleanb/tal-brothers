import { BROTHER_ROLE } from 'tal-brothers-shared'
import type {
  BrotherRole,
  SeatSnapshot,
  VariantDetailView,
  VariantKind,
  WhisperView,
} from 'tal-brothers-shared'

import { variantDetailsFor } from '../rules/variantDetail'
import type { GameState, SeatState } from '../state/gameState'
import { findScenarioEvent } from '../steps/rollStep'
import { projectPublic } from './projectDisplay'

/**
 * 좌석 투영 (룰북 §17, 아키텍처 §7.3).
 *
 * - 본인 잠식도·인벤토리·귓속말만 담고, 다른 좌석의 것은 담지 않는다
 * - `isTraitor`는 담지 않는다. 전환은 붉은 메시지 cue로만 알린다 (룰북 §10.1)
 * - 배신자 좌석과 일반 좌석의 **키 목록이 같아야** 한다. 구조 차이로 정체가 드러나면 안 된다
 */

/**
 * 이 좌석이 보는 변이 라벨 (룰북 §3.4, §6.4, §10.2).
 *
 * | 대상 | 보이는 값 |
 * |---|---|
 * | 배신자 | 항상 진짜 |
 * | 절대 시야를 쓴 셋째 | 진짜 (60% 이상이어도 가짜 라벨을 무시한다) |
 * | 60~99%에서 가짜 라벨이 걸린 좌석 | 이벤트 진입 시 확정 저장된 가짜 |
 * | 그 외 | 없음 |
 */
export function variantLabelsFor(
  state: GameState,
  role: BrotherRole,
): Record<string, VariantKind> | null {
  const current = state.currentEvent
  if (current === null) return null

  const seat = state.seats[role]
  if (seat.isTraitor) return { ...current.variants }
  if (role === BROTHER_ROLE.THIRD && current.trueSightUsed) return { ...current.variants }

  const fake = current.fakeLabels[role]
  return fake === undefined ? null : { ...fake }
}

/**
 * 라벨과 함께 보는 최종 적용값 (룰북 §6.4). 라벨이 있는 좌석에만, 같은 라벨로 계산한다 —
 * 가짜 라벨이면 가짜 변이를 적용한 값이다. 라벨이 없는 좌석(일반 좌석)은 null이다
 */
export function variantDetailsForSeat(
  state: GameState,
  labels: Record<string, VariantKind> | null,
): Record<string, VariantDetailView> | null {
  const current = state.currentEvent
  if (current === null || labels === null) return null
  const event = findScenarioEvent(state, current.eventId)
  return event === undefined ? null : variantDetailsFor(event, labels)
}

function projectWhispers(seat: SeatState): WhisperView[] {
  // 진실 여부는 서버만 아는 정보라 내보내지 않는다 (룰북 §17)
  return seat.whispers.map((whisper) => ({ kind: whisper.kind, text: whisper.text }))
}

export function projectSeat(state: GameState, role: BrotherRole): SeatSnapshot {
  const seat = state.seats[role]
  const labels = variantLabelsFor(state, role)

  return {
    ...projectPublic(state),
    seat: role,
    erosionPercent: seat.erosionPercent,
    talismanCount: seat.talismanCount,
    talismanOverflow: seat.talismanOverflow,
    tutorialTalismanCount: seat.tutorialTalismanCount,
    hasJadeHairpin: seat.hasJadeHairpin,
    abilityUsed: seat.abilityUsed,
    whispers: projectWhispers(seat),
    myVote: state.currentEvent?.votes[role] ?? null,
    variantLabels: labels,
    variantDetails: variantDetailsForSeat(state, labels),
    // 본인 좌석의 것만 담는다. 다른 좌석의 연결 상태는 Display에만 나간다 (룰북 §17)
    connection: seat.connection.status,
    botTakeover: seat.botTakeover,
  }
}
