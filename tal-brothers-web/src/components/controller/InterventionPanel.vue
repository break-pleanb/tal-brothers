<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { BROTHER_ROLE, COMMAND_TYPE, GAME_STEP } from 'tal-brothers-shared'
import type { BrotherRole, Command, GameStep, JudgmentView, SeatPrivateView } from 'tal-brothers-shared'

import { Button } from '@/components/ui/button'

/**
 * 개입 창 — **단계마다 쓸 수 있는 수단 하나** (룰북 §7.2, §7.4, §12).
 *
 * - 1단계는 둘째 재굴림, 2단계는 부적 보유자, 3단계는 첫째 강제 성공이다
 * - **부적은 판정당 1개, 서버 도달 선착순이다.** 누른 즉시 버튼을 비활성화해 두 번 누르지 않게 한다.
 *   선착순 판정 자체는 방당 직렬 큐가 한다 (아키텍처 §6)
 * - 연습 개입 창은 세 수단을 모두 눌러볼 수 있고, 효과 대신 설명이 뜬다 (룰북 §12)
 * - 쓸 수 있는지의 최종 판정은 서버가 한다. 버튼 비활성화는 편의일 뿐이다 (아키텍처 §7.1)
 */

const props = defineProps<{
  step: GameStep | null
  judgment: JudgmentView | null
  mySeat: BrotherRole | null
  /** 본인 좌석 정보. 좌석이 없는 기기는 null */
  privateView: SeatPrivateView | null
}>()

const emit = defineEmits<{ use: [command: Command] }>()

/** 누른 뒤 응답을 기다리는 동안 다시 누르지 못하게 한다 */
const pressed = ref(false)
watch(
  () => props.step,
  () => {
    pressed.value = false
  },
)

const isPractice = computed(() => props.step === GAME_STEP.PRACTICE_INTERVENTION)

/** 이 판정에서 부적이 이미 쓰였는지 — 공개 정보다 (룰북 §7.4) */
const talismanUsed = computed(
  () => props.judgment?.interventions.some((record) => record.kind === 'talisman') === true,
)

const talismanCount = computed(
  () =>
    (props.privateView?.talismanCount ?? 0) + (props.privateView?.tutorialTalismanCount ?? 0),
)

const canReroll = computed(
  () => props.mySeat === BROTHER_ROLE.SECOND && props.privateView?.abilityUsed === false,
)
const canTalisman = computed(() => talismanCount.value > 0 && !talismanUsed.value)
const canForce = computed(
  () => props.mySeat === BROTHER_ROLE.FIRST && props.privateView?.abilityUsed === false,
)

type Action = { label: string; command: Command; enabled: boolean }

/** 이 단계에서 내가 누를 수 있는 것. 연습 창에서는 셋 다 보여준다 */
const actions = computed<Action[]>(() => {
  const reroll: Action = {
    label: '주사위 다시 굴리기',
    command: { type: COMMAND_TYPE.INTERVENTION_REROLL },
    enabled: canReroll.value,
  }
  const talisman: Action = {
    label: `낡은 부적 쓰기 (최종값 +1)`,
    command: { type: COMMAND_TYPE.INTERVENTION_TALISMAN },
    enabled: canTalisman.value,
  }
  const force: Action = {
    label: '강제 성공 (내 잠식 +15%)',
    command: { type: COMMAND_TYPE.INTERVENTION_FORCE_SUCCESS },
    enabled: canForce.value,
  }

  if (isPractice.value) return [reroll, talisman, force]

  switch (props.step) {
    case GAME_STEP.INTERVENTION_REROLL:
      return canReroll.value ? [reroll] : []
    case GAME_STEP.INTERVENTION_TALISMAN:
      return canTalisman.value ? [talisman] : []
    case GAME_STEP.INTERVENTION_FORCE:
      return canForce.value ? [force] : []
    default:
      return []
  }
})

const hint = computed(() => {
  if (isPractice.value) return '연습입니다. 눌러도 부적과 능력은 소모되지 않습니다'
  if (actions.value.length === 0) return '지금 쓸 수 있는 수단이 없습니다'
  return '쓰지 않으면 다음 단계로 넘어갑니다'
})

function use(action: Action): void {
  // 부적은 선착순이라 누른 즉시 막는다. 연습 창은 몇 번이든 눌러볼 수 있다
  if (!isPractice.value) pressed.value = true
  emit('use', action.command)
}
</script>

<template>
  <div class="controller-bottom intervention">
    <p class="intervention__hint">{{ hint }}</p>
    <div class="intervention__actions">
      <Button
        v-for="action in actions"
        :key="action.command.type"
        class="intervention__button"
        size="lg"
        :disabled="!action.enabled || pressed"
        @click="use(action)"
      >
        {{ action.label }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.intervention {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.4rem;
}

.intervention__hint {
  font-size: 0.75rem;
  color: rgba(245, 245, 245, 0.55);
  text-align: center;
}

.intervention__actions {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.intervention__button {
  width: 100%;
}
</style>
