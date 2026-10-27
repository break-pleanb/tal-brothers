<script setup lang="ts">
import { ref } from 'vue'
import type { WhisperView } from 'tal-brothers-shared'

/**
 * 받은 귓속말 보관함 — **본인이 받은 것만** (룰북 §16, §17).
 *
 * 새로 받은 순간의 연출은 `WhisperVeil`이 맡는다. 덮개는 몇 초 뒤 사라지므로 지난 귓속말을 다시 볼 수 있게
 * 좌석 스냅샷의 `whispers`를 보관한다. 화면을 차지하지 않도록 **접힌 버튼("속삭임 N")으로 두고 눌러서 연다.**
 * 진실인지 거짓인지는 서버도 화면에 싣지 않는다.
 *
 * 귓속말 종류(진입 경고, 티어 환청 등)에 따라 모양을 바꾸지 않는다 — 문장만 보여준다.
 */

defineProps<{ whispers: WhisperView[] }>()

const open = ref(false)
</script>

<template>
  <section v-if="whispers.length > 0" class="whispers" data-testid="whisper">
    <button
      type="button"
      class="whispers__toggle"
      :aria-expanded="open"
      data-testid="whisper-toggle"
      @click="open = !open"
    >
      속삭임 {{ whispers.length }}
      <span class="whispers__chevron" aria-hidden="true">{{ open ? '▴' : '▾' }}</span>
    </button>
    <ol v-if="open" class="whispers__list">
      <li v-for="(whisper, index) in [...whispers].reverse()" :key="index" class="whispers__item">
        {{ whisper.text }}
      </li>
    </ol>
  </section>
</template>

<style scoped>
.whispers {
  margin-top: 1.25rem;
}

.whispers__toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.85rem;
  border: 1px solid rgba(170, 186, 204, 0.25);
  border-radius: 999px;
  background: rgba(10, 14, 20, 0.6);
  font-size: 0.8125rem;
  color: rgba(201, 211, 222, 0.85);
}

.whispers__chevron {
  font-size: 0.6875rem;
}

.whispers__list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(245, 245, 245, 0.1);
}

.whispers__item {
  font-size: 0.8125rem;
  line-height: 1.55;
  color: rgba(245, 245, 245, 0.82);
}
</style>
