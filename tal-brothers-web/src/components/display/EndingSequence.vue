<script setup lang="ts">
import { computed } from 'vue'
import { ASSET_KEY } from 'tal-brothers-shared'
import type { AssetKey, EndingView, SeatNameView } from 'tal-brothers-shared'

import { ASSET_URL } from '@/constants/assetUrl'
import { BROTHER_LABEL } from '@/constants/brotherLabel'
import { ENDING_LABEL } from '@/constants/endingLabel'
import { MOTION_TIMING } from '@/constants/motionTiming'

/**
 * 엔딩 (룰북 §15, §17, m5-plan M5-3).
 *
 * 엔딩 이름 → 내레이션 → 배신자 공개 순으로 하나씩 떠오른다. 문장은 **스냅샷의 `ending.narration`**이다 —
 * cue로만 오던 때는 새로고침하면 사라졌다 (m4-plan 11.1 2번). 1인 플레이 분기 내레이션도 서버가 골라 보낸다.
 *
 * - 연출 에셋은 서버가 `ending.assets`로 정한다 (룰북 §15 연출 에셋 열). 배경 에셋은 뒤에 깔고,
 *   탈·아이템 에셋은 가운데에 떠오르게 한다. 요괴화 탈은 배신자 승리 계열 엔딩에만 온다 (룰북 §18)
 * - 배신자의 승패와 정체는 엔딩 화면에서 공개한다. 배신자가 없으면 "배신자 없음" (룰북 §15, §21)
 * - 엔딩 연출은 게임 시계 밖이다. 이 화면은 스스로 닫히지 않는다 (m4-plan 11.1 d)
 */

const props = defineProps<{
  ending: EndingView
  seatNames: SeatNameView[]
}>()

const BACKGROUND_KEYS: AssetKey[] = [
  ASSET_KEY.BG_THATCHED_VILLAGE,
  ASSET_KEY.BG_DANGSAN_FOREST,
  ASSET_KEY.BG_BLOODY_SHRINE,
  ASSET_KEY.BG_BLOOD_TEAR_JANGSEUNG,
]

const backdrop = computed(() => {
  const key = props.ending.assets.find((asset) => BACKGROUND_KEYS.includes(asset))
  return key === undefined ? null : ASSET_URL[key]
})

const emblem = computed(() => {
  const key = props.ending.assets.find((asset) => !BACKGROUND_KEYS.includes(asset))
  return key === undefined ? null : ASSET_URL[key]
})

const traitorLine = computed(() => {
  if (props.ending.traitorSeats.length === 0) return '배신자 없음'
  const names = props.ending.traitorSeats.map((seat) => {
    const found = props.seatNames.find((entry) => entry.seat === seat)
    return found?.displayName ? `${BROTHER_LABEL[seat]} ${found.displayName}` : BROTHER_LABEL[seat]
  })
  const outcome = props.ending.traitorWon === null ? '' : props.ending.traitorWon ? ' — 승리' : ' — 패배'
  return `이면의 형제: ${names.join(', ')}${outcome}`
})

const motion = { '--ending-step': `${MOTION_TIMING.endingStepMs}ms` }
</script>

<template>
  <div class="ending" data-testid="ending-sequence" :style="motion">
    <div v-if="backdrop !== null" class="ending__backdrop" :style="{ backgroundImage: `url(${backdrop})` }" />
    <img v-if="emblem !== null" :src="emblem" alt="" class="ending__emblem" data-testid="ending-emblem" />
    <p class="ending__title">{{ ENDING_LABEL[ending.id] }}</p>
    <p class="ending__narration">{{ ending.narration }}</p>
    <p class="ending__traitor">{{ traitorLine }}</p>
  </div>
</template>

<style scoped>
.ending {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3cqh;
  padding: 0 12cqw;
  text-align: center;
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.88));
}

.ending__backdrop {
  position: absolute;
  inset: 0;
  z-index: -1;
  background-position: center;
  background-size: cover;
  opacity: 0.35;
  animation: ending-fade calc(var(--ending-step) * 2) ease both;
}

/* 탈·아이템 에셋은 검정 바탕 JPG라 screen으로 섞는다 */
.ending__emblem {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: -1;
  width: 34cqw;
  mix-blend-mode: screen;
  opacity: 0.45;
  mask-image: radial-gradient(closest-side, #000 60%, transparent 100%);
  transform: translate(-50%, -50%);
  animation: ending-fade calc(var(--ending-step) * 2) ease both;
}

.ending__title {
  font-size: var(--stage-title);
  font-weight: 700;
  letter-spacing: 0.08em;
  animation: ending-rise var(--ending-step) ease-out both;
}

.ending__narration {
  font-size: var(--stage-narration);
  line-height: 1.7;
  color: rgba(245, 245, 245, 0.88);
  animation: ending-rise var(--ending-step) ease-out var(--ending-step) both;
}

.ending__traitor {
  font-size: var(--stage-choice);
  color: #d9a0a0;
  animation: ending-rise var(--ending-step) ease-out calc(var(--ending-step) * 2) both;
}

@keyframes ending-rise {
  from {
    opacity: 0;
    transform: translateY(2cqh);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes ending-fade {
  from {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ending__backdrop,
  .ending__emblem,
  .ending__title,
  .ending__narration,
  .ending__traitor {
    animation: none;
  }
}
</style>
