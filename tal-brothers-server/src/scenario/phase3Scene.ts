import { ASSET_KEY, GAME_PHASE, JUDGMENT_KIND, PHASE3_ROUTE } from 'tal-brothers-shared'

import { GAME_CONFIG } from './gameConfig'
import { CONTEST_TEAM_DICE } from './scenarioTypes'
import type { Choice, ScenarioEvent } from './scenarioTypes'

/**
 * Phase 3: 장승 앞의 결전 (룰북 §14).
 *
 * - 결과는 효과 목록이 아니라 **엔딩**이므로 선택지의 효과 목록은 비어 있다 (§15)
 * - 흉/평/길 변이 없음, 첫째 강제 성공 사용 불가 (§14.2)
 * - 선택지 구성은 루트와 1인 플레이 여부에 따라 달라지므로 이벤트를 그때그때 만든다 (§14.5)
 */

export const PHASE3_EVENT_ID = 'phase3'

export const PHASE3_CHOICE_ID = {
  /** B-1 옥비녀 정화 — 투표 없이 즉시 판정 (룰북 §14.3) */
  PURIFY: 'p3-b1',
  /** A-1 미끼 — 판정 없음 (룰북 §14.4) */
  BAIT: 'p3-a1',
  /** A-2 돌파 — 협동·대립 판정 (룰북 §14.4) */
  BREAK: 'p3-a2',
} as const

const NARRATION =
  '마을 경계의 거대한 천하대장군 장승 앞. 삼형제 중 누군가의 눈에서 피눈물이 흐른다. ' +
  '"내가... 누구지...?" 뒤편에서 광대탈을 쓴 마을 사람들이 턱밑까지 추격해 온다.'

/** A-2의 기본 문장 (룰북 §14.4) */
const BREAK_TEXT = '마지막 힘으로 형제를 물리치고 탈출한다'

/** 1인 플레이에서 본인이 타겟일 때의 A-2 문장 (룰북 §14.5) */
const BREAK_TEXT_SOLO_SELF = '마지막 이성을 쥐어짜내며, 형제들이 나를 제압하도록 둔다'

/** B-1 — 옥비녀 보유자가 굴린다. 고정 기준은 4, 타겟이 인간 배신자면 대립 (룰북 §14.3) */
const PURIFY_CHOICE: Choice = {
  id: PHASE3_CHOICE_ID.PURIFY,
  text: '어머니의 옥비녀로 정화를 시도한다',
  judgment: {
    kind: JUDGMENT_KIND.CONTEST,
    threshold: GAME_CONFIG.thresholdBase,
    teamDice: CONTEST_TEAM_DICE.JADE_HOLDER,
    route: PHASE3_ROUTE.PURIFY,
  },
  success: [],
  failure: [],
}

/** A-1 — 판정이 없고 곧바로 엔딩으로 간다 (룰북 §14.4) */
const BAIT_CHOICE: Choice = {
  id: PHASE3_CHOICE_ID.BAIT,
  text: '잠식된 형제를 미끼로 두고 도망친다',
  judgment: null,
  resolve: [],
}

/** A-2 — 타겟 제외 전원의 최고값. 고정 기준은 5, 타겟이 인간 배신자면 대립 (룰북 §14.4) */
function breakChoice(soloTargetIsSelf: boolean): Choice {
  return {
    id: PHASE3_CHOICE_ID.BREAK,
    text: soloTargetIsSelf ? BREAK_TEXT_SOLO_SELF : BREAK_TEXT,
    judgment: {
      kind: JUDGMENT_KIND.CONTEST,
      threshold: GAME_CONFIG.thresholdHard,
      teamDice: CONTEST_TEAM_DICE.ALL_EXCEPT_TARGET,
      route: PHASE3_ROUTE.BREAK,
    },
    success: [],
    failure: [],
  }
}

export type Phase3SceneOptions = {
  /** 옥비녀 보유자가 있어 B-1로 가는 경우 (룰북 §14.1의 3번) */
  purifyRoute: boolean
  /** 1인 플레이에서 본인이 타겟인 경우 — A-1을 선택지에서 뺀다 (룰북 §14.5) */
  soloTargetIsSelf: boolean
}

/**
 * Phase 3 이벤트를 구성한다.
 * A-1 제외와 A-2 문장 교체는 투영이 아니라 **이벤트 구성 단계**에서 처리한다 (룰북 §14.5).
 */
export function buildPhase3Event(options: Phase3SceneOptions): ScenarioEvent {
  const choices: Choice[] = options.purifyRoute
    ? [PURIFY_CHOICE]
    : options.soloTargetIsSelf
      ? [breakChoice(true)]
      : [BAIT_CHOICE, breakChoice(false)]

  return {
    id: PHASE3_EVENT_ID,
    phase: GAME_PHASE.PHASE_3,
    title: '장승 앞의 결전',
    narration: NARRATION,
    backgroundAsset: ASSET_KEY.BG_BLOOD_TEAR_JANGSEUNG,
    choices,
    // 흉/평/길 변이 없음 (룰북 §6.3)
    variantApplied: false,
    isTutorial: false,
    // B-1은 투표 없이 즉시 판정한다 (룰북 §14.1)
    skipVoting: options.purifyRoute,
    grantsTutorialTalisman: false,
    environmentErosion: false,
    isBoss: false,
    grabsRandomSeat: false,
  }
}

/** 루트 정보 없이 참조할 때 쓰는 기본 구성 (테스트·데이터 검증용) */
export const PHASE3_SCENE: ScenarioEvent = buildPhase3Event({
  purifyRoute: false,
  soloTargetIsSelf: false,
})
