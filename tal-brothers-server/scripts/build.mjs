// 서버 배포 빌드 (아키텍처 §3, m5-plan M5-5).
//
// shared는 빌드 없이 TS 소스를 직접 export한다. 그래서 `node`로 바로 실행할 수 없다 —
// esbuild로 **shared 소스를 서버 번들에 함께 넣고**, npm 의존성(express·ws·supabase-js)은 밖에 둔다.
// 배포 환경은 `npm install --omit=dev` 후 `npm run start -w tal-brothers-server`로 띄운다.
//
// 같은 방식으로 통합 테스트 진입점(`e2e/e2eServer.ts`)도 `dist-e2e/`로 묶는다.
// 번들된 서버로 e2e를 돌려 번들 경로가 실제로 동작하는지 확인하기 위해서다 (운영에는 올리지 않는다).
//
// 실행: `npm run build -w tal-brothers-server`

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))

// shared만 번들에 넣고 나머지 런타임 의존성은 node_modules에서 읽는다
const external = Object.keys(pkg.dependencies ?? {}).filter((name) => name !== 'tal-brothers-shared')

const common = {
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  external,
  logLevel: 'info',
}

await build({
  ...common,
  entryPoints: [path.join(root, 'src/index.ts')],
  outfile: path.join(root, 'dist/index.js'),
})

await build({
  ...common,
  entryPoints: [path.join(root, 'e2e/e2eServer.ts')],
  outfile: path.join(root, 'dist-e2e/e2eServer.js'),
})
