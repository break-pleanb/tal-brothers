import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

/**
 * 화면을 띄우지 않고 보는 규칙 (m4-plan 6.2, 아키텍처 §2 원칙 2, 11.1 1번).
 *
 * 1. `components/display/`는 좌석 전용 타입을 import하지 않는다 — 비공개 값을 받을 통로 자체를 막는다
 * 2. 운영 빌드 산출물(`dist/`)에 서버 전용 문자열과 통합 테스트 대역이 없다
 *
 * 2번은 `npm run build -w tal-brothers-web`을 먼저 돌려야 한다. 산출물이 없으면 실패한다.
 */

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = path.resolve(WEB_ROOT, '..')

function filesUnder(dir: string, extension: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return filesUnder(full, extension)
    return entry.name.endsWith(extension) ? [full] : []
  })
}

test('Display 컴포넌트는 좌석 전용 타입을 import하지 않는다', () => {
  const forbidden = /\b(SeatPrivateView|SeatSnapshot|WhisperView)\b/
  const offenders = filesUnder(path.join(WEB_ROOT, 'src', 'components', 'display'), '.vue')
    .concat(filesUnder(path.join(WEB_ROOT, 'src', 'components', 'display'), '.ts'))
    .filter((file) => forbidden.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(WEB_ROOT, file))
  expect(offenders).toEqual([])
})

test('운영 빌드에 서버 전용 문자열과 테스트 대역이 없다', () => {
  const dist = path.join(WEB_ROOT, 'dist')
  const bundles = filesUnder(dist, '.js')
  expect(bundles.length, '먼저 npm run build -w tal-brothers-web을 돌린다').toBeGreaterThan(0)
  const bundleText = bundles.map((file) => fs.readFileSync(file, 'utf8')).join('\n')

  // 엔딩 조건 요약은 서버의 기록용 문자열이다. 화면으로 나가지 않는다
  const endings = fs.readFileSync(path.join(REPO_ROOT, 'tal-brothers-server', 'src', 'scenario', 'endings.ts'), 'utf8')
  const conditions = [...endings.matchAll(/condition:\s*'([^']+)'/g)].map((match) => match[1] ?? '')
  expect(conditions.length).toBeGreaterThan(0)

  const markers = ['E2E_FAKE_SUPABASE', 'tal:e2e:', '__e2e', ...conditions]
  const found = markers.filter((marker) => marker.length > 0 && bundleText.includes(marker))
  expect(found).toEqual([])
})
