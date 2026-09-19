<script setup lang="ts">
import { computed } from 'vue'
import type { AssetKey } from 'tal-brothers-shared'

import { ASSET_PLACEHOLDER } from '@/constants/assetPlaceholder'

/**
 * 탈 잔상 레이어 (M4 계획 2.3 레이어 2, 7절).
 *
 * M4는 **이름 카드와 단색 실루엣 도형**만 둔다. 탈 이미지와 잔상 연출은 M5다.
 * 자리·크기는 최종 형태로 맞춰 두어 M5가 이미지만 갈아끼우면 되게 한다.
 */

const props = defineProps<{ mask: AssetKey | null }>()

const placeholder = computed(() => (props.mask === null ? null : ASSET_PLACEHOLDER[props.mask]))
</script>

<template>
  <div v-if="placeholder !== null" class="stage-layer stage-layer--mask mask-apparition">
    <div
      class="mask-apparition__silhouette"
      :style="{ background: `radial-gradient(60% 60% at 50% 40%, ${placeholder.base}, transparent 70%)` }"
    />
    <p class="mask-apparition__label">{{ placeholder.label }}</p>
  </div>
</template>

<style scoped>
.mask-apparition {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.mask-apparition__silhouette {
  width: 26cqw;
  height: 26cqw;
  border-radius: 50% 50% 45% 45%;
  opacity: 0.85;
}

.mask-apparition__label {
  margin-top: -3cqh;
  font-size: var(--stage-title);
  font-weight: 700;
  letter-spacing: 0.18em;
  color: rgba(245, 245, 245, 0.32);
}
</style>
