# 탈: 이면의 형제들 — Claude Code 작업 지침

## 프로젝트

K-다크 판타지 심리 생존 TRPG. 인플루언서 합방·스트리밍에서 **관전이 재미있도록** 설계된 웹 게임.

- 인간 플레이어 1~3명, 빈 좌석은 봇
- 호스트 PC = **Display** (공용 중계 화면, 조작 없음)
- 모든 플레이어(호스트 포함) = 폰 **Controller** (개인 조작)
- 핵심 재미: 정보 비대칭 심리전 (비공개 잠식도, 배신자, 거짓 귓속말, 흉/평/길 변이)

## 문서 (작업 전 반드시 참조)

| 문서 | 내용 |
|---|---|
| `docs/rulebook-v3.md` | 게임 규칙 전체. **규칙의 유일한 원본** |
| `docs/architecture.md` | 시스템 설계와 확정된 기술 결정 |
| `docs/roadmap.md` | 마일스톤, 작업 단위, 진행 체크리스트 |

- 우선순위: 룰북 > 아키텍처 > 기존 코드
- 문서끼리 또는 문서와 코드가 어긋나면 **임의로 해석하지 말고 작업을 멈추고 보고**할 것
- 코드나 테스트에서 룰북 조항을 근거로 삼을 때는 `§7.3` 형식으로 표기

## 작업 규칙

1. **코드 작성 전에 계획을 먼저 제시하고 승인을 받는다.** 계획에는 다음을 포함한다.
   - 생성·수정할 파일 목록
   - 파일별 핵심 내용과 설계 판단
   - 근거가 되는 룰북 조항
2. **요청 범위 밖의 작업을 하지 않는다.** 추가 기능, 리팩터링, 의존성 추가, 파일 정리 모두 포함. 필요하다고 판단되면 제안만 한다.
3. 룰북에 없는 규칙이나 수치가 필요하면 만들지 말고 질문한다.
4. 응답은 한국어로 한다.
5. 로그·오류 원문을 길게 인용하지 않고, 확인한 내용을 요약해서 보고한다.
6. 코드는 완전한 파일 단위로 작성한다. `// ...생략` 같은 부분 코드를 남기지 않는다.
7. 작업 단위를 마치면 다음을 보고한다.
   - 변경 파일 목록
   - 테스트·타입 체크 결과 요약
   - `docs/roadmap.md` 체크리스트 갱신 내용

## 환경

- OS: **Windows / PowerShell.** `rm -rf` 같은 Unix 전용 명령을 쓰지 않는다
- Node 24, npm workspaces
- TypeScript 6.0.3 (루트 `node_modules` 공용)
- 에디터: WebStorm

## 저장소 구조

```
tal-brothers/                 # 루트 (npm workspaces)
├─ CLAUDE.md
├─ docs/
├─ tal-brothers-shared/       # 프론트·서버 공용 상수와 타입 (빌드 없이 TS 소스 직접 참조)
├─ tal-brothers-server/       # Node + Express + ws, 순수 룰 엔진 포함
└─ tal-brothers-web/          # Vue 3 + Vite 8 + Tailwind v4 + shadcn-vue(Reka UI) + Pinia + Vue Router
```

## 명령 (루트에서 실행)

| 용도 | 명령 |
|---|---|
| 패키지 설치 | `npm install <패키지> -w <워크스페이스>` (개발 의존성은 `-D`) |
| 웹 개발 서버 | `npm run dev:web` |
| 서버 개발 실행 | `npm run dev:server` |
| 서버 테스트 | `npm run test -w tal-brothers-server` |
| 서버 타입 체크 | `npm run typecheck -w tal-brothers-server` |
| shadcn 컴포넌트 추가 | `tal-brothers-web` 폴더에서 `npx shadcn-vue@latest add <이름>` |

## 아키텍처 원칙 (상세는 `docs/architecture.md`)

1. **룰 엔진은 순수 모듈.** 소켓, DB, 실제 시각, `Math.random`을 직접 쓰지 않는다. 현재 시각과 난수는 주입받는다
2. **서버 권위.** 주사위, 타이머, 잠식도, 변이, 봇 행동은 모두 서버가 계산한다. 프론트에 룰 계산을 두지 않는다
3. **시나리오 수치는 서버 전용.** 성공 기준, 보상, 페널티를 `shared`나 `web`에 넣지 않는다
4. **은닉은 화이트리스트 투영.** 보는 대상별로 필요한 필드만 골라 새 객체를 만들고, 은닉 테스트로 고정한다
5. **가짜 정보는 발생 시점에 확정해 상태에 저장.** 가짜 라벨, 귓속말, 가짜 붉은 메시지를 전송 시점에 새로 굴리지 않는다
6. **서버 → 클라이언트는 대상별 스냅샷 + 일회성 연출 신호(cue).** 클라이언트 → 서버는 명령만 보낸다
7. **모든 시간은 상태 안의 마감 시각으로 관리.** `setInterval` 틱을 쓰지 않는다

## 코딩 컨벤션

- TypeScript `strict`
- **`enum` 금지** (`erasableSyntaxOnly` 설정). `as const` 객체와 파생 유니온 타입을 쓴다
- **상수 파일:** 파일명 camelCase ↔ export const명 SCREAMING_SNAKE_CASE를 1:1로 맞춘다. 예: `gamePhase.ts` → `GAME_PHASE`
- tsconfig 경로 별칭은 `paths`만 사용한다 (`baseUrl`은 TypeScript 6에서 폐기 예정이라 쓰지 않음)
- web import 별칭: `@/` = `tal-brothers-web/src`
- shared import: `import { ... } from 'tal-brothers-shared'`
- Vue: `<script setup lang="ts">`, Composition API
- `tal-brothers-web/src/components/ui/`(shadcn 생성물)는 직접 수정을 최소화한다
- 판단 기준: **신규 입사자가 1달 안에 이해하고 수정할 수 있을 것**, 타이핑량과 휴먼 에러 최소화, 프로젝트 전반의 일관성 우선

## 현재 상태

`docs/roadmap.md`의 진행 상태 표를 따른다.
