<script setup lang="ts">
/**
 * 조작 잠금 덮개 (M4 계획 5절).
 *
 * 일시정지(아키텍처 §8)와 타임오버(룰북 §2.1)에서 화면을 덮고 **입력을 막는다.**
 * 잠금 판정은 서버 스냅샷을 따라간다. 화면이 스스로 잠그거나 푸는 일은 없다.
 */

defineProps<{
  visible: boolean
  title: string
  detail?: string | null
}>()
</script>

<template>
  <div v-if="visible" class="lock-overlay">
    <p class="lock-overlay__title">{{ title }}</p>
    <p v-if="detail" class="lock-overlay__detail">{{ detail }}</p>
  </div>
</template>

<style scoped>
.lock-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem;
  text-align: center;
  background: rgba(5, 5, 5, 0.92);
}

.lock-overlay__title {
  font-size: 1.25rem;
  font-weight: 600;
}

.lock-overlay__detail {
  font-size: 0.875rem;
  color: rgba(245, 245, 245, 0.6);
}
</style>
