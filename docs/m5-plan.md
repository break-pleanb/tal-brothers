# M5 실행 계획 — 에셋·프리로드·연출, 배포 빌드

> 근거 문서: `rulebook-v3.md`(규칙 원본) > `architecture.md`(구현 설계) > `roadmap.md`(범위)
> 이 문서는 M5 중 **에셋·프리로드·연출과 서버 배포 빌드 설정**을 진행하기 위한 계획이며, 코드는 포함하지 않는다.
> 진행 방식(무인 진행, 공통 관문, 결정 원칙, 통합 테스트 장치)은 `docs/m4-plan.md` 11절을 그대로 따른다.

## 전제

- M4가 자동 확인까지 끝난 상태에서 시작한다. 화면의 **자리·레이어·크기 비율은 M4에서 최종 형태**로 만들었고(m4-plan 7절),
  M5는 그 안의 내용물을 임시 그래픽에서 에셋으로 바꾸고 움직임을 더한다
- **은닉 원칙은 연출에서도 그대로다.** 진짜·가짜 붉은 메시지는 완전히 같은 연출, 비네트·흔들림은 잠식도에 연동하지 않는다,
  배신자 좌석의 화면은 일반 좌석과 같다 (m4-plan 6.4, 룰북 §10.1·§17)
- 룰북 §19의 시간(판정 연출 3초, 결과 표시 3초, 붉은 메시지 3초, 개입 4초)을 **연출이 늘리지 않는다.** 서버 단계가 시간을 정하고 화면은 따라간다
- 소리·진동은 넣지 않는다 (m4-plan 11.1 a·b)
- 서버·shared 변경은 **배포 빌드 설정만** 한다 (m4-plan 11.6 3번)
- **범위 밖 (후속):** 세이브/불러오기·좌석 재할당(아키 §10), Phase 전환 자동 저장(아키 §6), 호스팅과 실제 배포, OAuth 동의 화면 프로덕션 게시.
  이유는 Supabase 스키마 변경(사람이 SQL 실행)·실제 DB 확인·호스팅 선택·Google 콘솔 작업이 필요해 무인 검증이 되지 않기 때문이다
- **완료 기준(이번 범위):** 에셋과 연출이 붙은 빌드로 자동 한 판이 통과하고, 서버를 번들로 빌드해 실행할 수 있다.
  로드맵의 M5 완료 기준("방송에 사용할 수 있는 빌드")은 후속 범위와 사람 확인까지 끝나야 닫힌다

---

## 1. 작업 단위

| 단위 | 내용 | 끝나는 조건 |
|---|---|---|
| M5-1 | 에셋 적용 — `ASSET_URL`, 배경·탈·아이템 이미지, `introMask` 최적화 | 11종이 모두 실제로 그려진다, 운영 빌드 용량이 줄었다 |
| M5-2 | 프리로드 — `useAssetPreload`, 로비 준비 표시 | 게임 시작 뒤 이미지 요청 0건 |
| M5-3 | Display 연출 | 연출이 룰북 시간 안에 끝난다, 레이아웃 검사 통과 |
| M5-4 | Controller 연출 | 붉은 메시지 동일성 재통과, 축소 모션에서 동작 |
| M5-5 | 배포 빌드 — 서버 번들(shared 포함) | `node dist/index.js`로 `/healthz`, 번들된 e2e 서버로 한 판 |
| M5-6 | 마감 | 전체 회귀, `m5-notes.md`·로드맵 |

각 단위는 m4-plan 11.5의 공통 관문을 지난 뒤 `M5-N: 요약`으로 커밋한다.

### M5-1. 에셋 적용

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `src/constants/assetUrl.ts` | 생성 | `ASSET_URL: Record<AssetKey, string>` — Vite import로 해시된 URL (아키 §9.1·§9.3) |
| `src/constants/assetPlaceholder.ts` | 삭제 | m4-plan 7절의 예정대로 `assetUrl.ts`가 대체한다. 이름 표기가 필요한 곳은 `assetLabel.ts`(`ASSET_LABEL`)로 옮긴다 |
| `src/components/display/StageBackground.vue` | 수정 | 배경 이미지. 원본이 3:2라 `object-fit: cover`로 16:9를 채운다. 비네트는 Phase로만 |
| `src/components/display/MaskApparition.vue` | 수정 | 탈 이미지. 원본이 검정 바탕 JPG라 `mix-blend-mode: screen`으로 배경에 얹는다 |
| `src/components/controller/InventoryPanel.vue` | 수정 | 부적·옥비녀 아이콘 |
| `scripts/optimizeImages.mjs` (web) | 생성 | `introMask.png`(7.7MB) → webp. **원본은 지우지 않는다** (파일 정리 금지). 의존성 `sharp`(web devDependency) |
| `src/pages/LandingPage.vue` 등 | 수정 | 브랜드 이미지를 변환본으로 |

| 에셋 키 | 파일 | 쓰는 곳 (룰북 §18) |
|---|---|---|
| 초가 마을 | `backgrounds/thatchedVillage.jpg` | Phase 1 |
| 당산나무 숲 | `backgrounds/dangsanForest.jpg` | Phase 2 기본, 분기 A |
| 핏빛 사당 | `backgrounds/bloodyShrine.jpg` | 분기 B, 07 |
| 피눈물 장승 | `backgrounds/bloodTearJangseung.jpg` | Phase 3, 탈출 계열 엔딩 |
| 옥비녀 | `items/jadeHairpin.jpg` | 인벤토리, 옥비녀 이동, 진엔딩 |
| 낡은 부적 | `items/talisman.jpg` | 인벤토리 (튜토리얼 부적 공용) |
| 기본 광대탈 | `masks/clownMask.jpg` | 이장, 03 |
| 일반 탈 1 | `masks/commonMaskA.jpg` | 01 |
| 일반 탈 2 | `masks/commonMaskB.jpg` | 10 |
| 보스 탈 | `masks/bossMask.jpg` | 15 |
| 요괴화 탈 | `masks/corruptedMask.jpg` | 붉은 메시지(진짜·가짜), 배신자 승리 계열 엔딩 |

- 어느 화면에 어느 키를 쓸지는 **서버가 보낸 키**(`background`·`mask`·`EndingView.assets`)를 따른다. web이 이벤트별 매핑을 갖지 않는다
- **자동 확인:** 각 이미지 요소의 `naturalWidth > 0`, 운영 빌드 용량 전후 비교, 스크린샷

### M5-2. 프리로드

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `src/composables/useAssetPreload.ts` | 생성 | URL 목록을 받아 `Image` + `decode()`. 진행률·완료·실패 수를 돌려준다. 실패해도 게임은 진행한다 |
| `src/pages/LobbyPage.vue` (+ 로비 패널) | 수정 | Display 로비에 "에셋 준비 n/11". **시작 버튼을 막지 않는다** (m4-plan 11.1 c) |
| `DisplayPage`·`ControllerPage` | 수정 | 로비를 거치지 않고 들어온 경우(새로고침)도 같은 프리로드를 건다 |

- Display는 11종 전부, Controller는 아이템 2종 + 요괴화 탈(붉은 메시지)만 받는다. 폰 데이터를 아끼고, Controller가 쓰지 않는 이미지를 받지 않는다
- **자동 확인:** Playwright 요청 기록으로 **`lobby.start` 이후 이미지 요청 0건**, 로비 준비 표시 스크린샷

### M5-3. Display 연출

| 대상 | 연출 | 시간 |
|---|---|---|
| `StageBackground` | 배경 키가 바뀌면 교차 전환. 비네트는 Phase 1 → 2 → 3으로만 짙어진다 | `MOTION_TIMING` |
| `MaskApparition` | `eventIntro` cue 또는 탈 키 변경에 등장, 이후 낮은 불투명도의 잔상 | 상황 제시 30초 안 |
| `DiceArena` | `diceRolled` cue에 굴림 → 카운트업 0.6초(m4-plan 9절 9번) → 결과 고정. 비공개 판정은 "판정 완료"만, 굴림 연출도 하지 않는다 | 판정 연출 3초 안 |
| `InterventionTrack` | 단계 점등, 사용 알림에 강조 | 단계 4초 안 |
| `TargetReveal` | 타겟 공개, 옥비녀 이동 | `P3_TARGETING` 안 |
| `EndingSequence` | `EndingView.assets` 에셋, 이름 → 내레이션 → 배신자 공개 순 | 시계 밖 |
| `NoiseOverlay` | SVG `feTurbulence` 노이즈와 깜빡임 | 강제 잠식 |
| `src/constants/motionTiming.ts` | `MOTION_TIMING` — 화면 전용 시간값 한 곳 | |

- `diceRolled`·`judgmentResult` 같은 장면 cue를 놓쳐도 스냅샷만으로 최종 화면이 같아야 한다 (m4-plan 4.3)
- **자동 확인:** 연출 중간 프레임 스크린샷, 애니메이션 길이를 `getAnimations()`로 재서 룰북 시간 안인지, `layout.spec` 재실행

### M5-4. Controller 연출

| 대상 | 연출 |
|---|---|
| `RedMessageOverlay` | 요괴화 탈 + 적색 덮개 3초. **입력은 cue 하나뿐** — 진짜·가짜가 같은 DOM·스타일·시간 |
| 토스트·게이지·투표 선택 | 짧은 전환. 게이지 색이 티어에 따라 바뀌는 것은 본인 화면이라 허용 |
| 공통 | `prefers-reduced-motion`이면 움직임을 끄고 같은 정보를 정지 화면으로 |

- **자동 확인:** `redMessage.spec` 재실행(동일성), 축소 모션 에뮬레이션 스크린샷

### M5-5. 배포 빌드

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `tal-brothers-server/scripts/build.mjs` | 생성 | esbuild로 `src/index.ts` → `dist/index.js`. **shared TS 소스를 번들에 포함**하고 npm 의존성은 외부로 둔다 (아키 §3). 같은 방식으로 `e2e/e2eServer.ts` → `dist-e2e/` |
| 서버 `package.json` | 수정 | `build`, `start`(`node dist/index.js`). 의존성 `esbuild`(devDependency) |
| `.gitignore` | 수정 | 서버 `dist`·`dist-e2e` (루트의 `dist` 규칙이 이미 덮는지 확인) |
| `docs/architecture.md` §3 | 수정 | "배포용 서버 빌드는 M5에서 추가" 문장을 실제 방식으로 |

- **자동 확인:** 자리 값 환경 변수로 `node dist/index.js` → `GET /healthz`, `NODE_ENV=production`에서 개발용 옵션이 꺼지는지,
  **번들된 e2e 서버로 `fullGame` 1판**
- 호스팅·실제 환경 변수·도메인은 후속 범위다

### M5-6. 마감

- 전체 e2e(인간 1·2·3명, 붉은 메시지, 비상, 레이아웃, 회귀), 서버 테스트, 타입 체크, 빌드
- `docs/m5-notes.md`, 로드맵 M5 체크리스트. 상태는 **"에셋·연출·배포 빌드 완료 · 세이브/배포는 후속"**

---

## 2. 연출이 은닉을 깨지 않는지 확인하는 방법

| 위험 | 확인 |
|---|---|
| 진짜·가짜 붉은 메시지가 다르게 보인다 | `redMessage.spec` — DOM·계산 스타일·픽셀·표시 시간 동일 |
| 배경 연출이 잠식도를 드러낸다 | 비네트·흔들림의 입력이 Phase와 cue뿐인지 코드 검색 + Display 은닉 검사 |
| 배신자 화면이 다르다 | 같은 단계의 배신자·일반 Controller testid 집합 동일 (m4-plan 11.4) |
| 연출이 비공개 판정 결과를 드러낸다 | 비공개 판정에서 주사위 연출을 하지 않는다. Display ws·DOM 은닉 검사 |
| 프리로드가 다음 이벤트를 드러낸다 | 11종을 **한꺼번에** 받는다. 이벤트 순서를 따라 받으면 요청 순서로 다음 탈을 알 수 있다 |

---

## 3. 사람이 마지막에 확인할 항목 (M5 추가분)

m4-plan 11.7에 더해:

| # | 항목 |
|---|---|
| 1 | 실제 방송 모니터·OBS에서 배경 이미지 화질 (원본이 1248×832라 1920 폭에서 확대된다) |
| 2 | 탈 등장·잔상, 주사위, 엔딩 연출의 분위기와 길이 |
| 3 | 붉은 메시지(요괴화 탈)의 체감 |
| 4 | 저사양 폰에서 붉은 메시지·토스트 전환이 끊기지 않는지 |
| 5 | 배포 대상 결정 후 실제 배포 (후속) |

---

## 4. 후속 범위 (이번에 하지 않는 것)

| 항목 | 필요한 것 |
|---|---|
| 세이브/불러오기, 좌석 재할당 | `game_saves` 테이블 SQL(사람 실행), `savesRouter`·`saveRepository`, `SaveListPage`, 복원 검증, 실제 Supabase 확인 |
| Phase 전환 자동 저장 | 위와 같은 저장소 (아키 §6의 호출 자리) |
| 호스팅·배포 | 서버·web 호스팅 선택, 환경 변수, 도메인, HTTPS·WSS |
| OAuth 동의 화면 프로덕션 게시 | Google Cloud 콘솔 작업 (사람) |
