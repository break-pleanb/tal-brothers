<script setup lang="ts">
import { computed, toRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { COMMAND_TYPE, CUE_KIND, ENDING_ID, GAME_STEP } from 'tal-brothers-shared'
import type { CueKind } from 'tal-brothers-shared'

import ChoiceBoard from '@/components/display/ChoiceBoard.vue'
import ClockHud from '@/components/display/ClockHud.vue'
import DiceArena from '@/components/display/DiceArena.vue'
import EndingSequence from '@/components/display/EndingSequence.vue'
import HostBar from '@/components/display/HostBar.vue'
import InterventionTrack from '@/components/display/InterventionTrack.vue'
import LinkStatus from '@/components/display/LinkStatus.vue'
import MaskApparition from '@/components/display/MaskApparition.vue'
import NarrationPanel from '@/components/display/NarrationPanel.vue'
import NoiseOverlay from '@/components/display/NoiseOverlay.vue'
import PauseCurtain from '@/components/display/PauseCurtain.vue'
import PublicNoticeFeed from '@/components/display/PublicNoticeFeed.vue'
import SeatStrip from '@/components/display/SeatStrip.vue'
import StageBackground from '@/components/display/StageBackground.vue'
import TargetReveal from '@/components/display/TargetReveal.vue'
import { DISPLAY_ASSETS, useAssetPreload } from '@/composables/useAssetPreload'
import { useCountdown } from '@/composables/useCountdown'
import { useCueQueue } from '@/composables/useCueQueue'
import { useRoomSocket } from '@/composables/useRoomSocket'
import { MOTION_TIMING } from '@/constants/motionTiming'
import { resolveDeviceRole } from '@/lib/deviceRole'
import { usePlayStore } from '@/stores/play'

/**
 * Display 화면 (M4 계획 2절, 5절).
 *
 * **이 화면에는 게임 조작이 없다** (룰북 §1). 스냅샷을 받아 그리기만 한다.
 * 좌석 스냅샷을 들고 있지 않으므로 잠식도·인벤토리·변이·귓속말은 여기 올 수 없다 (M4 계획 6.1).
 *
 * 호스트 바는 게임 조작이 아니라 **방 운영**(일시정지·재개)이다 (룰북 §1, §21).
 */

const route = useRoute()
const play = usePlayStore()

const roomCode = String(route.params.roomCode ?? '').toUpperCase()

/** 로비를 거치지 않고 들어온 경우(새로고침)도 미리 받는다. 이미 받았으면 캐시에서 끝난다 */
useAssetPreload(DISPLAY_ASSETS)
const socket = useRoomSocket(roomCode, resolveDeviceRole(roomCode))

const { label: gameClockLabel } = useCountdown(toRef(play, 'clockDeadlineAt'))
const { label: stepClockLabel } = useCountdown(toRef(play, 'stepDeadlineAt'))

/** Display가 받는 공개 항목. 좌석 전용 값은 이 스냅샷에 아예 없다 */
const view = computed(() => play.snapshot)
const step = computed(() => play.step)

/** 선택지를 보여주는 단계 — 투표 중과 마감 직후 */
const showChoices = computed(
  () => step.value === GAME_STEP.VOTING || step.value === GAME_STEP.P3_VOTING,
)

/** 주사위·판정을 보여주는 단계 */
const showDice = computed(() =>
  step.value === null
    ? false
    : (
        [
          GAME_STEP.ROLL_WAIT,
          GAME_STEP.ROLL_REVEAL,
          GAME_STEP.INTERVENTION_REROLL,
          GAME_STEP.INTERVENTION_TALISMAN,
          GAME_STEP.INTERVENTION_FORCE,
          GAME_STEP.PRACTICE_INTERVENTION,
          GAME_STEP.RESOLUTION,
        ] as string[]
      ).includes(step.value),
)

/** 개입 창 트랙을 보여주는 단계 */
const showTrack = computed(() =>
  step.value === null
    ? false
    : (
        [
          GAME_STEP.INTERVENTION_REROLL,
          GAME_STEP.INTERVENTION_TALISMAN,
          GAME_STEP.INTERVENTION_FORCE,
          GAME_STEP.PRACTICE_INTERVENTION,
        ] as string[]
      ).includes(step.value),
)

/** 엔딩 — 스냅샷이 `ENDING`이고 엔딩이 확정됐을 때만 (룰북 §15) */
const ending = computed(() => (step.value === GAME_STEP.ENDING ? (view.value?.ending ?? null) : null))

/**
 * 강제 잠식은 모든 화면을 노이즈로 덮는다 (룰북 §2.1, §15).
 * `noiseLock` cue를 기다리지 않고 스냅샷으로 판단한다 — 새로고침해도 같은 그림이다
 */
const showNoise = computed(() => ending.value?.id === ENDING_ID.FORCED_EROSION)

/** 송출 화면(`?obs=1`)에서는 호스트 바를 그리지 않는다 (m4-plan 2.5) */
const obs = computed(() => route.query.obs === '1')

function hostPause(): void {
  socket.send({ type: COMMAND_TYPE.HOST_PAUSE })
}

function hostResume(): void {
  socket.send({ type: COMMAND_TYPE.HOST_RESUME })
}

/** 채택된 선택지의 문장. 결과 화면에서 무엇이 뽑혔는지 다시 보여준다 */
const adoptedText = computed(() => {
  const current = view.value
  if (current === null || current.adoptedChoiceId === null) return null
  return current.choices.find((choice) => choice.id === current.adoptedChoiceId)?.text ?? null
})

/**
 * 장면 cue (m4-plan 4.3).
 *
 * Phase 진입(`PHASE2_ENTRY`·`P3_TARGETING`)은 서버가 머물지 않고 곧바로 다음 단계로 넘긴다 —
 * 스냅샷에 그 단계가 남지 않으므로 진입 내레이션은 `phaseEntered` cue로만 그릴 수 있다 (m4-notes 자동 확인).
 * 아직 연출을 붙이지 않은 장면 cue는 곧바로 넘긴다. 놓쳐도 같은 내용이 스냅샷에 있다
 */
const SCENE_SHOWN: CueKind[] = [CUE_KIND.PHASE_ENTERED]
const scene = useCueQueue('scene', MOTION_TIMING.phaseNarrationMs)
watch(
  () => scene.current.value?.id ?? null,
  () => {
    const queued = scene.current.value
    if (queued !== null && !SCENE_SHOWN.includes(queued.cue.kind)) scene.dismiss()
  },
  { immediate: true },
)
const phaseNarration = computed(() => {
  const queued = scene.current.value
  return queued?.cue.kind === CUE_KIND.PHASE_ENTERED ? queued.cue.text : null
})

</script>

<template>
  <StageBackground :background="view?.background ?? null" :phase="view?.phase ?? null" />

  <MaskApparition :mask="view?.mask ?? null" />

  <div class="stage-layer stage-layer--hud">
    <div class="stage-safe display-hud">
      <div class="display-hud__top">
        <ClockHud
          class="display-hud__clock"
          :phase="view?.phase ?? null"
          :step="view?.step ?? null"
          :event-number="view?.eventNumber ?? null"
          :game-clock="gameClockLabel"
          :step-clock="stepClockLabel"
        />
        <LinkStatus :status="play.status" :stale="play.stale" />
      </div>

      <!-- 왼쪽 아래에 모은다. 오른쪽 아래는 캠 자리다 (m4-plan 2.4) -->
      <div class="display-hud__bottom">
        <PublicNoticeFeed :notices="view?.notices ?? []" />
        <SeatStrip :seat-names="play.seatNames" :connections="play.seatConnections" />
      </div>
    </div>

    <!-- 방송 캠 오버레이 자리. 글자를 놓지 않는다 (M4 계획 2.4) -->
    <div class="stage-cam-reserved" />
  </div>

  <div class="stage-layer stage-layer--body">
    <div class="stage-safe display-body">
      <p v-if="view === null" class="display-body__waiting">방 정보를 받는 중…</p>

      <template v-else>
        <TargetReveal
          v-if="view.phase3 !== null && ending === null"
          :phase3="view.phase3"
          :seat-names="play.seatNames"
        />

        <p v-if="phaseNarration !== null" class="display-body__phase">{{ phaseNarration }}</p>
        <NarrationPanel v-else :title="view.eventTitle" :narration="view.narration" />

        <ChoiceBoard
          v-if="showChoices"
          :choices="view.choices"
          :adopted-choice-id="view.adoptedChoiceId"
          :vote="view.vote"
        />

        <InterventionTrack
          v-if="showTrack"
          :step="step"
          :interventions="view.judgment?.interventions ?? []"
          :seat-names="play.seatNames"
        />

        <DiceArena
          v-if="showDice"
          :judgment="view.judgment"
          :step="step"
          :roller-seat="view.rollerSeat"
          :seat-names="play.seatNames"
        />

        <!-- 14A 부적 제출 창 — 누가 가졌는지는 보이지 않고 제출 사실만 공개 알림으로 뜬다 (룰북 §13.5) -->
        <p v-if="step === GAME_STEP.TALISMAN_WINDOW" class="display-body__result">
          봉인할 부적을 기다린다
        </p>

        <p v-if="step === GAME_STEP.RESOLUTION && adoptedText !== null" class="display-body__result">
          {{ adoptedText }}
        </p>
      </template>
    </div>
  </div>

  <!-- 덮개 레이어 — 세이프존을 무시하고 스테이지를 끝까지 채운다 (m4-plan 2.3) -->
  <div v-if="ending !== null || view?.pause" class="stage-layer stage-layer--overlay">
    <PauseCurtain v-if="view?.pause" :pause="view.pause" />
    <template v-else-if="ending !== null">
      <NoiseOverlay v-if="showNoise" />
      <EndingSequence :ending="ending" :seat-names="play.seatNames" />
    </template>
  </div>

  <!-- 방 운영 바 — 덮개보다 위, 세이프존 밖 위쪽 띠 -->
  <div class="stage-layer stage-layer--host">
    <HostBar
      :step="step"
      :pause="view?.pause ?? null"
      :hidden="obs || view === null || ending !== null"
      @pause="hostPause"
      @resume="hostResume"
    />
  </div>
</template>

<style scoped>
.display-hud {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.display-hud__top {
  display: flex;
  flex-direction: column;
  gap: 1cqh;
}

.display-hud__clock {
  width: 100%;
}

.display-hud__bottom {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1.5cqh;
}

.display-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2cqh;
  text-align: center;
  pointer-events: none;
}

.display-body__waiting {
  font-size: var(--stage-tag);
  color: rgba(245, 245, 245, 0.45);
}

.display-body__phase {
  max-width: 70cqw;
  font-size: var(--stage-narration);
  line-height: 1.7;
  color: rgba(245, 245, 245, 0.88);
}

.display-body__result {
  font-size: var(--stage-narration);
  color: rgba(245, 245, 245, 0.82);
}
</style>
