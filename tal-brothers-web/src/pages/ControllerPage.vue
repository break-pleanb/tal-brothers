<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { BROTHER_ROLE, COMMAND_TYPE, ENDING_ID, GAME_STEP } from 'tal-brothers-shared'
import type { Command } from 'tal-brothers-shared'

import AbilityButton from '@/components/controller/AbilityButton.vue'
import ActionBar from '@/components/controller/ActionBar.vue'
import CueToast from '@/components/controller/CueToast.vue'
import DesktopNotice from '@/components/controller/DesktopNotice.vue'
import EndingSummary from '@/components/controller/EndingSummary.vue'
import ErosionGauge from '@/components/controller/ErosionGauge.vue'
import InterventionPanel from '@/components/controller/InterventionPanel.vue'
import InventoryPanel from '@/components/controller/InventoryPanel.vue'
import LockOverlay from '@/components/controller/LockOverlay.vue'
import ReconnectNotice from '@/components/controller/ReconnectNotice.vue'
import RedMessageOverlay from '@/components/controller/RedMessageOverlay.vue'
import RollButton from '@/components/controller/RollButton.vue'
import TalismanPanel from '@/components/controller/TalismanPanel.vue'
import TrueSightSheet from '@/components/controller/TrueSightSheet.vue'
import VotePanel from '@/components/controller/VotePanel.vue'
import WhisperList from '@/components/controller/WhisperList.vue'
import NoiseOverlay from '@/components/display/NoiseOverlay.vue'
import { useCountdown } from '@/composables/useCountdown'
import { useRoomSocket } from '@/composables/useRoomSocket'
import { useWakeLock } from '@/composables/useWakeLock'
import { BROTHER_LABEL } from '@/constants/brotherLabel'
import { PAUSE_REASON_LABEL } from '@/constants/pauseReasonLabel'
import { STEP_LABEL } from '@/constants/stepLabel'
import { looksLikePhone, resolveDeviceRole } from '@/lib/deviceRole'
import { usePlayStore } from '@/stores/play'

/**
 * Controller 화면 (M4 계획 3절, 5절).
 *
 * **본인 것만 보인다.** 다른 좌석의 잠식도·인벤토리·연결 상태는 이 기기에 오지 않는다 (룰북 §17).
 * 하단 한 자리의 뜻이 단계마다 바뀌고 **자리는 바뀌지 않는다** (M4 계획 3.2).
 *
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
      return canSubmitTalisman.value
        ? '먼저 낸 한 명의 부적만 쓰입니다'
        : '봉인할 부적을 기다립니다'
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

/** 이번 이벤트를 가리키는 값. 버튼의 누름 상태를 이벤트마다 푼다 */
const eventKey = computed(() => `${play.phase ?? ''}:${view.value?.eventNumber ?? ''}`)

/** 투표 중의 보조 동작 — 셋째의 절대 시야와 부적 회복·보류함 정리 (룰북 §3.4, §8, §9.1) */
const showAbility = computed(
  () => step.value === GAME_STEP.VOTING && play.mySeat === BROTHER_ROLE.THIRD && play.privateView !== null,
)
const showTalismanPanel = computed(() => {
  const own = play.privateView
  if (step.value !== GAME_STEP.VOTING || own === null) return false
  return own.talismanCount > 0 || own.talismanOverflow > 0
})

/**
 * 14A 부적 제출 (룰북 §13.5). 선착순 1개라 누른 즉시 막는다.
 * 튜토리얼 부적은 T1에서만 있어 여기서는 세지 않는다 (룰북 §9.2)
 */
const submitPressed = ref(false)
watch(eventKey, () => {
  submitPressed.value = false
})
const canSubmitTalisman = computed(
  () => (play.privateView?.talismanCount ?? 0) > 0 && !submitPressed.value,
)

/** 엔딩 — 조작은 끝나고 요약만 남는다 (룰북 §15, m4-plan 11.1 d) */
const ending = computed(() => (step.value === GAME_STEP.ENDING ? (view.value?.ending ?? null) : null))

/**
 * 강제 잠식은 폰도 노이즈로 덮는다 (룰북 §2.1 "모든 화면", m4-plan 11.1 e).
 * `noiseLock` cue는 Display에만 오므로 스냅샷의 엔딩으로 판단한다
 */
const showNoise = computed(() => ending.value?.id === ENDING_ID.FORCED_EROSION)

/** Phase 3 타겟 — 공개 정보다. 본인이 타겟이면 한 줄 더 강조한다 (룰북 §14.1, m4-plan 5절) */
const targetSeat = computed(() => (ending.value === null ? (view.value?.phase3?.targetSeat ?? null) : null))

/** 일시정지 중에는 전 화면을 덮고 조작을 막는다 (아키텍처 §8) */
const pauseView = computed(() => view.value?.pause ?? null)

/** 연결이 정상이 아닐 때만 한 줄 (M4 실기 2차). 정상이면 아무것도 띄우지 않는다 */
const linkNotice = computed<string | null>(() => {
  if (play.status === 'connecting') return '연결 중…'
  if (play.status === 'closed') return '연결이 끊겼습니다. 다시 붙는 중…'
  return play.stale ? '화면이 밀렸습니다. 다시 붙는 중…' : null
})

function vote(choiceId: string): void {
  socket.send({ type: COMMAND_TYPE.VOTE_SUBMIT, choiceId })
}

function roll(): void {
  socket.send({ type: COMMAND_TYPE.ROLL_REQUEST })
}

function useIntervention(command: Command): void {
  socket.send(command)
}

function useTrueSight(): void {
  socket.send({ type: COMMAND_TYPE.ABILITY_TRUE_SIGHT })
}

function useTalisman(command: Command): void {
  socket.send(command)
}

function submitTalisman(): void {
  submitPressed.value = true
  socket.send({ type: COMMAND_TYPE.TALISMAN_SUBMIT })
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
      <InventoryPanel v-if="play.privateView !== null" :view="play.privateView" />

      <ReconnectNotice :status="play.status" />
      <p v-if="linkNotice !== null" class="controller-head__notice">{{ linkNotice }}</p>
      <p v-else-if="wakeLockNotice" class="controller-head__notice">{{ wakeLockNotice }}</p>
    </header>

    <main class="controller-body">
      <p v-if="view === null" class="controller-body__waiting">방 정보를 받는 중…</p>

      <EndingSummary v-else-if="ending !== null" :ending="ending" :seat-names="play.seatNames" />

      <template v-else>
        <p v-if="targetSeat !== null" class="controller-body__target">
          {{ targetSeat === play.mySeat ? '당신의 눈에서 피눈물이 흐른다' : `타겟 — ${BROTHER_LABEL[targetSeat]}` }}
        </p>
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

        <AbilityButton
          v-if="showAbility && play.privateView !== null"
          :ability-used="play.privateView.abilityUsed"
          :event-key="eventKey"
          @use="useTrueSight"
        />

        <TalismanPanel
          v-if="showTalismanPanel && play.privateView !== null"
          :view="play.privateView"
          :event-key="eventKey"
          @use="useTalisman"
        />

        <p v-if="!isVoting && view.adoptedChoiceId !== null" class="controller-body__adopted">
          채택 —
          {{ view.choices.find((choice) => choice.id === view?.adoptedChoiceId)?.text ?? '' }}
        </p>
      </template>

      <WhisperList v-if="play.privateView !== null" :whispers="play.privateView.whispers" />

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
      v-else-if="step === GAME_STEP.TALISMAN_WINDOW"
      label="부적 제출"
      test-id="talisman-submit"
      :disabled="!canSubmitTalisman"
      :hint="actionHint"
      @press="submitTalisman"
    />

    <ActionBar
      v-else
      :label="null"
      :hint="isVoting ? '마감 전에는 몇 번이든 바꿀 수 있습니다' : actionHint"
    />

    <TrueSightSheet :choices="view?.choices ?? []" />

    <RedMessageOverlay />

    <div v-if="showNoise" class="controller-noise"><NoiseOverlay /></div>

    <CueToast />

    <LockOverlay
      :visible="pauseView !== null"
      :title="pauseView === null ? '' : PAUSE_REASON_LABEL[pauseView.reason].title"
      :detail="pauseView === null ? null : PAUSE_REASON_LABEL[pauseView.reason].detail"
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

.controller-body__target {
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #e7b4b4;
}

/* 노이즈 위에 엔딩 요약이 보이도록 반투명으로 깐다. 아래 버튼은 누를 수 없다 */
.controller-noise {
  position: fixed;
  inset: 0;
  z-index: 20;
  opacity: 0.55;
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
