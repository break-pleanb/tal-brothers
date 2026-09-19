<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

/**
 * Display 레이아웃 — 16:9 레터박스 스테이지 (M4 계획 2절, 아키텍처 §9.4).
 *
 * - 모니터 비율이 무엇이든 스테이지는 언제나 16:9다. 방송 송출·녹화가 이 안쪽만 잡으면 된다
 * - **스테이지 밖(레터박스 띠)에는 아무것도 그리지 않는다.** 디버그 표시도 넣지 않는다
 * - 크기 계산은 **CSS만** 한다. 창 크기를 바꿔도 같은 그림이 나오도록 JS 리사이즈 계산을 두지 않는다
 * - 스테이지 안의 크기는 전부 `cqw`·`cqh`(컨테이너 단위)다. `vw`를 쓰면 레터박스가 생길 때 비율이 깨진다
 * - **레이어 순서(z-index)는 이 파일이 혼자 들고 있다.** 컴포넌트마다 흩뿌리지 않는다
 */

const route = useRoute()

/** 개발 중에만 `?safe=1`로 세이프존 경계선을 띄운다. 기본은 꺼짐 (M4 계획 2.4) */
const showGuides = computed(() => route.query.safe === '1')
</script>

<template>
  <div class="display-viewport">
    <div class="display-stage" :class="{ 'display-stage--guides': showGuides }">
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
.display-viewport {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100vw;
  height: 100dvh;
  overflow: hidden;
  background: #000;
  /* Display에는 게임 조작이 없다 (룰북 §1). 방 운영 바는 M4-6에서 마우스를 움직일 때만 커서를 되살린다 */
  cursor: none;
}

.display-stage {
  position: relative;
  width: min(100vw, calc(100dvh * 16 / 9));
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: #0a0a0a;
  color: #f5f5f5;
  /* 스테이지 안의 모든 크기가 이 상자를 기준으로 한다 */
  container: stage / size;

  /* 방송 세이프존 (M4 계획 9절 5번) */
  --stage-safe-x: 4cqw;
  --stage-safe-y: 4cqh;
  --stage-cam: 24cqw;

  /* 글자 크기 척도 (M4 계획 2.2). 실기 확인에서 조정하는 값이라 여기 한 곳에 모은다 */
  --stage-title: 3.2cqw;
  --stage-narration: 2cqw;
  --stage-choice: 1.8cqw;
  --stage-hud: 2.4cqw;
  --stage-tag: 1.4cqw;
}
</style>

<style>
/**
 * 스테이지 안에서 쓰는 자리 클래스.
 * 자식 컴포넌트가 함께 쓰므로 scoped로 두지 않는다. **정의는 이 파일에만 있다.**
 */
.stage-layer {
  position: absolute;
  inset: 0;
}

/* 아키텍처 §9.4의 순서 그대로다 */
.stage-layer--background {
  z-index: 0;
}
.stage-layer--vignette {
  z-index: 1;
  pointer-events: none;
}
.stage-layer--mask {
  z-index: 2;
}
.stage-layer--hud {
  z-index: 3;
}
.stage-layer--body {
  z-index: 4;
}
.stage-layer--overlay {
  z-index: 5;
}

/** HUD와 본문은 세이프존 안에만 놓는다. 배경과 덮개는 세이프존을 무시하고 끝까지 채운다 */
.stage-safe {
  position: absolute;
  inset: var(--stage-safe-y) var(--stage-safe-x);
}

/** 방송 캠 오버레이 자리. 이 영역에는 글자를 놓지 않는다 */
.stage-cam-reserved {
  position: absolute;
  right: 0;
  bottom: 0;
  width: var(--stage-cam);
  height: var(--stage-cam);
}

/* `?safe=1`일 때만 보이는 경계선 */
.display-stage--guides .stage-safe {
  outline: 1px dashed rgba(245, 245, 245, 0.35);
}
.display-stage--guides .stage-cam-reserved {
  outline: 1px dashed rgba(220, 120, 120, 0.45);
}
</style>
