<script setup lang="ts">
import { ROUTE_NAME } from '@/constants/routeName'
</script>

<template>
  <section class="flex flex-1 flex-col items-center justify-center gap-4 text-center">
    <h1 class="text-2xl font-semibold">길을 잃었습니다</h1>
    <p class="text-sm text-neutral-400">없는 주소입니다.</p>
    <RouterLink class="text-sm underline" :to="{ name: ROUTE_NAME.LANDING }">
      처음으로 돌아가기
    </RouterLink>
  </section>
</template>
