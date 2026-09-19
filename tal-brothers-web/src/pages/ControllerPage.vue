<script setup lang="ts">
import { useRoute } from 'vue-router'

/** Controller 화면 자리표시자. 실제 조작 화면은 M4다 (로드맵) */

const route = useRoute()
const roomCode = String(route.params.roomCode ?? '').toUpperCase()
</script>

<template>
  <section class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
    <h1 class="text-2xl font-semibold tracking-widest">{{ roomCode }}</h1>
    <p class="text-sm text-neutral-400">조작 화면은 M4에서 만듭니다.</p>
    <p class="text-xs text-neutral-500">이 폰이 당신의 좌석에 연결돼 있습니다.</p>
  </section>
</template>
