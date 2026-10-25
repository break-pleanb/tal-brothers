<script setup lang="ts">
import { computed } from 'vue'
import { VARIANT_KIND } from 'tal-brothers-shared'
import type { ChoiceView, VariantDetailView, VariantKind } from 'tal-brothers-shared'

import { Button } from '@/components/ui/button'
import { useCueQueue } from '@/composables/useCueQueue'
import { variantDetailText } from '@/lib/variantDetailText'

/**
 * 절대 시야 결과 (룰북 §3.4, §6.4).
 *
 * `trueSightResult` cue는 셋째 좌석에게만 온다. 본인이 닫을 때까지 띄워 둔다 (모달 채널).
 * 가짜 라벨이 적용되지 않은 **실제 변이**다 (룰북 §3.4).
 *
 * 열람 화면에는 **라벨과 최종 적용값**을 함께 적는다 (룰북 §6.4). 최종값은 좌석 스냅샷의 `variantDetails`다 —
 * 절대 시야를 쓴 셋째의 스냅샷에는 진짜 변이를 적용한 값이 실려 온다.
 */

const props = defineProps<{
  choices: ChoiceView[]
  variantDetails: Record<string, VariantDetailView> | null
}>()

const { current, dismiss } = useCueQueue('modal')

const KNOWN = new Set<string>(Object.values(VARIANT_KIND))

const rows = computed(() => {
  const variants = current.value?.cue.data?.variants
  if (variants === null || typeof variants !== 'object') return []
  return props.choices.map((choice) => {
    const raw = (variants as Record<string, unknown>)[choice.id]
    const variant = typeof raw === 'string' && KNOWN.has(raw) ? (raw as VariantKind) : null
    return {
      id: choice.id,
      text: choice.text,
      label: variant === null ? '—' : variantDetailText(variant, props.variantDetails?.[choice.id] ?? null),
    }
  })
})
</script>

<template>
  <div v-if="current !== null" class="true-sight" data-testid="true-sight" role="dialog">
    <div class="true-sight__card">
      <p class="true-sight__title">{{ current.cue.text }}</p>
      <ul class="true-sight__list">
        <li v-for="row in rows" :key="row.id" class="true-sight__row">
          <span class="true-sight__label">{{ row.label }}</span>
          <span class="true-sight__text">{{ row.text }}</span>
        </li>
      </ul>
      <Button class="true-sight__close" data-testid="true-sight-close" @click="dismiss">닫기</Button>
    </div>
  </div>
</template>

<style scoped>
.true-sight {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(0, 0, 0, 0.7);
}

.true-sight__card {
  width: 100%;
  max-width: 24rem;
  padding: 1.25rem;
  border: 1px solid rgba(245, 245, 245, 0.2);
  border-radius: 1rem;
  background: #141414;
}

.true-sight__title {
  margin-bottom: 0.9rem;
  font-size: 0.9375rem;
  font-weight: 600;
}

.true-sight__list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.true-sight__row {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

/* 진짜 라벨과 가짜 라벨의 표기는 같아야 한다 — 투표 패널과 같은 색을 쓴다 (룰북 §17) */
.true-sight__label {
  flex: none;
  font-weight: 600;
  color: rgba(245, 245, 245, 0.85);
}

.true-sight__text {
  font-size: 0.875rem;
  color: rgba(245, 245, 245, 0.8);
}

.true-sight__close {
  width: 100%;
  margin-top: 1.1rem;
}
</style>
