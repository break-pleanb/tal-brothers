<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { GAME_STEP, PAUSE_REASON } from 'tal-brothers-shared'
import type { GameStep, PauseView } from 'tal-brothers-shared'

/**
 * 호스트 바 — **방 운영**(일시정지·재개)만 한다 (룰북 §1, §21, m4-plan 2.5·9절 1번).
 *
 * Display에는 게임 조작이 없다. 일시정지·재개는 룰이 아니라 진행 관리라 예외다.
 *
 * - 평소에는 숨고, 마우스를 움직이면 잠시 나타난다. 방송 송출 화면(`?obs=1`)에서는 아예 그리지 않는다
 * - 세이프존 밖, 스테이지 위쪽 띠에 둔다. 방송 화면의 본문을 가리지 않는다
 * - 정지는 **상황 제시(`EVENT_INTRO`)에서만** 받는다 (서버 `canHostPause`, m4-plan 11.1 f).
 *   그 밖에서는 버튼을 막고 이유를 한 줄 적는다
 * - 재개는 호스트가 건 정지만 풀 수 있다. 연결 끊김으로 걸린 정지는 연결이 돌아오면 서버가 푼다 (아키텍처 §8)
 */

const props = defineProps<{
  step: GameStep | null
  pause: PauseView | null
  hidden: boolean
}>()

const emit = defineEmits<{ pause: []; resume: [] }>()

/** 마우스를 멈추고 이만큼 지나면 숨긴다. 화면 전용 값이다 */
const IDLE_HIDE_MS = 3000

const awake = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

function wake(): void {
  awake.value = true
  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(() => {
    awake.value = false
  }, IDLE_HIDE_MS)
}

onMounted(() => window.addEventListener('pointermove', wake))
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', wake)
  if (timer !== null) clearTimeout(timer)
})

const canPause = computed(() => props.pause === null && props.step === GAME_STEP.EVENT_INTRO)
const canResume = computed(() => props.pause?.reason === PAUSE_REASON.HOST)

const hint = computed(() => {
  if (props.pause !== null && !canResume.value) return '연결이 돌아오면 자동으로 이어집니다'
  if (props.pause === null && !canPause.value) return '일시정지는 상황 제시 중에만 할 수 있습니다'
  return ''
})
</script>

<template>
  <div v-if="!hidden" class="host-bar" :class="{ 'host-bar--awake': awake }" @pointerenter="wake">
    <button
      v-if="pause === null"
      type="button"
      class="host-bar__button"
      data-testid="host-pause"
      :disabled="!canPause"
      @click="emit('pause')"
    >
      일시정지
    </button>
    <button
      v-else
      type="button"
      class="host-bar__button"
      data-testid="host-resume"
      :disabled="!canResume"
      @click="emit('resume')"
    >
      다시 시작
    </button>
    <span v-if="hint !== ''" class="host-bar__hint">{{ hint }}</span>
  </div>
</template>

<style scoped>
/* 스테이지 위쪽 세이프존 바깥 띠(4cqh)에 놓는다 */
.host-bar {
  position: absolute;
  top: 0;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 1cqw;
  height: var(--stage-safe-y);
  padding: 0 1.5cqw;
  border-radius: 0 0 0.6cqw 0.6cqw;
  background: rgba(20, 20, 20, 0.9);
  opacity: 0;
  transform: translateX(-50%);
  transition: opacity 0.2s ease;
}

.host-bar--awake,
.host-bar:focus-within {
  opacity: 1;
}

.host-bar__button {
  padding: 0.3cqh 1cqw;
  border: 1px solid rgba(245, 245, 245, 0.35);
  border-radius: 0.4cqw;
  font-size: 1.1cqw;
  color: #f5f5f5;
  background: transparent;
  cursor: pointer;
}

.host-bar__button:disabled {
  opacity: 0.4;
  cursor: default;
}

.host-bar__hint {
  font-size: 1cqw;
  color: rgba(245, 245, 245, 0.65);
}
</style>
