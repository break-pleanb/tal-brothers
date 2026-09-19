<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useRoute } from 'vue-router'
import { COMMAND_TYPE, GAME_STEP } from 'tal-brothers-shared'
import type { Command } from 'tal-brothers-shared'

import ActionBar from '@/components/controller/ActionBar.vue'
import CueToast from '@/components/controller/CueToast.vue'
import DesktopNotice from '@/components/controller/DesktopNotice.vue'
import ErosionGauge from '@/components/controller/ErosionGauge.vue'
import InterventionPanel from '@/components/controller/InterventionPanel.vue'
import LockOverlay from '@/components/controller/LockOverlay.vue'
import RollButton from '@/components/controller/RollButton.vue'
import VotePanel from '@/components/controller/VotePanel.vue'
import { useCountdown } from '@/composables/useCountdown'
import { useRoomSocket } from '@/composables/useRoomSocket'
import { useWakeLock } from '@/composables/useWakeLock'
import { BROTHER_LABEL } from '@/constants/brotherLabel'
import { STEP_LABEL } from '@/constants/stepLabel'
import { looksLikePhone, resolveDeviceRole } from '@/lib/deviceRole'
import { usePlayStore } from '@/stores/play'

/**
 * Controller 화면 (M4 계획 3절, 5절).
 *
 * **본인 것만 보인다.** 다른 좌석의 잠식도·인벤토리·연결 상태는 이 기기에 오지 않는다 (룰북 §17).
 * 하단 한 자리의 뜻이 단계마다 바뀌고 **자리는 바뀌지 않는다** (M4 계획 3.2).
 *
 * 인벤토리·능력·귓속말·붉은 메시지는 M4-5, Phase 3·엔딩은 M4-6이다.
 */

const route = useRoute()
const play = usePlayStore()

const roomCode = String(route.params.roomCode ?? '').toUpperCase()
const socket = useRoomSocket(roomCode, resolveDeviceRole(roomCode))

const { notice: wakeLockNotice } = useWakeLock()
const { label: stepClockLabel } = useCountdown(toRef(play, 'stepDeadlineAt'))

/** PC로 열었으면 안내를 띄우되 막지는 않는다 (9절 6번) */
const dismissedDesktopNotice = ref(false)
const showDesktopNotice = computed(() => !looksLikePhone() && !dismissedDesktopNotice.value)

const step = computed(() => play.step)
const view = computed(() => play.snapshot)
const seatLabel = computed(() => (play.mySeat === null ? '자리 없음' : BROTHER_LABEL[play.mySeat]))
const stepLabel = computed(() => (step.value === null ? '' : STEP_LABEL[step.value]))

const isVoting = computed(
  () => step.value === GAME_STEP.VOTING || step.value === GAME_STEP.P3_VOTING,
)

const isIntervention = computed(() =>
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

/** 단계별 액션바 안내. 누를 것이 없는 단계에서는 문구만 남는다 (M4 계획 5절) */
const actionHint = computed(() => {
  switch (step.value) {
    case GAME_STEP.EVENT_INTRO:
      return '잠시 기다리세요'
    case GAME_STEP.ROLL_REVEAL:
      return '판정 결과를 확인하세요'
    case GAME_STEP.TALISMAN_WINDOW:
      return '부적 제출 창입니다 (M4-5)'
    case GAME_STEP.RESOLUTION:
      return '결과를 적용하는 중'
    case GAME_STEP.PHASE2_ENTRY:
      return '숲으로 들어갑니다'
    case GAME_STEP.ENDING:
      return '게임이 끝났습니다'
    default:
      return '잠시 기다리세요'
  }
})

/** 일시정지 중에는 전 화면을 덮고 조작을 막는다 (아키텍처 §8) */
const pauseView = computed(() => view.value?.pause ?? null)

function vote(choiceId: string): void {
  socket.send({ type: COMMAND_TYPE.VOTE_SUBMIT, choiceId })
}

function roll(): void {
  socket.send({ type: COMMAND_TYPE.ROLL_REQUEST })
}

function useIntervention(command: Command): void {
  socket.send(command)
}
</script>

<template>
  <template v-if="showDesktopNotice">
    <div class="controller-body">
      <DesktopNotice :room-code="roomCode" @dismiss="dismissedDesktopNotice = true" />
    </div>
  </template>

  <template v-else>
    <header class="controller-top">
      <div class="controller-head">
        <div>
          <p class="controller-head__seat">{{ seatLabel }}</p>
          <p class="controller-head__step">{{ stepLabel }}</p>
        </div>
        <p v-if="stepClockLabel !== ''" class="controller-head__clock">{{ stepClockLabel }}</p>
      </div>

      <ErosionGauge
        v-if="play.privateView !== null"
        :percent="play.privateView.erosionPercent"
        class="controller-head__gauge"
      />

      <p v-if="wakeLockNotice" class="controller-head__notice">{{ wakeLockNotice }}</p>
    </header>

    <main class="controller-body">
      <p v-if="view === null" class="controller-body__waiting">방 정보를 받는 중…</p>

      <template v-else>
        <p v-if="view.eventTitle !== null" class="controller-body__title">{{ view.eventTitle }}</p>
        <p v-if="view.narration !== null" class="controller-body__narration">
          {{ view.narration }}
        </p>

        <VotePanel
          v-if="isVoting"
          :choices="view.choices"
          :my-vote="play.privateView?.myVote ?? null"
          :variant-labels="play.privateView?.variantLabels ?? null"
          :disabled="play.privateView === null"
          @select="vote"
        />

        <p v-else-if="view.adoptedChoiceId !== null" class="controller-body__adopted">
          채택 —
          {{ view.choices.find((choice) => choice.id === view?.adoptedChoiceId)?.text ?? '' }}
        </p>
      </template>

      <p v-if="play.message" class="controller-body__message">{{ play.message }}</p>
    </main>

    <RollButton
      v-if="step === GAME_STEP.ROLL_WAIT"
      :judgment="view?.judgment ?? null"
      :my-seat="play.mySeat"
      :roller-seat="view?.rollerSeat ?? null"
      @roll="roll"
    />

    <InterventionPanel
      v-else-if="isIntervention"
      :step="step"
      :judgment="view?.judgment ?? null"
      :my-seat="play.mySeat"
      :private-view="play.privateView"
      @use="useIntervention"
    />

    <ActionBar
      v-else
      :label="null"
      :hint="isVoting ? '마감 전에는 몇 번이든 바꿀 수 있습니다' : actionHint"
    />

    <CueToast />

    <LockOverlay
      :visible="pauseView !== null"
      title="일시정지"
      detail="호스트가 다시 시작할 때까지 기다려 주세요."
    />
  </template>
</template>

<style scoped>
.controller-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.controller-head__seat {
  font-size: 1rem;
  font-weight: 600;
}

.controller-head__step {
  font-size: 0.75rem;
  color: rgba(245, 245, 245, 0.55);
}

.controller-head__clock {
  font-size: 1.25rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.controller-head__gauge {
  margin-top: 0.75rem;
}

.controller-head__notice {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #d9a066;
}

.controller-body__waiting {
  font-size: 0.8125rem;
  color: rgba(245, 245, 245, 0.45);
}

.controller-body__title {
  margin-bottom: 0.5rem;
  font-size: 1.0625rem;
  font-weight: 600;
}

.controller-body__narration {
  margin-bottom: 1rem;
  font-size: 0.9375rem;
  line-height: 1.6;
  color: rgba(245, 245, 245, 0.82);
}

.controller-body__adopted {
  font-size: 0.875rem;
  color: rgba(245, 245, 245, 0.7);
}

.controller-body__message {
  margin-top: 1rem;
  font-size: 0.8125rem;
  color: #d9a066;
}
</style>
