<script setup lang="ts">
import JoinQrPanel from '@/components/lobby/JoinQrPanel.vue'

/**
 * PC로 조작 화면을 열었을 때의 안내 (M4 계획 3.4, 9절 6번).
 *
 * 룰북 §1은 "폰(Controller)으로만 조작"이지만 **막지는 않는다.**
 * 개발·디버깅에 필요하고, 막아도 화면이 옆 사람에게 보이는 것은 어차피 막지 못한다 (룰북 §20).
 *
 * 판단은 **화면 폭이 아니라 포인터 종류**로 한다. 창을 좁혀도 PC는 PC다 (M4 계획 3.4).
 */

defineProps<{ roomCode: string }>()

const emit = defineEmits<{ dismiss: [] }>()
</script>

<template>
  <div class="desktop-notice">
    <p class="desktop-notice__title">조작은 폰으로 합니다</p>
    <p class="desktop-notice__body">
      이 화면은 PC로 열렸습니다. 폰으로 아래 QR을 찍어 같은 방에 들어오세요.
      PC 화면은 옆 사람에게 보일 수 있습니다.
    </p>

    <JoinQrPanel :room-code="roomCode" />

    <button type="button" class="desktop-notice__dismiss" @click="emit('dismiss')">
      그래도 이 화면에서 조작하기
    </button>
  </div>
</template>

<style scoped>
.desktop-notice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem 1rem;
  text-align: center;
}

.desktop-notice__title {
  font-size: 1.125rem;
  font-weight: 600;
}

.desktop-notice__body {
  max-width: 28rem;
  font-size: 0.875rem;
  color: rgba(245, 245, 245, 0.6);
}

.desktop-notice__dismiss {
  font-size: 0.8125rem;
  color: rgba(245, 245, 245, 0.5);
  text-decoration: underline;
}
</style>
