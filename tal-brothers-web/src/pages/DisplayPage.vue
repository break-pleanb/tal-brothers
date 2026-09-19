<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useRoute } from 'vue-router'
import { GAME_STEP } from 'tal-brothers-shared'

import ChoiceBoard from '@/components/display/ChoiceBoard.vue'
import ClockHud from '@/components/display/ClockHud.vue'
import DiceArena from '@/components/display/DiceArena.vue'
import InterventionTrack from '@/components/display/InterventionTrack.vue'
import LinkStatus from '@/components/display/LinkStatus.vue'
import MaskApparition from '@/components/display/MaskApparition.vue'
import NarrationPanel from '@/components/display/NarrationPanel.vue'
import SeatStrip from '@/components/display/SeatStrip.vue'
import StageBackground from '@/components/display/StageBackground.vue'
import { useCountdown } from '@/composables/useCountdown'
import { useRoomSocket } from '@/composables/useRoomSocket'
import { resolveDeviceRole } from '@/lib/deviceRole'
import { usePlayStore } from '@/stores/play'

/**
 * Display 화면 (M4 계획 2절, 5절).
 *
 * **이 화면에는 게임 조작이 없다** (룰북 §1). 스냅샷을 받아 그리기만 한다.
 * 좌석 스냅샷을 들고 있지 않으므로 잠식도·인벤토리·변이·귓속말은 여기 올 수 없다 (M4 계획 6.1).
 *
 * Phase 3·엔딩·덮개는 M4-6에서 채운다.
 */

const route = useRoute()
const play = usePlayStore()

const roomCode = String(route.params.roomCode ?? '').toUpperCase()
useRoomSocket(roomCode, resolveDeviceRole(roomCode))

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

/** 채택된 선택지의 문장. 결과 화면에서 무엇이 뽑혔는지 다시 보여준다 */
const adoptedText = computed(() => {
  const current = view.value
  if (current === null || current.adoptedChoiceId === null) return null
  return current.choices.find((choice) => choice.id === current.adoptedChoiceId)?.text ?? null
})

/** 공개 알림 — 최근 것부터 몇 건만 (룰북 §17). 전체 목록은 M4-5의 `PublicNoticeFeed`가 맡는다 */
const recentNotices = computed(() => (view.value?.notices ?? []).slice(-3))
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

      <div class="display-hud__bottom">
        <SeatStrip :seat-names="play.seatNames" :connections="play.seatConnections" />
        <ul v-if="recentNotices.length > 0" class="display-hud__notices">
          <li v-for="(notice, index) in recentNotices" :key="index">{{ notice.text }}</li>
        </ul>
      </div>
    </div>

    <!-- 방송 캠 오버레이 자리. 글자를 놓지 않는다 (M4 계획 2.4) -->
    <div class="stage-cam-reserved" />
  </div>

  <div class="stage-layer stage-layer--body">
    <div class="stage-safe display-body">
      <p v-if="view === null" class="display-body__waiting">방 정보를 받는 중…</p>

      <template v-else>
        <NarrationPanel :title="view.eventTitle" :narration="view.narration" />

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

        <p v-if="step === GAME_STEP.RESOLUTION && adoptedText !== null" class="display-body__result">
          {{ adoptedText }}
        </p>
      </template>
    </div>
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
  align-items: flex-end;
  justify-content: space-between;
  gap: 2cqw;
}

.display-hud__notices {
  max-width: 34cqw;
  font-size: var(--stage-tag);
  color: rgba(245, 245, 245, 0.7);
  text-align: right;
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

.display-body__result {
  font-size: var(--stage-narration);
  color: rgba(245, 245, 245, 0.82);
}
</style>
