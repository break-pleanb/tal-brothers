<script setup lang="ts">
import { computed } from 'vue'
import { JUDGMENT_KIND } from 'tal-brothers-shared'
import type { BrotherRole, JudgmentView } from 'tal-brothers-shared'

import { Button } from '@/components/ui/button'

/**
 * 굴림 버튼 (룰북 §5.2, 아키텍처 §8).
 *
 * - **개인 판정은 판정자만, 협동·대립은 참여자가 각자 자기 주사위를 굴린다.**
 *   누가 굴리는지는 서버가 `judgment.dice`에 좌석을 실어 알려 준다 — 화면이 계산하지 않는다
 * - **비공개 판정은 `dice`가 오지 않으므로 `rollerSeat`으로 판단한다** (룰북 §5.4, §21).
 *   판정자는 공개 정보지만 주사위·기준·성패는 판정자에게도 오지 않는다
 * - 10초 안에 누르지 않으면 서버가 대신 굴린다. 화면은 남은 시간만 보여주고 아무것도 보내지 않는다
 */

const props = defineProps<{
  judgment: JudgmentView | null
  mySeat: BrotherRole | null
  /** 이번 판정을 굴리는 좌석. 협동 판정은 null이고 `dice`가 참여자를 알려 준다 */
  rollerSeat: BrotherRole | null
}>()

const emit = defineEmits<{ roll: [] }>()

const isHidden = computed(() => props.judgment?.kind === JUDGMENT_KIND.HIDDEN)

/** 내가 굴려야 하는 주사위. 없으면 이 판정에서 굴릴 것이 없다 */
const myDie = computed(() => {
  if (props.mySeat === null) return null
  return props.judgment?.dice?.find((die) => die.seat === props.mySeat) ?? null
})

/** 내가 비공개 판정의 판정자인지. 이때는 굴릴 주사위가 스냅샷에 오지 않는다 */
const isHiddenRoller = computed(
  () => isHidden.value && props.mySeat !== null && props.mySeat === props.rollerSeat,
)

/**
 * 이 단계는 `ROLL_WAIT`에서만 그려진다.
 * 비공개 판정은 굴리는 순간 다음 단계로 넘어가므로, 여기 있다는 것은 아직 굴리지 않았다는 뜻이다.
 */
const canRoll = computed(
  () => isHiddenRoller.value || (myDie.value !== null && myDie.value.value === null),
)

const hint = computed(() => {
  if (isHiddenRoller.value) return '비공개 판정입니다. 결과는 당신에게도 공개되지 않습니다'
  if (isHidden.value) return '누군가 비공개 판정을 하는 중입니다'
  if (myDie.value === null) return '다른 형제의 판정을 기다리는 중'
  if (myDie.value.value !== null) return `굴린 값 ${myDie.value.value}`
  return '10초 안에 굴리지 않으면 자동으로 굴려집니다'
})
</script>

<template>
  <div class="controller-bottom roll-button">
    <p class="roll-button__hint">{{ hint }}</p>
    <Button v-if="canRoll" class="roll-button__button" size="lg" @click="emit('roll')">
      주사위 굴리기
    </Button>
  </div>
</template>

<style scoped>
.roll-button {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.4rem;
}

.roll-button__hint {
  font-size: 0.75rem;
  color: rgba(245, 245, 245, 0.55);
  text-align: center;
}

.roll-button__button {
  width: 100%;
}
</style>
