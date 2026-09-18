import { BROTHER_ROLE, EROSION_TIER, VARIANT_KIND } from 'tal-brothers-shared'
import type { BrotherRole, ErosionTier, VariantKind } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../scenario/gameConfig'
import { WHISPER_KIND } from '../../scenario/constants/whisperKind'
import type { ScenarioEvent } from '../../scenario/scenarioTypes'
import { PUBLIC_NOTICE_KIND, SEAT_ORDER } from '../state/gameState'
import type { GameState, PendingWhisper, ReceivedWhisper } from '../state/gameState'
import { pickOne, rollChance, type Rng } from '../random'
import { tierOf } from './erosion'
import { pickFalseVariant } from './variant'

/**
 * 귓속말 5종 (룰북 §16).
 *
 * | 종류 | 발송 시점 | 진실 여부 |
 * |---|---|---|
 * | `t2Variant` | 이장 변이 결정 직후 | 비공개 판정 성공 = 진실 |
 * | `eventWhisper` | 같은 이벤트 결과 적용 시 | 비공개 판정 성공 = 진실 |
 * | `tierHallucination` | 랜덤 이벤트 시작 시 | 진실 30% |
 * | `shrineFail` | 다음 이벤트 시작 시 | 거짓 100% |
 * | `entryWarning` | Phase 2 진입 시 | 정보 없음 |
 *
 * 내용은 발생·발송 시점에 한 번 만들어 좌석에 저장한다. 전송마다 새로 굴리지 않는다 (아키텍처 §2).
 */

/** T2 귓속말이 알려주는 대상 이벤트 (룰북 §12) */
export const T2_WHISPER_TARGET_EVENT_ID = 'villageChief'

const VARIANT_LABEL: Record<VariantKind, string> = {
  [VARIANT_KIND.ILL]: '흉',
  [VARIANT_KIND.PLAIN]: '평',
  [VARIANT_KIND.BLESS]: '길',
}

/** 잠식 구간 표기 (룰북 §4.3, §13.4) */
export const TIER_LABEL: Record<ErosionTier, string> = {
  [EROSION_TIER.NORMAL]: '0~29%',
  [EROSION_TIER.TIER30]: '30~59%',
  [EROSION_TIER.TIER60]: '60~99%',
  [EROSION_TIER.TRAITOR]: '100%',
}

const ALL_TIERS: readonly ErosionTier[] = [
  EROSION_TIER.NORMAL,
  EROSION_TIER.TIER30,
  EROSION_TIER.TIER60,
  EROSION_TIER.TRAITOR,
]

const SEAT_LABEL: Record<BrotherRole, string> = {
  [BROTHER_ROLE.FIRST]: '첫째',
  [BROTHER_ROLE.SECOND]: '둘째',
  [BROTHER_ROLE.THIRD]: '셋째',
}

// ── T2 귓속말 (룰북 §12) ─────────────────────────────────────────────

/** 귓속말 문장을 만든다 */
function variantWhisperText(choiceText: string, variant: VariantKind): string {
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
    text: variantWhisperText(choice.text, claimed),
    receivedAtEventId,
    t2Variant: { choiceId: choice.id, variant: claimed },
  }
}

// ── 잠식 구간 귓속말 (룰북 §13.4, §16) ───────────────────────────────

/** 거짓이 주장할 구간 — 실제 구간을 제외한 나머지 중 무작위 1개 (룰북 §16) */
export function pickFalseTier(actual: ErosionTier, rng: Rng): ErosionTier {
  return pickOne(
    rng,
    ALL_TIERS.filter((tier) => tier !== actual),
  )
}

/** 귓속말이 말할 대상 — 자기 자신은 제외한다 (룰북 §13.4) */
export function pickWhisperSubject(receiver: BrotherRole, rng: Rng): BrotherRole {
  return pickOne(
    rng,
    SEAT_ORDER.filter((role) => role !== receiver),
  )
}

/**
 * 무작위 다른 형제 1명의 잠식 구간을 알려주는 귓속말 (룰북 §13.4, §16).
 * 배신자는 100% 구간으로 말한다 (M2 계획 10절 4번).
 */
export function buildTierWhisper(
  state: GameState,
  receiver: BrotherRole,
  kind: typeof WHISPER_KIND.EVENT_WHISPER | typeof WHISPER_KIND.TIER_HALLUCINATION | typeof WHISPER_KIND.SHRINE_FAIL,
  truthful: boolean,
  rng: Rng,
  receivedAtEventId: string,
): ReceivedWhisper {
  const aboutSeat = pickWhisperSubject(receiver, rng)
  const actual = tierOf(state.seats[aboutSeat].erosionPercent)
  const claimed = truthful ? actual : pickFalseTier(actual, rng)

  return {
    kind,
    text: `속삭임 — ${SEAT_LABEL[aboutSeat]}의 잠식은 ${TIER_LABEL[claimed]} 구간이다.`,
    receivedAtEventId,
    tier: { aboutSeat, tier: claimed },
  }
}

/** Phase 2 진입 환청 — 부적 보유자의 경고. 정보가 없고 부적도 소모하지 않는다 (룰북 §13.1) */
export function buildEntryWarningWhisper(receivedAtEventId: string): ReceivedWhisper {
  return {
    kind: WHISPER_KIND.ENTRY_WARNING,
    text: '품속의 부적이 뜨겁게 달아오른다 — "너희들 중 누군가는 이미 껍데기만 남았어."',
    receivedAtEventId,
  }
}

// ── 티어 환청 발동 판정 (룰북 §4.3) ─────────────────────────────────

/**
 * 이 좌석이 이번 랜덤 이벤트에서 티어 환청을 받는지 (룰북 §4.3).
 * 30~59%는 50% 확률, 60~99%는 100%. 0~29%와 100%(배신자) 구간에는 발동하지 않는다.
 */
export function shouldReceiveTierWhisper(erosionPercent: number, rng: Rng): boolean {
  const tier = tierOf(erosionPercent)
  if (tier === EROSION_TIER.TIER60) return true
  if (tier === EROSION_TIER.TIER30) {
    return rollChance(rng, GAME_CONFIG.tier30HallucinationChance)
  }
  return false
}

/** 티어 환청의 진실 여부 — 진실 30% (룰북 §4.3, §16) */
export function rollTierWhisperTruth(rng: Rng): boolean {
  return rollChance(rng, GAME_CONFIG.tier30TruthRatio)
}

// ── 발송 ─────────────────────────────────────────────────────────────

export type DeliveredWhisper = {
  targetSeat: BrotherRole
  whisper: ReceivedWhisper
}

/** 수신 좌석에 저장하고 Display에는 발송 사실만 남긴다 (룰북 §16, §17) */
export function deliverWhisper(
  draft: GameState,
  targetSeat: BrotherRole,
  whisper: ReceivedWhisper,
): DeliveredWhisper {
  draft.seats[targetSeat].whispers.push(whisper)
  draft.notices.push({
    kind: PUBLIC_NOTICE_KIND.WHISPER_SENT,
    text: '누군가에게 속삭임이 전달되었다',
  })
  return { targetSeat, whisper }
}

/**
 * 이 이벤트에서 발송해야 할 예약 귓속말을 처리한다 (룰북 §12, §13.2).
 * T2 귓속말은 이장 변이가 결정된 직후, 사당 실패 귓속말은 다음 이벤트 시작 시 발송된다.
 */
export function deliverPendingWhispers(
  draft: GameState,
  event: ScenarioEvent,
  variants: Record<string, VariantKind>,
  rng: Rng,
): DeliveredWhisper[] {
  const due: PendingWhisper[] = []
  const rest: PendingWhisper[] = []
  for (const pending of draft.pendingWhispers) {
    if (pending.deliverAtEventId === event.id) due.push(pending)
    else rest.push(pending)
  }
  if (due.length === 0) return []

  const delivered: DeliveredWhisper[] = []
  for (const pending of due) {
    const whisper =
      pending.kind === WHISPER_KIND.T2_VARIANT
        ? buildT2VariantWhisper(event, variants, pending.truthful, rng, event.id)
        : buildTierWhisper(
            draft,
            pending.targetSeat,
            WHISPER_KIND.SHRINE_FAIL,
            pending.truthful,
            rng,
            event.id,
          )
    delivered.push(deliverWhisper(draft, pending.targetSeat, whisper))
  }

  draft.pendingWhispers = rest
  return delivered
}
