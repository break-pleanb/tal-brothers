<script setup lang="ts">
import type { ChoiceView, VariantKind } from 'tal-brothers-shared'

import { ATTRIBUTE_LABEL } from '@/constants/attributeLabel'
import { JUDGMENT_LABEL } from '@/constants/judgmentLabel'
import { VARIANT_LABEL } from '@/constants/variantLabel'

/**
 * 선택지 투표 (룰북 §6.4, §8).
 *
 * - 마감 전에는 몇 번이든 바꿀 수 있다. 내 선택만 강조한다 — 남이 무엇을 골랐는지는 오지 않는다
 * - **변이 라벨은 진짜와 가짜가 같은 모양이어야 한다** (룰북 §4.3, §17).
 *   여기서는 받은 값을 그대로 찍기만 하고 "확실함" 같은 꼬리표를 붙이지 않는다
 */

defineProps<{
  choices: ChoiceView[]
  /** 내가 지금 고른 선택지 */
  myVote: string | null
  /** 선택지별 변이 라벨. 볼 수 없는 좌석은 null이다 */
  variantLabels: Record<string, VariantKind> | null
  disabled: boolean
}>()

const emit = defineEmits<{ select: [choiceId: string] }>()
</script>

<template>
  <ul class="vote-panel">
    <li v-for="choice in choices" :key="choice.id">
      <button
        type="button"
        class="vote-panel__choice"
        :class="{ 'vote-panel__choice--mine': choice.id === myVote }"
        :disabled="disabled"
        @click="emit('select', choice.id)"
      >
        <span class="vote-panel__text">{{ choice.text }}</span>

        <span class="vote-panel__tags">
          <span v-if="choice.judgmentKind !== null">{{ JUDGMENT_LABEL[choice.judgmentKind] }}</span>
          <span v-if="choice.attribute !== null">{{ ATTRIBUTE_LABEL[choice.attribute] }}</span>
          <span v-if="choice.hiddenCostPercent !== null">대가 +{{ choice.hiddenCostPercent }}%</span>
          <span v-if="variantLabels?.[choice.id]" class="vote-panel__variant">
            {{ VARIANT_LABEL[variantLabels[choice.id] as VariantKind] }}
          </span>
        </span>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.vote-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.vote-panel__choice {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  width: 100%;
  padding: 0.9rem 1rem;
  border: 1px solid rgba(245, 245, 245, 0.18);
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.03);
  text-align: left;
}

.vote-panel__choice--mine {
  border-color: #9e4c4c;
  background: rgba(158, 76, 76, 0.18);
}

.vote-panel__choice:disabled {
  opacity: 0.5;
}

.vote-panel__text {
  font-size: 0.9375rem;
  line-height: 1.5;
}

.vote-panel__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: rgba(245, 245, 245, 0.6);
}

/* 진짜 라벨과 가짜 라벨의 표기가 같아야 한다 (룰북 §17) */
.vote-panel__variant {
  color: rgba(245, 245, 245, 0.85);
}
</style>
