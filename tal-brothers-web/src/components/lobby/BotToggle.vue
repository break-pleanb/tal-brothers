<script setup lang="ts">
import type { BrotherRole, LobbySeatView } from 'tal-brothers-shared'

import { Button } from '@/components/ui/button'

/**
 * 봇 토글 (아키텍처 §9.1). 호스트 Display만 쓴다.
 * 사람이 앉은 좌석은 봇으로 돌릴 수 없다 — 버튼을 비활성화하되 판정은 서버가 한다 (아키텍처 §7.1).
 */

defineProps<{ seats: LobbySeatView[] }>()

const emit = defineEmits<{ toggle: [seat: BrotherRole, isBot: boolean] }>()
</script>

<template>
  <div class="space-y-2">
    <p class="text-xs text-neutral-400">
      시작하면 빈 좌석은 봇이 됩니다. 미리 봇으로 지정할 수도 있습니다.
    </p>
    <div class="flex flex-wrap gap-2">
      <Button
        v-for="seat in seats"
        :key="seat.seat"
        size="sm"
        :variant="seat.isBot ? 'default' : 'outline'"
        :disabled="seat.occupied"
        @click="emit('toggle', seat.seat, !seat.isBot)"
      >
        {{ seat.seat }} · {{ seat.isBot ? '봇' : '사람' }}
      </Button>
    </div>
  </div>
</template>
