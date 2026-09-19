# 시스템 아키텍처

> 게임 규칙은 `docs/rulebook-v3.md`가 원본입니다. 이 문서는 그 규칙을 어떻게 구현하는지를 정의합니다.

---

## 1. 전체 구성

```
[Display: 호스트 PC]  ──┐
[Controller: 폰 ×1~3] ──┼── ws ──  [tal-brothers-server]  ── service role ──  [Supabase DB]
[로비·메뉴 (REST)]    ──┘            (게임 상태의 유일한 원본)
          └─────────────── Supabase Auth (Google) ───────────────┘
```

| 역할 | 기기 | 하는 일 |
|---|---|---|
| Display | 호스트 PC (화면 공유) | 방 생성, 로비 QR 표시, 공용 화면 중계. 게임 조작 없음 |
| Controller | 각 플레이어 폰 | 투표, 굴림, 개입, 아이템, 개인 정보 확인 |

- 호스트는 같은 Google 계정으로 Display(PC)와 Controller(폰)에 **동시 접속**한다
- 좌석은 `계정 + 기기 역할(Controller)` 조합으로 연결한다

---

## 2. 설계 원칙

| # | 원칙 | 이유 |
|---|---|---|
| 1 | 룰 엔진을 순수 모듈로 분리 | 복잡한 규칙의 단위 테스트, 봇 자동 대전 시뮬레이션, 세이브(상태 JSON 저장) |
| 2 | 시나리오 수치는 서버 전용 | 프론트 번들에 들어가면 개발자도구로 수치 비공개 원칙이 깨짐 |
| 3 | 화이트리스트 투영 | 필드를 null로 지우는 방식은 필드 추가 시 누락으로 유출됨 |
| 4 | 가짜 정보는 발생 시 확정해 상태에 저장 | 전송마다 새로 굴리면 재접속·재동기화 때 값이 바뀌어 가짜가 들킴 |
| 5 | 스냅샷 + cue | 이벤트별 응답 메시지는 누락 하나로 화면이 어긋남. 방당 소켓 최대 4개, 상태가 작아 전체 전송 부담 없음 |
| 6 | 모든 시간은 단계 마감 시각 | 일시정지·세이브·재접속 시 남은 시간 변환이 단순해짐 |
| 7 | 방당 액션 직렬 큐 | 부적 선착순 등 동시성 문제를 락 없이 해결 |

---

## 3. 패키지 역할

| 패키지 | 들어가는 것 | 들어가면 안 되는 것 |
|---|---|---|
| `tal-brothers-shared` | 공용 상수(역할, 속성, 단계, 명령 종류, 에셋 키, 알림·귓속말 종류), 프로토콜 타입, 투영 타입 | 시나리오 데이터, 성공 기준·보상·페널티 수치, 룰 계산 로직 |
| `tal-brothers-server` | 룰 엔진, 시나리오 데이터, 런타임, 통신, 인증, 저장 | 화면 로직 |
| `tal-brothers-web` | 화면, 라우팅, 스냅샷 렌더링, 명령 전송 | 룰 계산 (예외: 마감 시각으로 남은 시간 표시) |

- shared는 빌드 없이 `src/index.ts`를 직접 export한다. Vite(web)와 tsx(server)가 TS 소스를 처리한다
- 배포용 서버 빌드에서 shared를 번들에 포함하는 설정은 M5에서 추가한다

---

## 4. 서버 구조

```
tal-brothers-server/
├─ src/
│  ├─ index.ts                     # Express + ws 부트스트랩
│  ├─ config/
│  │  └─ serverEnv.ts              # SERVER_ENV
│  │
│  ├─ engine/                      # 순수 룰 엔진 (I/O 없음)
│  │  ├─ engineTypes.ts            # 액션, 처리 결과, 거절 타입
│  │  ├─ random.ts                 # 난수 인터페이스 (운영: crypto, 테스트·시뮬: 시드 고정)
│  │  ├─ dispatch.ts               # 액션 진입점: 현재 단계의 처리기로 분기
│  │  ├─ state/                    # 상태 타입, 새 게임 생성, 세이브 복원 검증
│  │  ├─ steps/                    # 단계별 처리기
│  │  │  ├─ lobbyStep.ts
│  │  │  ├─ eventIntroStep.ts
│  │  │  ├─ votingStep.ts
│  │  │  ├─ rollStep.ts            # 굴림 대기 → 굴림 → 연출
│  │  │  ├─ interventionStep.ts    # 둘째 → 부적 → 첫째, 스킵 규칙
│  │  │  ├─ talismanWindowStep.ts  # 14A 8초 제출 창
│  │  │  ├─ resolutionStep.ts      # 효과 적용, 환경 잠식
│  │  │  ├─ phase3Step.ts          # 타겟 지정 → 판정 순서 0~4
│  │  │  └─ endingStep.ts
│  │  ├─ rules/                    # 단계에서 호출하는 순수 규칙
│  │  │  ├─ erosion.ts             # 증감, 티어, 100% 전환, 회복 제외
│  │  │  ├─ modifiers.ts           # 직업 보정, 버프/디버프 하한
│  │  │  ├─ variant.ts             # 흉/평/길 결정·적용, 가짜 라벨
│  │  │  ├─ effects.ts             # 효과 적용, 강제 성공 시 보상 제거·부작용 유지
│  │  │  ├─ whisper.ts             # 귓속말 종류별 생성
│  │  │  ├─ traitor.ts
│  │  │  └─ target.ts              # Phase 3 타겟 우선순위, 옥비녀 이동
│  │  ├─ bots/
│  │  │  └─ botPolicy.ts           # 굴림, 부적 자동 사용, 능력, 100% 방해
│  │  └─ projection/
│  │     ├─ projectDisplay.ts
│  │     └─ projectSeat.ts         # 배신자·셋째·가짜 라벨 분기
│  │
│  ├─ scenario/                    # 룰북 v3 데이터 (서버 전용)
│  │  ├─ constants/                # 효과 분류·대상·종류 (파일명 ↔ export명 1:1)
│  │  ├─ scenarioTypes.ts
│  │  ├─ gameConfig.ts             # GAME_CONFIG (룰북 §19 + 운영 규칙 설정값)
│  │  ├─ phase1Events.ts           # PHASE1_EVENTS
│  │  ├─ phase2Events.ts           # PHASE2_EVENTS
│  │  ├─ phase3Scene.ts            # PHASE3_SCENE
│  │  └─ endings.ts                # ENDINGS
│  │
│  ├─ room/                        # 엔진을 실제 시간·소켓에 연결
│  │  ├─ roomRuntime.ts            # 방당 액션 직렬 큐, 타이머 예약, 스냅샷 전송
│  │  ├─ roomRegistry.ts           # 메모리 내 방 목록
│  │  └─ seatBinding.ts            # 유저 ↔ 좌석, 연결 끊김 → 봇 대행
│  │
│  ├─ transport/
│  │  ├─ ws/
│  │  │  ├─ wsServer.ts
│  │  │  └─ wsSession.ts           # 인증 핸드셰이크, 명령 검증, 재접속
│  │  └─ http/
│  │     ├─ roomsRouter.ts         # 방 생성·참가
│  │     └─ savesRouter.ts         # 세이브 목록·불러오기
│  │
│  ├─ infra/
│  │  ├─ supabaseAdmin.ts
│  │  ├─ authVerifier.ts           # Supabase JWT 검증
│  │  └─ saveRepository.ts
│  │
│  └─ sim/                         # 콘솔 시뮬레이션 (M1: Phase 1, M2: 봇 대전)
└─ test/
   ├─ engine/
   └─ support/                     # 테스트 공용 드라이버 (가상 시계·액션 큐)
```

---

## 5. 룰 엔진

### 5.1 인터페이스

```
dispatch(state, action, context) → 처리 결과 | 거절
context = { now, rng }
처리 결과 = { state, cues, logs, nextDeadline }
```

- **액션은 세 종류뿐이다**
  - 플레이어 명령: 좌석(또는 Display)과 명령 내용
  - 타이머 만료: `(단계, 상태 버전)`을 담는다. 현재 단계·버전과 다르면 무시한다
  - 연결 변화(presence): 대상(좌석 또는 Display)과 연결 상태. 런타임이 소켓 open/close를 이 액션으로 바꿔 큐에 넣는다. 연결 상태가 상태 안에 남아 세이브·재현·테스트가 명령·타이머와 같은 방식이 된다
- **봇 입력은 별도 액션을 만들지 않는다.** 봇이 행동해야 하는 단계에 진입하는 즉시 엔진 내부에서 처리한다
- **상태는 액션마다 복제 후 수정한다.** 거절 시 원본이 오염되지 않게 한다
- 액션이 적용될 때마다 상태 버전 번호를 1 올린다
- 엔진 안에서 `Date.now()`, `Math.random()`을 호출하지 않는다

### 5.2 상태 모델

| 영역 | 내용 |
|---|---|
| 메타 | 방 코드, 엔진 버전, 시나리오 버전, 상태 버전 번호 |
| 게임 시계 | 마감 시각, 또는 일시정지 시 남은 시간 |
| 진행 위치 | Phase, 이벤트 순서표(Phase 2 슬롯 배치 포함), 현재 단계, 단계 마감 시각 |
| 좌석 ×3 | 형제 역할, 인간/봇, 유저 ID, 연결 상태·끊긴 시각, 봇 대행 여부, 잠식도, 인벤토리, 능력 사용 여부, 배신자 여부, 봇 방해 사용 여부, 받은 귓속말 |
| 현재 이벤트 | 이벤트 ID, 선택지별 실제 변이, 좌석별 가짜 라벨, 셋째 절대 시야 사용 여부, 투표(좌석별 선택), 채택 선택지, 판정자 |
| 현재 판정 | 판정 유형, 주사위 목록(주인 포함), 적용 보정, 성공 기준, 결과, 개입 적용 내역, 강제 성공 여부 |
| 팀 플래그 | 대기 중인 버프/디버프 |
| 공개 알림 | Display용 최근 알림 (능력 사용, 부적 사용, 익명 디버프, 익명 저주, 귓속말 발송 알림) |
| Phase 3 | 타겟, 옥비녀 이동 내역, 루트 |
| 일시정지 | 자동 일시정지 누적 시간 |
| 엔딩 | 엔딩 ID, 배신자 승패 |

### 5.3 단계 흐름

```
LOBBY
 → EVENT_INTRO (30초)
 → VOTING (3분, 조기 마감 가능)
 → ROLL_WAIT (판정자 버튼, 10초 후 자동 굴림)
 → ROLL_REVEAL (연출)
 → INTERVENTION_REROLL → INTERVENTION_TALISMAN → INTERVENTION_FORCE    ※ 공개 판정 실패 시에만
 → RESOLUTION (3초)
 → 다음 이벤트 | 다음 Phase

14A:      VOTING → TALISMAN_WINDOW (8초) → RESOLUTION
Phase 3:  P3_TARGETING → (B-1 즉시 판정 | P3_VOTING → 판정) → ENDING
공통:     PAUSED, ENDING
```

- T1·T2 성공 시 개입 창 대신 **연습 개입 창**(`PRACTICE_INTERVENTION`, 단일 단계 12초) 단계를 거친다 (룰북 §12)
- 선택지가 1개인 이벤트(T2-1)는 `VOTING`을 생략하고 `EVENT_INTRO` → `ROLL_WAIT`로 진행한다 (룰북 §12)
- `ROLL_REVEAL`은 3초 [설정값] 뒤 다음 단계로 넘어간다
- `RESOLUTION`은 효과를 적용한 뒤 **3초 [설정값] 머물렀다가** 다음 이벤트·Phase로 넘어간다 (룰북 §19).
  체류를 서버 단계로 두어야 Display와 모든 Controller가 같은 시점에 결과를 본다. Display만 연출로 겹쳐 보여주면
  Controller는 결과를 못 보고, 연출 신호(cue)가 유실되면 아무 데도 뜨지 않는다
- **효과 적용 직후 게임이 끝나는 경우(타임오버, 인간 전원 배신자, Phase 3)는 체류 없이 `ENDING`으로 간다.**
  엔딩 화면이 곧 결과 화면이라 같은 내용을 두 번 기다리게 된다
- 입력 유예 0.3초는 타이머를 `마감 시각 + 0.3초`에 발화시키는 것으로 처리한다

### 5.4 효과 모델

선택지의 결과는 **효과 목록**으로 표현하고, 모든 효과에 분류를 붙인다.

| 분류 | 의미 | 강제 성공 시 | 흉/길 변이 |
|---|---|---|---|
| `reward` | 보상 (부적 획득, 회복, 옥비녀, 버프) | 제거 | 길: +1단계 |
| `sideEffect` | 성공에 따라오는 부작용 | 유지 | 영향 없음 |
| `penalty` | 실패 페널티, 우회 시간 비용 | 해당 없음 | 흉: 가산, 길: 감산 |

```
예) 이장 B
성공: [sideEffect: 판정자 잠식 +5], [reward: 부적 1개 → 판정자]
실패: [penalty: 판정자 잠식 +20]
```

- 이벤트마다 강제 성공 예외 코드를 따로 쓰지 않고, 분류만 보고 처리한다
- 효과 대상 표기는 룰북 §4.1(판정자 / 전원 / 명시 대상)과 §5.3(협동 보상 수령자)을 따른다

### 5.5 난수

- 엔진은 난수 인터페이스만 받는다
- 운영: `crypto` 기반
- 테스트·시뮬레이션: 시드 고정 난수. 같은 시드면 같은 결과가 재현되어야 한다

---

## 6. 런타임 (room)

| 항목 | 설계 |
|---|---|
| 방 상태 보관 | 메모리 (서버 인스턴스 1대 전제) |
| 액션 처리 | 방당 직렬 큐. 명령과 타이머 만료를 같은 큐에 넣는다 |
| 타이머 | 처리 결과의 `nextDeadline`으로 예약. `(단계, 상태 버전)` 키로 늦은 타이머 무시 |
| 전송 | 액션 처리 후 연결된 대상마다 투영 스냅샷 전송, cue는 해당 대상에게만 |
| 자동 저장 | **M5 예정.** Phase 전환 시 Supabase에 상태 JSON 저장. M3에서는 Phase 전환 지점에 호출 자리만 비워 둔다 |

---

## 7. 프로토콜

### 7.1 클라이언트 → 서버 (명령)

| 명령 | 보내는 쪽 | 가능한 단계 |
|---|---|---|
| `session.hello` | 모두 | 연결 직후 (토큰, 방 코드, 기기 역할) |
| `lobby.pickSeat` / `lobby.toggleBot` | Controller / 호스트 Display | LOBBY |
| `lobby.start` | 호스트 Display | LOBBY |
| `vote.submit` | 인간 좌석 | VOTING, P3_VOTING (마감 전 변경 허용) |
| `roll.request` | 판정자, 협동·대립 판정 참여자 | ROLL_WAIT |
| `ability.trueSight` | 셋째 | VOTING |
| `intervention.reroll` | 둘째 | INTERVENTION_REROLL |
| `intervention.talisman` | 부적 보유자 | INTERVENTION_TALISMAN |
| `intervention.forceSuccess` | 첫째 | INTERVENTION_FORCE |
| `talisman.heal` | 부적 보유자 | VOTING |
| `talisman.submit` | 부적 보유자 | TALISMAN_WINDOW |
| `talisman.transfer` / `talisman.discard` | 초과 획득자 | 초과 발생 시 |
| `host.save` / `host.pause` / `host.resume` | 호스트 Display | 이벤트 사이 |

- 모든 명령은 엔진이 좌석과 단계를 검증한다. 클라이언트 버튼 비활성화는 편의일 뿐이다
- 명령 이름은 shared의 `COMMAND_TYPE` 상수로 정의한다
- **호스트 Display가 보내는 명령은 방 운영뿐이다** (`lobby.*`, `host.*`). 게임 조작은 좌석 Controller만 보낸다.
  룰북 §1의 "Display에 조작 없음"은 게임 조작을 뜻하고, 방 운영은 그 예외다 (룰북 §21)

### 7.2 서버 → 클라이언트

| 메시지 | 대상 | 내용 |
|---|---|---|
| `snapshot` | 각 대상 | 대상별 투영 전체 + 상태 버전 + **서버의 현재 시각(`serverNow`)** |
| `cue` | 각 대상 | 일회성 연출: 주사위 애니메이션, 귓속말 토스트, 붉은 메시지, 노이즈, 엔딩 시작 |
| `rejected` | 명령 보낸 쪽 | 거절 사유 |

- **진짜 붉은 메시지와 가짜 붉은 메시지는 같은 cue 형식**을 쓰고, 테스트로 고정한다
- 클라이언트는 상태 버전이 건너뛰면 스냅샷을 다시 요청한다
- 마감 시각은 모두 **서버 기준 절대 시각**이다. 스냅샷마다 `serverNow`를 함께 실어 클라이언트가
  자기 시계와의 차이를 보정하게 한다. 보정이 없으면 폰 시계가 틀어진 만큼 카운트다운이 틀린다

### 7.3 투영

| 필드 | Display | 일반 좌석 | 배신자 좌석 | 셋째 (능력 사용) |
|---|---|---|---|---|
| 상황·선택지 문장, 판정 유형·속성 태그 | O | O | O | O |
| 변이 라벨 + 최종값 | X | 60% 이상이면 확정된 가짜 라벨, 아니면 X | 진짜 | 진짜 |
| 비공개 판정 대가 표기 | O | O | O | O |
| 본인 잠식도·인벤토리·귓속말 | X | 본인만 | 본인만 | 본인만 |
| 공개 판정 주사위 | O | O | O | O |
| 비공개 판정 주사위 | "판정 완료" | "판정 완료" (판정자 포함) | 동일 | 동일 |
| 판정자 (`rollerSeat`) | O | O | O | O |
| 투표 | 투표 중 참여 인원 수, 마감 후 득표 수 | 본인 선택 + 동일 | 동일 | 동일 |
| 배신자 여부 | X | X | 필드로 보내지 않음, cue로만 전달 | X |
| 다른 좌석의 잠식도·인벤토리 | X | X | X | X |
| 좌석별 연결 상태 | O (전 좌석, "연결 끊김"만) | 본인만 | 본인만 | 본인만 |

| 좌석 표시 이름과 봇 구성 | O | O | O | O |
| 현재 진행 번호 (총 개수는 제외) | O | O | O | O |
| 엔딩의 배신자 승패와 정체 | `ENDING`에서만 O | `ENDING`에서만 O | 동일 | 동일 |

- 연결 상태는 잠식도·인벤토리와 무관해 심리전 정보가 아니다. **Display에만 좌석별로 표시**하고 표기는 "연결 끊김"으로 통일한다. "봇 대행"이라는 표현은 쓰지 않는다 (룰북 §17)
- **총 이벤트 개수는 어떤 투영에도 넣지 않는다.** 남은 개수를 알면 부적 사용 시점이 계산 문제가 된다 (룰북 §17)
- **배신자 정체는 `ENDING` 단계의 투영에만 들어간다.** 그 전에는 어떤 경로로도 나가지 않는다 (룰북 §15)
- **좌석의 봇 구성(`isBot`)은 공개하되 봇 대행(`botTakeover`)은 좌석 줄에 담지 않는다.** 봇 구성은 로비에서
  이미 공개된 정보이고, 대행은 "연결 끊김"으로만 표기해야 한다 (룰북 §17). 은닉 테스트로 고정한다
- **판정자는 비공개 판정에서도 공개한다.** 채택된 선택지의 속성 태그로 이미 드러나 있고(룰북 §3.1, §6.4),
  감추는 것은 주사위·기준·성패다 (룰북 §5.4). 판정자가 직접 굴려야 대가를 치르고 진실을 모르는 정보를
  받는 장면이 산다 — 자동 굴림으로 넘어가면 그 장면이 사라진다. 은닉 테스트로 고정한다
- 투영 함수는 필요한 필드만 골라 **새 객체를 만든다**
- 은닉 테스트 예: Display 투영에 잠식도 필드가 없음, 일반 좌석 투영에 다른 좌석 인벤토리가 없음, 배신자 좌석과 일반 좌석의 투영 구조(키 목록)가 같음

---

## 8. 운영 규칙 (룰북 외, 설정값)

| 규칙 | 설계 |
|---|---|
| 판정자 자동 굴림 | `ROLL_WAIT` 10초 경과 시 서버가 굴림 액션을 대신 넣음 |
| 협동·대립 판정 굴림 | 인간은 각자 자기 주사위 버튼, 봇 주사위는 즉시, 10초 안에 누르지 않은 주사위는 자동. 모든 주사위가 나오면 한 번에 결과 연출 |
| 투표 참여 인원 표시 | 투표 중 Display에 참여 인원 수만 표시, 선택지별 득표는 마감 후 |
| 투표 변경 | 마감 전 변경 허용 (참여 인원 수 불변) |
| 조기 마감 기준 | **연결된 인간** 전원이 투표했을 때 |
| Controller 연결 끊김 | 끊긴 시각 기록 → 30초 후 봇 대행. 재접속 시 즉시 해제. 30초 안에 필요한 입력은 기권·자동 굴림·미사용으로 처리 |
| 연결된 인간 Controller 0명 | 자동 일시정지 |
| Display 연결 끊김 | 자동 일시정지. 게임 시계와 단계 마감 시각을 남은 시간으로 변환해 저장, 재개 시 재계산, 대기 타이머 무효화. 정지 중 명령 거절, Controller에 잠금 화면 |
| 자동 일시정지 한도 | 게임당 누적 5분. **한도를 넘기면 그 회차만이 아니라 이후로도 자동 정지를 하지 않는다.** 이후 연결이 끊겨도 정지 없이 계속 진행한다 |
| 호스트 수동 일시정지 | 이벤트 사이에만. **자동 정지 한도와 무관하게 계속 가능하다** (누적에도 세지 않는다) |

| 개발용 시계 단축 | 방 생성 요청에 게임 시계 분을 실어 짧은 판을 돌릴 수 있다. **개발 환경에서만 받는다** — 운영 환경에서는 값이 들어와도 무시한다. 룰북 §19의 100분은 그대로 두고, 이 방 하나의 시계만 바꾼다 |

| 설정값 | 기본값 |
|---|---|
| 자동 굴림 대기 | 10초 |
| Controller 봇 대행 전환 | 30초 |
| 자동 일시정지 누적 한도 | 5분 |

---

## 9. 프론트엔드

### 9.1 구조

```
tal-brothers-web/src/
├─ main.ts, App.vue, style.css
├─ router/          index.ts, routes.ts, guards.ts
├─ layouts/         DefaultLayout.vue, DisplayLayout.vue, ControllerLayout.vue
├─ pages/
│  ├─ LandingPage.vue, AuthCallbackPage.vue, MainMenuPage.vue, SaveListPage.vue
│  ├─ JoinPage.vue, LobbyPage.vue, NotFoundPage.vue
│  ├─ DisplayPage.vue
│  └─ ControllerPage.vue
├─ components/
│  ├─ ui/                        # shadcn-vue 생성물
│  ├─ lobby/                     # SeatBoard, JoinQrPanel, BotToggle
│  ├─ display/                   # StageBackground, ClockHud, NarrationPanel, ChoiceBoard, DiceArena,
│  │                             # InterventionTrack, PublicNoticeFeed, MaskApparition, TargetReveal,
│  │                             # EndingSequence, NoiseOverlay
│  └─ controller/                # ErosionGauge, InventoryPanel, VotePanel, RollButton, InterventionPanel,
│                                # AbilityButton, WhisperToast, RedMessageOverlay, LockOverlay
├─ stores/          auth.ts, play.ts        # play가 방 세션(소켓·스냅샷·cue)을 모두 갖는다
├─ composables/     useRoomSocket, useCountdown, useAssetPreload, useWakeLock
├─ services/        supabase.ts, apiClient.ts, roomSocket.ts
├─ constants/       routeName.ts (ROUTE_NAME), assetUrl.ts (ASSET_URL)
├─ lib/             utils.ts (shadcn)
└─ assets/images/   backgrounds/, items/, masks/
```

### 9.2 라우트

| 경로 | 페이지 | 레이아웃 | 접근 조건 |
|---|---|---|---|
| `/` | LandingPage | Default | 공개 |
| `/auth/callback` | AuthCallbackPage | 없음 | 공개 |
| `/menu` | MainMenuPage | Default | 로그인 |
| `/saves` | SaveListPage | Default | 로그인 |
| `/join/:roomCode` | JoinPage | Default | 로그인 (미로그인 시 로그인 후 복귀) |
| `/lobby/:roomCode` | LobbyPage | Default | 로그인 + 방 멤버 |
| `/display/:roomCode` | DisplayPage | Display | 로그인 + 호스트 |
| `/play/:roomCode` | ControllerPage | Controller | 로그인 + 좌석 보유 |
| `/:pathMatch(.*)*` | NotFoundPage | Default | 공개 |

- 레이아웃은 `meta` 분기가 아니라 **중첩 라우트의 부모 컴포넌트**로 둔다
- 라우터 가드는 인증 스토어의 초기화 완료를 기다린 뒤 판단한다
- **로비와 게임 화면은 같은 방의 같은 스냅샷을 본다.** 스토어를 나누면 라우트가 바뀔 때 소켓이 끊겼다 붙어
  자동 일시정지 조건(§8)에 걸린다. `play.ts` 하나가 방 세션을 들고 로비 화면은 그 파생만 읽는다

### 9.3 원칙

- 스토어를 공개/비공개로 나누지 않는다. 서버가 대상별로 투영해 보내므로 받은 스냅샷을 그대로 그린다
- 화면에 룰 계산을 두지 않는다. 남은 시간 표시만 마감 시각으로 계산한다
- 에셋 URL은 shared의 에셋 키를 `ASSET_URL`로 매핑한다

### 9.4 레이아웃

**Display (방송 화면)**
- 뷰포트 전체 검은 배경에 16:9 스테이지를 레터박스로 배치
- 글자 크기는 컨테이너 단위(cqw)로 스테이지 크기에 비례
- 레이어: 배경 → 비네트 → 탈 잔상 → HUD → 주사위·컷인
- 방송 캠 오버레이용 세이프존 확보

**Controller (모바일 전용)**
- 세이프에어리어 적용, 상단 잠식도 게이지 고정, 하단 액션바 고정
- 화면 꺼짐 방지(Wake Lock)
- PC 화면으로 접속 시 폰 접속 안내와 QR 표시

---

## 10. 인증·세이브·재접속

| 항목 | 설계 |
|---|---|
| 로그인 | **전원 Google** (Supabase Auth). 세이브 불러오기 시 좌석 주인 검증을 단순하게 하기 위함 |
| 인앱 브라우저 | 초대 페이지에서 카카오톡·인스타그램 등 인앱 브라우저를 감지해 외부 브라우저로 열기 안내 (Google이 인앱 OAuth를 차단) |
| OAuth 동의 화면 | 공개 전 Google Cloud에서 "프로덕션"으로 게시 (기본 범위만 사용) |
| 서버 인증 | `session.hello`의 토큰을 **`supabase.auth.getUser(token)`으로 검증**한다. 의존성이 늘지 않고 프로젝트의 JWT 서명 키 설정에 영향받지 않는다. 연결당 1회만 호출한다. 토큰을 URL에 싣지 않는다 |
| 좌석 바인딩 | 유저 ID ↔ 좌석. 같은 유저가 재접속하면 같은 좌석으로 복귀 |
| 세이브 | Phase 전환 시 자동 + 호스트 수동(이벤트 사이). 엔진 상태 JSON + 엔진·시나리오 버전 |
| 불러오기 | 버전 불일치 시 거부. 복원 방은 일시정지 상태로 로비에 열림 |
| 좌석 주인 불참 | 호스트가 해당 좌석을 봇으로 돌리거나 다른 Google 사용자에게 재할당. 재할당된 사람은 잠식도, 인벤토리, 배신자 여부, 받은 귓속말을 그대로 이어받음 |
| DB 테이블 | `profiles`, `rooms` (초대 코드 조회·이력), `game_saves` |
| DB 쓰기 | 서버(service role)만. 클라이언트는 RLS로 본인 데이터 읽기만 |

---

## 11. 확정된 기술 결정

| 항목 | 결정 |
|---|---|
| 저장소 | 루트 + npm workspaces (`tal-brothers-shared`, `tal-brothers-server`, `tal-brothers-web`) |
| 언어 | TypeScript 6 (전 패키지) |
| 프론트 | Vue 3, Vite 8, Tailwind CSS v4, shadcn-vue (Reka UI, Neutral), Pinia, Vue Router |
| 서버 | Node 24, Express, ws, tsx (개발 실행) |
| 테스트 | Vitest (서버) |
| DB·인증 | Supabase, 전원 Google 로그인 |
| 엔진 형태 | 순수 함수 + 시각·난수 주입 |
| 통신 | 스냅샷 + cue, 명령만 수신 |
| 동시성 | 방당 직렬 큐, 서버 인스턴스 1대 |
| tsconfig | `erasableSyntaxOnly`를 server·shared에도 적용해 전 패키지에서 `enum`을 막는다 |
