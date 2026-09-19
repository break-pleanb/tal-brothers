<script setup lang="ts">
import { Button } from '@/components/ui/button'

/**
 * 액션바 — 단계별 주 버튼 **한 자리** (M4 계획 3.2, 5절).
 *
 * 단계마다 버튼의 뜻이 바뀌고 **자리는 바뀌지 않는다.** 엄지로 닿는 하단에 둔다.
 * 보조 동작(부적 회복, 절대 시야, 양도·버림)은 여기 두지 않는다 — 실수로 누르면 안 되는 것들이다.
 *
 * 버튼 비활성화는 편의일 뿐이고 **단계·좌석 판정은 서버가 한다** (아키텍처 §7.1).
 */

defineProps<{
  /** 버튼 글자. 누를 것이 없는 단계에서는 안내 문구만 남기고 버튼을 숨긴다 */
  label: string | null
  disabled?: boolean
  /** 버튼 위 한 줄 안내. 지금 무엇을 기다리는지 알려 준다 */
  hint?: string | null
}>()

const emit = defineEmits<{ press: [] }>()
</script>

<template>
  <div class="controller-bottom action-bar">
    <p v-if="hint" class="action-bar__hint">{{ hint }}</p>
    <Button
      v-if="label !== null"
      class="action-bar__button"
      size="lg"
      :disabled="disabled === true"
      @click="emit('press')"
    >
      {{ label }}
    </Button>
  </div>
</template>

<style scoped>
.action-bar {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.4rem;
}

.action-bar__hint {
  font-size: 0.75rem;
  color: rgba(245, 245, 245, 0.55);
  text-align: center;
}

.action-bar__button {
  width: 100%;
}
</style>
