<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { Button } from '@/components/ui/button'

/**
 * 셋째의 절대 시야 (룰북 §3.4, §3.5).
 *
 * - 투표 시간 중에만 쓴다. 첫째·둘째의 능력은 개입 창(`InterventionPanel`)에 있다
 * - **배신자여도 숨기거나 비활성화하지 않는다** (룰북 §3.5). 화면은 배신자 여부를 모른다
 * - 쓸 수 있는지의 최종 판정은 서버가 한다. 한 번 누르면 응답이 올 때까지 다시 누르지 못하게만 한다
 */

const props = defineProps<{
  /** 고유 능력을 이미 썼는지 (T1·T2 사용은 횟수를 소모하지 않는다, 룰북 §3.5) */
  abilityUsed: boolean
  /** 이번 투표를 가리키는 값. 바뀌면 누름 상태를 푼다 */
  eventKey: string
}>()

const emit = defineEmits<{ use: [] }>()

const pressed = ref(false)
watch(
  () => props.eventKey,
  () => {
    pressed.value = false
  },
)

const disabled = computed(() => props.abilityUsed || pressed.value)

function use(): void {
  pressed.value = true
  emit('use')
}
</script>

<template>
  <div class="ability">
    <Button
      class="ability__button"
      variant="secondary"
      data-testid="ability-true-sight"
      :disabled="disabled"
      @click="use"
    >
      절대 시야 — 모든 선택지의 실제 변이 보기
    </Button>
    <p class="ability__hint">
      {{ abilityUsed ? '절대 시야를 이미 썼습니다' : '게임당 한 번. 사용 사실은 중계 화면에 공개됩니다' }}
    </p>
  </div>
</template>

<style scoped>
.ability {
  margin-top: 1rem;
}

.ability__button {
  width: 100%;
}

.ability__hint {
  margin-top: 0.35rem;
  font-size: 0.75rem;
  color: rgba(245, 245, 245, 0.55);
}
</style>
