# M3 실행 계획 — 런타임, 통신, 인증, 로비, 운영 규칙

> 근거 문서: `rulebook-v3.md`(규칙 원본) > `architecture.md`(구현 설계) > `roadmap.md`(범위)
> 이 문서는 M3-1 ~ M3-7을 한 번에 진행하기 위한 계획이며, 코드는 포함하지 않는다.
> 타입·메시지 표기는 설계 스케치이고 최종 파일 작성 시 확정한다.

## 전제

- M2 완료 상태에서 시작한다. 엔진은 로비 없이 한 판을 엔딩까지 진행할 수 있고, 투영 함수도 있다
- M3의 일은 **엔진을 실제 시간·소켓·계정에 연결하는 것**이다. 룰 계산을 새로 만들지 않는다
- 화면은 최소 구성만 만든다. Display·Controller 게임 화면은 M4다
- 세이브/불러오기는 M5다. M3는 저장 호출 자리만 비워 둔다 (10절 13번)
- 룰북에 수치가 없는 항목은 만들지 않는다. 10절에 모아 두고 착수 전에 답을 받는다
- **완료 기준(로드맵):** PC 1대와 폰 여러 대가 같은 방에 접속해 로비에서 게임을 시작할 수 있다

---

## 1. 작업 단위 분할과 단위별 파일 목록

| 단위 | 내용 | 끝나는 조건 |
|---|---|---|
| M3-1 | shared 프로토콜·거절 사유·로비 투영 타입 | `typecheck -w tal-brothers-shared` / `-w tal-brothers-server` 통과 |
| M3-2 | 엔진: 로비 단계, 연결 상태, 봇 대행, 일시정지 | 엔진 테스트 통과, 기존 343건 유지 |
| M3-3 | room 런타임 (직렬 큐, 타이머 예약, 스냅샷·cue 전송) | 가짜 스케줄러로 런타임 테스트 통과 |
| M3-4 | ws 세션 (인증 핸드셰이크, 명령 검증, rejected, 재동기화) | 가짜 소켓으로 세션 테스트 통과 |
| M3-5 | infra·REST·부트스트랩 (Supabase, 방 생성·참가, Express) | 서버가 뜨고 REST 왕복 테스트 통과 |
| M3-6 | web 기반 (인증 스토어, 라우터·가드, 랜딩·메뉴·초대) | 로그인 후 `/menu`까지 이동, 미로그인은 되돌아감 |
| M3-7 | web 로비 (소켓 연결, 좌석 보드, 봇 토글, QR, 시작) | PC·폰 실제 접속으로 완료 기준 확인 |

### M3-1. shared 프로토콜·거절 사유·로비 투영 타입

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `tal-brothers-shared/src/constants/deviceRole.ts` | 생성 | `DEVICE_ROLE` (`DISPLAY` / `CONTROLLER`) — 아키 §1 |
| `tal-brothers-shared/src/constants/rejectionReason.ts` | 생성 | `REJECTION_REASON` — **엔진에서 shared로 옮긴다**. `rejected` 메시지가 그대로 싣는다 (10절 2번) |
| `tal-brothers-shared/src/constants/serverMessageType.ts` | 생성 | `SERVER_MESSAGE_TYPE` (`welcome` / `snapshot` / `cue` / `rejected` / `error`) — 아키 §7.2 |
| `tal-brothers-shared/src/constants/clientFrameType.ts` | 생성 | `CLIENT_FRAME_TYPE` (`hello` / `command` / `resync`) |
| `tal-brothers-shared/src/constants/pauseReason.ts` | 생성 | `PAUSE_REASON` (`host` / `displayGone` / `noHumanController`) — 아키 §8 |
| `tal-brothers-shared/src/constants/seatConnection.ts` | 생성 | `SEAT_CONNECTION` (`connected` / `disconnected`) |
| `tal-brothers-shared/src/types/command.ts` | 수정 | `session.hello`, `lobby.pickSeat`, `lobby.toggleBot`, `lobby.start`, `host.pause`, `host.resume` 타입 추가 |
| `tal-brothers-shared/src/types/protocol.ts` | 생성 | 클라이언트 프레임·서버 메시지 봉투 (3절) |
| `tal-brothers-shared/src/types/rest.ts` | 생성 | REST 요청·응답 타입 (4절) |
| `tal-brothers-shared/src/types/projection.ts` | 수정 | `LobbyView`, `PauseView` 추가, `PublicView`·`SeatPrivateView`에 연결 |
| `tal-brothers-shared/src/index.ts` | 수정 | 위 전부 re-export |

> `REJECTION_REASON`을 옮기는 이유는 M2에서 `PUBLIC_NOTICE_KIND`·`WHISPER_KIND`를 옮긴 것과 같다.
> 클라이언트가 거절 사유로 분기해야 하므로 값이 공용이어야 한다. 값은 바뀌지 않으므로 기존 테스트는 그대로 통과한다.

### M3-2. 엔진: 로비 단계, 연결 상태, 봇 대행, 일시정지

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `src/engine/engineTypes.ts` | 수정 | `ACTION_KIND.PRESENCE` 추가, `REJECTION_REASON`을 shared에서 읽음 (10절 1번) |
| `src/engine/state/gameState.ts` | 수정 | 8절의 확장 필드 전부 (`userId`, `connection`, `botTakeover`, `pause`, `room`) |
| `src/engine/state/createGame.ts` | 수정 | **`LOBBY` 단계에서 멈춘다.** Phase 1 진입은 `lobby.start`가 한다 (8.3) |
| `src/engine/rules/seatControl.ts` | 생성 | `isHumanSeat` / `isBotControlled` / `connectedHumanSeats` — 좌석 판정의 단일 진입점 (5.3) |
| `src/engine/rules/pause.ts` | 생성 | 일시정지·재개 시각 변환, 자동 누적 한도 (5.5) |
| `src/engine/steps/lobbyStep.ts` | 생성 | 좌석 선택·해제, 봇 토글, 시작 조건 검사 |
| `src/engine/steps/pausedStep.ts` | 생성 | 일시정지 중 명령 거절, `host.resume`과 presence만 받음 |
| `src/engine/steps/votingStep.ts` 외 | 수정 | `!seat.isBot` 직접 판정을 `seatControl`의 서술어로 교체 (5.3의 표) |
| `src/engine/bots/botPolicy.ts` | 수정 | 봇 대행 좌석도 굴림·부적 자동 사용 대상에 포함 |
| `src/engine/dispatch.ts` | 수정 | presence 액션 분기, `LOBBY`·`PAUSED` 처리기 등록 |
| `test/engine/steps/lobbyStep.test.ts` · `pauseStep.test.ts` · `presence.test.ts` | 생성 | 9절 참조 |
| `test/support/gameDriver.ts` | 수정 | `startGame`이 로비에서 `lobby.start`를 한 번 보내 기존 테스트의 시작 지점을 유지 |

### M3-3. room 런타임

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `src/room/roomTypes.ts` | 생성 | `RoomHandle`, `RoomMember`, 전송 대상 타입 |
| `src/room/scheduler.ts` | 생성 | `Scheduler` 인터페이스(`at(time, fn)` / `cancel`)와 실제 시각 구현. 테스트는 가짜를 넣는다 |
| `src/room/roomRuntime.ts` | 생성 | 방당 액션 직렬 큐, 타이머 예약·무효화, 처리 결과 전송 (2절) |
| `src/room/roomRegistry.ts` | 생성 | 메모리 내 방 목록, 방 코드 발급·조회·정리 |
| `src/room/seatBinding.ts` | 생성 | 유저 ↔ 좌석, 소켓 ↔ 좌석, 연결 끊김 → presence 액션 |
| `test/room/roomRuntime.test.ts` · `seatBinding.test.ts` | 생성 | 9절 참조 |

### M3-4. ws 세션

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `src/transport/ws/socketPort.ts` | 생성 | 세션이 쓰는 소켓 인터페이스(`send` / `close`). 테스트가 가짜를 넣는다 |
| `src/transport/ws/commandCodec.ts` | 생성 | 들어온 JSON을 `Command`로 검증. 손으로 쓴 검증기, 의존성 없음 |
| `src/transport/ws/wsSession.ts` | 생성 | hello 인증 → 방 참가 → 명령 중계 → 끊김 처리 (3절) |
| `src/transport/ws/wsServer.ts` | 생성 | `ws` 서버 부착, 연결마다 세션 생성 |
| `test/transport/wsSession.test.ts` · `commandCodec.test.ts` | 생성 | 9절 참조 |

### M3-5. infra·REST·부트스트랩

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `src/config/serverEnv.ts` | 생성 | `SERVER_ENV` — 환경 변수 읽기와 누락 시 즉시 실패 (7.2) |
| `src/infra/supabaseAdmin.ts` | 생성 | service role 클라이언트 |
| `src/infra/authVerifier.ts` | 생성 | Supabase JWT 검증. 인터페이스로 두고 테스트는 가짜를 넣는다 (10절 4번) |
| `src/infra/roomRepository.ts` | 생성 | `rooms` 테이블 기록·조회 (초대 코드 확인용) |
| `src/transport/http/roomsRouter.ts` | 생성 | 방 생성·조회·참가 (4절) |
| `src/transport/http/healthRouter.ts` | 생성 | `GET /healthz` |
| `src/index.ts` | 생성 | Express + ws 부트스트랩, CORS, 0.0.0.0 바인딩 |
| `tal-brothers-server/.gitignore` | 생성 | `.env` 제외 |
| `docs/supabase-setup.sql` | 생성 | `profiles`·`rooms` 테이블과 RLS 정책. **사람이 SQL Editor에서 실행한다** (7.3) |
| `test/transport/roomsRouter.test.ts` | 생성 | 9절 참조 |

### M3-6. web 기반

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `src/services/supabase.ts` | 생성 | `createClient`, Google OAuth 시작·세션 복원 |
| `src/services/apiClient.ts` | 생성 | REST 호출, 액세스 토큰을 `Authorization` 헤더에 실음 |
| `src/stores/auth.ts` | 생성 | 세션·프로필, 초기화 완료 플래그 (가드가 이 플래그를 기다린다, 아키 §9.2) |
| `src/router/routes.ts` · `index.ts` · `guards.ts` | 생성 | 아키 §9.2의 경로표 중 M3 범위 (6.1) |
| `src/layouts/DefaultLayout.vue` | 생성 | 공통 배경·여백 |
| `src/pages/LandingPage.vue` | 생성 | `introMask.png` + Google 로그인 버튼 |
| `src/pages/AuthCallbackPage.vue` | 생성 | 세션 교환 후 복귀 경로로 이동 |
| `src/pages/MainMenuPage.vue` | 생성 | 방 만들기 / 코드로 참가 / 로그아웃. `/saves`는 M5라 비활성 |
| `src/pages/JoinPage.vue` | 생성 | 초대 링크 진입, 인앱 브라우저 감지 안내 (아키 §10) |
| `src/pages/NotFoundPage.vue` | 생성 | |
| `src/constants/routeName.ts` | 생성 | `ROUTE_NAME` |
| `src/lib/inAppBrowser.ts` | 생성 | UA로 카카오톡·인스타그램 등 감지 |
| `tal-brothers-web/package.json` | 수정 | `typecheck` 스크립트 추가 (`vue-tsc --noEmit`) |
| `src/App.vue` · `HelloWorld.vue` · `assets/hero.png` 등 | 삭제·교체 | Vite 템플릿 잔재 정리 |

### M3-7. web 로비

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `src/services/roomSocket.ts` | 생성 | ws 연결·재연결·프레임 송수신 |
| `src/composables/useRoomSocket.ts` | 생성 | 스토어에 스냅샷·cue를 흘려 넣는 래퍼 |
| `src/stores/lobby.ts` | 생성 | 로비 스냅샷, 내 좌석, 연결 상태 |
| `src/pages/LobbyPage.vue` | 생성 | 기기 역할에 따라 Display 패널 / Controller 패널 (10절 14번) |
| `src/components/lobby/SeatBoard.vue` · `BotToggle.vue` · `JoinQrPanel.vue` | 생성 | 아키 §9.1 |
| `src/pages/DisplayPage.vue` · `ControllerPage.vue` | 생성 | **M4 자리표시자.** 시작 후 이동할 곳만 만든다 |

---

## 2. room 런타임 설계

### 2.1 방당 직렬 큐

```
enqueue(action) → 큐에 넣고, 실행 중이 아니면 드레인 시작
drain(): 큐가 빌 때까지
  1. now = clock.now()
  2. result = dispatch(state, action, { now, rng })
  3. 거절이면 요청자에게만 rejected 전송, 상태는 그대로
  4. 성공이면 state 교체 → 타이머 재예약 → 대상별 전송
```

- **명령과 타이머 만료와 presence를 같은 큐에 넣는다** (아키 §6). 부적 선착순(룰북 §7.4)이 락 없이 도착 순서로 결정된다
- 드레인은 동기 루프다. `dispatch`가 순수 함수라 중간에 비동기 지점이 없다
- 전송과 저장처럼 I/O가 필요한 일은 드레인 밖으로 빼서 큐를 막지 않는다
- 난수는 방마다 운영용 `crypto` 구현 1개를 들고 있는다 (아키 §5.5)

### 2.2 타이머 예약과 무효화

- 처리 결과의 `nextDeadline`(`{ at, step, stateVersion }`)으로 **방마다 타이머 1개만** 예약한다
- 새 결과가 나오면 이전 타이머를 먼저 취소한다. 취소가 늦어 이미 발화했더라도, 액션에 실린 `(step, stateVersion)`이 현재와 다르면 엔진이 `staleTimer`로 거절한다 (아키 §5.1). **이중 방어**
- `nextDeadline`이 `null`이면(로비, 엔딩) 예약하지 않는다
- 일시정지 진입 시 타이머를 취소하고, 재개 시 남은 시간으로 다시 예약한다 (5.5)
- 시간은 `Scheduler` 인터페이스로만 다룬다. 런타임 코드가 `setTimeout`·`Date.now`를 직접 부르지 않아야 테스트에서 시간을 제어할 수 있다

### 2.3 스냅샷·cue 전송 시점

| 시점 | 보내는 것 | 대상 |
|---|---|---|
| 액션 1건 처리 성공 직후 | `snapshot` → 이어서 `cue` | 연결된 모든 대상(각자 투영). cue는 `audience`가 가리키는 대상만 |
| 거절 | `rejected` | 명령을 보낸 소켓만 |
| hello 성공 직후 | `welcome` → `snapshot` | 그 소켓만 |
| `resync` 요청 | `snapshot` | 그 소켓만. cue는 다시 보내지 않는다 |

- **스냅샷을 먼저, cue를 나중에** 같은 처리 안에서 연속으로 보낸다. cue가 가리키는 값이 이미 스냅샷에 반영돼 있어야 화면이 어긋나지 않는다
- 투영은 대상마다 새로 만든다(`projectDisplay` 1회 + `projectSeat` 좌석 수만큼). 방당 소켓이 최대 4개라 매번 만들어도 부담이 없다 (아키 §2 원칙 5)
- cue는 **다시 보내지 않는다.** 재접속·재동기화로 받는 것은 스냅샷뿐이다. 놓친 연출은 복구하지 않는 것이 설계다 (아키 §2 원칙 4·5)

---

## 3. ws 프로토콜 구현

### 3.1 프레임 형식

**클라이언트 → 서버**

| `t` | 본문 | 비고 |
|---|---|---|
| `hello` | `{ token, roomCode, deviceRole }` | 연결 직후 1회. 토큰은 URL에 싣지 않는다 (아키 §10) |
| `command` | `{ seq, command }` | `command`는 shared의 `Command` |
| `resync` | `{ haveVersion }` | 상태 버전이 건너뛰었을 때 |

**서버 → 클라이언트**

| `t` | 본문 |
|---|---|
| `welcome` | `{ roomCode, deviceRole, seat, protocolVersion }` |
| `snapshot` | `{ stateVersion, snapshot }` |
| `cue` | `{ stateVersion, cues }` |
| `rejected` | `{ seq, reason, detail? }` |
| `error` | `{ code, message }` — 프레임을 못 읽었거나 인증 전 명령이 온 경우 |

### 3.2 `session.hello` 인증

```
1. 토큰 검증 (authVerifier) → userId. 실패면 error 후 close
2. roomCode로 방 조회. 없으면 error 후 close
3. deviceRole 확인
   - DISPLAY: 방의 호스트 userId와 같아야 한다
   - CONTROLLER: 방 멤버면 된다
4. 같은 (userId, deviceRole) 소켓이 이미 있으면 이전 소켓을 닫는다 (10절 7번)
5. seatBinding에서 이 userId의 좌석을 찾아 붙인다. 없으면 좌석 없이 참가(로비에서 고른다)
6. presence 액션을 큐에 넣는다 → welcome → snapshot
```

- **hello 이전의 모든 프레임은 거절한다.** 인증 상태는 세션 객체가 들고 있다
- hello 타임아웃(10초) 안에 오지 않으면 소켓을 닫는다 [운영 설정값, 10절 6번]

### 3.3 명령 검증

검증은 **세 겹**이고 각 겹의 책임이 다르다.

| 겹 | 위치 | 보는 것 | 실패 시 |
|---|---|---|---|
| 1 | `commandCodec` | JSON 모양, `type`이 아는 값인지, 필드 타입 | `rejected(unknownCommand)` |
| 2 | `wsSession` | 인증 여부, 이 소켓이 좌석을 가졌는지, Display가 좌석 명령을 보내지 않았는지 | `rejected(wrongSeat)` |
| 3 | 엔진 `dispatch` | 단계·좌석·조건 (룰) | 엔진의 `Rejection` 그대로 |

- 클라이언트의 버튼 비활성화는 편의일 뿐이고 **판정은 항상 엔진이 한다** (아키 §7.1)
- `rejected`에는 `seq`를 실어 클라이언트가 어느 명령이 막혔는지 알 수 있게 한다

### 3.4 상태 버전 불일치 시 재동기화

- 서버는 액션 1건마다 `stateVersion`을 1 올리고, 스냅샷에 그 값을 싣는다 (아키 §5.1)
- 클라이언트는 받은 버전이 `마지막 + 1`이 아니면 `resync`를 보낸다
- 서버는 `resync`에 **현재 전체 스냅샷 1건**으로 답한다. 델타나 재생은 없다
- 재접속은 재동기화의 특수한 경우다. hello 성공 직후 항상 전체 스냅샷을 보내므로 별도 처리가 없다
- 스냅샷이 전체 상태라 버전이 건너뛰어도 화면은 맞는다. `resync`는 **cue 누락을 눈치채기 위한 방어선**이다

---

## 4. Supabase 인증과 REST

### 4.1 인증 흐름

```
web: signInWithOAuth({ provider: 'google', redirectTo: <origin>/auth/callback })
   → Supabase가 Google로 보냈다가 /auth/callback으로 복귀
   → supabase-js가 세션 저장, auth 스토어가 준비 완료 표시
   → REST는 Authorization: Bearer <access_token>
   → ws는 hello 본문에 같은 토큰
server: authVerifier.verify(token) → { userId, email }
```

- 전원 Google 로그인이다 (아키 §10). 익명 참가는 없다
- 토큰을 URL·쿼리스트링에 싣지 않는다

### 4.2 REST

베이스 `/api`, 응답은 모두 JSON, 실패는 `{ error: { code, message } }`.

| 메서드·경로 | 인증 | 요청 | 성공 응답 |
|---|---|---|---|
| `GET /healthz` | 없음 | — | `{ ok: true }` |
| `POST /api/rooms` | 필요 | `{}` | `{ roomCode, hostUserId, createdAt }` |
| `GET /api/rooms/:roomCode` | 필요 | — | `{ roomCode, hostName, step, seatCount, joinable }` |
| `POST /api/rooms/:roomCode/join` | 필요 | `{}` | `{ roomCode, memberId }` |

| 실패 | 코드 |
|---|---|
| 토큰 없음·만료 | 401 `unauthenticated` |
| 호스트가 아님 | 403 `forbidden` |
| 없는 방 코드 | 404 `roomNotFound` |
| 이미 시작한 방에 참가 | 409 `roomNotJoinable` |

- **방 상태는 메모리가 원본이다.** `rooms` 테이블은 초대 코드 조회와 이력용이다 (아키 §10)
- 방 코드는 혼동 문자를 뺀 대문자·숫자 6자 [운영 설정값, 10절 6번]
- `POST /join`은 **멤버 등록까지만** 한다. 좌석 선택은 로비에서 ws로 한다 — 좌석은 경쟁 자원이라 **방당 직렬 큐를 지나야** 선착순이 흔들리지 않는다 (아키 §2 원칙 7)

---

## 5. 운영 규칙 구현 방식

근거는 아키텍처 §8. 설정값은 이미 `GAME_CONFIG`에 있다 (`botTakeoverSeconds` 30초, `autoPauseLimitMinutes` 5분).

### 5.1 연결 변화를 엔진에 넣는 방법

연결 변화는 명령도 타이머도 아니다. **`ACTION_KIND.PRESENCE` 액션을 새로 만든다** (10절 1번).

```
presence = { kind: 'presence', target: 좌석 | 'display', status: connected | disconnected }
```

- 이렇게 두면 연결 상태가 **상태 안에** 남아 세이브·재현·테스트가 모두 기존 방식 그대로다
- 런타임은 소켓 open/close에서 이 액션을 큐에 넣기만 한다

### 5.2 Controller 연결 끊김 30초 봇 대행

| 시점 | 처리 |
|---|---|
| 끊김 | `seat.connection = { status: disconnected, at: now }`. `at + 30초`를 다음 타이머 후보로 올린다 |
| 30초 경과 | 타이머 만료 → `seat.botTakeover = true` |
| 재접속 | `botTakeover = false` 즉시 해제, 예약된 전환 타이머는 버전 불일치로 무효 |
| 30초 안에 필요한 입력 | 기권·자동 굴림·미사용으로 이미 처리된다 (룰북 §8, 아키 §8). 새 규칙을 만들지 않는다 |

**타이머가 하나뿐인 문제:** 단계 마감과 봇 대행 전환이 동시에 대기할 수 있다.
`nextDeadline`은 **둘 중 이른 시각**을 고르고, 엔진이 `timerAt`으로 중간 타이머를 지정하는 기존 방식(봇 부적 판단, 룰북 §11)을 그대로 쓴다.

### 5.3 봇 대행 좌석의 취급

`isBot` 하나로 세 가지를 판정하던 것을 **서술어 셋으로 나눈다** (`rules/seatControl.ts`).

| 서술어 | 뜻 | 쓰는 곳 |
|---|---|---|
| `isHumanSeat` | 좌석 구성이 인간인가 (`!isBot`) | 배신자 전환(§10.1), 전원 배신자 검사(§10.3), 1인 플레이 판정(§10.1), Phase 3 A 루트 투표 자격(§14.4) |
| `isBotControlled` | 지금 서버가 대신 조작하는가 (`isBot \|\| botTakeover`) | 봇 굴림·부적 자동 사용·둘째 재굴림·첫째 강제 성공(§11), 좌석 명령 거절 |
| `connectedHumanSeats` | 지금 연결된 인간 좌석 | 투표 조기 마감 기준(아키 §8), 인간 Controller 0명 검사 |

- **봇 대행 중인 인간 좌석은 여전히 인간이다.** 100%에 도달하면 배신자로 전환하고(룰북 §10.1), 봇 대행은 조작만 대신한다(§11)
- Phase 3 A 루트의 유효표는 **실제로 들어온 표**만 센다. 봇 대행 좌석은 기권이 되고, 그래서 유효표 0 규칙(§14.4)이 그대로 작동한다
- 봇 100% 방해(§11)는 봇 좌석의 규칙이므로 대행 좌석에는 적용하지 않는다 (10절 5번에서 확인받는다)

### 5.4 일시정지

| 유발 | 조건 | 해제 |
|---|---|---|
| 인간 Controller 0명 | 연결된 인간 좌석이 0이 되는 순간 | 인간 Controller가 1명이라도 연결되면 |
| Display 끊김 | Display 소켓이 닫히는 순간 | Display 재접속 |
| 호스트 수동 | `host.pause`, **이벤트 사이에만** | `host.resume` |

- 인간 좌석이 애초에 0명인 구성(봇 자동 대전)은 이 검사를 하지 않는다. 시뮬레이터에는 소켓이 없다
- 자동 일시정지는 **게임당 누적 5분**까지다. 누적이 한도를 넘으면 정지하지 않고 계속 진행한다 (아키 §8)
- 한도를 넘은 뒤 다시 끊겨도 더 이상 정지하지 않는다 (10절 10번)
- 정지 중 도착한 좌석 명령은 `PAUSED` 단계 처리기가 거절한다. Controller에는 잠금 화면 (아키 §8)

### 5.5 일시정지·재개 시 시각 변환

모든 시간이 절대 마감 시각이라(아키 §2 원칙 6) 변환이 두 줄이다.

```
정지 시각 t
  clock.pausedRemainingMs          = clock.deadlineAt - t
  progress.pausedStepRemainingMs   = progress.stepDeadlineAt - t   (null이면 null 유지)
  pause = { reason, pausedAt: t, resumeStep: progress.step }
  progress.step = PAUSED
  런타임은 타이머를 취소한다

재개 시각 t2
  clock.deadlineAt        = t2 + clock.pausedRemainingMs
  progress.stepDeadlineAt = t2 + progress.pausedStepRemainingMs
  progress.step           = pause.resumeStep
  자동 정지였으면 pause.autoAccumulatedMs += t2 - pause.pausedAt
  런타임은 새 마감 시각으로 타이머를 다시 건다
```

- 정지 중에는 게임 시계가 흐르지 않으므로 타임오버(룰북 §2.1) 검사에 걸릴 일이 없다
- 재개 시 `stateVersion`이 오르므로 클라이언트는 평소처럼 스냅샷으로 따라온다

---

## 6. web 범위

### 6.1 라우터와 가드

아키 §9.2의 경로표 중 M3에서 실제로 쓰는 것만 만든다.

| 경로 | 페이지 | 접근 조건 | M3 상태 |
|---|---|---|---|
| `/` | LandingPage | 공개 | 완성 |
| `/auth/callback` | AuthCallbackPage | 공개 | 완성 |
| `/menu` | MainMenuPage | 로그인 | 방 만들기·참가만 |
| `/join/:roomCode` | JoinPage | 로그인 (미로그인 시 로그인 후 복귀) | 완성 |
| `/lobby/:roomCode` | LobbyPage | 로그인 + 방 멤버 | 완성 |
| `/display/:roomCode` | DisplayPage | 로그인 + 호스트 | 자리표시자 |
| `/play/:roomCode` | ControllerPage | 로그인 + 좌석 보유 | 자리표시자 |
| `/saves` | — | — | M5. 메뉴에서 비활성 |
| `*` | NotFoundPage | 공개 | 완성 |

- 레이아웃은 `meta` 분기가 아니라 **중첩 라우트의 부모 컴포넌트**로 둔다 (아키 §9.2)
- 가드는 인증 스토어의 **초기화 완료를 기다린 뒤** 판단한다. 새로고침 직후 세션 복원 전에 튕기지 않게 한다
- 미로그인으로 `/join/:roomCode`에 들어오면 경로를 기억했다가 로그인 후 되돌아온다

### 6.2 인증 스토어

| 상태 | 뜻 |
|---|---|
| `ready` | Supabase 세션 복원 시도가 끝났는가. 가드가 이 값을 기다린다 |
| `session` | 액세스 토큰과 만료 시각 |
| `user` | id, 표시 이름, 아바타 |

- `onAuthStateChange`로 갱신한다. 토큰이 갱신돼도 열린 ws는 그대로 둔다 (세션은 hello 시점에 한 번 검증한다)

### 6.3 페이지 최소 구성

| 페이지 | 담는 것 |
|---|---|
| Landing | `introMask.png`, 제목, Google 로그인 버튼 1개 |
| AuthCallback | 로딩 표시와 복귀 처리만. 레이아웃 없음 |
| MainMenu | "방 만들기"(→ `POST /api/rooms` → `/lobby/:code`), "코드로 참가"(입력 → `/join/:code`), 로그아웃 |
| Join | 방 정보 확인, **인앱 브라우저면 외부 브라우저로 열기 안내**(아키 §10), 참가 → `/lobby/:code` |
| Lobby | 기기 역할에 따라 두 패널 (아래) |

**LobbyPage의 두 얼굴** — 화면 폭이 아니라 **기기 역할**로 가른다 (10절 14번).

| 역할 | 보여주는 것 |
|---|---|
| Display (호스트 PC) | 방 코드, 초대 QR(`/join/:code`), 좌석 3칸 현황, 봇 토글, 시작 버튼 |
| Controller (폰) | 좌석 3칸 중 고르기, 내 좌석 표시, 대기 문구 |

- 브랜드 이미지는 `introMask.png`만 쓴다. **인게임 에셋 11종은 M4까지 노출하지 않는다** (로드맵 M3)
- 시작하면 Display는 `/display/:code`, Controller는 `/play/:code`로 이동한다. 두 페이지는 M3에서 "M4 예정" 자리표시자다

---

## 7. 로컬에서 PC와 폰으로 접속해 확인하는 방법

### 7.1 실행

```
# 터미널 1 — 서버 (0.0.0.0:3000)
npm run dev:server

# 터미널 2 — web (외부 접속 허용)
npm run dev:web -- --host
```

Vite가 `Network: http://<PC 내부 IP>:5173/`을 출력한다. 폰 브라우저로 그 주소를 연다.

### 7.2 환경 변수

| 파일 | 키 | 값 |
|---|---|---|
| `tal-brothers-web/.env.local` | `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| | `VITE_SUPABASE_ANON_KEY` | anon 키 |
| | `VITE_API_BASE_URL` | `http://<PC 내부 IP>:3000` |
| | `VITE_WS_URL` | `ws://<PC 내부 IP>:3000/ws` |
| `tal-brothers-server/.env` | `PORT` | `3000` |
| | `SUPABASE_URL` | 위와 같음 |
| | `SUPABASE_SERVICE_ROLE_KEY` | service role 키 (**절대 web에 넣지 않는다**) |
| | `SUPABASE_JWT_ISSUER` | `<SUPABASE_URL>/auth/v1` |
| | `CORS_ORIGIN` | `http://localhost:5173,http://<PC 내부 IP>:5173` |

- Node 24는 `--env-file`을 기본 지원하므로 dotenv 의존성을 추가하지 않는다. `dev` 스크립트에 플래그를 붙인다
- `.env`·`.env.local`은 커밋하지 않는다. 서버 워크스페이스에 `.gitignore`를 추가한다

### 7.3 사람이 해야 하는 작업 목록

코드로 대신할 수 없는 것만 적는다. **M3-5 착수 전에 1~5번이, 실기 확인 전에 6~10번이 끝나 있어야 한다.**

| # | 할 일 | 어디서 |
|---|---|---|
| 1 | Supabase 프로젝트 생성(또는 기존 프로젝트 확인)하고 **URL·anon 키·service role 키** 확보 | Supabase 대시보드 |
| 2 | Google Cloud에서 OAuth 클라이언트(웹) 생성. 승인된 리디렉션 URI에 `https://<project-ref>.supabase.co/auth/v1/callback` 등록 | Google Cloud Console |
| 3 | Supabase Authentication → Providers → Google 사용 설정, 2번의 클라이언트 ID·시크릿 입력 | Supabase 대시보드 |
| 4 | Authentication → URL Configuration에서 Site URL `http://localhost:5173`, Additional Redirect URLs에 `http://localhost:5173/**`와 `http://<PC 내부 IP>:5173/**` 추가 | Supabase 대시보드 |
| 5 | `docs/supabase-setup.sql`(M3-5에서 작성)을 SQL Editor에서 실행해 `profiles`·`rooms` 테이블과 RLS 정책 생성 | Supabase 대시보드 |
| 6 | `ipconfig`로 PC 내부 IP 확인 | PowerShell |
| 7 | `.env.local`·`.env` 두 파일을 7.2 표대로 작성 | 에디터 |
| 8 | Windows 방화벽에서 Node.js 인바운드(3000, 5173) 허용. 첫 실행 때 뜨는 창에서 **개인 네트워크** 체크 | Windows 보안 경고 |
| 9 | 폰을 PC와 **같은 Wi-Fi**에 연결 (게스트 망이나 모바일 데이터면 접속되지 않는다) | 폰 |
| 10 | 좌석을 사람 2~3명으로 채워 볼 거라면 **Google 계정 2~3개**를 준비하고 OAuth 동의 화면 테스트 사용자에 모두 추가 | Google Cloud Console |

- OAuth 동의 화면의 **프로덕션 게시는 M5**다. M3에서는 테스트 모드 + 테스트 사용자로 충분하다
- 카카오톡 등 인앱 브라우저로 초대 링크를 열면 Google이 로그인을 막는다. JoinPage의 안내대로 외부 브라우저로 열어야 한다

### 7.4 확인 순서

1. PC 브라우저 `http://localhost:5173` → 로그인 → `/menu` → 방 만들기 → `/lobby/:code` (Display 패널, QR 표시)
2. 폰 카메라로 QR → `/join/:code` → 로그인 → 참가 → `/lobby/:code` (Controller 패널)
3. 폰에서 좌석 선택 → PC 좌석 보드가 즉시 갱신되는지 확인 (스냅샷 왕복)
4. 폰 2대째로 2·3 반복, 남은 좌석은 봇 토글
5. PC에서 시작 → 양쪽이 자리표시자 페이지로 이동하고 서버 로그에 첫 이벤트 진입이 찍히는지 확인
6. 폰을 비행기 모드로 30초 → 봇 대행 전환 확인 → 복귀 시 해제 확인
7. PC 탭을 닫아 Display를 끊고 폰이 잠금 화면이 되는지, 다시 열면 재개되는지 확인

---

## 8. M2 상태·타입에서 확장이 필요한 부분

### 8.1 `SeatState`

| 필드 | 타입 | 근거 | 쓰는 곳 |
|---|---|---|---|
| `userId` | `string \| null` | 아키 §10 | 좌석 바인딩, 재접속 복귀 |
| `connection` | `{ status, disconnectedAt: number \| null }` | 아키 §8 | 봇 대행 전환, 조기 마감 |
| `botTakeover` | `boolean` | 아키 §8 | `isBotControlled` |

### 8.2 `GameState`

| 필드 | 타입 | 근거 |
|---|---|---|
| `room` | `{ hostUserId, displayConnected }` | 아키 §1, §8 |
| `pause` | `{ reason, pausedAt, resumeStep, autoAccumulatedMs }` | 아키 §5.2, §8 |
| `clock.pausedRemainingMs` | `number \| null` | 아키 §5.2 "마감 시각, 또는 일시정지 시 남은 시간" |
| `progress.pausedStepRemainingMs` | `number \| null` | 같음 |

### 8.3 `createGame`과 시작 지점

M2의 `createGame`은 만들자마자 Phase 1 첫 이벤트로 들어간다. M3에서는 **`LOBBY`에서 멈춘다.**

- `lobby.start`가 좌석 구성을 확정하고 첫 이벤트로 진입시킨다
- 영향 범위는 두 곳뿐이다. 시뮬레이터(`playGame`)와 테스트 드라이버(`test/support/gameDriver.ts`)가 시작 직후 `lobby.start`를 한 번 보내면 기존 테스트 343건은 그대로 통과한다
- 좌석 구성 인자(`seatSetupForHumans`)는 로비 없이 상태를 만들 때(시뮬·테스트) 계속 쓴다

### 8.4 투영

| 타입 | 추가 |
|---|---|
| `PublicView` | `lobby: LobbyView \| null`, `pause: PauseView \| null` |
| `LobbyView` | 좌석별 `{ role, isBot, occupied, displayName \| null }`, 시작 가능 여부 |
| `PauseView` | `{ reason, pausedAt }` — 누적 시간은 보내지 않는다(운영 수치) |
| `SeatPrivateView` | `connection`, `botTakeover` — **본인 것만** |

- 다른 좌석의 연결 상태는 공개하지 않는다. 로비에서는 좌석 점유 여부만 보이면 된다 (10절 11번에서 확인받는다)
- 은닉 테스트에 **"Display·좌석 투영 어디에도 `userId`가 없다"** 를 추가한다

### 8.5 `GAME_CONFIG`

- `botTakeoverSeconds`(30)와 `autoPauseLimitMinutes`(5)는 M2에서 이미 넣었다
- 새로 필요한 값은 hello 타임아웃·방 코드 길이·방 보관 기간 3개뿐이고, **룰이 아니라 운영값이라 `SERVER_ENV` 쪽에 둔다** (10절 6번)

---

## 9. 테스트 전략

엔진과 달리 M3의 코드는 시각·소켓·네트워크가 섞인다.
**섞이는 지점마다 인터페이스를 끼워 넣고 테스트에서 가짜를 주입한다.** 엔진이 `Rng`와 `now`를 주입받는 것과 같은 방식이다.

| 계층 | 검증 방법 | 가짜로 바꾸는 것 |
|---|---|---|
| 엔진 (M3-2) | 기존 방식 그대로. `test/support/gameDriver.ts` 사용 | 없음 (이미 순수) |
| room 런타임 (M3-3) | 가짜 `Scheduler`로 시간을 손으로 돌린다. "예약 → 취소 → 늦은 발화" 순서를 재현 | `Scheduler`, `Clock`, 전송 함수 |
| ws 세션 (M3-4) | 실제 소켓 없이 `SocketPort` 가짜에 프레임을 넣고, 나간 프레임을 배열로 모아 본다 | `SocketPort`, `authVerifier` |
| 인증 (M3-5) | `authVerifier` 인터페이스에 대해 테스트. **실제 Supabase는 호출하지 않는다** | `authVerifier`, `roomRepository` |
| REST (M3-5) | Express 앱을 랜덤 포트로 띄우고 Node 내장 `fetch`로 왕복. 테스트 의존성을 늘리지 않는다 | `authVerifier`, `roomRepository` |
| web (M3-6·7) | M3에서는 자동 테스트를 만들지 않는다. 7.4의 실기 확인이 검증이다 | — |

> **원칙:** I/O를 하는 모듈은 **얇게** 만들고 판단을 순수 함수로 밀어낸다.
> `wsSession`은 "누가 무엇을 보낼 수 있는가"만 판단하고, 룰 판단은 전부 엔진에 맡긴다.
> 그래야 M3에서도 테스트가 엔진 테스트만큼 빠르고 결정적이다.

### 9.1 작업 단위별 테스트 목록

**M3-2 — `test/engine/steps/lobbyStep.test.ts`, `pauseStep.test.ts`, `presence.test.ts`**

| # | 검증 | 근거 |
|---|---|---|
| 1 | 좌석 선택·해제·봇 토글이 반영되고, 이미 찬 좌석 선택은 거절된다 | 아키 §7.1 |
| 2 | `lobby.start`는 호스트 Display만 보낼 수 있고, 시작하면 Phase 1 첫 이벤트로 간다 | 아키 §7.1 |
| 3 | 시작 시점에 빈 좌석은 봇이 된다 | 룰북 §1 (10절 8번) |
| 4 | Controller 끊김 30초 뒤 `botTakeover`가 켜지고, 재접속하면 즉시 꺼진다 | 아키 §8 |
| 5 | 봇 대행 좌석의 명령은 거절되고 굴림은 서버가 대신한다 | 아키 §8, 룰북 §11 |
| 6 | 봇 대행 좌석도 100%에서 배신자로 전환한다 | 룰북 §10.1, §11 |
| 7 | 조기 마감은 **연결된 인간** 전원 기준이다 | 아키 §8 |
| 8 | 인간 Controller 0명·Display 끊김·`host.pause` 세 경로가 모두 `PAUSED`로 간다 | 아키 §8 |
| 9 | 정지·재개 뒤 게임 시계와 단계 마감의 **남은 시간이 보존된다** | 아키 §5.2, §8 |
| 10 | 자동 정지 누적이 5분을 넘으면 더 이상 정지하지 않는다 | 아키 §8 |
| 11 | 정지 중 좌석 명령은 거절되고 `host.resume`만 받는다 | 아키 §8 |
| 12 | `host.pause`는 이벤트 사이에서만 받는다 | 아키 §8 |

**M3-3 — `test/room/roomRuntime.test.ts`, `seatBinding.test.ts`**

| # | 검증 |
|---|---|
| 1 | 동시에 들어온 명령 2건이 **도착 순서대로** 처리된다 (부적 선착순) |
| 2 | 새 결과가 나오면 이전 타이머가 취소되고, 취소가 늦어 발화해도 `staleTimer`로 거절된다 |
| 3 | `nextDeadline`이 null이면 타이머를 예약하지 않는다 |
| 4 | 처리 1건마다 대상별 스냅샷이 1회씩, cue는 `audience`가 가리키는 대상에게만 나간다 |
| 5 | 거절은 요청자에게만 나가고 다른 대상에는 아무것도 나가지 않는다 |
| 6 | 같은 userId가 재접속하면 같은 좌석으로 복귀한다 |

**M3-4 — `test/transport/wsSession.test.ts`, `commandCodec.test.ts`**

| # | 검증 |
|---|---|
| 1 | hello 이전의 프레임은 모두 거절된다 |
| 2 | 토큰 검증 실패·없는 방·호스트가 아닌 Display 요청이 각각 다른 사유로 닫힌다 |
| 3 | 깨진 JSON, 모르는 `type`, 필드 타입 불일치가 `unknownCommand`로 거절된다 |
| 4 | Display가 좌석 명령을 보내면 `wrongSeat`으로 거절된다 |
| 5 | `rejected`에 요청의 `seq`가 실린다 |
| 6 | `resync`에 전체 스냅샷 1건으로 답하고 cue는 보내지 않는다 |
| 7 | 같은 (userId, deviceRole)로 다시 접속하면 이전 소켓이 닫힌다 |

**M3-5 — `test/transport/roomsRouter.test.ts`**

| # | 검증 |
|---|---|
| 1 | 토큰 없는 요청은 401이다 |
| 2 | 방 생성이 코드를 돌려주고, 같은 코드가 두 번 발급되지 않는다 |
| 3 | 없는 코드 조회는 404, 이미 시작한 방 참가는 409다 |
| 4 | 실패 응답이 모두 `{ error: { code, message } }` 모양이다 |

**M3-6·M3-7 — 실기 확인 (7.4)**

로드맵의 완료 기준(PC 1대 + 폰 여러 대가 로비에서 시작)을 사람이 직접 확인한다.

---

## 10. 해석이 필요한 항목

> 룰북·아키텍처에 없거나, 아키텍처를 고쳐야 하는 항목이다. **M3 착수 전에 답을 받는다.**

| # | 항목 | 계획의 가정 | 확인받을 것 |
|---|---|---|---|
| 1 | 연결 변화를 엔진에 넣는 방법 | `ACTION_KIND.PRESENCE`를 새로 만든다. 연결 상태가 상태에 남아 세이브·재현·테스트가 기존 방식 그대로가 된다 | 아키 §5.1의 "액션은 두 종류뿐이다"를 세 종류로 고쳐도 되는가 |
| 2 | `REJECTION_REASON`의 위치 | 서버 `engineTypes`에서 shared로 옮긴다. `rejected` 메시지가 값을 그대로 싣고 클라이언트가 분기한다 | M2의 알림·귓속말 종류 이동과 같은 판단이면 승인 |
| 3 | QR 생성 라이브러리 | `qrcode`(또는 동급)를 web에 추가한다. 직접 구현하지 않는다 | **의존성 추가 승인 필요** (CLAUDE.md 작업 규칙 2) |
| 4 | Supabase JWT 검증 방식 | JWKS로 **로컬 검증**한다(`jose` 의존성 1개). 접속마다 Supabase를 호출하지 않아 빠르고 오프라인 테스트가 쉽다 | 로컬 검증(의존성 +1) vs `supabase.auth.getUser(token)`(의존성 0, 네트워크 왕복) 중 어느 쪽인가 |
| 5 | 봇 대행 좌석과 봇 100% 방해 | 적용하지 않는다. 대행 좌석은 인간이라 배신자 전환 경로를 타므로(룰북 §10.1) 방해까지 겹치면 이중 적용이다 | 룰북 §11의 방해가 좌석 구성 기준인지 조작 주체 기준인지 |
| 6 | 운영 설정값 3종 | 방 코드 6자(혼동 문자 제외), hello 타임아웃 10초, 방 보관 기간(마지막 활동 후 6시간) | 룰이 아니므로 `GAME_CONFIG`가 아닌 `SERVER_ENV`에 둔다. 값 자체를 확정받을 것 |
| 7 | 같은 계정·같은 역할로 중복 접속 | 나중 소켓이 이전 소켓을 밀어낸다. 이전 소켓에는 사유를 보내고 닫는다 | 밀어내기 vs 나중 접속 거절 |
| 8 | 좌석을 고르지 않은 인간이 있는 채로 시작 | 시작 시점에 비어 있는 좌석은 자동으로 봇이 된다 (룰북 §1 "빈 좌석은 봇") | 승인이면 로비에 "시작 시 빈 좌석은 봇" 안내만 표시한다 |
| 9 | 로비에서의 좌석 변경·해제 | 시작 전에는 자유롭게 바꾸고 뺄 수 있다 | 승인 여부 |
| 10 | 자동 정지 한도를 넘긴 뒤 | 한도를 넘으면 그 뒤로는 자동 정지를 하지 않는다. 호스트 수동 정지는 계속 가능하다 | 아키 §8의 "초과 시 정지하지 않고 계속 진행"이 **그 회차만**인지 **이후 전부**인지 |
| 11 | 다른 좌석의 연결 상태 공개 | 공개하지 않는다. 로비에서는 점유 여부만 보인다 | 룰북 §17에 없는 항목이다. 방송 재미를 위해 Display에 표시할 여지가 있어 확인이 필요하다 |
| 12 | 좌석 복귀 기준 | userId로 복귀시킨다 (아키 §10). 같은 계정이 다른 기기로 접속하면 기기만 바뀌고 좌석은 유지된다 | 승인 여부 |
| 13 | 자동 저장의 마일스톤 | M5로 미룬다. M3는 Phase 전환 지점에 호출 자리만 비워 둔다 | **문서 간 불일치.** 아키 §6은 자동 저장을 런타임 항목으로 적었고 로드맵은 세이브를 M5에 두었다. 어느 쪽으로 맞출지 |
| 14 | 로비 화면을 Display·Controller로 나누는 방법 | 같은 `/lobby/:roomCode` 라우트에서 **기기 역할**로 패널을 가른다. 화면 폭으로 가르지 않는다 | 아키 §9.2는 로비를 Default 레이아웃 1개로 적었다. 이 해석이 맞는지 |
| 15 | 게임 시작 후 이동 경로 | Display는 `/display/:code`, Controller는 `/play/:code`로 이동하고 M3에서는 두 페이지가 자리표시자다 | 승인 여부 |

---

## 11. 진행 순서와 확인 방법

1. **10절 항목 확인** → 답을 받아 10절에 반영하고 착수한다
2. **7.3의 사람 작업 1~5번**을 먼저 끝낸다. M3-5가 여기에 막힌다
3. **M3-1** → `typecheck -w tal-brothers-shared`, `-w tal-brothers-server`
4. **M3-2** → 엔진 테스트. 기존 343건이 그대로 통과하는지 함께 본다
5. **M3-3** → 런타임 테스트 (가짜 스케줄러)
6. **M3-4** → 세션 테스트 (가짜 소켓)
7. **M3-5** → 서버 기동, `GET /healthz`, REST 왕복 테스트
8. **M3-6** → PC 브라우저로 로그인 → `/menu`까지
9. **M3-7** → 7.4의 확인 순서를 PC·폰으로 끝까지
10. 마지막에 `docs/roadmap.md`의 M3 체크리스트와 진행 상태 표를 갱신하고, 계획과 달라진 결정은 `docs/m3-notes.md`에 남긴다
11. 작업 단위마다 `M3-N: 요약` 형식으로 커밋한다. push는 하지 않는다

각 작업 단위가 끝날 때마다 변경 파일 목록, 테스트·타입 체크 결과 요약, 로드맵 갱신 내용을 보고한다.
