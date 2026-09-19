<script setup lang="ts">
/**
 * Controller 레이아웃 — 폰 3단 구성 (M4 계획 3절, 아키텍처 §9.4).
 *
 * ```
 * ┌──────────────────────────────┐
 * │ 상단 고정 — 잠식도, 이름, 남은 시간 │
 * ├──────────────────────────────┤
 * │ 가운데 — 여기만 스크롤            │
 * ├──────────────────────────────┤
 * │ 하단 고정 — 액션바 (주 버튼 한 자리) │
 * └──────────────────────────────┘
 * ```
 *
 * - **엄지로 닿는 하단에 주 버튼 하나.** 단계마다 뜻이 바뀌고 자리는 바뀌지 않는다
 * - 세이프에어리어는 **고정 요소마다 각자** 더한다. 상단은 위쪽 인셋, 하단은 아래쪽 인셋
 * - 주소창이 접혔다 펴지는 높이 변화는 `100dvh`로 받는다
 * - 자리 클래스의 정의는 이 파일에만 둔다 (DisplayLayout과 같은 방식)
 */
</script>

<template>
  <div class="controller-frame">
    <RouterView />
  </div>
</template>

<style scoped>
.controller-frame {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
  background: #0a0a0a;
  color: #f5f5f5;
}
</style>

<style>
.controller-top {
  flex: none;
  padding: calc(0.75rem + env(safe-area-inset-top, 0px)) 1rem 0.75rem;
  padding-left: calc(1rem + env(safe-area-inset-left, 0px));
  padding-right: calc(1rem + env(safe-area-inset-right, 0px));
  border-bottom: 1px solid rgba(245, 245, 245, 0.1);
}

/** 가운데만 스크롤한다. 단계가 바뀌어도 상·하단은 움직이지 않는다 */
.controller-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 1rem;
  padding-left: calc(1rem + env(safe-area-inset-left, 0px));
  padding-right: calc(1rem + env(safe-area-inset-right, 0px));
}

.controller-bottom {
  flex: none;
  /** 가운데가 비어 있는 단계에도 높이가 흔들리지 않게 최소 높이를 고정한다 */
  min-height: 4.5rem;
  padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px));
  padding-left: calc(1rem + env(safe-area-inset-left, 0px));
  padding-right: calc(1rem + env(safe-area-inset-right, 0px));
  border-top: 1px solid rgba(245, 245, 245, 0.1);
}
</style>
