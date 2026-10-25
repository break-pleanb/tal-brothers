<script setup lang="ts">
import { computed } from 'vue'
import type { SeatPrivateView } from 'tal-brothers-shared'

/**
 * 인벤토리 — **본인 것만** (룰북 §9, §17).
 *
 * 부적 보유 여부는 비공개이고 사용 사실만 공개된다 (룰북 §9.1). 이 패널은 좌석 스냅샷만 받으므로
 * 다른 좌석의 인벤토리는 애초에 그릴 수 없다.
 *
 * - 튜토리얼 부적은 판정 보정 전용이라 따로 적는다 (룰북 §9.2)
 * - 보류함은 상한을 넘겨 받은 부적이다. 투표 중에 양도하거나 버린다 (룰북 §9.1)
 * - 옥비녀는 보유만 표시한다. 쓰는 곳은 Phase 3다 (룰북 §9.3)
 */

const props = defineProps<{ view: SeatPrivateView }>()

const items = computed(() => {
  const list: string[] = []
  if (props.view.talismanCount > 0) list.push(`낡은 부적 ×${props.view.talismanCount}`)
  if (props.view.tutorialTalismanCount > 0) {
    list.push(`튜토리얼 부적 ×${props.view.tutorialTalismanCount}`)
  }
  if (props.view.talismanOverflow > 0) list.push(`보류함 ×${props.view.talismanOverflow}`)
  if (props.view.hasJadeHairpin) list.push('어머니의 옥비녀')
  return list
})
</script>

<template>
  <div class="inventory" data-testid="inventory">
    <span class="inventory__label">소지품</span>
    <span v-if="items.length === 0" class="inventory__empty">없음</span>
    <span v-for="item in items" :key="item" class="inventory__item">{{ item }}</span>
  </div>
</template>

<style scoped>
.inventory {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.6rem;
  font-size: 0.75rem;
}

.inventory__label {
  color: rgba(245, 245, 245, 0.55);
}

.inventory__empty {
  color: rgba(245, 245, 245, 0.4);
}

.inventory__item {
  padding: 0.1rem 0.5rem;
  border: 1px solid rgba(245, 245, 245, 0.2);
  border-radius: 999px;
  color: rgba(245, 245, 245, 0.9);
}
</style>
