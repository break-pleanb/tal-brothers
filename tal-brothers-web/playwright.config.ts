import { defineConfig } from '@playwright/test'

/**
 * 통합 테스트 설정 (m4-plan 11.4).
 *
 * 테스트 전용 서버(가짜 인증·가속 시계)와 테스트 전용 web(가짜 Supabase)을 띄운다.
 * 운영 진입점과 운영 Vite 설정은 쓰지 않는다.
 *
 * 한 판에 브라우저 컨텍스트 2~4개가 함께 돈다. 판끼리는 서버를 공유하므로 **한 번에 하나씩** 돌린다.
 */

const SERVER_PORT = 3100
const WEB_PORT = 5174

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  outputDir: './e2e-artifacts/test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // 한 판은 가속 4배로 수 분이 걸린다. 여러 판을 도는 스펙은 스스로 시간을 늘린다
  timeout: 10 * 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['json', { outputFile: 'e2e-artifacts/results.json' }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      // `E2E_BUNDLED=1`이면 배포 빌드와 같은 방식으로 묶은 서버(`dist-e2e/`)를 띄운다 (m5-plan M5-5).
      // 먼저 `npm run build -w tal-brothers-server`를 돌린다
      command:
        process.env.E2E_BUNDLED === '1'
          ? 'node tal-brothers-server/dist-e2e/e2eServer.js'
          : 'npm run e2e:serve -w tal-brothers-server',
      cwd: '..',
      url: `http://localhost:${SERVER_PORT}/healthz`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        E2E_SERVER_PORT: String(SERVER_PORT),
        E2E_WEB_PORT: String(WEB_PORT),
        E2E_TIME_RATE: process.env.E2E_TIME_RATE ?? '4',
        E2E_SEED: process.env.E2E_SEED ?? '1',
      },
    },
    {
      // 빌드본을 띄운다 — 판이 도는 동안 소스를 고쳐도 화면이 흔들리지 않는다 (vite.e2e.config.ts)
      command:
        'npx vite build --config vite.e2e.config.ts --mode e2e && npx vite preview --config vite.e2e.config.ts --mode e2e',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
