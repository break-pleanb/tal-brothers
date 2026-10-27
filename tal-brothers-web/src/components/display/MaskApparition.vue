<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AssetKey } from 'tal-brothers-shared'

import { ASSET_URL } from '@/constants/assetUrl'
import { MOTION_TIMING } from '@/constants/motionTiming'

/**
 * 탈 잔상 레이어 (m4-plan 2.3 레이어 2, m5-plan M5-1).
 *
 * 탈 이미지는 검정 바탕 JPG라 `screen`으로 섞어 검정을 지운다. 본문 글자 아래 층이므로
 * 글자를 가리지 않도록 흐리게 둔다. 탈 키는 서버가 이벤트마다 보낸다 — 탈이 없는 이벤트는 그리지 않는다.
 *
 * 구도 (m5-notes 탈 구도):
 * - `intro` — 상황 제시. 어둠에서 밝기와 크기가 함께 커지며 다가온다(`maskApproachMs`). 그동안 본문 글자는 없다
 * - `overlook` — 투표부터. 오른쪽 위로 물러나 작아진 채 내려다본다. 캠 자리(오른쪽 아래) 위에만 머문다
 * - `lunge` — 공개 판정 실패 순간 짧게 다가왔다 물러난다. 판정 연출 3초(룰북 §19) 안에서 끝난다
 *
 * 등장 움직임은 **이미지가 처음 붙을 때의 구도**로 정한다. 구도가 바뀔 때마다 애니메이션 이름을 바꾸면
 * 등장이 다시 재생되기 때문이다. 구도 이동은 바깥 틀의 transition이 맡는다.
 */

export type MaskPose = 'intro' | 'overlook'

const props = defineProps<{
  mask: AssetKey | null
  pose: MaskPose
  lunge: boolean
  /** 이벤트가 바뀌면 같은 탈이라도 등장부터 다시 한다 */
  eventKey: string
}>()

const imageUrl = computed(() => (props.mask === null ? null : ASSET_URL[props.mask]))
const imageKey = computed(() => `${props.eventKey}:${imageUrl.value ?? ''}`)

/** 이미지가 새로 붙을 때의 구도. 이후 구도가 바뀌어도 등장 움직임은 그대로 둔다 */
const entryPose = ref<MaskPose>(props.pose)
watch(
  imageKey,
  () => {
    entryPose.value = props.pose
  },
  { flush: 'sync' },
)

const motion = {
  '--mask-enter': `${MOTION_TIMING.maskEnterMs}ms`,
  '--mask-approach': `${MOTION_TIMING.maskApproachMs}ms`,
  '--mask-shift': `${MOTION_TIMING.maskShiftMs}ms`,
  '--mask-lunge': `${MOTION_TIMING.maskLungeMs}ms`,
  '--mask-lunge-delay': `${MOTION_TIMING.maskLungeDelayMs}ms`,
}
</script>

<template>
  <div
    v-if="imageUrl !== null"
    class="stage-layer stage-layer--mask mask-apparition"
    :class="`mask-apparition--${pose}`"
    :style="motion"
    :data-mask-pose="pose"
  >
    <div class="mask-apparition__frame">
      <div class="mask-apparition__lunge" :class="{ 'mask-apparition__lunge--on': lunge }">
        <img
          :key="imageKey"
          :src="imageUrl"
          alt=""
          class="mask-apparition__image"
          :class="`mask-apparition__image--from-${entryPose}`"
          data-testid="mask-image"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.mask-apparition {
  pointer-events: none;
}

/* 가운데 기준으로 두고 transform만 바꿔 구도를 옮긴다 */
.mask-apparition__frame {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 40cqw;
  transform: translate(-50%, -50%);
  transition: transform var(--mask-shift) ease-in-out;
}

/* 오른쪽 위에서 내려다본다 — 너비 24cqw, 가운데가 (84cqw, 26cqh). 캠 자리(아래 24cqw 정사각형) 위에서 끝난다 */
.mask-apparition--overlook .mask-apparition__frame {
  transform: translate(calc(-50% + 34cqw), calc(-50% - 24cqh)) scale(0.6);
}

.mask-apparition__image {
  display: block;
  width: 100%;
  height: auto;
  mix-blend-mode: screen;
  opacity: 0.4;
  /* 사각 테두리가 보이지 않게 가장자리를 둥글게 지운다 */
  mask-image: radial-gradient(closest-side, #000 60%, transparent 100%);
}

.mask-apparition__image--from-intro {
  animation:
    mask-approach var(--mask-approach) ease-in,
    mask-breathe 7s ease-in-out var(--mask-approach) infinite;
}

.mask-apparition__image--from-overlook {
  animation:
    mask-enter var(--mask-enter) ease-out,
    mask-breathe 7s ease-in-out var(--mask-enter) infinite;
}

.mask-apparition__lunge--on {
  animation: mask-lunge var(--mask-lunge) ease-out var(--mask-lunge-delay) both;
}

/* 어둠 속 멀리서 밝기와 크기가 함께 커지며 다가온다. 끝에 글자가 뜨므로 잔상 밝기로 내려앉는다 */
@keyframes mask-approach {
  0% {
    opacity: 0;
    transform: scale(0.55);
    filter: brightness(0.2) blur(0.4cqw);
  }
  80% {
    opacity: 0.8;
    transform: scale(1.04);
    filter: brightness(1) blur(0);
  }
  100% {
    opacity: 0.4;
    transform: scale(1);
  }
}

/* 크게 떠올랐다가 잔상으로 가라앉는다 */
@keyframes mask-enter {
  0% {
    opacity: 0;
    transform: scale(1.18);
    filter: blur(0.6cqw);
  }
  35% {
    opacity: 0.85;
    transform: scale(1.04);
    filter: blur(0);
  }
  100% {
    opacity: 0.4;
    transform: scale(1);
  }
}

@keyframes mask-breathe {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 0.3;
  }
}

/* 판정 실패 — 화면 가운데 쪽으로 짧게 다가왔다 물러난다 */
@keyframes mask-lunge {
  0%,
  100% {
    transform: none;
    filter: none;
  }
  35% {
    transform: translate(-6cqw, 8cqh) scale(1.35);
    filter: brightness(1.8);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mask-apparition__frame {
    transition: none;
  }

  .mask-apparition__image--from-intro,
  .mask-apparition__image--from-overlook,
  .mask-apparition__lunge--on {
    animation: none;
  }
}
</style>
