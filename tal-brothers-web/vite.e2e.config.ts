import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, mergeConfig } from 'vite'
import type { Plugin } from 'vite'

import baseConfig from './vite.config.ts'

/**
 * 통합 테스트 전용 Vite 설정 (m4-plan 11.1 1번, 11.3 M4-A).
 *
 * 운영 설정을 그대로 펼치고 **`src/services/supabase.ts` 하나만** 가짜 모듈로 바꾼다.
 * `@/services/supabase`와 `./supabase` 어느 경로로 import해도 같은 파일로 풀리므로,
 * 별칭이 아니라 **풀린 파일 경로**를 보고 바꾼다.
 *
 * 환경 변수는 `.env.e2e`(mode `e2e`)에서 읽는다. 운영 빌드는 이 파일을 쓰지 않는다.
 */

const realSupabase = path.normalize(fileURLToPath(new URL('./src/services/supabase.ts', import.meta.url)))
const fakeSupabase = fileURLToPath(new URL('./e2e/fakes/supabase.ts', import.meta.url))

function swapSupabase(): Plugin {
  return {
    name: 'tal-e2e-swap-supabase',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!source.endsWith('supabase')) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (resolved === null) return null
      const resolvedPath = path.normalize(resolved.id.split('?')[0] ?? '')
      return resolvedPath === realSupabase ? fakeSupabase : null
    },
  }
}

export const E2E_WEB_PORT = 5174

export default mergeConfig(
  baseConfig,
  defineConfig({
    mode: 'e2e',
    plugins: [swapSupabase()],
    server: {
      port: E2E_WEB_PORT,
      strictPort: true,
    },
  }),
)
