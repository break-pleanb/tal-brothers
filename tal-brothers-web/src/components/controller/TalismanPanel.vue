<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { BROTHER_ROLE, COMMAND_TYPE } from 'tal-brothers-shared'
import type { BrotherRole, Command, SeatPrivateView } from 'tal-brothers-shared'

import { Button } from '@/components/ui/button'
import { BROTHER_LABEL } from '@/constants/brotherLabel'

/**
 * 투표 중의 부적 보조 동작 (룰북 §8, §9.1, §9.2).
 *
 * - **회복:** 낡은 부적 1개로 본인 잠식을 씻는다. 튜토리얼 부적은 판정 보정 전용이라 세지 않는다 (룰북 §9.2)
 * - **보류함 정리:** 상한을 넘겨 받은 부적을 다른 형제에게 건네거나 버린다 (룰북 §9.1).
 *   건넨 사실은 받는 사람에게만 알려지고 Display에는 나가지 않는다 (룰북 §21)
 *
 * 실수로 누르면 안 되는 동작이라 하단 액션바가 아니라 가운데 영역에 둔다 (m4-plan 3.2).
 * 14A 부적 제출은 그 단계의 주 버튼이라 액션바가 맡는다.
 * 쓸 수 있는지의 최종 판정은 서버가 한다 (아키텍처 §7.1).
 */

const props = defineProps<{
  view: SeatPrivateView
  /** 이번 투표를 가리키는 값. 바뀌면 누름 상태를 푼다 */
  eventKey: string
}>()

const emit = defineEmits<{ use: [command: Command] }>()

/** 회복은 한 번 누르면 스냅샷이 바뀔 때까지 막는다 — 두 번 눌러 부적 두 개가 나가지 않게 */
const healPending = ref(false)
watch(
  () => [props.eventKey, props.view.talismanCount] as const,
  () => {
    healPending.value = false
  },
)

const canHeal = computed(() => props.view.talismanCount > 0 && !healPending.value)
const hasOverflow = computed(() => props.view.talismanOverflow > 0)
const otherSeats = computed<BrotherRole[]>(() =>
  [BROTHER_ROLE.FIRST, BROTHER_ROLE.SECOND, BROTHER_ROLE.THIRD].filter((seat) => seat !== props.view.seat),
)

function heal(): void {
  healPending.value = true
  emit('use', { type: COMMAND_TYPE.TALISMAN_HEAL })
}

function transfer(seat: BrotherRole): void {
  emit('use', { type: COMMAND_TYPE.TALISMAN_TRANSFER, toSeat: seat })
}

function discard(): void {
  emit('use', { type: COMMAND_TYPE.TALISMAN_DISCARD })
}
</script>

<template>
  <div class="talisman" data-testid="talisman-panel">
    <div v-if="view.talismanCount > 0" class="talisman__block">
      <Button
        class="talisman__wide"
        variant="secondary"
        data-testid="talisman-heal"
        :disabled="!canHeal"
        @click="heal"
      >
        낡은 부적으로 잠식 씻기
      </Button>
      <p class="talisman__hint">부적 1개를 씁니다. 사용 사실은 중계 화면에 공개됩니다</p>
    </div>

    <div v-if="hasOverflow" class="talisman__block">
      <p class="talisman__title">보류함 부적 {{ view.talismanOverflow }}개 — 투표가 끝나면 사라집니다</p>
      <div class="talisman__row">
        <Button
          v-for="seat in otherSeats"
          :key="seat"
          variant="secondary"
          data-testid="talisman-transfer"
          :data-seat="seat"
          @click="transfer(seat)"
        >
          {{ BROTHER_LABEL[seat] }}에게 건네기
        </Button>
        <Button variant="secondary" data-testid="talisman-discard" @click="discard">버리기</Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.talisman {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.talisman__wide {
  width: 100%;
}

.talisman__hint {
  margin-top: 0.35rem;
  font-size: 0.75rem;
  color: rgba(245, 245, 245, 0.55);
}

.talisman__title {
  margin-bottom: 0.5rem;
  font-size: 0.8125rem;
  color: rgba(245, 245, 245, 0.8);
}

.talisman__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
