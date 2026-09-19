import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    // 폰이 같은 Wi-Fi에서 PC 내부 IP로 접속한다 (M3 계획 7.1).
    // 여기에 두면 실행 방법이 갈리지 않는다 — `npm run dev:web`만으로 외부에 열린다
    host: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})