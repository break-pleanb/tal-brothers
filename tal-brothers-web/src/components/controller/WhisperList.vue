<script setup lang="ts">
import type { WhisperView } from 'tal-brothers-shared'

/**
 * 받은 귓속말 목록 — **본인이 받은 것만** (룰북 §16, §17).
 *
 * 새로 받은 순간의 알림은 `CueToast`가 맡는다. 토스트는 4초 뒤 사라지므로, 지난 귓속말을 다시 볼 수 있게
 * 좌석 스냅샷의 `whispers`를 그대로 늘어놓는다. 진실인지 거짓인지는 서버도 화면에 싣지 않는다.
 *
 * 귓속말 종류(진입 경고, 티어 환청 등)에 따라 모양을 바꾸지 않는다 — 문장만 보여준다.
 */

defineProps<{ whispers: WhisperView[] }>()
</script>

<template>
  <section v-if="whispers.length > 0" class="whispers" data-testid="whisper">
    <p class="whispers__title">받은 귓속말 {{ whispers.length }}</p>
    <ol class="whispers__list">
      <li v-for="(whisper, index) in [...whispers].reverse()" :key="index" class="whispers__item">
        {{ whisper.text }}
      </li>
    </ol>
  </section>
</template>

<style scoped>
.whispers {
  margin-top: 1.25rem;
  padding-top: 0.9rem;
  border-top: 1px solid rgba(245, 245, 245, 0.1);
}

.whispers__title {
  margin-bottom: 0.5rem;
  font-size: 0.75rem;
  color: rgba(245, 245, 245, 0.55);
}

.whispers__list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.whispers__item {
  font-size: 0.8125rem;
  line-height: 1.55;
  color: rgba(245, 245, 245, 0.82);
}
</style>
