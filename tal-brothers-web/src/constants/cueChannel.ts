import { CUE_KIND } from 'tal-brothers-shared'
import type { CueKind } from 'tal-brothers-shared'

/**
 * cue를 어느 자리에 연출할지 (M4 계획 4.3).
 *
 * **스냅샷이 진실이고 cue는 장식이다.** cue 연출이 밀려도 스냅샷 렌더를 막지 않는다.
 *
 * | 자리 | 처리 |
 * |---|---|
 * | `overlay` | 화면을 덮는다. 최신 1건만 연출하고 나머지는 버린다 |
 * | `toast` | 겹치지 않게 순차로 띄운다 |
 * | `scene` | 해당 패널의 애니메이션만 켠다. 놓쳐도 같은 내용이 스냅샷에 있다 |
 * | `modal` | 본인이 닫을 때까지 유지한다 |
 *
 * **진짜 붉은 메시지와 가짜 붉은 메시지는 같은 `redMessage` cue로 온다.** 자리도 연출도 같아야 한다 (룰북 §10.1).
 */
export type CueChannel = 'overlay' | 'toast' | 'scene' | 'modal'

export const CUE_CHANNEL: Record<CueKind, CueChannel> = {
  [CUE_KIND.RED_MESSAGE]: 'overlay',
  [CUE_KIND.NOISE_LOCK]: 'overlay',
  [CUE_KIND.ENDING]: 'overlay',

  [CUE_KIND.WHISPER_RECEIVED]: 'toast',
  [CUE_KIND.TUTORIAL_TALISMAN_GRANTED]: 'toast',
  [CUE_KIND.INTERVENTION_USED]: 'toast',
  [CUE_KIND.PRACTICE_EXPLAIN]: 'toast',
  [CUE_KIND.FORCE_SUCCESS_EXPLAIN]: 'toast',

  [CUE_KIND.EVENT_INTRO]: 'scene',
  [CUE_KIND.PHASE_ENTERED]: 'scene',
  [CUE_KIND.DICE_ROLLED]: 'scene',
  [CUE_KIND.JUDGMENT_RESULT]: 'scene',
  [CUE_KIND.HIDDEN_JUDGMENT_DONE]: 'scene',
  [CUE_KIND.TALISMAN_WINDOW]: 'scene',
  [CUE_KIND.TARGET_REVEALED]: 'scene',
  [CUE_KIND.JADE_HAIRPIN_MOVED]: 'scene',
  [CUE_KIND.RESOLUTION]: 'scene',

  [CUE_KIND.TRUE_SIGHT_RESULT]: 'modal',
}
