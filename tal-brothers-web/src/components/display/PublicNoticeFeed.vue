<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { PUBLIC_NOTICE_KIND } from 'tal-brothers-shared'
import type { NoticeView } from 'tal-brothers-shared'

import { MOTION_TIMING } from '@/constants/motionTiming'

/**
 * 공개 알림 (룰북 §17).
 *
 * 능력·부적 사용자 이름, 익명 디버프·저주, 귓속말 발송 알림, 득표 수, 13번 발목 대상, Phase 3 타겟,
 * 옥비녀 이동, 엔딩 — 서버가 공개해도 된다고 정한 것만 `notices`로 온다. 문장도 서버가 만든다.
 *
 * - **최근 3건만** 보여준다. 방송 화면을 글자로 채우지 않는다
 * - 새로 붙은 알림은 잠깐 밝게 떴다가 흐려진다. 처음 접속했을 때 이미 있던 알림은 강조하지 않는다
 * - **다음 이벤트가 시작되면 지난 이벤트의 득표 알림은 지운다.** 득표 수는 그 이벤트의 결과라 다음 이벤트에서는
 *   지금 투표의 득표로 오해된다. 다른 알림(사용자 이름·익명 디버프 등)은 그대로 둔다
 * - **자리는 왼쪽 아래, 좌석 줄 위다.** 오른쪽 아래는 캠 오버레이 자리라 글자를 놓지 않는다 (m4-plan 2.4)
 *
 * 서버의 `notices`는 지우지 않고 쌓기만 하므로 **위치 번호가 곧 알림의 식별자**다.
 */

const props = defineProps<{
  notices: NoticeView[]
  /** 지금 이벤트를 가리키는 값. 바뀌면 그 앞의 득표 알림을 지운다 */
  eventKey: string
  /** 지금 이벤트의 투표가 이미 마감됐는지. 새로고침 직후 마지막 득표 알림이 이번 것인지 가른다 */
  voteClosed: boolean
}>()

/** 화면에 남겨 두는 건수. 화면 전용 값이다 */
const VISIBLE = 3

/** 이 위치 번호보다 앞의 득표 알림은 지난 이벤트 것이다 */
const tallyCutoff = ref(0)
/** 이 위치 번호부터 새로 붙은 알림이다 */
const freshFrom = ref(props.notices.length)

function lastTallyIndex(): number {
  return props.notices.map((notice) => notice.kind).lastIndexOf(PUBLIC_NOTICE_KIND.VOTE_TALLY)
}

// 처음 접속(새로고침)했을 때 이번 이벤트의 투표가 끝났으면 마지막 득표 알림은 이번 이벤트 것이다
tallyCutoff.value = props.voteClosed ? Math.max(0, lastTallyIndex()) : props.notices.length

watch(
  () => props.eventKey,
  () => {
    tallyCutoff.value = props.notices.length
  },
)

type Entry = { index: number; text: string; fresh: boolean }

const visible = computed<Entry[]>(() =>
  props.notices
    .map((notice, index) => ({ notice, index }))
    .filter(({ notice, index }) => notice.kind !== PUBLIC_NOTICE_KIND.VOTE_TALLY || index >= tallyCutoff.value)
    .slice(-VISIBLE)
    .map(({ notice, index }) => ({ index, text: notice.text, fresh: index >= freshFrom.value })),
)

const motion = { '--notice-highlight': `${MOTION_TIMING.noticeHighlightMs}ms` }
</script>

<template>
  <ol class="notice-feed" data-testid="notice-feed" :style="motion">
    <li
      v-for="entry in visible"
      :key="entry.index"
      class="notice-feed__item"
      :class="{ 'notice-feed__item--fresh': entry.fresh }"
    >
      {{ entry.text }}
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
  opacity: 0.6;
}

/* 밝게 떴다가 다른 알림과 같은 흐린 상태로 가라앉는다 */
.notice-feed__item--fresh {
  animation: notice-highlight var(--notice-highlight) ease-out;
}

@keyframes notice-highlight {
  0% {
    opacity: 0;
    transform: translateX(-1cqw);
  }
  12% {
    opacity: 1;
    transform: none;
    text-shadow: 0 0 0.8cqw rgba(245, 245, 245, 0.6);
  }
  60% {
    opacity: 1;
  }
  100% {
    opacity: 0.6;
  }
}

@media (prefers-reduced-motion: reduce) {
  .notice-feed__item--fresh {
    animation: none;
  }
}
</style>
