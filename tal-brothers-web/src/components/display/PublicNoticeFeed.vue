<script setup lang="ts">
import { computed } from 'vue'
import type { NoticeView } from 'tal-brothers-shared'

/**
 * 공개 알림 (룰북 §17).
 *
 * 능력·부적 사용자 이름, 익명 디버프·저주, 귓속말 발송 알림, 득표 수, 13번 발목 대상, Phase 3 타겟,
 * 옥비녀 이동, 엔딩 — 서버가 공개해도 된다고 정한 것만 `notices`로 온다. 문장도 서버가 만든다.
 *
 * - 최근 몇 건만 보여주고 오래된 것일수록 흐리게 한다. 방송 화면을 글자로 채우지 않는다
 * - **자리는 왼쪽 아래, 좌석 줄 위다.** 오른쪽 아래는 캠 오버레이 자리라 글자를 놓지 않는다 (m4-plan 2.4)
 */

const props = defineProps<{ notices: NoticeView[] }>()

/** 화면에 남겨 두는 건수. 화면 전용 값이다 */
const VISIBLE = 4

const visible = computed(() => props.notices.slice(-VISIBLE))
</script>

<template>
  <ol class="notice-feed" data-testid="notice-feed">
    <li
      v-for="(notice, index) in visible"
      :key="`${notices.length - visible.length + index}`"
      class="notice-feed__item"
      :style="{ opacity: String(0.45 + (0.55 * (index + 1)) / visible.length) }"
    >
      {{ notice.text }}
    </li>
  </ol>
</template>

<style scoped>
.notice-feed {
  display: flex;
  flex-direction: column;
  gap: 0.6cqh;
  max-width: 40cqw;
  font-size: var(--stage-tag);
  line-height: 1.4;
  color: rgba(245, 245, 245, 0.9);
}

.notice-feed__item {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
