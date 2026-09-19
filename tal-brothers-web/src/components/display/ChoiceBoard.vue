<script setup lang="ts">
import { computed } from 'vue'
import type { ChoiceView, VoteView } from 'tal-brothers-shared'

import { ATTRIBUTE_LABEL } from '@/constants/attributeLabel'
import { JUDGMENT_LABEL } from '@/constants/judgmentLabel'

/**
 * 선택지 카드 (룰북 §6.4, §8, §17).
 *
 * - 담는 것: 문장, 판정 유형·속성 태그, 비공개 판정의 대가
 * - **담지 않는 것: 성공 기준·보상·페널티·변이 라벨.** 애초에 이 컴포넌트의 props에 들어오지 않는다
 * - 투표 중에는 **참여 인원 수만**, 마감 뒤에만 선택지별 득표 수를 보여준다 (룰북 §8)
 */

const props = defineProps<{
  choices: ChoiceView[]
  adoptedChoiceId: string | null
  vote: VoteView | null
}>()

const closed = computed(() => props.vote?.closed === true)

function countOf(choiceId: string): number | null {
  const vote = props.vote
  if (vote === null || !vote.closed) return null
  return vote.counts[choiceId] ?? 0
}

function tagsOf(choice: ChoiceView): string[] {
  const tags: string[] = []
  if (choice.judgmentKind !== null) tags.push(JUDGMENT_LABEL[choice.judgmentKind])
  if (choice.attribute !== null) tags.push(ATTRIBUTE_LABEL[choice.attribute])
  if (choice.hiddenCostPercent !== null) tags.push(`대가 +${choice.hiddenCostPercent}%`)
  return tags
}
</script>

<template>
  <div class="choice-board">
    <ul class="choice-board__list">
      <li
        v-for="choice in choices"
        :key="choice.id"
        class="choice-board__card"
        :class="{ 'choice-board__card--adopted': choice.id === adoptedChoiceId }"
      >
        <p class="choice-board__text">{{ choice.text }}</p>
        <p v-if="tagsOf(choice).length > 0" class="choice-board__tags">
          {{ tagsOf(choice).join(' · ') }}
        </p>
        <p v-if="closed" class="choice-board__count">{{ countOf(choice.id) }}표</p>
      </li>
    </ul>

    <p v-if="vote !== null && !closed" class="choice-board__participants">
      {{ vote.participantCount }}명이 골랐습니다
    </p>
  </div>
</template>

<style scoped>
.choice-board {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.2cqh;
  width: 100%;
}

.choice-board__list {
  display: flex;
  gap: 1.2cqw;
  justify-content: center;
  width: 100%;
}

.choice-board__card {
  flex: 1 1 0;
  max-width: 26cqw;
  padding: 1.6cqh 1.2cqw;
  border: 1px solid rgba(245, 245, 245, 0.18);
  border-radius: 0.8cqw;
  background: rgba(0, 0, 0, 0.4);
}

.choice-board__card--adopted {
  border-color: #9e4c4c;
  background: rgba(158, 76, 76, 0.18);
}

.choice-board__text {
  font-size: var(--stage-choice);
  line-height: 1.5;
}

.choice-board__tags {
  margin-top: 0.8cqh;
  font-size: var(--stage-tag);
  color: rgba(245, 245, 245, 0.6);
}

.choice-board__count {
  margin-top: 0.8cqh;
  font-size: var(--stage-choice);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.choice-board__participants {
  font-size: var(--stage-tag);
  color: rgba(245, 245, 245, 0.6);
}
</style>
