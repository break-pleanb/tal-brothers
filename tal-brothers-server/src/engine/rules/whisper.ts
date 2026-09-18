import { VARIANT_KIND } from 'tal-brothers-shared'
import type { VariantKind } from 'tal-brothers-shared'

import { WHISPER_KIND } from '../../scenario/scenarioTypes'
import type { ScenarioEvent } from '../../scenario/scenarioTypes'
import { PUBLIC_NOTICE_KIND } from '../state/gameState'
import type { GameState, PendingWhisper, ReceivedWhisper } from '../state/gameState'
import { pickOne, type Rng } from '../random'

/**
 * T2 귓속말 (룰북 §12, §16).
 *
 * - 진실/거짓 여부는 T2-2 판정 직후 확정해 `pendingWhispers`에 저장한다 (effects.ts)
 * - 내용은 이장 이벤트가 출현해 변이가 결정된 직후 생성해 발송한다 (§6.1의 변이 결정 시점을 유지하기 위함)
 * - 거짓일 때는 실제 변이를 제외한 나머지 두 값 중 무작위 1개를 알려준다
 */

/** T2 귓속말이 알려주는 대상 이벤트 (룰북 §12) */
export const T2_WHISPER_TARGET_EVENT_ID = 'villageChief'

const VARIANT_LABEL: Record<VariantKind, string> = {
  [VARIANT_KIND.ILL]: '흉',
  [VARIANT_KIND.PLAIN]: '평',
  [VARIANT_KIND.BLESS]: '길',
}

const ALL_VARIANTS: readonly VariantKind[] = [
  VARIANT_KIND.ILL,
  VARIANT_KIND.PLAIN,
  VARIANT_KIND.BLESS,
]

/** 거짓 귓속말이 주장할 변이 — 실제 변이를 제외한 나머지 두 값 중 무작위 1개 (룰북 §12) */
export function pickFalseVariant(actual: VariantKind, rng: Rng): VariantKind {
  return pickOne(
    rng,
    ALL_VARIANTS.filter((variant) => variant !== actual),
  )
}

/** 귓속말 문장을 만든다 */
function whisperText(choiceText: string, variant: VariantKind): string {
  return `점괘가 비친다 — "${choiceText}"의 기운은 ${VARIANT_LABEL[variant]}이다.`
}

/**
 * 이장 이벤트 선택지 1개를 골라 귓속말 내용을 만든다.
 * 진실이면 실제 변이를, 거짓이면 나머지 두 값 중 하나를 주장한다.
 */
export function buildT2VariantWhisper(
  event: ScenarioEvent,
  variants: Record<string, VariantKind>,
  truthful: boolean,
  rng: Rng,
  receivedAtEventId: string,
): ReceivedWhisper {
  const choice = pickOne(rng, event.choices)
  const actual = variants[choice.id] ?? VARIANT_KIND.PLAIN
  const claimed = truthful ? actual : pickFalseVariant(actual, rng)

  return {
    kind: WHISPER_KIND.T2_VARIANT,
    text: whisperText(choice.text, claimed),
    receivedAtEventId,
    t2Variant: { choiceId: choice.id, variant: claimed },
  }
}

/**
 * 이 이벤트에서 발송해야 할 예약 귓속말을 처리한다 (룰북 §12).
 * 수신 좌석에만 저장하고, Display에는 발송 사실만 남긴다 (룰북 §16, §17).
 */
export function deliverPendingWhispers(
  draft: GameState,
  event: ScenarioEvent,
  variants: Record<string, VariantKind>,
  rng: Rng,
): ReceivedWhisper[] {
  const due: PendingWhisper[] = []
  const rest: PendingWhisper[] = []
  for (const pending of draft.pendingWhispers) {
    if (pending.deliverAtEventId === event.id) due.push(pending)
    else rest.push(pending)
  }
  if (due.length === 0) return []

  const delivered: ReceivedWhisper[] = []
  for (const pending of due) {
    if (pending.kind !== WHISPER_KIND.T2_VARIANT) continue
    const whisper = buildT2VariantWhisper(event, variants, pending.truthful, rng, event.id)
    draft.seats[pending.targetSeat].whispers.push(whisper)
    draft.notices.push({
      kind: PUBLIC_NOTICE_KIND.WHISPER_SENT,
      text: '누군가에게 속삭임이 전달되었다',
    })
    delivered.push(whisper)
  }

  draft.pendingWhispers = rest
  return delivered
}
