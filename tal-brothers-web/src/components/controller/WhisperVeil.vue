<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ASSET_KEY, PUBLIC_NOTICE_KIND } from 'tal-brothers-shared'

import { ASSET_URL } from '@/constants/assetUrl'
import { MOTION_TIMING } from '@/constants/motionTiming'
import { usePlayStore } from '@/stores/play'

/**
 * 귓속말 덮개 (룰북 §16, §17, m5-notes 귓속말 연출).
 *
 * **받은 좌석과 받지 않은 좌석이 같은 순간에 같은 모양·같은 길이의 덮개를 본다.** 다른 것은 문장뿐이다.
 * 받지 않은 좌석은 "무언가 속삭였지만 알아들을 수 없다"를 본다. 폰 화면이 캠·옆자리에 보여도
 * 덮개가 떴다는 사실만으로는 누가 받았는지 알 수 없어야 한다.
 *
 * - **신호는 공개 알림 `whisperSent`다.** 서버는 귓속말 1건마다 수신 좌석의 `whispers`와 이 알림을
 *   같은 상태 전이에서 함께 추가하고, 알림은 모든 좌석 스냅샷에 실린다. 그래서 모든 Controller가 같은
 *   상태 버전에서 덮개를 띄운다. 수신자에게만 가는 `whisperReceived` cue는 쓰지 않는다 — cue로 띄우면
 *   수신자만 시점이 달라진다
 * - 새 발송 알림 k건, 내 `whispers` 증가분 m건이면 덮개 k장을 차례로 띄우고 앞의 m장에 내 문장을 싣는다
 * - 처음 받은 스냅샷을 기준선으로 삼는다. 새로고침해도 지난 덮개를 다시 띄우지 않는다
 * - **문장 상자 크기는 고정이다.** 가장 긴 귓속말이 들어가는 줄 수만큼 높이를 잡아, 줄 수로 글자 덩어리
 *   모양이 달라지지 않게 한다. 글자가 나타나는 데 걸리는 시간도 문장 길이와 무관하게 같다
 * - **조작을 막지 않는다.** 덮개 전체가 `pointer-events: none`이라 투표·굴림·개입·14A 제출 중이어도 아래 버튼이
 *   그대로 눌린다. 받은 좌석과 받지 않은 좌석이 똑같이 동작한다. 덮개를 눌러 닫는 동작은 두지 않는다 —
 *   닫는 좌석과 안 닫는 좌석의 표시 시간이 달라지기 때문이다
 * - 붉은색을 쓰지 않는다. 붉은 메시지(룰북 §10.1)와 혼동되면 안 된다. 탈도 요괴화 탈이 아니라 기본 광대탈이다
 */

/** 받지 않은 좌석에 보이는 문장 */
const UNHEARD_TEXT = '무언가 속삭였지만 알아들을 수 없다'

const MASK_URL = ASSET_URL[ASSET_KEY.MASK_CLOWN]

const play = usePlayStore()

/** 띄울 덮개 문장 대기열. 맨 앞이 지금 보이는 것이다 */
const queue = ref<{ id: number; text: string }[]>([])
let nextId = 1
let seenNotices: number | null = null
let seenWhispers = 0
let timer: ReturnType<typeof setTimeout> | null = null

watch(
  () => play.snapshot,
  (snapshot) => {
    if (snapshot === null) return
    const notices = snapshot.notices
    const whispers = play.privateView?.whispers ?? []

    // 기준선 — 처음 받은 스냅샷이거나 다른 판으로 바뀌어 알림이 줄었을 때
    if (seenNotices === null || notices.length < seenNotices) {
      seenNotices = notices.length
      seenWhispers = whispers.length
      return
    }

    const sent = notices.slice(seenNotices).filter((notice) => notice.kind === PUBLIC_NOTICE_KIND.WHISPER_SENT).length
    const received = whispers.slice(seenWhispers).map((whisper) => whisper.text)
    seenNotices = notices.length
    seenWhispers = whispers.length

    for (let index = 0; index < sent; index += 1) {
      queue.value.push({ id: nextId, text: received[index] ?? UNHEARD_TEXT })
      nextId += 1
    }
  },
  { immediate: true },
)

const current = computed(() => queue.value[0] ?? null)

// 맨 앞 덮개가 바뀔 때마다 같은 시간을 건다
watch(
  () => current.value?.id ?? null,
  (id) => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    if (id === null) return
    timer = setTimeout(() => {
      queue.value = queue.value.slice(1)
    }, MOTION_TIMING.whisperVeilMs)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (timer !== null) clearTimeout(timer)
})

/** 한 글자씩 나타난다. 글자 간격은 `whisperRevealMs`를 글자 수로 나눈 값이라 다 나타나는 시점이 같다 */
const chars = computed(() => {
  const text = current.value?.text ?? ''
  const list = Array.from(text)
  const step = list.length === 0 ? 0 : MOTION_TIMING.whisperRevealMs / list.length
  return list.map((char, index) => ({ char, delay: `${Math.round(index * step)}ms` }))
})

const motion = { '--whisper-veil': `${MOTION_TIMING.whisperVeilMs}ms` }
</script>

<template>
  <div
    v-if="current !== null"
    :key="current.id"
    class="whisper-veil"
    data-testid="whisper-veil"
    aria-live="polite"
    :style="motion"
  >
    <img :src="MASK_URL" alt="" class="whisper-veil__mask" />
    <div class="whisper-veil__box">
      <p class="whisper-veil__text">
        <span
          v-for="(entry, index) in chars"
          :key="index"
          class="whisper-veil__char"
          :style="{ animationDelay: entry.delay }"
          >{{ entry.char }}</span
        >
      </p>
    </div>
  </div>
</template>

<style scoped>
/* 화면 가장자리가 어두워진다. 가운데는 비워 아래 화면이 비친다 */
.whisper-veil {
  position: fixed;
  inset: 0;
  z-index: 55;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2rem 1rem;
  background: radial-gradient(ellipse at center, rgba(8, 12, 18, 0.25) 30%, rgba(4, 6, 10, 0.92) 100%);
  pointer-events: none;
  animation: whisper-veil-life var(--whisper-veil) linear both;
}

/* 흐릿한 기본 광대탈 실루엣. 색을 빼서 붉은 메시지의 요괴화 탈과 구분한다 */
.whisper-veil__mask {
  width: min(56vw, 14rem);
  mix-blend-mode: screen;
  opacity: 0.35;
  filter: grayscale(1) blur(3px) brightness(0.8);
  mask-image: radial-gradient(closest-side, #000 50%, transparent 100%);
}

/*
 * 문장 상자 — 크기를 고정한다. 높이는 가장 긴 귓속말(Phase 2 진입 경고, 약 46자)이 가장 좁은 폰(360px)에서
 * 차지하는 줄 수보다 넉넉한 5줄이다. 문장마다 줄 수가 달라도 상자 모양은 같다
 */
.whisper-veil__box {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: min(86vw, 22rem);
  height: calc(5 * 1.7 * 1.0625rem + 2rem);
  padding: 1rem 1.25rem;
  overflow: hidden;
  border: 1px solid rgba(170, 186, 204, 0.22);
  border-radius: 0.75rem;
  background: rgba(10, 14, 20, 0.78);
}

/*
 * 문장 요소도 상자를 꽉 채운다. 요소 크기가 문장 줄 수를 따라가지 않게 하고, 글자는 그 안에서 가운데로 모은다.
 * 글자 하나하나가 줄바꿈 단위다
 */
.whisper-veil__text {
  display: flex;
  flex-wrap: wrap;
  align-content: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 1.0625rem;
  line-height: 1.7;
  color: #c9d3de;
  text-align: center;
}

/* 글자마다 떨리며 나타난다 */
.whisper-veil__char {
  display: inline-block;
  white-space: pre;
  animation: whisper-char-in 420ms ease-out both;
}

@keyframes whisper-veil-life {
  0% {
    opacity: 0;
  }
  8%,
  88% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@keyframes whisper-char-in {
  0% {
    opacity: 0;
    transform: translate(0, 0.2em);
    filter: blur(2px);
  }
  30% {
    opacity: 0.7;
    transform: translate(-0.06em, -0.04em);
  }
  55% {
    transform: translate(0.06em, 0.03em);
  }
  80% {
    transform: translate(-0.03em, 0);
  }
  100% {
    opacity: 1;
    transform: none;
    filter: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .whisper-veil,
  .whisper-veil__char {
    animation: none;
  }
}
</style>
