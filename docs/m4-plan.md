# M4 실행 계획 — Display·Controller 화면 (임시 그래픽)

> 근거 문서: `rulebook-v3.md`(규칙 원본) > `architecture.md`(구현 설계) > `roadmap.md`(범위)
> 이 문서는 M4-1 ~ M4-7을 한 번에 진행하기 위한 계획이며, 코드는 포함하지 않는다.
> 타입·컴포넌트 표기는 설계 스케치이고 최종 파일 작성 시 확정한다.

## 전제

- M3 완료 상태에서 시작한다. 서버는 로비에서 엔딩까지 한 판을 진행하고, 대상별 스냅샷과 cue를 보낸다
- **M4의 일은 받은 스냅샷을 그리고 명령을 보내는 것뿐이다.** 룰 계산을 web에 넣지 않는다 (아키 §9.3).
  유일한 예외는 마감 시각으로 남은 시간을 표시하는 것이다
- **서버 코드는 원칙적으로 건드리지 않는다.** 화면에 필요한 값이 투영에 없으면 만들어 내지 말고 9절에 적어 확인받는다.
  9절의 확정으로 **승인된 서버·shared 변경 4건**(`serverNow`, `RESOLUTION` 체류, 투영 3가지, 개발용 시계 단축)은 M4-1에서 함께 한다
- 에셋 11종 적용·프리로드·연출은 M5다. M4는 임시 그래픽으로 자리와 레이어만 맞춘다 (7절)
- 세이브/불러오기는 M5다. 메뉴의 `/saves`는 비활성 상태를 유지한다
- 룰북에 없는 수치·문구는 만들지 않는다. 9절에 모아 두었고 **2026-09-19에 13건 모두 확정됐다** (9절)
- M3에서 넘어온 항목 2건을 포함한다 — 연결 끊김 봇 대행·일시정지의 실기 확인(8절), 로비 봇 지정 버튼의 대비(M4-7)
- M2에서 미룬 **밸런스 재판단**도 M4-7에 있다 (로드맵 M2 "추가 조정은 M4에서 사람이 실제로 한 판 돌린 뒤 판단한다")
- **완료 기준(로드맵):** 사람이 실제로 한 판을 처음부터 끝까지 플레이할 수 있다
- **2026-10-25부터 M4-5 이후는 무인 진행이다.** 사람은 계획을 한 번 승인하고 최종 결과만 본다.
  사람이 하던 실기 확인(8절)을 대신하는 **통합 테스트 장치**(M4-A·M4-B)를 먼저 만들고, 단위마다 구현 → 자동 확인 → 커밋을 반복한다.
  확정된 결정, 진행 원칙, 장치 구성은 **11절**에 있다

---

## 1. 작업 단위 분할과 단위별 파일 목록

| 단위 | 내용 | 끝나는 조건 |
|---|---|---|
| M4-1 | 표시 기반 — play 스토어, cue 큐, 남은 시간, 표기 사전 | `typecheck -w tal-brothers-web` 통과, 자리표시자에 단계·남은 시간이 뜬다 |
| M4-2 | Display 셸 — 16:9 스테이지, 레이어, HUD, 세이프존 | 로비에서 시작하면 Display에 배경·시계·좌석 줄이 뜬다 |
| M4-3 | Controller 셸 — 세이프에어리어, 잠식도 게이지, 액션바, Wake Lock | 폰에서 본인 잠식도와 단계별 빈 액션바가 뜬다 |
| M4-4 | 이벤트 본류 — 소개, 투표, 굴림, 개입 창 | 봇 2명과 함께 T1~이장을 끝까지 조작할 수 있다 |
| M4-A | 통합 테스트 기반 — 테스트 전용 진입점, 가짜 인증, 가속 시계, Playwright (11.4) | 로비 → 첫 이벤트가 자동으로 진행된다 |
| M4-B | 플레이 드라이버·기록기·은닉 검사기 (11.4) | 인간 1·2·3명 각 1판이 `ENDING` 단계까지 자동으로 가고 은닉 검사 위반 0건 |
| M4-C | 다크 토큰 적용과 기존 화면 회귀 (11.1 3번) | 전 화면 대비 검사 통과 |
| M4-5a | 개인 정보 — 인벤토리, 절대 시야, 부적 회복·제출·양도·버림, Phase 2 진입, 14A | 절대 시야·부적 회복·14A 제출이 자동 판에서 한 번 이상 일어난다 |
| M4-5b | 심리전 — 귓속말 목록, 붉은 메시지, 공개 알림 피드 | 진짜·가짜 붉은 메시지의 DOM·스타일·픽셀이 같다 |
| M4-6a | Phase 3·엔딩·노이즈 (+ `EndingView.narration`·`assets`) | 엔딩 3종 이상, B-1·A 루트, 타임오버 노이즈 |
| M4-6b | 비상 상황 — 호스트 바, 일시정지 덮개, 잠금 사유, 연결 끊김·복귀 | 비상 시나리오 5개 통과 |
| M4-7 | 마감 — 8절 자동 확인 전수, 커버리지, 레이아웃 검사 | 전체 e2e 통과, `docs/m4-notes.md`·로드맵 갱신 |

> 2026-10-25 무인 진행 승인으로 M4-A·M4-B·M4-C를 더하고 M4-5·M4-6을 둘로 나눴다.
> **호스트 바(2.5)는 M4-2에 파일이 없어 만들어지지 않았으므로 M4-6b에서 만든다.** 단위별 파일은 11.3에 있다

- 각 단위의 끝에 `npm run typecheck -w tal-brothers-web`과 `npm run build -w tal-brothers-web`을 돌린다
- shared를 건드리는 단위에서는 서버 테스트(현재 426건)가 그대로 통과하는지 함께 본다
- ~~web에는 자동 테스트가 없다 (M3 계획 9절). 검증은 타입 체크와 8절의 실기 확인이다 (9절 10번)~~
  **M4-A부터 Playwright 통합 테스트가 생긴다.** 단위가 끝났다고 보는 공통 관문은 11.5

### M4-1. 표시 기반 — 승인된 서버 변경 + 스토어, cue 큐, 남은 시간

9절에서 승인된 서버·shared 변경을 먼저 한다. 화면이 없으면 확인할 수 없는 값들이라 여기서 끝내 둔다.

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `tal-brothers-shared/src/types/protocol.ts` | 수정 | `SnapshotMessage.serverNow` (9절 2번) |
| `tal-brothers-shared/src/types/projection.ts` | 수정 | `PublicView.seatNames`·`eventNumber`, `EndingView.traitorWon`·`traitorSeats` (9절 4번) |
| `tal-brothers-shared/src/types/rest.ts` | 수정 | `CreateRoomRequest.devClockMinutes` (9절 12번) |
| `server/scenario/gameConfig.ts` | 수정 | `resolutionSeconds: 3` (룰북 §19) |
| `server/engine/steps/resolutionStep.ts` | 수정 | 결과 적용 후 3초 체류 → 타이머 만료에 다음 단계로 (9절 3번) |
| `server/engine/state/gameState.ts` · `createGame.ts` | 수정 | `clock.durationMs` — 이 방의 게임 시계 길이 (9절 12번) |
| `server/engine/steps/lobbyStep.ts` | 수정 | 시작 시 `clock.durationMs`로 시계를 건다. 좌석 선택 시 표시 이름 저장 (9절 4번 ①) |
| `server/engine/projection/projectDisplay.ts` | 수정 | `seatNames`·`eventNumber`·엔딩 배신자 공개 (9절 4번) |
| `server/room/roomRuntime.ts` · `roomRegistry.ts` | 수정 | 스냅샷에 `serverNow`, 방 생성 시 시계 길이 주입 |
| `server/transport/http/roomsRouter.ts` · `config/serverEnv.ts` | 수정 | 개발 환경에서만 `devClockMinutes`를 받는다 (9절 12번) |
| `src/stores/play.ts` | 생성 | 방 세션의 주인 — 소켓 수명, 스냅샷, cue 큐, 거절 메시지 (4절) |
| `src/stores/lobby.ts` | 삭제 | `play.ts`에 흡수한다 (9절 7번 확정). 로비 화면은 `play.ts`의 파생만 읽는다 |
| `src/composables/useRoomSocket.ts` | 수정 | 연결 수명을 **컴포넌트가 아니라 방**에 맞춘다. 로비 → 게임 라우트 이동에서 소켓이 끊기지 않게 한다 (4.1) |
| `src/composables/useCountdown.ts` | 생성 | 마감 시각 → 남은 시간. 250ms 갱신, 일시정지 중 정지 (4.4) |
| `src/composables/useCueQueue.ts` | 생성 | cue 분류·순차 소비·폐기 (4.3) |
| `src/constants/brotherLabel.ts` | 생성 | `BROTHER_LABEL` — 첫째·둘째·셋째 |
| `src/constants/attributeLabel.ts` | 생성 | `ATTRIBUTE_LABEL` — 근력/보호, 민첩/눈치, 지식/도술 |
| `src/constants/judgmentLabel.ts` | 생성 | `JUDGMENT_LABEL` — 개인·협동·비공개·아이템 사용·대립 |
| `src/constants/variantLabel.ts` | 생성 | `VARIANT_LABEL` — 흉·평·길 |
| `src/constants/endingLabel.ts` | 생성 | `ENDING_LABEL` — 엔딩 7종 이름 (룰북 §15) |
| `src/constants/rejectionLabel.ts` | 생성 | `REJECTION_LABEL` — 거절 사유의 한국어 안내 문구 |

- 표기 사전은 **shared 상수 값 → 한국어 문자열** 매핑만 한다. 시나리오 문장은 서버가 스냅샷·cue에 실어 보낸다
- 파일명 camelCase ↔ export const명 SCREAMING_SNAKE_CASE 1:1 규칙을 따른다 (CLAUDE.md)
- 사전의 키를 shared 유니온 타입으로 묶어, 상수가 늘면 타입 체크가 빠진 항목을 잡게 한다

### M4-2. Display 셸

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `src/layouts/DisplayLayout.vue` | 생성 | 16:9 레터박스 스테이지, 컨테이너 쿼리 기준점, 레이어 슬롯, 세이프존 (2절) |
| `src/components/display/StageBackground.vue` | 생성 | 배경 키 → 임시 색·그라데이션 (7절). 비네트 레이어 포함 |
| `src/components/display/ClockHud.vue` | 생성 | 게임 시계 남은 시간, 단계 남은 시간, Phase 표기 |
| `src/components/display/SeatStrip.vue` | 생성 | 좌석 3칸 요약 — 형제 이름과 **"연결 끊김"** 표기 (룰북 §17). Display 전용 |
| `src/components/display/MaskApparition.vue` | 생성 | 탈 잔상 레이어. M4는 이름 카드와 실루엣 도형 (7절) |
| `src/pages/DisplayPage.vue` | 수정 | 자리표시자 → 단계별 분기 뼈대 |
| `src/router/routes.ts` | 수정 | `/display/:roomCode`를 `DisplayLayout` 중첩 라우트로 (아키 §9.2) |
| `index.html` | 수정 | `viewport-fit=cover` — Controller 세이프에어리어와 공용 (3.1) |

### M4-3. Controller 셸

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `src/layouts/ControllerLayout.vue` | 생성 | 세이프에어리어, 상단 게이지 고정, 하단 액션바 고정, 가운데만 스크롤 (3절) |
| `src/components/controller/ErosionGauge.vue` | 생성 | **본인 잠식도만.** 30·60·100 눈금 (룰북 §4.3) |
| `src/components/controller/ActionBar.vue` | 생성 | 단계별 주 버튼 한 자리 (5절 표) |
| `src/components/controller/LockOverlay.vue` | 생성 | 일시정지·타임오버 덮개, 조작 차단 |
| `src/components/controller/DesktopNotice.vue` | 생성 | PC로 열었을 때의 안내와 QR (9절 6번) |
| `src/composables/useWakeLock.ts` | 생성 | 화면 꺼짐 방지, 복귀 시 재요청, 미지원 시 안내 문구 (3.3) |
| `src/pages/ControllerPage.vue` | 수정 | 자리표시자 → 단계별 분기 뼈대 |
| `src/router/routes.ts` | 수정 | `/play/:roomCode`를 `ControllerLayout` 중첩 라우트로 |

> `ActionBar`·`DesktopNotice`·`SeatStrip`은 아키 §9.1의 컴포넌트 목록에 없다.
> 목록에 있는 것들을 쪼갠 것이 아니라 **자리를 나눠 갖는 셸 컴포넌트**라 새로 둔다. 진행 기록에 남긴다.

### M4-4. 이벤트 본류 — 소개, 투표, 굴림, 개입 창

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `src/components/display/NarrationPanel.vue` | 생성 | 이벤트 제목·상황 문장. `eventIntro` cue로 등장 연출 |
| `src/components/display/ChoiceBoard.vue` | 생성 | 선택지 카드 — 문장, 판정 유형·속성 태그, 비공개 판정 대가. **수치는 없다** (룰북 §6.4) |
| `src/components/display/DiceArena.vue` | 생성 | 주사위, 보정, 최종값, 성공 기준, 성패. 비공개 판정은 "판정 완료"만 (룰북 §5.4) |
| `src/components/display/InterventionTrack.vue` | 생성 | 개입 창 3단계 진행 표시와 사용자 공개 (룰북 §7.2) |
| `src/components/controller/VotePanel.vue` | 생성 | 선택지 버튼, 재선택, 내 선택 강조. 변이 라벨을 함께 표기 (룰북 §6.4) |
| `src/components/controller/RollButton.vue` | 생성 | 개인·비공개는 판정자만, 협동·대립은 본인 주사위 (룰북 §5.2) |
| `src/components/controller/InterventionPanel.vue` | 생성 | 단계별 가능한 수단 1개. 부적은 선착순이라 누른 즉시 비활성 (룰북 §7.4) |
| `src/pages/DisplayPage.vue` · `ControllerPage.vue` | 수정 | 5절 표의 단계 분기 채우기 |

### M4-5. 개인 정보와 심리전

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `src/components/display/PublicNoticeFeed.vue` | 생성 | 공개 알림 — 능력·부적 사용자 이름, 익명 디버프·저주, 귓속말 발송 알림, 득표 수 (룰북 §17) |
| `src/components/controller/InventoryPanel.vue` | 생성 | 부적 개수, 보류함, 튜토리얼 부적, 옥비녀. **본인 것만** |
| `src/components/controller/AbilityButton.vue` | 생성 | 고유 능력 1회. 배신자여도 숨기거나 비활성화하지 않는다 (룰북 §3.5) |
| `src/components/controller/TrueSightSheet.vue` | 생성 | 절대 시야 결과 — 선택지별 실제 변이 (룰북 §3.4) |
| `src/components/controller/TalismanPanel.vue` | 생성 | 회복(투표 중), 14A 제출, 초과분 양도·버림 (룰북 §9.1, §13.5) |
| `src/components/controller/WhisperToast.vue` | 생성 | 받은 귓속말. 수신자 폰에만 (룰북 §16) |
| `src/components/controller/RedMessageOverlay.vue` | 생성 | 붉은 메시지 3초. **진짜와 가짜가 같은 연출**이어야 한다 (룰북 §10.1, §17) |

### M4-6. Phase 3·엔딩·비상 상황

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `src/components/display/TargetReveal.vue` | 생성 | 타겟 공개와 옥비녀 이동 (룰북 §14.1) |
| `src/components/display/EndingSequence.vue` | 생성 | 엔딩 이름과 내레이션. 1인 플레이 분기 내레이션 포함 (룰북 §14.5) |
| `src/components/display/NoiseOverlay.vue` | 생성 | 타임오버 노이즈와 조작 잠금 (룰북 §2.1) |
| `src/components/display/PauseCurtain.vue` | 생성 | 일시정지 사유 표기와 재개 안내 (아키 §8) |
| `src/pages/DisplayPage.vue` · `ControllerPage.vue` | 수정 | `P3_TARGETING` · `P3_VOTING` · `PAUSED` · `ENDING` 분기 |

### M4-7. 실기 확인과 마감

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| ~~`src/components/lobby/BotToggle.vue`~~ | ~~수정~~ | **2026-09-20 완료** — 실기 1차에서 확인을 방해해 앞당겼다 (대비와 한국어 라벨) |
| `docs/m4-notes.md` | 생성 | 계획과 달라진 결정, 확인 필요, 제안 (M3와 같은 구성) |
| `docs/roadmap.md` | 수정 | M4 체크리스트와 진행 상태 표 |
| `docs/rulebook-v3.md` · `architecture.md` | 수정 | 9절 결정이 규칙·설계를 바꿀 때만 |

- 8절의 실기 확인을 여기서 끝낸다
- 한 판을 돌린 뒤 **밸런스 재판단**을 한다. 조정한다면 룰북 §19·§21.1에 한 번에 한 값만 기록한다

---

## 2. Display 레이아웃

### 2.1 16:9 레터박스 스테이지

```
[뷰포트: 전체 검정]
  └ [스테이지: 16:9 고정, 가운데 정렬]
       width  = min(100vw, 100vh * 16 / 9)
       height = width * 9 / 16
```

- 모니터 비율이 무엇이든 스테이지는 언제나 16:9다. 방송 송출·녹화가 이 안쪽만 잡으면 된다
- 스테이지 밖(레터박스 띠)에는 **아무것도 그리지 않는다.** 디버그 표시도 넣지 않는다
- 새로고침·창 크기 변경에도 같은 그림이 나오도록 크기 계산은 CSS만으로 한다. JS 리사이즈 계산을 두지 않는다

### 2.2 컨테이너 단위 글자 크기

- 스테이지에 `container-type: size`를 걸고, **스테이지 안의 모든 크기를 `cqw`(컨테이너 너비 1%)로** 적는다
- `vw`를 쓰지 않는다. 뷰포트가 아니라 스테이지가 기준이어야 레터박스가 생겨도 비율이 유지된다
- 기준 척도 (스테이지 너비 100cqw 기준, 1920px 모니터에서 1cqw ≈ 19.2px)

| 쓰임 | 크기 |
|---|---|
| 이벤트 제목 | 3.2cqw |
| 상황 문장 | 2.0cqw |
| 선택지 문장 | 1.8cqw |
| HUD 숫자(시계) | 2.4cqw |
| 보조 표기(태그·이름) | 1.4cqw |

- 위 값은 **화면 전용 수치**라 룰북에 없다. 한 곳(`DisplayLayout`의 CSS 변수)에 모아 두고 실기 확인에서 조정한다

### 2.3 레이어 구성

아키 §9.4의 순서를 그대로 쓴다. z-index를 각 컴포넌트에 흩지 않고 레이아웃이 슬롯으로 고정한다.

| # | 레이어 | 내용 | 컴포넌트 |
|---|---|---|---|
| 0 | 배경 | 배경 키별 색·그라데이션 | `StageBackground` |
| 1 | 비네트 | 가장자리 어둠. 잠식도가 아니라 **Phase**로만 짙어진다 | `StageBackground` 내부 |
| 2 | 탈 잔상 | 이벤트 탈. M4는 이름 카드와 실루엣 | `MaskApparition` |
| 3 | HUD | 시계, Phase, 좌석 줄, 공개 알림 | `ClockHud` · `SeatStrip` · `PublicNoticeFeed` |
| 4 | 본문 | 내레이션, 선택지, 주사위, 개입 창, 타겟 | `NarrationPanel` · `ChoiceBoard` · `DiceArena` · `InterventionTrack` · `TargetReveal` |
| 5 | 덮개 | 일시정지, 타임오버 노이즈, 엔딩 | `PauseCurtain` · `NoiseOverlay` · `EndingSequence` |

- **비네트 짙기를 좌석 잠식도에 연동하지 않는다.** 평균값이라도 관전자가 역산할 수 있어 룰북 §17을 깬다

### 2.4 방송 세이프존

- 스테이지 안쪽에 여백을 두고 **HUD와 본문은 세이프존 안에만** 배치한다. 배경과 덮개는 세이프존을 무시하고 끝까지 채운다
- 캠 오버레이 자리를 한 칸 비워 둔다. 그 영역에는 글자를 놓지 않는다
- 수치와 캠 위치는 아키 §9.4에 없다 → **9절 5번**
- 개발 중에만 `?safe=1` 쿼리로 세이프존 경계선을 띄운다. 기본은 꺼짐

### 2.5 Display에는 조작이 없다

- 룰북 §1은 Display의 **게임 조작**을 금지한다. 투표·굴림·개입·능력·부적 버튼을 두지 않고 커서를 숨긴다
- **방 운영(일시정지·재개)은 예외다** (룰북 §1, §21 확정). 평소에는 숨고 마우스를 움직이면 나타나는 얇은 호스트 바를
  세이프존 밖에 둔다. 게임 조작이 아니므로 룰북 §1과 충돌하지 않는다 (9절 1번)

---

## 3. Controller 레이아웃

### 3.1 세이프에어리어

- `index.html`의 viewport에 `viewport-fit=cover`를 넣고, 레이아웃이 `env(safe-area-inset-*)`를 패딩으로 받는다
- 고정 요소마다 각자 인셋을 더한다. 상단 게이지는 위쪽 인셋, 하단 액션바는 아래쪽 인셋
- 주소창이 접혔다 펴지는 높이 변화는 `100dvh`로 받는다

### 3.2 3단 구성

```
┌───────────────────────────────────────┐
│ 상단 고정 — 잠식도 게이지, 형제 이름, 남은 시간 │
├───────────────────────────────────────┤
│                                       │
│ 가운데 — 상황·선택지·개인 정보 (여기만 스크롤)  │
│                                       │
├───────────────────────────────────────┤
│ 하단 고정 — 액션바 (단계별 주 버튼)           │
└───────────────────────────────────────┘
```

- **엄지로 닿는 하단에 주 버튼 하나.** 단계마다 버튼의 뜻이 바뀌고 자리는 바뀌지 않는다 (5절 표)
- 보조 동작(부적 회복, 절대 시야, 양도·버림)은 가운데 영역에 둔다. 실수로 누르면 안 되는 것들이다
- 가운데 영역이 비어 있는 단계에도 레이아웃 높이는 고정한다. 단계가 바뀔 때 버튼이 움직이면 오조작이 난다

### 3.3 Wake Lock

- `navigator.wakeLock`을 좌석 화면 진입 시 요청하고, 탭이 다시 보이면 재요청한다
- 실패해도 게임은 그대로 진행한다. 미지원·거부면 상단에 **"화면 자동 꺼짐을 꺼 두세요"** 한 줄만 띄운다
- 방을 떠날 때 해제한다

### 3.4 PC로 접속했을 때

- 화면 폭이 아니라 **기기 역할**(`lib/deviceRole.ts`, M3-7)과 포인터 종류로 판단한다
- 폰이 아닌 것으로 보이면 `DesktopNotice`로 "조작은 폰으로 합니다" 안내와 이 방의 QR을 띄운다
- 안내만 할지 조작까지 막을지는 룰북 §1의 해석이 갈린다 → **9절 6번**

---

## 4. play 스토어와 cue 큐 설계

### 4.1 소켓 수명 — 라우트가 아니라 방에 묶는다

M3-7의 `useRoomSocket`은 **컴포넌트 수명**에 묶여 있다. `LobbyPage`가 사라지면 소켓이 닫힌다.
그러면 게임 시작 직후 로비 → `/display` · `/play` 이동에서 **모든 기기의 소켓이 한 번씩 끊겼다 붙는다.**

- 서버는 그 끊김을 presence 액션으로 받는다. 인간 Controller가 전부 동시에 이동하면 **자동 일시정지 조건**에 걸릴 수 있다 (아키 §8)
- 재접속하면 좌석은 userId로 복귀하지만(M3 계획 10절 12번), 자동 정지 누적 시간은 이미 쌓인다

**설계:** 소켓을 스토어가 들고, `connect(roomCode, deviceRole)` · `disconnect()`를 방 진입·이탈에서만 부른다.
로비와 게임 화면은 같은 연결을 이어 쓴다. 스토어는 `play.ts` 하나로 합친다 (9절 7번 확정, 아키 §9.1).

### 4.2 스냅샷 반영

- 받은 스냅샷을 **그대로 보관하고 그대로 그린다.** 공개/비공개로 스토어를 나누지 않는다 (아키 §9.3)
- 이 기기가 알 수 없는 값은 스냅샷에 아예 없다. 화면은 부재를 "표시하지 않음"으로 처리한다
- Display는 `DisplaySnapshot`, 좌석은 `SeatSnapshot`, 좌석 없는 Controller는 `PublicSnapshot`을 받는다.
  좁히는 판정은 M3-7의 `hasSeat` · `hasSeatConnections`와 같은 방식으로 한 곳에서만 한다
- 상태 버전이 건너뛰면 `resync`를 보낸다 (M3-7 `roomSocket.ts`가 이미 한다). **cue는 다시 오지 않는다**

### 4.3 cue 큐 — 일회성 연출

**원칙: 스냅샷이 진실이고 cue는 장식이다.** cue 연출이 밀려도 스냅샷 렌더를 막지 않는다.

| 분류 | cue | 처리 |
|---|---|---|
| 덮개 | `redMessage`, `noiseLock`, `ending` | 큐에서 하나씩. 연출 동안 입력을 잠근다. `redMessage`는 3초 후 소멸 (룰북 §10.1) |
| 토스트 | `whisperReceived`, `tutorialTalismanGranted`, `interventionUsed`, `practiceExplain`, `forceSuccessExplain` | 겹치지 않게 순차 표시 |
| 장면 강조 | `eventIntro`, `phaseEntered`, `diceRolled`, `judgmentResult`, `hiddenJudgmentDone`, `talismanWindow`, `targetRevealed`, `jadeHairpinMoved`, `resolution` | 해당 패널의 애니메이션만 켠다. 놓쳐도 같은 내용이 스냅샷에 있다 |
| 개인 모달 | `trueSightResult` | Controller에서 닫을 때까지 유지 |

- **진짜 붉은 메시지와 가짜 붉은 메시지는 같은 cue(`redMessage`)로 온다.** 화면도 완전히 같아야 한다.
  종류를 나누거나 애니메이션을 달리하면 "붉은 화면 = 배신자"가 성립해 은닉이 깨진다 (룰북 §10.1, 아키 §7.2)
- 탭이 백그라운드였다 돌아오면 밀린 cue가 한꺼번에 있다. 오래된 것은 버린다 → 폐기 기준은 **9절 8번**
- cue에는 상태 버전이 실려 온다(`CueMessage.stateVersion`). 폐기 판단의 근거로 쓴다

### 4.4 남은 시간 표시

- `stepDeadlineAt`(단계 마감)과 `clockDeadlineAt`(게임 시계)은 **절대 시각**이다. 남은 시간 = 마감 − 지금
- 이것이 아키 §9.3이 허용하는 **유일한 클라이언트 계산**이다. 그 밖의 어떤 룰도 화면에서 계산하지 않는다
- 250ms마다 갱신하고 1초 단위로 표시한다. 음수는 0으로 잘라 보여준다
- `stepDeadlineAt`이 null이면 단계 타이머를 표시하지 않는다 (`RESOLUTION` 등)
- `PAUSED`에서는 카운트다운을 멈춘다. 재개하면 서버가 새 마감 시각을 실은 스냅샷을 보낸다 (아키 §8)
- 마감 시각은 서버 시각이고 폰 시계는 서버와 다를 수 있다. 스냅샷마다 오는 `serverNow`로 오프셋을 잡아 보정한다 (9절 2번).
  오프셋은 스냅샷을 받을 때마다 갱신하고, 남은 시간 = `마감 − (지금 + 오프셋)`으로 계산한다

---

## 5. 화면별 구성 요소와 단계별 표시 내용

단계는 `GAME_STEP` 전체다.

| 단계 | Display | Controller |
|---|---|---|
| `LOBBY` | M3-7 화면 유지 (좌석 보드, QR, 시작) | M3-7 화면 유지 (좌석 선택) |
| `EVENT_INTRO` | 배경 전환, 탈 등장, 이벤트 제목과 상황 문장, 30초 게이지 | 상황 문장 요약, "잠시 기다리세요". 액션바 비활성 |
| `VOTING` | 선택지 카드(문장 + 판정 유형·속성 태그 + 비공개 판정 대가), **참여 인원 수만**, 3분 게이지 | 선택지 버튼(재선택 가능), 내 선택 강조, 변이 라벨(있을 때), 절대 시야·부적 회복 |
| 투표 마감 | 득표 수 공개(`voteTally` 알림)와 채택 선택지 강조 | 채택 결과 |
| `ROLL_WAIT` | 판정자와 판정 유형·속성, 10초 게이지 | 판정자면 큰 굴림 버튼. 협동·대립은 참여자 각자 버튼. 그 외는 대기. **비공개 판정도 판정자가 직접 굴린다** (9절 14번) |
| `ROLL_REVEAL` | 주사위, 보정, 최종값, 성공 기준, 성패 (3초). 비공개는 **"판정 완료"만** | 같은 내용 축약. 비공개는 판정자에게도 결과를 보이지 않는다 |
| `INTERVENTION_REROLL` | 3단계 트랙 1칸 점등, 4초 | 둘째만 재굴림 버튼 |
| `INTERVENTION_TALISMAN` | 2칸 점등, 4초 | 부적 보유자만 버튼. 누가 먼저 누르면 즉시 비활성 |
| `INTERVENTION_FORCE` | 3칸 점등, 4초 | 첫째만 강제 성공 버튼. 대가(+15%)를 버튼에 적는다 |
| `PRACTICE_INTERVENTION` | "연습" 표기와 12초 게이지 | 세 버튼을 눌러볼 수 있고 효과는 설명 팝업 (룰북 §12) |
| `TALISMAN_WINDOW` | "봉인할 부적을 기다린다", 8초 게이지 | 부적 보유자에게 제출 버튼. 제출하면 즉시 종료 |
| `RESOLUTION` | 결과 문장과 적용 내역. **서버가 3초 머문다** (룰북 §19, 9절 3번) | 본인에게 적용된 결과. 같은 3초 |
| `PHASE2_ENTRY` | 배경 전환과 진입 환청 내레이션 | 부적 보유자는 경고 귓속말, 미보유자는 잠식 상승이 게이지에 반영 |
| `P3_TARGETING` | 타겟 좌석 공개, 옥비녀 이동 연출 (룰북 §14.1) | 같은 공개 정보. 본인이 타겟이면 강조 |
| `P3_VOTING` | A-1 · A-2 선택지, **마감 = 시계 0** | 투표 버튼. 1인 플레이에서 본인이 타겟이면 A-1이 없다 (룰북 §14.5) |
| `PAUSED` | 일시정지 사유와 재개 안내 | 전체 잠금 덮개. 조작 불가 |
| `ENDING` | 엔딩 이름과 내레이션 (룰북 §15) | 엔딩 요약. 조작 종료 |
| 타임오버 | 전 화면 노이즈(`noiseLock` cue) | 노이즈와 조작 잠금 (룰북 §2.1) |

- **`ROLL_WAIT`의 자동 굴림:** 10초가 지나면 서버가 대신 굴린다 (아키 §8). 화면은 남은 시간만 보여주고 아무것도 보내지 않는다
- **개입 창 조기 종료:** 수단이 소모되면 남은 시간을 기다리지 않고 다음 단계로 간다 (룰북 §7.2). 화면은 스냅샷을 따라가기만 한다
- **Phase 3 개입 창:** 팀 측이 졌을 때만, 팀 측 주사위에만 열린다. 첫째 강제 성공은 쓸 수 없다 (룰북 §14.2)
- **연결 끊김 좌석:** Display의 `SeatStrip`에 "연결 끊김"만 표기한다. "봇 대행"이라는 말을 화면 어디에도 쓰지 않는다 (룰북 §17)
- **본인의 봇 대행:** `SeatPrivateView.botTakeover`는 본인에게만 온다. 복귀했을 때 "자리를 비운 동안 서버가 대신했습니다" 정도만 띄운다

---

## 6. 정보 은닉이 화면에서 지켜지는지 확인하는 방법

투영은 서버에서 이미 테스트로 고정돼 있다 (M2-6, M3-2). M4에서 새로 생기는 위험은
**web이 받은 값을 엉뚱한 화면에 그리는 것**이다. 세 겹으로 막는다.

### 6.1 타입으로 막는다 (1차)

- `components/display/` 아래 컴포넌트의 props는 `DisplaySnapshot` 또는 `PublicView`만 받는다
- `SeatPrivateView`를 받는 컴포넌트는 `components/controller/` 아래에만 둔다
- Display 컴포넌트에서 `erosionPercent`·`talismanCount`·`variantLabels`·`whispers`를 쓰면 **컴파일이 깨진다**
- `DisplayPage`는 좌석 스냅샷을 아예 들고 있지 않는다. 스토어에서 Display용 파생만 읽는다

### 6.2 디렉터리 규칙 (2차)

- `components/display/`는 `SeatPrivateView` · `SeatSnapshot` · `WhisperView`를 import하지 않는다
- 위반을 자동으로 잡으려면 web에 테스트 러너가 필요하다 → **9절 10번**. 도입 전에는 코드 리뷰와 6.3으로 대신한다

### 6.3 사람 점검표 (3차, 실기 확인에 포함)

**Display 화면에 다음이 하나도 없어야 한다**

- 잠식도 숫자나 게이지 (전체·평균·개인 모두)
- 인벤토리 — 부적 개수, 옥비녀 보유
- 변이 라벨 — 흉·평·길 표기
- 귓속말 내용 (룰북 §16의 "누군가에게 속삭임이 전달되었다"만 허용)
- 비공개 판정의 주사위·성패 ("판정 완료"만)
- 투표 중 선택지별 득표 (참여 인원 수만, 마감 후에만 득표 수)
- 투표자가 누구인지
- 배신자 표시, 봇 대행 표시 ("연결 끊김"만)

**Controller 화면에 다음이 하나도 없어야 한다**

- 다른 좌석의 잠식도·인벤토리·연결 상태
- 다른 좌석이 받은 귓속말
- 셋째가 능력을 쓰지 않았는데 보이는 변이 라벨 (60% 이상의 가짜 라벨은 예외이고, 그것도 진짜와 구분되지 않아야 한다)

**두 화면 공통**

- 브라우저 개발자도구에서 Display 탭의 스냅샷 객체를 펼쳐 위 필드가 실제로 없는지 확인한다
- 빌드 산출물에서 시나리오 수치(성공 기준·보상·페널티 문자열)가 검색되지 않는지 확인한다 (아키 §2 원칙 2)
- 스냅샷을 `localStorage`·`sessionStorage`에 저장하지 않는다. 저장하면 같은 폰을 넘겨받은 사람이 읽을 수 있다

### 6.4 연출로 새는 것

- 진짜·가짜 붉은 메시지의 **연출 시간·색·글자 크기·소리가 완전히 같아야 한다** (4.3)
- 가짜 라벨과 진짜 라벨의 표기가 같아야 한다. "확실함" 같은 표시를 붙이지 않는다
- 비네트·흔들림 같은 배경 연출을 잠식도에 연동하지 않는다 (2.3)
- 배신자 좌석의 화면 구성이 일반 좌석과 완전히 같아야 한다 (룰북 §17)

---

## 7. 임시 그래픽의 범위

에셋 11종(룰북 §18)은 **M5에서 붙인다.** M4는 자리·레이어·크기만 최종과 같게 만들고 내용물을 임시로 채운다.

| 자리 | M5에서 붙일 것 | M4 임시 |
|---|---|---|
| 배경 4종 | 배경 이미지 | 배경 키마다 다른 단색 + 그라데이션 (초가 마을 흙빛 / 당산나무 숲 짙은 녹청 / 핏빛 사당 암적 / 피눈물 장승 회청) |
| 탈 5종 | 탈 이미지와 잔상 연출 | 화면 중앙의 큰 한글 이름 카드 + 단색 실루엣 도형 |
| 아이템 2종 | 아이콘 | 텍스트 배지 (`부적 ×2`, `옥비녀`) |
| 붉은 메시지 | 요괴화 탈 + 연출 | 전면 적색 덮개 + 흰 글자, 3초 |
| 타임오버 노이즈 | 노이즈 소재 | CSS 반복 그라데이션과 깜빡임 |
| 주사위 | 굴림 애니메이션 | 숫자 카운트업 후 고정 |
| 엔딩 | 엔딩별 연출 | 엔딩 이름 + 내레이션 텍스트 |

- **M5가 이미지만 갈아끼우면 되도록** 레이어 순서·세이프존·크기 비율은 M4에서 최종 형태로 만든다
- 에셋 키(`AssetKey`)는 서버가 보낸다. M4는 키 → 임시 표현 매핑만 둔다. M5가 그 매핑을 `constants/assetUrl.ts`로 바꾼다
- **이미지 파일은 이미 저장소에 있다** (`tal-brothers-web/src/assets/images/`). 그래도 M4에서 붙이지 않는 것이 계획안이다.
  프리로드가 없으면 첫 노출마다 화면이 끊기고, 용량 문제(`introMask.png` 7.7MB, M3 노트의 제안)가 게임 중에 드러난다 → **9절 11번**
- 색·글꼴 방향은 룰북에 없다 → **9절 13번**

---

## 8. 사람이 실기로 확인하는 순서

M3 계획 7.3의 사람 작업은 이미 끝났다. 준비는 M3와 같다 (서버·web 실행, 같은 Wi-Fi, PC는 Display, 폰은 Controller).

| # | 확인 | 어디서 | 비고 | 확인 방식 (2026-10-25) |
|---|---|---|---|---|
| 1 | 인간 1명 + 봇 2명으로 시작 → T1 진입. 튜토리얼 부적 지급 안내가 뜬다 | PC·폰 | 룰북 §9.2 | 자동 `fullGame` |
| 2 | T1 투표 → 굴림 → **실패면 실전 개입 창, 성공이면 연습 개입 창** | 폰 | 룰북 §12 | 자동 `fullGame` (시드) |
| 3 | T2-1은 **투표 없이 바로 협동 판정**으로 넘어간다 | PC | 선택지 1개 이벤트 | 자동 `fullGame` |
| 4 | T2-2에서 비공개 판정을 고르면 Display에 "판정 완료"만 뜨고 판정자 폰에도 결과가 없다 | PC·폰 | 룰북 §5.4 | 자동 은닉 검사 (11.4) |
| 5 | 이장 이벤트에서 귓속말이 판정자 폰에만 뜨고, Display에는 발송 알림만 뜬다 | PC·폰 | 룰북 §16 | 자동 은닉 검사 (11.4) |
| 6 | Phase 2 진입 환청 → 분기 → 랜덤 이벤트. 잠식도 게이지가 오른다 | 폰 | 룰북 §13 | 자동 `fullGame` |
| 7 | 14A가 채택되면 8초 제출 창이 열리고, 아무도 제출하지 않으면 익명 저주 알림이 뜬다 | PC·폰 | 룰북 §13.5 | 자동 `fullGame` (시드) |
| 8 | 보스(슬롯 7)에서 협동 판정 전원 굴림이 각자 버튼으로 진행된다 | 폰 | 아키 §8 | 자동 `fullGame` |
| 9 | 60% 넘긴 좌석에 가짜 라벨·가짜 붉은 메시지가 나온다. 진짜와 구분되지 않는다 | 폰 | 확률이라 여러 판 필요 | 자동 `redMessage` |
| 10 | 100% 도달 시 붉은 메시지 3초 후 UI가 그대로다 | 폰 | 룰북 §10.1 | 자동 `redMessage` |
| 11 | Phase 3 타겟 공개와 옥비녀 이동이 Display에 뜬다 | PC | 룰북 §14.1 | 자동 `fullGame` (시드) |
| 12 | 엔딩 화면이 뜨고 조작이 끝난다 | PC·폰 | 룰북 §15 | 자동 `fullGame` |
| 13 | **연결 끊김 봇 대행 (M3 이월)** — 폰을 비행기 모드로 30초 → Display에 "연결 끊김", 봇이 대신 굴린다. 복귀하면 해제된다 | 폰·PC | 아키 §8 | 자동 `emergency`(`setOffline`) + **사람**(실제 비행기 모드) |
| 14 | **일시정지 (M3 이월)** — ① PC 탭을 닫으면 폰이 잠금 화면 ② 다시 열면 재개 ③ 폰을 전부 끊으면 자동 정지 ④ 호스트 수동 정지·재개 | PC·폰 | 아키 §8 | 자동 `emergency` |
| 15 | 타임오버 — 시계가 0이 되면 노이즈로 덮이고 조작이 잠긴다 | PC·폰 | 100분을 다 쓰기 어렵다 → **9절 12번** | 자동 `emergency` (`?clock=1`) |
| 16 | 6.3의 은닉 점검표 전부 | PC·폰 | | 자동 은닉 검사 전부 |
| 17 | 아이폰·안드로이드 각 1대에서 세이프에어리어와 Wake Lock | 폰 2종 | | **사람** |
| 18 | 인간 2~3명 구성으로 한 판. 투표 다수결·동률, 부적 선착순, 심리전이 실제로 돌아가는지 | 폰 2~3대 | **완료 기준** | **사람** (자동은 흐름만 확인) |

- 13·14번은 M3에서 화면이 없어 확인하지 못한 항목이다 (`docs/m3-notes.md` 실기 확인)
- 18번이 로드맵의 완료 기준이다. 여기까지 끝나야 M4를 닫는다

---

## 9. 해석 항목과 확정 내용 (2026-09-19 전건 확정)

룰북·아키텍처에 답이 없어 임의로 정할 수 없던 항목 13건이다. **모두 확정됐고**, 규칙·설계를 바꾸는 것은
`rulebook-v3.md`·`architecture.md`에 반영했다. 아래 표의 결정 열이 구현의 근거다.

| # | 항목 | 확정된 결정 | 문서 반영 |
|---|---|---|---|
| 1 | 게임 중 Display의 호스트 조작 | **계획안대로.** 평소에는 숨고 마우스를 움직이면 나타나는 얇은 호스트 바를 세이프존 밖에 둔다. 호스트 바는 게임 조작이 아니라 **방 운영**이라 룰북 §1과 충돌하지 않는다 | 룰북 §1 (방 운영 예외), §21 (확정) / 아키 §7.1 |
| 2 | 서버 시각과 폰 시계의 차이 | **계획안대로.** `SnapshotMessage`에 `serverNow`를 더해 클라이언트가 오프셋을 잡는다 | 아키 §7.2 |
| 3 | `RESOLUTION` 체류 시간 | **수정.** Display만 겹쳐 보여주는 대신 **서버에 3초 체류를 설정값으로 둔다.** Display만 처리하면 Controller는 결과를 보지 못하고, cue가 유실되면 아예 표시되지 않는다. 서버 단계로 두면 모든 기기가 같은 시점에 결과를 본다. 이벤트 13개 기준 시계 소모는 39초라 밸런스에 영향이 없다 | 룰북 §19 (결과 표시 3초), §21 (확정) / 아키 §5.3 |
| 4 | 투영에 없어 그릴 수 없는 값 3가지 | **① 게임 중 좌석 표시 이름: 승인.** ② **진행 위치: 범위 축소** — 현재 Phase와 진행 번호만 노출하고 **총 이벤트 개수는 노출하지 않는다.** 남은 개수를 알면 부적 사용 시점이 계산 문제가 되어, 시계만 압박 지표로 남긴다는 설계 의도와 어긋난다. **③ 엔딩의 배신자 승패와 정체: 승인** — 엔딩 화면에서 공개한다 | 룰북 §15, §17, §21 (확정) / 아키 §7.3 |
| 5 | 방송 세이프존 수치와 캠 자리 | **계획안대로.** 스테이지 안쪽 상하좌우 4%, 캠 자리는 오른쪽 아래 24%×24%를 비워 둔다 | 화면 전용 수치 — `DisplayLayout` CSS 변수 |
| 6 | PC로 `/play`를 열었을 때 | **계획안대로.** 안내를 띄우되 막지는 않는다 | — |
| 7 | 스토어 구성과 소켓 수명 | **승인.** `play.ts` 하나로 합쳐 방 세션을 갖고, 로비 화면은 그 파생만 읽는다 | 아키 §9.1, §9.2 |
| 8 | 밀린 cue의 폐기 기준 | **계획안대로.** 현재 스냅샷 버전보다 2 이상 오래된 cue는 버린다. 덮개 cue는 최신 1건만 연출한다 | — |
| 9 | 화면 전용 시간값 | **계획안대로.** 토스트 4초, 카운트업 0.6초로 시작하고 실기 확인에서 조정한다. 룰북에 있는 값(붉은 메시지 3초, 판정 연출 3초, 개입 4초, **결과 표시 3초**)은 건드리지 않는다 | 결과 카드 3초는 3번 결정으로 **룰북 §19** 값이 됐다 |
| 10 | web 자동 테스트 도입 | **계획안대로.** M4에서는 넣지 않는다. 화면이 굳는 M5에서 다시 판단한다 | — |
| 11 | M4에서 에셋 이미지를 붙일지 | **계획안대로.** 붙이지 않는다 (7절) | — |
| 12 | 짧은 판을 돌리기 위한 개발용 설정 | **승인 + 보강.** 방 생성 시에만 먹는 개발용 시계 단축 옵션을 서버에 둔다. **개발 환경에서만 동작하고, 운영 환경에서는 옵션이 들어와도 무시한다** | 아키 §8 |
| 13 | 임시 그래픽의 색 방향 | **계획안대로.** Tailwind neutral 계열 어두운 바탕에 적색 하나만 강조로 쓴다. 강조 적색은 붉은 메시지와 혼동되지 않게 채도를 낮춘다 | — |
| 14 | 비공개 판정의 판정자 (M4-4에서 발견, 2026-09-20 확정) | **`PublicView`에 `rollerSeat`을 더한다.** 판정자는 채택된 선택지의 속성 태그로 이미 공개된 정보라(룰북 §3.1, §6.4) 새로 새는 것이 없다. 비공개 판정은 잠식도 +10%를 내고 진실·거짓을 모르는 정보를 받는 장면이라 **판정자가 직접 굴려야 긴장이 산다.** 서버가 10초 뒤 대신 굴리면 그 장면이 사라진다. 은닉 테스트로 "판정자는 공개, 주사위·기준·성패는 비공개"를 고정한다 | 아키 §7.3 |

### 9.1 3번 결정이 바꾸는 것

`RESOLUTION`을 서버 단계로 두면 시뮬레이션 소요 시간의 기대값이 이벤트당 3초씩 늘어난다.

- `GAME_CONFIG.resolutionSeconds = 3` (룰북 §19)
- `resolutionStep`은 효과를 적용한 뒤 마감 시각을 걸고, **타이머 만료에서** 다음 이벤트·Phase로 넘어간다
- **효과 적용 직후 게임이 끝나는 경우는 체류하지 않는다** — 타임오버, 인간 전원 배신자, Phase 3의 엔딩 결정.
  엔딩 화면이 곧 결과 화면이라 같은 내용을 두 번 기다리게 된다 (아키 §5.3)
- 영향을 받는 서버 테스트와 시뮬 출력 기대값을 함께 갱신한다

---

## 10. 진행 순서와 확인 방법

1. ~~**9절의 항목 확인.**~~ **2026-09-19에 13건 모두 확정됐다** (9절 표의 결정 열)
2. ~~결정 내용을 이 문서와 `architecture.md`·`rulebook-v3.md`에 반영한다~~ 완료
3. **M4-1** → `typecheck -w tal-brothers-web`, 자리표시자에 단계와 남은 시간이 뜨는지
4. **M4-2** → PC에서 16:9 스테이지와 HUD. 창 크기를 바꿔도 비율이 유지되는지
5. **M4-3** → 폰에서 세이프에어리어와 액션바. Wake Lock이 걸리는지
6. **M4-4** → 봇 2명과 T1~이장을 끝까지 (8절 1~5번)
7. **M4-5** → Phase 2를 끝까지 (8절 6~10번)
8. **M4-6** → Phase 3와 엔딩, 일시정지·타임오버 (8절 11~15번)
9. **M4-7** → 8절 16~18번, 은닉 점검표, 로비 버튼 대비 수정, 밸런스 재판단
10. 마지막에 `docs/roadmap.md`의 M4 체크리스트와 진행 상태 표를 갱신하고, 계획과 달라진 결정은 `docs/m4-notes.md`에 남긴다
11. 작업 단위마다 `M4-N: 요약` 형식으로 커밋한다. push는 하지 않는다

각 작업 단위가 끝날 때마다 변경 파일 목록, 타입 체크·빌드 결과 요약, 로드맵 갱신 내용을 보고한다.

> 2026-10-25부터는 11절이 진행 순서를 대신한다. 사람에게 단위마다 보고하지 않고 마지막에 한 번 보고한다 (11.8).

---

## 11. 무인 진행과 통합 테스트 장치 (2026-10-25 승인)

M4-4까지 끝난 시점에서 남은 M4와 M5 일부(에셋·프리로드·연출·배포 빌드)를 **사람의 중간 확인 없이** 진행하기로 했다.
M5 부분은 `docs/m5-plan.md`에 있다. 이 절은 M4 부분과 두 마일스톤이 함께 쓰는 장치·원칙을 적는다.

### 11.1 착수 전 확정 (2026-10-25)

| # | 항목 | 결정 |
|---|---|---|
| 1 | Google 로그인 우회 | **테스트 전용 진입점.** 서버는 `tal-brothers-server/e2e/`의 별도 진입점이 가짜 검증기를 주입한다. web은 `vite.e2e.config.ts`가 `@/services/supabase` 하나만 가짜 모듈로 바꾼다. `src/`, `vite.config.ts`, 서버 `src/index.ts`에는 우회 경로를 두지 않는다. 운영 빌드에 가짜가 없음을 산출물 검색으로 확인한다 |
| 2 | 엔딩 내레이션·에셋 | **`EndingView`에 `narration`·`assets`를 더한다.** 지금은 Display용 `ending` cue로만 와서 새로고침·cue 유실 시 사라진다. 엔딩은 공개 정보라 은닉에 영향이 없다 |
| 3 | shadcn 다크 토큰 (m4-notes 제안) | **`<html class="dark">`를 적용한다.** 시점은 통합 테스트 장치 직후, M4-5 착수 전(M4-C). 새로 만드는 화면을 최종 토큰 기준으로 만들고 스크린샷 검증도 그 기준으로 하기 위해서다. 적용 직후 기존 화면 전체를 스크린샷으로 회귀 확인한다 |
| 4 | M5 범위 | 에셋·프리로드·연출 + **배포 빌드 설정**까지. 세이브/불러오기, 호스팅·실제 배포, OAuth 프로덕션 게시는 후속 |

**함께 확정한 기본값** (룰북에 없어 보수적으로 정한 것)

| # | 항목 | 기본값 | 이유 |
|---|---|---|---|
| a | 소리 | 넣지 않는다 | 사운드 에셋이 없다. 넣으면 진짜·가짜 붉은 메시지의 소리까지 같아야 한다 (6.4) |
| b | 진동 | 쓰지 않는다 | 룰에 없고, 진동 소리는 옆 사람에게 들려 정보가 새는 새 경로가 된다 (룰북 §20) |
| c | 프리로드와 게임 시작 | 시작을 막지 않는다. Display 로비에 준비 상태만 | 시작 조건은 룰북 §1에 있다 |
| d | 엔딩 이후 | Display는 엔딩 화면에 머문다. Controller는 엔딩 요약과 "메뉴로" | 엔딩 연출은 시계 밖 최대 20분 (룰북 §15) |
| e | Controller의 노이즈 | 스냅샷이 `ENDING`이고 엔딩이 강제 잠식이면 노이즈를 덮는다 | `noiseLock` cue는 Display에만 간다. 룰북 §2.1은 "모든 화면"이다 |
| f | 호스트 정지 버튼 | `EVENT_INTRO`에서만 누를 수 있고 그 밖에서는 비활성 + 안내 | 서버 `canHostPause`와 맞춘다 |
| g | 화면 전용 연출 시간 | `constants/motionTiming.ts` 한 곳. 룰북 §19 값 안에서만 | 9절 9번과 같은 방식 |
| h | 밸런스 재판단 | 하지 않고 사람 몫으로 넘긴다 | 로드맵이 "사람이 실제로 한 판 돌린 뒤"라고 적었다 |

### 11.2 진행 순서

| 순서 | 단위 | 커밋 |
|---|---|---|
| 0 | 문서 (이 절, `m5-plan.md`) | `문서: ...` |
| 1~3 | M4-A → M4-B → M4-C | `M4-A: ...` 등 |
| 4~5 | M4-5a → M4-5b | `M4-5: ...` |
| 6~7 | M4-6a → M4-6b | `M4-6: ...` |
| 8 | M4-7 | `M4-7: ...` |
| 9~14 | M5-1 ~ M5-6 (`docs/m5-plan.md`) | `M5-N: ...` |

- 브랜치는 `feature/gen-animation`. push하지 않는다. 커밋 메시지에 attribution 줄을 붙이지 않는다

### 11.3 단위별 파일

**M4-A. 통합 테스트 기반**

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `tal-brothers-server/e2e/e2eServer.ts` | 생성 | `src/index.ts`와 같은 조립. 다른 점은 가짜 검증기, `repository: null`, 가속 스케줄러, 시드 난수(`E2E_SEED`). `NODE_ENV=production`이면 시작을 거부한다 |
| `tal-brothers-server/e2e/fakeAuthVerifier.ts` | 생성 | 토큰 `e2e.<userId>.<base64url 이름>`을 `AuthUser`로 바꾼다. 그 밖은 `null` |
| `tal-brothers-server/e2e/acceleratedScheduler.ts` | 생성 | `now() = 시작 시각 + 실제 경과 × 배율`, `at()`은 실제 지연 ÷ 배율. 배율은 `E2E_TIME_RATE`(기본 4). **엔진은 그대로이고 주입한 시각만 빨라진다** |
| 서버 `package.json` · `tsconfig.json` | 수정 | `e2e:serve` 스크립트, 타입 체크에 `e2e/` 포함 |
| `tal-brothers-web/e2e/fakes/supabase.ts` | 생성 | `services/supabase.ts`와 같은 export. 세션은 Playwright가 `localStorage`에 넣은 사용자로 만든다. 식별 문자열 `E2E_FAKE_SUPABASE` |
| `tal-brothers-web/vite.e2e.config.ts` · `.env.e2e` · `tsconfig.e2e.json` · `playwright.config.ts` | 생성 | 별칭 하나만 덧씌운 설정, 가짜 환경 변수(비밀 아님), e2e 타입 체크, 서버 3100·web 5174 |
| `tal-brothers-web/e2e/support/harness.ts` · `lobbyFlow.ts`, `e2e/smoke.spec.ts` | 생성 | 컨텍스트(Display 1920×1080, Controller 모바일 에뮬레이션), 화면 조작만으로 로비 진행 |
| web 레이아웃·컴포넌트 | 수정 | `data-step`·`data-event`·`data-seat`, `data-testid` (11.4) |
| 루트·web `package.json`, `.gitignore`, `CLAUDE.md` | 수정 | `test:e2e`, 결과물 폴더 무시, 명령 표 한 줄 |

**M4-B. 플레이 드라이버·기록기·은닉 검사기** — `e2e/support/playerPolicy.ts`(화면 버튼만 눌러 진행, 정책 `first`·`seeded`·`risky`·`useAll`),
`recorder.ts`(단계가 바뀔 때마다 모든 기기 스크린샷, ws 프레임 기록), `hidingChecks.ts`, `coverage.ts`, `e2e/fullGame.spec.ts`,
`e2e/staticRules.spec.ts`(display 컴포넌트의 import 규칙 6.2, 운영 빌드에 서버 전용 문자열·가짜 모듈이 없음)

**M4-C. 다크 토큰** — `index.html`, 대비가 무너진 곳의 클래스, `e2e/regression.spec.ts`(전 화면 스크린샷 + 버튼 대비비 ≥ 4.5)

**M4-5a. 개인 정보** — `InventoryPanel`, `AbilityButton`(절대 시야), `TrueSightSheet`, `TalismanPanel`(회복·14A 제출·양도·버림),
`DisplayPage`·`ControllerPage`의 `PHASE2_ENTRY`·`TALISMAN_WINDOW` 분기

**M4-5b. 심리전** — `WhisperList`(본인 `whispers`, 새 귓속말 알림은 기존 `CueToast`), `RedMessageOverlay`(입력은 cue 하나뿐, 스냅샷 값을 읽지 않는다),
`PublicNoticeFeed`(DisplayPage의 임시 목록 대체), `e2e/redMessage.spec.ts`

**M4-6a. Phase 3·엔딩·노이즈** — shared `EndingView.narration`·`assets`, `projectDisplay`(엔딩 내레이션 선택을 `endingStep`과 한 함수로),
shape·은닉 테스트, `TargetReveal`, `EndingSequence`, `NoiseOverlay`, `EndingSummary`, 두 페이지의 `P3_TARGETING`·`P3_VOTING`·`ENDING` 분기

**M4-6b. 비상 상황** — `HostBar`(2.5), `PauseCurtain`, `LockOverlay` 사유별 문구, `TakeoverNotice`, `e2e/emergency.spec.ts`
(① Controller 오프라인 → "연결 끊김"·봇 굴림 → 복귀 ② Display 닫기 → 잠금 → 재개 ③ Controller 전부 오프라인 → 자동 정지 ④ 호스트 정지·재개 ⑤ "봇 대행" 문구 없음)

**M4-7. 마감** — `e2e/layout.spec.ts`(Display 3개 해상도에서 16:9·세이프존·캠 자리·레터박스, Controller 3개 폭에서 가로 스크롤 없음·액션바 위치 고정),
커버리지(`GAME_STEP` 전 값, 둘째 재굴림, 부적 선착순), 8절 자동/사람 구분 기록, 아키 §9.1·§11 갱신.
로드맵 M4 상태는 **"자동 확인 완료 · 사람 실기 대기"**로 둔다 — 완료 기준이 사람의 한 판이다

### 11.4 통합 테스트 장치

```
Playwright (Chromium 1개, 컨텍스트 2~4개 — 저장소가 컨텍스트마다 분리된다)
 ├ Display 컨텍스트 1920×1080 ── /menu → /lobby → /display
 └ Controller 컨텍스트 ×1~3 (모바일 에뮬레이션) ── /join → /lobby → /play
          │ http://localhost:5174  (vite.e2e.config.ts, @/services/supabase → 가짜)
          ▼
 e2eServer.ts :3100 ── createHttpApp + attachWsServer
   (가짜 AuthVerifier, repository null, 가속 스케줄러 ×4, 시드 난수)
```

- **가속 시계:** 스케줄러만 빨라지므로 단계 시간·봇 대행 30초·자동 정지 한도가 모두 같은 비율로 줄어든다. 클라이언트 카운트다운은 실제 시간으로
  흐르므로 스크린샷의 남은 시간 숫자는 실제와 다르다(표시만의 문제). 게임 시계 단축은 기존 `/menu?clock=<분>`을 타임오버 시나리오에만 쓴다
- **시드:** 같은 시드라도 입력 시점에 따라 전개가 달라질 수 있어, 커버리지는 여러 시드를 돌려 모은다
- **결과물:** `tal-brothers-web/e2e-artifacts/` — 스크린샷, ws 프레임, 요약, 커버리지. git에 넣지 않는다
- **화면 확인:** 자동 검사가 통과해도 단위마다 대표 스크린샷을 직접 열어 겹침·잘림·대비·빈 화면을 본다

**`data-testid`**

| 범주 | 값 |
|---|---|
| 공통 | 레이아웃 루트의 `data-step`·`data-event`·`data-seat` |
| 비공개 (Display에 있으면 위반) | `erosion-gauge`, `inventory`, `variant-label`, `true-sight`, `whisper`, `red-message`, `talisman-panel` |
| 조작 | `vote-choice`, `roll-button`, `intervention-*`, `ability-true-sight`, `talisman-heal`, `talisman-submit`, `talisman-transfer`, `talisman-discard`, `host-pause`, `host-resume` |

**은닉 검사 (단계마다, 6.3을 자동화한 것)**

| 대상 | 검사 |
|---|---|
| Display DOM | 비공개 testid 0개. 보이는 글자에 `%`가 없다 — **예외는 비공개 판정 대가 `잠식도 10% 상승`뿐** (룰북 §5.4). Controller가 받은 귓속말 문장이 없다. "봇 대행"이 없다. `ENDING` 전에는 배신자 정체 표기가 없다 |
| Display ws 프레임 | 스냅샷 키(중첩 전부)에 `erosionPercent`·`talismanCount`·`talismanOverflow`·`tutorialTalismanCount`·`hasJadeHairpin`·`whispers`·`variantLabels`·`myVote`·`botTakeover`·`isTraitor`·`userId`가 없다. `whisperReceived`·`redMessage`·`trueSightResult` cue가 오지 않는다. 비공개 판정의 `judgment`에 주사위·기준·성패가 없다 |
| Controller | 다른 좌석이 받은 귓속말 문장이 없다. 다른 좌석의 "연결 끊김"이 없다 |
| 배신자 좌석 | 같은 단계의 배신자 Controller와 일반 Controller의 testid 집합이 같다 (룰북 §17) |
| 저장소 | `localStorage`·`sessionStorage` 키가 허용 목록(`tal:deviceRole:*`, `tal:e2e:*`, 로그인 복귀용)뿐 |

**붉은 메시지 동일성** — 화면은 진짜·가짜를 모르므로 판이 끝난 뒤 가른다. `EndingView.traitorSeats`의 좌석이 받은 **마지막** 붉은 메시지가 진짜,
그 밖은 전부 가짜다(100% 좌석은 가짜 대상에서 빠진다, 룰북 §4.3). 덮개의 정규화 `outerHTML`, 하위 요소의 계산 스타일, 요소 스크린샷,
표시 시간이 **넷 다 같아야** 한다.

### 11.5 단위가 끝났다고 보는 공통 관문

1. shared·server·web 타입 체크와 `typecheck:e2e`
2. 서버 테스트 전체 (줄지 않는다)
3. web 운영 빌드 + `staticRules.spec`
4. 그 단위의 e2e 스펙 + 회귀용 `fullGame`(인간 1명)
5. 단위의 끝나는 조건 (1절 표)
6. 대표 스크린샷 직접 확인
7. 로드맵 체크리스트, 계획과 달라진 것은 `m4-notes.md`

e2e가 한 번 실패하고 재실행에서 통과하면 불안정으로 보고 장치 쪽 원인을 고친 뒤 넘어간다. **같은 관문에서 세 번 고쳐도 통과하지 못하면 거기서 멈추고**
notes에 "중단 — 원인·시도·남은 일"을 적는다. 뒤 단위가 앞 단위에 기대므로 건너뛰지 않는다.

### 11.6 무인 진행 중 결정 원칙

1. 룰북에 없는 결정은 **가장 보수적인 해석**(정보를 덜 보여주는 쪽, 새 수치·문구를 만들지 않는 쪽, 서버를 바꾸지 않는 쪽)으로 진행하고 notes "확인 필요"에 남긴다
2. **룰 변경과 은닉 원칙을 바꾸는 결정은 하지 않는다.** 필요하면 그 기능을 빼거나 표시하지 않고 기록한다
3. 서버·shared 변경은 **e2e 진입점(신규 파일), `EndingView.narration`·`assets`, 서버 배포 빌드 설정**만 한다.
   예외는 룰북·아키텍처와 어긋나는 서버 버그뿐이고, 회귀 테스트와 함께 notes 변경 이력에 남긴다
4. 시나리오·엔딩 문장을 새로 쓰지 않는다. 화면 안내 문구는 기능 설명 수준만
5. 추가 의존성은 `@playwright/test`(+ Chromium), `sharp`, `esbuild`뿐
6. `components/ui/`는 건드리지 않는다
7. 문서끼리 어긋나면 룰북 > 아키텍처 > 코드 순으로 따르고 notes에 적는다. 룰북은 고치지 않는다

### 11.7 사람이 마지막에 확인할 항목

| # | 항목 | 자동화로 안 되는 이유 |
|---|---|---|
| 1 | 실제 Google 로그인 — PC·폰, 복귀, Supabase Site URL | 자동화는 가짜 인증으로 우회했다 |
| 2 | 인앱 브라우저 안내와 외부 브라우저 열기 | 실제 앱 필요 |
| 3 | 폰 카메라로 QR 스캔, 같은 Wi-Fi 내부 IP 접속 | 자동화는 localhost |
| 4 | 아이폰 Safari·안드로이드 Chrome의 세이프에어리어, 주소창, 터치 (8절 17번) | 에뮬레이션은 Chromium 하나 |
| 5 | Wake Lock 실제 동작 | 헤드리스에서는 항상 실패한다 |
| 6 | 비행기 모드·Wi-Fi 끊김으로 한 연결 끊김과 복귀 | 자동화는 `setOffline` 흉내 |
| 7 | 실제 시간(배율 1)의 체감 — 30초 소개, 3분 투표, 4초 개입 창, 카운트다운 숫자 | 자동화는 4배속 |
| 8 | 방송 화면 — OBS 캡처, 캠 오버레이, 실제 모니터에서 글자 크기 | 시각 판단 |
| 9 | 연출의 분위기, 붉은 메시지의 느낌, 에셋 색감 | 재미·미감 |
| 10 | 인간 2~3명 실제 심리전 한 판 (8절 18번, **M4 완료 기준**) | 재미와 사람의 판단 |
| 11 | 밸런스 재판단 (11.1 h) | 사람이 한 판 돌린 뒤 판단 |
| 12 | 저사양 폰의 연출 성능 | 실제 기기 |
| 13 | 다크 토큰 적용 후 전체 인상 | 대비는 자동, 미감은 사람 |

### 11.8 마지막 보고

단위별 변경 파일과 커밋, 타입 체크·테스트·빌드·e2e 결과, 커버리지 표, 대표 스크린샷 경로, notes "확인 필요" 항목, 11.7 목록, 중단했다면 그 지점과 원인.
