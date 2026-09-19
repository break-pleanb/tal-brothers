<script setup lang="ts">
import { computed } from 'vue'
import QrcodeVue from 'qrcode.vue'

import { WEB_ENV } from '@/config/webEnv'

/**
 * 초대 QR (아키텍처 §9.1).
 *
 * 폰이 읽는 주소라 **PC의 `localhost`를 그대로 실으면 안 된다.**
 * `VITE_PUBLIC_WEB_ORIGIN`이 있으면 그 값을, 없으면 지금 보고 있는 주소를 쓴다.
 * SVG로 그려 큰 화면에서 확대해도 깨지지 않는다.
 */

const props = defineProps<{ roomCode: string }>()

const joinUrl = computed(() => {
  const origin = WEB_ENV.publicWebOrigin ?? window.location.origin
  return `${origin.replace(/\/$/, '')}/join/${props.roomCode}`
})

const isLocalhost = computed(() => /localhost|127\.0\.0\.1/.test(joinUrl.value))
</script>

<template>
  <div class="space-y-3">
    <div class="inline-block rounded-lg bg-white p-3">
      <QrcodeVue :value="joinUrl" :size="180" render-as="svg" level="M" />
    </div>

    <p class="break-all text-xs text-neutral-400">{{ joinUrl }}</p>
    <p v-if="isLocalhost" class="text-xs text-amber-400">
      폰에서는 이 주소로 접속할 수 없습니다. PC를 내부 IP 주소로 열거나
      <code>VITE_PUBLIC_WEB_ORIGIN</code>을 설정해 주세요.
    </p>
  </div>
</template>
