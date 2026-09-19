# 로드맵

> 작업 단위를 마치면 해당 체크리스트를 `[x]`로 갱신하고, 진행 상태 표를 업데이트합니다.

## 진행 상태

| 마일스톤 | 내용 | 상태 |
|---|---|---|
| M0 | 개발 환경 구성 | 완료 |
| M1 | 엔진 핵심 + Phase 1 | 완료 |
| M2 | Phase 2·3, 엔딩, 투영, 봇 자동 대전 | 완료 |
| M3 | 런타임, 통신, 인증, 로비, 운영 규칙 | 진행 중 |
| M4 | Display·Controller 화면 (임시 그래픽) | 대기 |
| M5 | 에셋·연출, 세이브/불러오기, 배포 | 대기 |

---

## M0. 개발 환경 구성 (완료)

- [x] 루트 npm workspaces 구성 (`tal-brothers-shared`, `tal-brothers-server`, `tal-brothers-web`)
- [x] shared 패키지: `PROTOCOL_VERSION`만 export하는 최소 상태
- [x] server 패키지: `package.json`, `tsconfig.json`, 빈 `src`. express, ws, typescript, tsx, @types 설치
- [x] web 패키지: Vite vue-ts 템플릿, Tailwind v4, 경로 별칭 `@/`, shadcn-vue 초기화(Reka UI, Neutral), vue-router·pinia·supabase-js 설치
- [x] shadcn `button` 컴포넌트 추가로 동작 확인
- [x] web은 Vite 기본 화면 상태 (M4에서 교체)
- [x] server에 vitest 설치, test·test:watch 스크립트 추가

---

## M1. 엔진 핵심 + Phase 1

### 목표

서버·화면 없이 **엔진만으로 Phase 1(T1 → T2 → 이장)을 끝까지 진행**한다.

### 완료 기준

- `npm run sim:phase1 -w tal-brothers-server -- --seed 42`로 Phase 1 한 판이 끝까지 진행되고 이벤트별 진행 로그가 출력된다
- 인간 1·2·3명 구성 모두 동작한다
- 같은 시드로 실행하면 같은 결과가 재현된다
- 단위 테스트와 타입 체크가 통과한다

### 범위

| M1 포함 | M1 제외 (이후 마일스톤) |
|---|---|
| 게임 생성 (좌석 3, 인간/봇 구성) | Phase 2·3, 엔딩 |
| 게임 시계, 단계 마감 시각 | 환경 잠식, 잠식 티어 효과 (환청, 가짜 라벨, 가짜 붉은 메시지) |
| 이벤트 소개 → 투표 → 판정 → 개입 창 → 결과 | 배신자 전환, 봇 100% 방해 |
| 개인·협동·비공개 판정 | 14A 부적 제출 창, 부적 보유 상한·양도 |
| 개입 창 3단계, 연습 개입 창 | 대립 판정 |
| 고유 능력 3종, 튜토리얼 횟수 미소모 | 투영 |
| 부적 판정 보정·회복, 튜토리얼 부적 | 연결 끊김, 일시정지, 소켓, 인증 |
| 흉/평/길 변이 (이장), T2 귓속말 | 타임오버 엔딩 (M1은 시계 0 도달 시 로그만 남기고 계속 진행) |
| 버프/디버프 (이장 A 실패 -1, 이장 C 성공 +1) | |
| 봇 굴림, 둘째 봇 자동 재굴림, 봇 부적 자동 사용 | |
| 운영 규칙: 판정자 10초 자동 굴림, 협동 판정 굴림 방식, 투표 변경·조기 마감·기권·동률 | |

- M1에서 Phase 1이 끝나면 `PHASE1_COMPLETE` 단계로 멈춘다. 이 단계는 M2에서 Phase 2 진입으로 교체한다
- M1에서 모든 좌석은 연결된 상태로 간주한다

### M1-1. shared 상수와 명령 타입

**파일**
```
tal-brothers-shared/src/
├─ constants/
│  ├─ brotherRole.ts      # BROTHER_ROLE
│  ├─ attribute.ts        # ATTRIBUTE
│  ├─ judgmentKind.ts     # JUDGMENT_KIND
│  ├─ variantKind.ts      # VARIANT_KIND
│  ├─ gamePhase.ts        # GAME_PHASE
│  ├─ gameStep.ts         # GAME_STEP
│  ├─ commandType.ts      # COMMAND_TYPE
│  └─ assetKey.ts        # ASSET_KEY (룰북 §18, 배경 4 / 아이템 2 / 탈 5)
├─ types/
│  └─ command.ts          # 클라이언트 → 서버 명령 타입 (M1 범위 명령만)
└─ index.ts
```

**체크리스트**
- [x] 상수는 `as const` 객체 + 파생 유니온 타입
- [x] `GAME_STEP`은 아키텍처 §5.3 단계 전체와 연습 개입 창, `PHASE1_COMPLETE`(임시) 포함
- [x] `COMMAND_TYPE`은 아키텍처 §7.1 전체, `types/command.ts`는 M1 범위 명령만 타입 정의
- [x] `ASSET_KEY`는 서버가 지정하는 인게임 에셋 11종만 포함한다. 랜딩·메뉴용 브랜드 이미지(`introMask.png`)는 web 전용이라 제외한다
- [x] shared에 `typecheck` 스크립트 추가, 통과
- [x] `tal-brothers-server/tsconfig.json`과 `tal-brothers-shared/tsconfig.json`에 `erasableSyntaxOnly: true` 추가 (이번 작업 범위에 포함)

### M1-2. 서버 테스트 환경과 시나리오 데이터

**파일**
```
tal-brothers-server/
├─ src/scenario/
│  ├─ scenarioTypes.ts           # 이벤트, 선택지, 판정 사양, 효과(분류: reward / sideEffect / penalty)
│  ├─ gameConfig.ts              # GAME_CONFIG
│  └─ phase1Events.ts            # PHASE1_EVENTS
└─ test/scenario/
   └─ phase1Events.test.ts       # 데이터 무결성
```

**체크리스트**
- [x] vitest 설치와 test 스크립트는 M0에서 완료 (재설치 금지)
- [x] 효과 모델은 아키텍처 §5.4를 따른다
- [x] `GAME_CONFIG`에 룰북 §19 설정값 전체와 아키텍처 §8 운영 규칙 설정값 포함 (+ 룰북 §11 `botTalismanDelaySeconds`)
- [x] `PHASE1_EVENTS`는 이벤트 4개(T1, T2-1, T2-2, 이장)로 구성하고 룰북 §12 수치를 그대로 옮김
- [x] 각 이벤트·선택지에 배경·탈 에셋 키 지정 (룰북 §18). 이미지 파일 경로는 web이 매핑하므로 서버는 키만 다룬다
- [x] 무결성 테스트: 선택지 ID 중복 없음, 판정 선택지에 속성 태그 존재, 성공 기준 4~6 범위(원본 데이터 기준), 변이 적용 여부가 룰북 §6.3과 일치

### M1-3. 엔진 기반과 순수 규칙

**파일**
```
tal-brothers-server/
├─ src/engine/
│  ├─ engineTypes.ts
│  ├─ random.ts
│  ├─ dispatch.ts                # 단계별 분기 골격, 알 수 없는 액션은 거절
│  ├─ state/
│  │  ├─ gameState.ts
│  │  └─ createGame.ts
│  └─ rules/
│     ├─ erosion.ts              # 5% 단위, 0~100 범위 (100% 전환은 M2)
│     ├─ modifiers.ts            # 직업 보정, 버프/디버프 합산, 디버프 하한 -2
│     ├─ variant.ts              # 흉/평/길 결정·적용, 비공개 판정 규칙, 적용 제외
│     ├─ effects.ts              # 효과 적용, 강제 성공 시 reward 제거·sideEffect 유지
│     └─ whisper.ts              # T2 귓속말 (이장 선택지 1개 변이, 진실/거짓)
└─ test/engine/rules/
   └─ (규칙별 테스트)
```

**체크리스트**
- [x] 엔진 인터페이스는 아키텍처 §5.1을 따른다
- [x] 시드 난수는 외부 의존성 없이 구현하고, 같은 시드 같은 수열을 테스트로 확인
- [x] 흉/평/길 테스트: 성공 기준 상한 6, 기준 6에서 흉은 페널티만, 비공개 판정 길의 하한 2, 판정 없는 선택지 시간 가감 (룰북 §6.2). 옥비녀 보상의 길 처리는 `jadeHairpin` 효과가 M2라 `it.todo`
- [x] 강제 성공 테스트: 룰북 §3.2 표의 이장 B·C 사례

### M1-4. 단계 처리기와 봇 정책

**파일**
```
tal-brothers-server/
├─ src/engine/
│  ├─ steps/
│  │  ├─ eventIntroStep.ts       # 튜토리얼 부적 지급(T1 진입), 변이 결정
│  │  ├─ votingStep.ts           # 투표·변경·조기 마감·기권·동률, 절대 시야, 부적 회복
│  │  ├─ rollStep.ts             # 판정자 결정, 개인·협동·비공개 굴림, 10초 자동 굴림
│  │  ├─ interventionStep.ts     # 3단계, 스킵 규칙, 부적 선착순 1개, 연습 개입 창
│  │  └─ resolutionStep.ts       # 효과 적용, 튜토리얼 부적 소멸, 다음 이벤트 또는 PHASE1_COMPLETE
│  └─ bots/
│     └─ botPolicy.ts
└─ test/engine/steps/
   └─ (단계별 테스트)
```

**체크리스트**
- [x] 판정자 결정: 채택 선택지의 속성 담당 형제 (룰북 §3.1)
- [x] 투표: 룰북 §8, 아키텍처 §8
- [x] 협동 판정 굴림 방식: 아키텍처 §8
- [x] 비공개 판정: 대가 고정, 결과 비공개, 개입 창 없음 (룰북 §5.4)
- [x] 개입 창: 실패 시에만 열림, 단계 순서·시간, 둘째·첫째 조기 스킵, 부적 단계 스킵 금지, 판정당 부적 1개 (룰북 §7)
- [x] 첫째 강제 성공 사용 불가 조건 (룰북 §3.2)
- [x] T1·T2: 실패 페널티 없음, 실패 시 실전 창, 성공 시 연습 창, 능력 횟수 미소모, 첫째 대가 적용 (룰북 §12)
- [x] 봇 정책: 룰북 §11 중 M1 범위 (굴림, 둘째 봇 재굴림, 부적 자동 사용 — 마감 1초 전 판단)

### M1-5. 콘솔 시뮬레이션과 전체 흐름 테스트

**파일**
```
tal-brothers-server/
├─ package.json                  # sim:phase1 스크립트 추가
├─ src/sim/
│  └─ playPhase1.ts              # --seed, --humans(1~3) 인자
└─ test/engine/
   └─ phase1Flow.test.ts
```

**체크리스트**
- [x] 인간 좌석 입력은 시드 기반 랜덤 정책으로 대신한다 (대화형 입력 없음)
- [x] 시간은 가상 시계로 진행한다. 다음 마감 시각으로 시계를 옮기고 타이머 만료 액션을 넣는다 (실제 대기 없음)
- [x] 로그는 이벤트별로 채택 선택지, 변이, 판정자, 주사위, 개입 내역, 결과, 좌석별 잠식도·인벤토리를 한국어로 요약
- [x] 흐름 테스트: 인간 1·2·3명 구성 모두 `PHASE1_COMPLETE` 도달, 같은 시드 같은 최종 상태

---

## M2. Phase 2·3, 엔딩, 투영, 봇 자동 대전

> 실행 계획은 `docs/m2-plan.md`, 진행 기록은 `docs/m2-notes.md`.

### 범위

- Phase 2: 진입 환청, 분기, 랜덤 슬롯 배치(보스 7번째 고정), 이벤트 풀 01~15, 환경 잠식
- 잠식 티어 효과: 30% 티어 환청, 60% 티어 가짜 라벨·가짜 붉은 메시지 (발생 시 확정 저장)
- 14A 부적 제출 창, 부적 보유 상한·양도·버림
- 배신자: 전환, 정보 우위, 회복 제외, 승패
- 봇 100% 방해
- Phase 3: 타겟 지정, 옥비녀 이동, B-1, A 루트, 대립 판정, 1인 플레이 규칙 (룰북 §14)
- 엔딩 판정, 타임오버, Phase 3 유효표 0
- 투영: `projectDisplay`, `projectSeat`, 은닉 테스트 (아키텍처 §7.3)
- 봇 자동 대전 CLI: 수백 판 실행 후 Phase 2 종료 시 잠식도 분포, 배신자 발생 수, 엔딩 분포 출력

**완료 기준:** 봇 자동 대전 결과로 룰북 §19 설정값 조정 여부를 판단할 수 있다

### M2-1. shared 상수·명령·투영 타입 확장

- [x] `GAME_STEP`에 `PHASE2_ENTRY` 추가, `PHASE1_COMPLETE` 제거
- [x] `EROSION_TIER`, `ENDING_ID`, `PHASE3_ROUTE` 상수 추가
- [x] `CUE_KIND`를 엔진에서 shared로 옮김 (클라이언트가 cue를 분기해야 하므로 공용)
- [x] 명령 타입에 `talisman.submit` / `talisman.transfer` / `talisman.discard` 추가
- [x] `types/projection.ts` — `DisplaySnapshot`, `SeatSnapshot`과 하위 타입
- [x] shared·server typecheck 통과, M1 테스트 163건 유지

### M2-2. Phase 2·3 시나리오 데이터와 엔딩표

- [x] 효과 대상·종류·귓속말 종류 상수 확장 (`SUBMITTER`, `RANDOM_SEAT`, `ALL_EXCEPT_ROLLER`, `JADE_HAIRPIN`, 귓속말 4종)
- [x] `scenarioTypes` 확장 — 14A·대립 판정 사양, `isBoss`, `environmentErosion`, `grabsRandomSeat`, `variantExempt`
- [x] `phase2Events.ts` — 분기, 풀 01~14, 보스 15
- [x] `phase3Scene.ts`(루트·1인 플레이별 선택지 구성), `endings.ts`
- [x] 데이터 무결성 테스트 27건 (계획 9절 M2-2)

### M2-3. 상태 확장과 순수 규칙

- [x] 상태 확장 (계획 2절) — 배신자, 보류함, 옥비녀, 가짜 라벨, Phase 3, 엔딩, 시계 만료
- [x] `erosion.ts` 티어 판정과 좌석 잠식 단일 진입점, `traitor.ts`, `target.ts`, `slots.ts`
- [x] `variant.ts` 가짜 라벨, `whisper.ts` 귓속말 5종, `effects.ts` 새 대상·옥비녀·보유 상한
- [x] 봇 100% 방해와 첫째 봇 보스 강제 성공 판단 (단계 연결은 M2-4)
- [x] 규칙 테스트 5종 (계획 9절 M2-3). M1의 옥비녀 `it.todo` 해제

### M2-4. Phase 2 단계 처리기

- [x] `phase2EntryStep.ts` — 진입 환청, 슬롯 배치
- [x] `eventIntroStep` — 티어 환청·가짜 라벨·가짜 붉은 메시지·13번 발목 대상
- [x] `talismanWindowStep.ts` — 14A 제출 창 8초
- [x] `votingStep` — 보류함 양도·버림, 마감 시 자동 폐기
- [x] `resolutionStep` — 환경 잠식, Phase 전환 (배신자 전환은 잠식 진입점에서 처리)
- [x] `rollStep` — Phase별 이벤트 조회와 14A 분기, 대립 판정 비교 규칙
- [x] Phase 2 단계 테스트 25건 (계획 9절 M2-4)

### M2-5. Phase 3와 엔딩

- [x] `phase3Step.ts` — 판정 순서 0~4, 시계 절삭, A 루트 투표, 1인 플레이
- [x] 대립 판정 (`rollStep`), Phase 3 개입 제한 (`interventionStep`)
- [x] `endingStep.ts`, `rules/clock.ts` 타임오버 (타이머 처리 맨 앞 한 곳에서 검사)
- [x] Phase 3·엔딩 테스트 26건 (계획 9절 M2-5)

### M2-6. 투영

- [x] `projectDisplay.ts`, `projectSeat.ts` — 화이트리스트 투영
- [x] 은닉 테스트와 구조 고정 테스트 20건 (계획 7.2)

### M2-7. 봇 자동 대전과 전체 흐름

- [x] `humanPolicy.ts` (가상 입력 지연 포함), `playGame.ts`, `playPhase1.ts` 축소
- [x] `botMatch.ts` CLI와 `sim:game` / `sim:bots` 스크립트 (`--humans all` 구성 비교)
- [x] 전체 흐름 테스트 15건과 집계 테스트 11건
- [x] 구성별 300판(총 1200판) 결과로 룰북 §19 조정 대상 정리 → `docs/m2-notes.md`

### M2 이후 1차 조정 (2026-09-18)

- [x] `docs/m2-notes.md`의 확인 필요 3건을 룰북에 확정 반영 (§4.3, §11, §16, §20, §21)
- [x] 밸런스 1건: Phase 2 진입 환청 잠식 +20% → +10% (룰북 §13.1, §19, §21.1)
- [x] `sim:game` 이벤트 블록에 심리전 요소 표시 (귓속말·가짜 라벨·가짜 붉은 메시지·배신자 전환·익명 표기·부적 이동)
- [x] 같은 조건으로 재측정, 조정 전후 비교 → `docs/m2-notes.md`

### M2 이후 버그 수정 (2026-09-18)

밸런스는 현재 값에서 확정한다. 추가 조정은 M4에서 사람이 실제로 한 판 돌린 뒤 판단한다.

- [x] 배신자가 0명인 판은 배신자 승패를 판정하지 않는다 (룰북 §15, §21 확정 반영)
- [x] `EndingState.traitorWon`을 `boolean | null`로, 봇 자동 대전 배신자 승률의 모집단을 배신자 1명 이상인 판으로 한정
- [x] Phase 3의 **대립**과 **고정 기준** 판정을 시뮬 로그·투영·cue·엔진 로그에서 구분해 표기 (룰북 §14.3, §14.4)

### M3 착수 전 정리 (2026-09-18)

`docs/m2-notes.md`의 승인된 제안 2건.

- [x] `PUBLIC_NOTICE_KIND`·`WHISPER_KIND`를 shared로 옮기고 `NoticeView`·`WhisperView`의 `kind`를 유니온 타입으로 좁힘
- [x] 단계 테스트 드라이버를 `test/support/gameDriver.ts`로 추출

## M3. 런타임, 통신, 인증, 로비, 운영 규칙

> 실행 계획은 `docs/m3-plan.md`, 진행 기록은 `docs/m3-notes.md`.
> 계획 10절의 해석 항목 15건은 **2026-09-19에 모두 확정**했다.

### 범위

- room 런타임: 방당 직렬 큐, 타이머 예약, 스냅샷·cue 전송
- ws: `session.hello` 인증, 명령 검증, `rejected`, 재동기화
- Supabase JWT 검증, REST 방 생성·참가
- 로비: 좌석 선택, 봇 토글, 시작, QR
- 운영 규칙: Controller 연결 끊김 봇 대행, 전원 끊김 일시정지, Display 끊김 일시정지와 누적 한도, 호스트 수동 일시정지
- web: 인증 스토어, 라우터·가드, 최소 랜딩, 메뉴, 초대 페이지(인앱 브라우저 안내), 로비 페이지, 랜딩·메뉴 브랜드 이미지로 `introMask.png` 사용 (인게임 에셋은 M4까지 노출하지 않음)

**완료 기준:** PC 1대와 폰 여러 대가 같은 방에 접속해 로비에서 게임을 시작할 수 있다

### M3-0. 착수 전 결정 반영

- [x] 계획 10절 해석 항목 15건 확정 내용을 `docs/m3-plan.md` 10절과 각 절에 반영
- [x] 아키텍처 §5.1(액션 세 종류), §6(자동 저장 M5), §7.3(연결 상태 투영), §8(자동 정지 한도), §10(JWT 검증 방식) 수정
- [x] 룰북 §17 좌석 연결 상태 공개, §21 (확정) 행 추가
- [x] 7.3 사람 작업 목록에 OAuth 동의 화면 구성 추가, Vite 외부 노출을 M3-7 구현으로 이동

### M3-1. shared 프로토콜·거절 사유·로비 투영 타입

- [x] `DEVICE_ROLE`·`REJECTION_REASON`·`SERVER_MESSAGE_TYPE`·`CLIENT_FRAME_TYPE`·`PAUSE_REASON`·`SEAT_CONNECTION` 상수 (+ `PROTOCOL_ERROR_CODE`·`API_ERROR_CODE`)
- [x] `types/protocol.ts`, `types/rest.ts`, 명령 타입 확장, `LobbyView`·`PauseView`·`SeatConnectionView`
- [x] `REJECTION_REASON`을 엔진에서 shared로 이동, 서버 import 9곳 교체
- [x] shared·server typecheck 통과, 기존 테스트 343건 유지

### M3-2. 엔진: 로비 단계, 연결 상태, 봇 대행, 일시정지

- [ ] `ACTION_KIND.PRESENCE`, 상태 확장(`userId`, `connection`, `botTakeover`, `pause`, `room`)
- [ ] `createGame`이 `LOBBY`에서 멈추고 `lobby.start`가 Phase 1로 진입
- [ ] `rules/seatControl.ts`, `rules/pause.ts`, `steps/lobbyStep.ts`, `steps/pausedStep.ts`
- [ ] 엔진 테스트 (계획 9.1 M3-2 12건), 기존 테스트 유지

### M3-3. room 런타임

- [ ] `scheduler.ts`, `roomRuntime.ts`, `roomRegistry.ts`, `seatBinding.ts`
- [ ] 런타임 테스트 (계획 9.1 M3-3 6건)

### M3-4. ws 세션

- [ ] `socketPort.ts`, `commandCodec.ts`, `wsSession.ts`, `wsServer.ts`
- [ ] 세션 테스트 (계획 9.1 M3-4 7건)

### M3-5. infra·REST·부트스트랩

- [ ] `serverEnv.ts`, `supabaseAdmin.ts`, `authVerifier.ts`, `roomRepository.ts`
- [ ] `roomsRouter.ts`, `healthRouter.ts`, `src/index.ts`
- [ ] `docs/supabase-setup.sql`, `.env.example`, `.gitignore`
- [ ] REST 테스트 (계획 9.1 M3-5 4건)

### M3-6. web 기반

- [ ] `services/supabase.ts`, `apiClient.ts`, `stores/auth.ts`
- [ ] 라우터·가드, 레이아웃, 랜딩·콜백·메뉴·초대·404 페이지
- [ ] Vite 템플릿 잔재 정리, `typecheck` 스크립트 추가

### M3-7. web 로비

- [ ] `roomSocket.ts`, `useRoomSocket.ts`, `stores/lobby.ts`
- [ ] `LobbyPage.vue`, `SeatBoard`·`BotToggle`·`JoinQrPanel`, Display·Controller 자리표시자
- [ ] `vite.config.ts`의 `server.host`, `qrcode.vue` 설치
- [ ] 실기 확인 (계획 7.4)

## M4. Display·Controller 화면 (임시 그래픽)

- Display·Controller 레이아웃 (아키텍처 §9.4)
- play 스토어, cue 큐, 남은 시간 표시
- 투표, 굴림, 개입 창, 능력, 부적, 귓속말, 붉은 메시지, Phase 3, 엔딩 화면

**완료 기준:** 사람이 실제로 한 판을 처음부터 끝까지 플레이할 수 있다

## M5. 에셋·연출, 세이브/불러오기, 배포

- 에셋 11종 적용, 프리로드, 연출
- 세이브/불러오기, 좌석 재할당 (아키텍처 §10)
- OAuth 동의 화면 프로덕션 게시
- 서버 배포 빌드 (shared 번들 포함)

**완료 기준:** 방송에 사용할 수 있는 빌드
