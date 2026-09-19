<script setup lang="ts">
import { useRoute } from 'vue-router'

/** Display 화면 자리표시자. 실제 중계 화면은 M4다 (로드맵) */

const route = useRoute()
const roomCode = String(route.params.roomCode ?? '').toUpperCase()
</script>

<template>
  <section class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
    <h1 class="text-2xl font-semibold tracking-widest">{{ roomCode }}</h1>
    <p class="text-sm text-neutral-400">중계 화면은 M4에서 만듭니다.</p>
    <p class="text-xs text-neutral-500">게임은 이미 서버에서 진행 중입니다.</p>
  </section>
</template>
