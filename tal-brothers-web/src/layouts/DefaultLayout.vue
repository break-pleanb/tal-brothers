<script setup lang="ts">
/**
 * 공통 레이아웃 (아키텍처 §9.2).
 * 랜딩·메뉴·초대·로비가 함께 쓴다. Display·Controller 전용 레이아웃은 M4다.
 */
</script>

<template>
  <div class="min-h-dvh bg-neutral-950 text-neutral-100">
    <main
      class="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-6 py-10"
      style="padding-bottom: calc(2.5rem + env(safe-area-inset-bottom, 0px))"
    >
      <RouterView />
    </main>
  </div>
</template>
