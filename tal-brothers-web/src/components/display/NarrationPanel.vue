<script setup lang="ts">
/**
 * 이벤트 제목과 상황 문장 (M4 계획 2.3 레이어 4).
 *
 * 문장은 **서버가 스냅샷에 실어 보낸 것**을 그대로 쓴다. 시나리오 문장을 web에 두지 않는다 (아키텍처 §2).
 * 등장 연출은 제목이 바뀔 때마다 다시 재생한다 — cue가 유실돼도 스냅샷만으로 같은 그림이 된다.
 */

defineProps<{
  title: string | null
  narration: string | null
}>()
</script>

<template>
  <div v-if="title !== null" :key="title" class="narration">
    <p class="narration__title">{{ title }}</p>
    <p v-if="narration !== null" class="narration__text">{{ narration }}</p>
  </div>
</template>

<style scoped>
.narration {
  text-align: center;
  animation: narration-in 420ms ease-out;
}

.narration__title {
  font-size: var(--stage-title);
  font-weight: 700;
  letter-spacing: 0.04em;
}

.narration__text {
  margin-top: 1cqh;
  font-size: var(--stage-narration);
  line-height: 1.6;
  color: rgba(245, 245, 245, 0.82);
}

@keyframes narration-in {
  from {
    opacity: 0;
    transform: translateY(1.5cqh);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
