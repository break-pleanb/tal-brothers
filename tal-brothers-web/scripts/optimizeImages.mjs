// 브랜드 이미지 변환 (m5-plan M5-1).
//
// 랜딩의 `introMask.png`는 2816×1536, 7.7MB인데 화면에는 192px 폭으로 나온다.
// 고해상도 화면(4배)까지 덮는 768px 폭의 webp를 만든다. **원본은 지우지 않는다** (파일 정리는 범위 밖).
//
// 실행: `npm run images:optimize -w tal-brothers-web` — 결과물은 저장소에 함께 넣는다.
// 빌드 과정에 넣지 않는 이유: 원본이 바뀌는 일이 드물고, 빌드마다 sharp를 돌리면 CI·배포 환경에 네이티브 의존성이 생긴다.

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const JOBS = [
  {
    from: 'src/assets/images/masks/introMask.png',
    to: 'src/assets/images/masks/introMask.webp',
    width: 768,
  },
]

for (const job of JOBS) {
  const info = await sharp(path.join(root, job.from))
    .resize({ width: job.width, withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 90 })
    .toFile(path.join(root, job.to))
  console.info(`${job.to} — ${info.width}×${info.height}, ${Math.round(info.size / 1024)}KB`)
}
