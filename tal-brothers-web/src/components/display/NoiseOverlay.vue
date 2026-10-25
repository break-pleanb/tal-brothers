<script setup lang="ts">
/**
 * 타임오버·강제 잠식 노이즈 (룰북 §2.1, §15).
 *
 * "모든 화면이 노이즈로 덮이고 조작이 잠긴다." 노이즈 소재는 에셋 11종에 없어(룰북 §18) SVG 잡음과 CSS로 만든다.
 * 소리는 넣지 않는다 (m4-plan 11.1 a). Display와 Controller가 같은 컴포넌트를 쓴다 —
 * 부모가 덮을 범위(스테이지 또는 폰 화면 전체)를 정하고, 이 컴포넌트는 그 상자를 채우기만 한다.
 */
</script>

<template>
  <div class="noise" data-testid="noise" aria-hidden="true">
    <!-- 지글거리는 화면 잡음. 시드를 바꿔 가며 다시 그린다 (m5-plan M5-3) -->
    <svg class="noise__static" preserveAspectRatio="none">
      <filter id="tal-noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="1" stitchTiles="stitch">
          <animate attributeName="seed" values="1;7;3;9;5;2;8" dur="0.5s" repeatCount="indefinite" />
        </feTurbulence>
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#tal-noise)" />
    </svg>
    <div class="noise__grain" />
    <div class="noise__scan" />
  </div>
</template>

<style scoped>
.noise {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #111;
  pointer-events: auto;
}

.noise__static {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.35;
  mix-blend-mode: screen;
}

/* 촘촘한 반복 그라데이션을 계단식으로 움직여 지직거리는 느낌을 낸다 */
.noise__grain {
  position: absolute;
  inset: -50%;
  background-image:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.08) 0 1px, transparent 1px 3px),
    repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.35) 0 2px, transparent 2px 5px),
    repeating-linear-gradient(37deg, rgba(255, 255, 255, 0.05) 0 1px, transparent 1px 4px);
  animation: noise-jitter 0.18s steps(3) infinite;
}

.noise__scan {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 0%, rgba(255, 255, 255, 0.06) 50%, transparent 100%);
  background-size: 100% 12%;
  animation: noise-scan 1.6s linear infinite;
}

@keyframes noise-jitter {
  0% {
    transform: translate(0, 0);
  }
  33% {
    transform: translate(-3%, 2%);
  }
  66% {
    transform: translate(2%, -3%);
  }
  100% {
    transform: translate(0, 0);
  }
}

@keyframes noise-scan {
  from {
    background-position: 0 -20%;
  }
  to {
    background-position: 0 120%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .noise__grain,
  .noise__scan {
    animation: none;
  }
}
</style>
