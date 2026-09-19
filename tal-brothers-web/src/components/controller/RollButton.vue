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
 * - 10초 안에 누르지 않으면 서버가 대신 굴린다. 화면은 남은 시간만 보여주고 아무것도 보내지 않는다
 * - **비공개 판정은 굴릴 좌석이 스냅샷에 없다.** 판정자를 알 수 없어 버튼을 띄우지 못한다
 *   → `docs/m4-notes.md`의 확인 필요. 그동안은 서버의 자동 굴림에 맡긴다
 */

const props = defineProps<{
  judgment: JudgmentView | null
  mySeat: BrotherRole | null
}>()

const emit = defineEmits<{ roll: [] }>()

const isHidden = computed(() => props.judgment?.kind === JUDGMENT_KIND.HIDDEN)

/** 내가 굴려야 하는 주사위. 없으면 이 판정에서 굴릴 것이 없다 */
const myDie = computed(() => {
  if (props.mySeat === null) return null
  return props.judgment?.dice?.find((die) => die.seat === props.mySeat) ?? null
})

const canRoll = computed(() => myDie.value !== null && myDie.value.value === null)

const hint = computed(() => {
  if (isHidden.value) return '비공개 판정입니다. 결과는 아무에게도 공개되지 않습니다'
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
