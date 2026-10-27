<script setup lang="ts">
/**
 * 이벤트 제목과 상황 문장 (M4 계획 2.3 레이어 4).
 *
 * 문장은 **서버가 스냅샷에 실어 보낸 것**을 그대로 쓴다. 시나리오 문장을 web에 두지 않는다 (아키텍처 §2).
 * 등장 연출은 제목이 바뀔 때마다 다시 재생한다 — cue가 유실돼도 스냅샷만으로 같은 그림이 된다.
 *
 * 배치 (m5-notes 탈 구도):
 * - `center` — 탈이 없는 이벤트. 가운데에 제목과 문장을 함께 둔다
 * - `split` — 탈이 있는 이벤트의 상황 제시. 제목은 위, 문장은 아래 자막 띠. 가운데는 탈 얼굴 자리다
 * - `compact` — 탈이 있는 이벤트의 투표 이후. 왼쪽 열 맨 위에 작게 둔다
 */

export type NarrationLayout = 'center' | 'split' | 'compact'

withDefaults(
  defineProps<{
    title: string | null
    narration: string | null
    layout?: NarrationLayout
  }>(),
  { layout: 'center' },
)
</script>

<template>
  <div v-if="title !== null" :key="title" class="narration" :class="`narration--${layout}`">
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

/* 제목은 시계 HUD 아래, 가운데 */
.narration--split .narration__title {
  position: absolute;
  top: 9cqh;
  right: 0;
  left: 0;
}

/*
 * 아래 자막 띠 — 왼쪽 아래 공개 알림·좌석 줄 위, 오른쪽은 캠 자리 왼쪽에서 끝난다 (m4-plan 2.4).
 * 세이프존 기준 좌표다
 */
.narration--split .narration__text {
  position: absolute;
  right: calc(var(--stage-cam) - var(--stage-safe-x) + 2cqw);
  bottom: 22cqh;
  left: 0;
  margin-top: 0;
  padding: 1.2cqh 2cqw;
  border-radius: 0.6cqw;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.7) 50%, rgba(0, 0, 0, 0.55));
}

.narration--compact {
  text-align: left;
}

.narration--compact .narration__title {
  font-size: var(--stage-narration);
}

.narration--compact .narration__text {
  margin-top: 0.6cqh;
  font-size: var(--stage-choice);
  line-height: 1.5;
}

@media (prefers-reduced-motion: reduce) {
  .narration {
    animation: none;
  }
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
