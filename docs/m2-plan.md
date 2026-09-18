# M2 실행 계획 — Phase 2·3, 엔딩, 투영, 봇 자동 대전

> 근거 문서: `rulebook-v3.md`(규칙 원본) > `architecture.md`(구현 설계) > `roadmap.md`(범위)
> 이 문서는 M2-1 ~ M2-7을 한 번에 진행하기 위한 계획이며, 코드는 포함하지 않는다.
> 타입 표기는 설계 스케치이고 최종 파일 작성 시 확정한다.

## 전제

- M1 완료 상태에서 시작한다. Phase 1 엔진(단계 전이, 판정, 개입 창, 변이, 효과, 봇 굴림)은 그대로 쓴다
- `PHASE1_COMPLETE`(M1 임시 종료 단계)를 **Phase 2 진입으로 교체**한다. 상수는 제거한다
- M2 완료 시점에 게임은 **로비 없이도 한 판이 끝까지(엔딩까지) 진행**된다
- 소켓·인증·로비·연결 끊김·일시정지·세이브는 M3 이후다. 모든 좌석은 연결된 상태로 본다
- 화면은 없다. 투영 함수는 만들지만 소비자는 M4다. M2에서는 테스트가 유일한 소비자다
- 룰북에 수치가 없는 항목은 만들지 않는다. 10절에 모아 두고 답을 받은 뒤 진행한다

---

## 1. 작업 단위 분할과 단위별 파일 목록

| 단위 | 내용 | 끝나는 조건 |
|---|---|---|
| M2-1 | shared 상수·명령·투영 타입 확장 | `typecheck -w tal-brothers-shared` 통과 |
| M2-2 | Phase 2·3 시나리오 데이터와 엔딩표 | 데이터 무결성 테스트 통과 |
| M2-3 | 상태 확장과 순수 규칙 (잠식 티어, 배신자, 가짜 정보, 타겟) | 규칙 테스트 통과 |
| M2-4 | Phase 2 단계 처리기 (진입 환청, 슬롯 배치, 14A, 환경 잠식, 부적 상한) | Phase 2 단계 테스트 통과 |
| M2-5 | Phase 3와 엔딩 단계 처리기 (판정 순서 0~4, 대립 판정, 1인 플레이, 타임오버) | Phase 3·엔딩 테스트 통과 |
| M2-6 | 투영과 은닉 테스트 | 은닉 테스트 통과 |
| M2-7 | 봇 자동 대전 CLI와 전체 흐름 테스트 | 수백 판 실행 결과로 §19 설정값 조정 여부 판단 가능 |

### M2-1. shared 상수·명령·투영 타입 확장

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `tal-brothers-shared/src/constants/gameStep.ts` | 수정 | `PHASE2_ENTRY` 추가, `PHASE1_COMPLETE` 제거 |
| `tal-brothers-shared/src/constants/erosionTier.ts` | 생성 | `EROSION_TIER` 4구간 (`NORMAL`/`TIER30`/`TIER60`/`TRAITOR`) — 룰북 §4.3 |
| `tal-brothers-shared/src/constants/endingId.ts` | 생성 | `ENDING_ID` 7종 — 룰북 §15 |
| `tal-brothers-shared/src/constants/phase3Route.ts` | 생성 | `PHASE3_ROUTE` (`PURIFY`=B-1 / `BAIT`=A-1 / `BREAK`=A-2) — 룰북 §14 |
| `tal-brothers-shared/src/constants/cueKind.ts` | 생성 | `CUE_KIND` — **엔진에서 shared로 옮긴다**. 클라이언트가 cue를 분기하려면 공용이어야 한다 |
| `tal-brothers-shared/src/types/command.ts` | 수정 | `talisman.submit` / `talisman.transfer`(대상 좌석) / `talisman.discard` 추가 |
| `tal-brothers-shared/src/types/projection.ts` | 생성 | `DisplaySnapshot`, `SeatSnapshot`과 하위 타입 (7절) |
| `tal-brothers-shared/src/index.ts` | 수정 | 위 전부 re-export |

> `CUE_KIND`를 shared로 옮기면 서버의 `engineTypes.ts`는 `Cue`의 구조(대상·본문)만 들고 종류는 shared에서 읽는다. 값은 바뀌지 않으므로 M1 테스트의 문자열 비교는 그대로 통과한다.

### M2-2. Phase 2·3 시나리오 데이터와 엔딩표

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `src/scenario/constants/effectTarget.ts` | 수정 | `SUBMITTER`, `RANDOM_SEAT`, `ALL_EXCEPT_ROLLER` 추가 (3절) |
| `src/scenario/constants/effectKind.ts` | 수정 | `JADE_HAIRPIN` 추가 |
| `src/scenario/constants/whisperKind.ts` | 수정 | `EVENT_WHISPER`, `TIER_HALLUCINATION`, `SHRINE_FAIL`, `ENTRY_WARNING` 추가 (룰북 §16) |
| `src/scenario/scenarioTypes.ts` | 수정 | `JadeHairpinEffect`, `ItemJudgmentSpec`(14A), `ContestJudgmentSpec`(Phase 3), `ScenarioEvent.isBoss`·`environmentErosion` 플래그 |
| `src/scenario/phase2Events.ts` | 생성 | `PHASE2_BRANCH`(분기), `PHASE2_POOL`(01~14), `PHASE2_BOSS`(15) — 룰북 §13 (3절) |
| `src/scenario/phase3Scene.ts` | 생성 | `PHASE3_SCENE` — B-1, A-1, A-2 선택지와 성공 조건 (5절) |
| `src/scenario/endings.ts` | 생성 | `ENDINGS` — 7종 조건·배신자 승패·연출 에셋 (룰북 §15) |
| `test/scenario/phase2Events.test.ts` | 생성 | 데이터 무결성 (9절) |
| `test/scenario/phase3Scene.test.ts` | 생성 | Phase 3·엔딩 데이터 무결성 |

### M2-3. 상태 확장과 순수 규칙

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `src/engine/state/gameState.ts` | 수정 | 2절의 확장 필드 전부 |
| `src/engine/rules/erosion.ts` | 수정 | 티어 판정, 배신자 회복 제외, 100% 도달 판정 |
| `src/engine/rules/traitor.ts` | 생성 | 100% 전환, 1인 플레이 예외, 전원 배신자 검사, 승패 |
| `src/engine/rules/variant.ts` | 수정 | 60% 티어 가짜 라벨 확정 저장, 옥비녀 보상은 증가 제외 |
| `src/engine/rules/whisper.ts` | 수정 | 귓속말 5종 생성 (이벤트·티어 환청·사당 실패·진입 경고·T2) |
| `src/engine/rules/target.ts` | 생성 | Phase 3 타겟 우선순위, 옥비녀 이동 |
| `src/engine/rules/effects.ts` | 수정 | 새 대상 3종, `jadeHairpin`, 배신자 회복 제외 경유 |
| `src/engine/rules/slots.ts` | 생성 | Phase 2 랜덤 슬롯 배치 (풀에서 7개 비복원 추출, 슬롯 7 보스 고정) |
| `test/engine/rules/` 5개 파일 | 생성·수정 | 9절 참조 |

### M2-4. Phase 2 단계 처리기

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `src/engine/steps/phase2EntryStep.ts` | 생성 | 진입 환청, 슬롯 배치, 부적 보유자/미보유자 분기 |
| `src/engine/steps/eventIntroStep.ts` | 수정 | 티어 환청·가짜 라벨·가짜 붉은 메시지 확정, 13번 발목 대상 지정 |
| `src/engine/steps/votingStep.ts` | 수정 | 부적 초과분 양도·버림 명령 수신 |
| `src/engine/steps/talismanWindowStep.ts` | 생성 | 14A 8초 제출 창, 선착순 1개, 미제출 시 무작위 1명 |
| `src/engine/steps/resolutionStep.ts` | 수정 | 환경 잠식 +5%, 부적 보유 상한 검사, 배신자 전환 검사, Phase 전환 |
| `src/engine/steps/interventionStep.ts` | 수정 | 봇 100% 방해, 첫째 봇 보스 실패 시 강제 성공 |
| `src/engine/bots/botPolicy.ts` | 수정 | 100% 방해 1회, 보스 강제 성공, Phase 3 굴림 |
| `test/engine/steps/phase2Step.test.ts` · `talismanWindowStep.test.ts` | 생성 | 9절 참조 |

### M2-5. Phase 3와 엔딩

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `src/engine/steps/phase3Step.ts` | 생성 | 판정 순서 0~4, 시계 10분 절삭, A 루트 투표, 1인 플레이 분기 |
| `src/engine/steps/rollStep.ts` | 수정 | 대립 판정(상대 주사위), 팀 측 판정자 결정 |
| `src/engine/steps/interventionStep.ts` | 수정 | Phase 3는 팀 측만, 강제 성공 사용 불가 |
| `src/engine/steps/endingStep.ts` | 생성 | 엔딩 판정, 배신자 승패, 1인 내레이션 분기 |
| `src/engine/rules/clock.ts` | 생성 | 타임오버 검사 (Phase 1~2 즉시 중단 / Phase 3 예외) |
| `test/engine/steps/phase3Step.test.ts` · `endingStep.test.ts` | 생성 | 9절 참조 |

### M2-6. 투영

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `src/engine/projection/projectDisplay.ts` | 생성 | Display 화이트리스트 (아키 §7.3) |
| `src/engine/projection/projectSeat.ts` | 생성 | 좌석별 화이트리스트, 배신자·셋째·가짜 라벨 분기 |
| `test/engine/projection/hiding.test.ts` | 생성 | 은닉 테스트 (7절 표) |
| `test/engine/projection/shape.test.ts` | 생성 | 배신자·일반 좌석 투영의 키 목록 동일성 |

### M2-7. 봇 자동 대전과 전체 흐름

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `src/sim/humanPolicy.ts` | 생성 | M1 `playPhase1.ts`의 인간 좌석 랜덤 정책을 공용 모듈로 추출 |
| `src/sim/playGame.ts` | 생성 | 한 판을 엔딩까지 진행하는 가상 시계 루프 (M1 `runPhase1`의 일반화) |
| `src/sim/playPhase1.ts` | 수정 | `playGame`의 Phase 1 전용 출력으로 축소 |
| `src/sim/botMatch.ts` | 생성 | 수백 판 자동 대전 CLI, 지표 집계 (8절) |
| `tal-brothers-server/package.json` | 수정 | `sim:game`, `sim:bots` 스크립트 추가 |
| `test/engine/fullGameFlow.test.ts` | 생성 | 인간 0~3명 구성이 엔딩에 도달, 같은 시드 같은 결과 |
| `test/sim/botMatch.test.ts` | 생성 | 집계 함수의 산술 검증 (적은 판수로) |

---

## 2. M1 상태 타입에서 확장이 필요한 부분

M1은 확장 지점을 주석으로만 남겼다. M2에서 실제로 채우는 필드는 다음과 같다.

### 2.1 `SeatState`

| 필드 | 타입 | 근거 | 쓰는 곳 |
|---|---|---|---|
| `isTraitor` | `boolean` | §10.1 | 회복 제외, 투영, 엔딩 승패, 타겟 우선순위 |
| `botSabotageUsed` | `boolean` | §11 | 봇 100% 방해 게임당 1회 |
| `hasJadeHairpin` | `boolean` | §9.3 | 비소모성이라 개수가 아니라 보유 여부 |
| `talismanOverflow` | `number` | §9.1 | 상한 2를 넘겨 받은 초과분. 양도·버림 전까지 인벤토리 밖에 둔다 |

- `abilityUsed`, `erosionPercent`, `talismanCount`, `whispers`는 그대로 쓴다
- `tutorialTalismanCount`는 Phase 1 전용이라 그대로 둔다

### 2.2 `CurrentEventState`

| 필드 | 타입 | 근거 |
|---|---|---|
| `fakeLabels` | `Partial<Record<BrotherRole, Record<string, VariantKind>>>` | §4.3 60% 티어. **이벤트 진입 시 확정 저장** (아키 §2 원칙 4) |
| `grabbedSeat` | `BrotherRole \| null` | §13.5 13번 발목 대상 |
| `talismanSubmittedBy` | `BrotherRole \| null` | §13.5 14A 선착순 제출자 |
| `environmentErosionApplied` | `boolean` | §4.2 랜덤 이벤트 종료 시 1회만 |

### 2.3 `JudgmentState`

| 필드 | 타입 | 근거 |
|---|---|---|
| `opponentDie` | `DiceRoll \| null` | §14 대립 판정의 배신자 측 주사위. 개입 대상이 아니다 |
| `contest` | `boolean` | 동점이면 배신자 승 (팀 최종값 **>** 상대값) |
| `teamSeats` | `BrotherRole[]` | A-2의 "타겟 제외 전원" 등 팀 측 구성을 고정 저장 |

### 2.4 `GameState`

| 필드 | 타입 | 근거 |
|---|---|---|
| `progress.slotOrder` | `string[]` | Phase 2 진입 시 확정한 슬롯 배치. `eventOrder`를 Phase마다 교체한다 |
| `phase3` | `{ targetSeat, route, jadeHairpinMovedTo, soloPlayTargetIsSelf } \| null` | §14 |
| `ending` | `{ id, traitorWon, narrationKey } \| null` | §15 |
| `clock.expiredAt` | `number \| null` | §2.1 타임오버 시점. Phase 3는 0을 지나도 진행하므로 "지난 시각"을 남긴다 |

### 2.5 `GAME_CONFIG`

값은 이미 M1에서 전부 정의했다(룰북 §19 전 항목). M2에서 **새로 읽기 시작**하는 값은 다음과 같고, 새로 추가하는 값은 없다.

`environmentErosionPercent`, `phase2EntryNoTalismanPercent`, `phase3TargetThresholdPercent`, `phase3TruncateMinutes`, `talismanWindowSeconds`, `redMessageSeconds`, `talismanLimit`, `coopBossThreshold`, `tier30HallucinationChance`, `tier30TruthRatio`, `tier60FakeLabelChance`, `fakeRedMessageChance`

---

## 3. Phase 2를 효과 모델로 옮긴 결과

### 3.1 효과 모델 확장

| 추가 | 값 | 이유 |
|---|---|---|
| `EFFECT_TARGET.SUBMITTER` | `'submitter'` | 14A 제출자 잠식 -15% |
| `EFFECT_TARGET.RANDOM_SEAT` | `'randomSeat'` | 14A 미제출 시 무작위 1명 +10% (봇 포함) |
| `EFFECT_TARGET.ALL_EXCEPT_ROLLER` | `'allExceptRoller'` | 15B 성공 "판정자 제외 전원 -10%" |
| `EFFECT_KIND.JADE_HAIRPIN` | `'jadeHairpin'` | 분기 B 성공 보상. `isBoostableReward`가 false를 돌려주므로 길 변이는 페널티 감소로 대체된다 (§6.2) |
| `WHISPER_KIND.EVENT_WHISPER` | `'eventWhisper'` | 02A·05A·14B — 무작위 다른 형제 1명의 잠식 구간 |
| `WHISPER_KIND.TIER_HALLUCINATION` | `'tierHallucination'` | 30%·60% 티어 환청 |
| `WHISPER_KIND.SHRINE_FAIL` | `'shrineFail'` | 분기 B 실패, 거짓 100% |
| `WHISPER_KIND.ENTRY_WARNING` | `'entryWarning'` | Phase 2 진입 환청 중 부적 보유자 |

> 아키텍처 §5.4의 효과 분류표에 `jadeHairpin`과 새 대상 3종을 반영한다.

### 3.2 진입 환청 (룰북 §13.1)

**선택지가 없어 `ScenarioEvent`로 두지 않고 `PHASE2_ENTRY` 단계 처리기가 직접 적용한다** (10절 1번).

| 대상 | 처리 |
|---|---|
| 부적 보유자 (봇 포함) | `WHISPER_KIND.ENTRY_WARNING` 귓속말 1건. 부적 소모 없음, 잠식 변화 없음 |
| 부적 미보유자 (봇 포함) | 잠식 `+phase2EntryNoTalismanPercent`(20%), 1명당 팀 플래그 -1 (익명, 하한 -2) |

- 튜토리얼 부적은 T1에서 소멸했으므로 판정 대상은 `talismanCount`뿐이다
- 디버프는 `addTeamModifier`를 미보유자 수만큼 반복 호출해 하한 -2가 자동으로 걸리게 한다
- 같은 단계에서 **슬롯 배치**를 확정해 `progress.eventOrder`에 쓴다

### 3.3 분기 (룰북 §13.2) — `branch`

`variantApplied: true` · `environmentErosion: false` · 배경은 A `BG_DANGSAN_FOREST` / B `BG_BLOODY_SHRINE`

| 선택지 | 판정 | 기준 | 성공 효과 | 실패 효과 |
|---|---|---|---|---|
| `branch-a` 오솔길로 돌아간다 | 없음 | — | `resolve: [{penalty, timeDelta, -15분}]` | — |
| `branch-b` 핏빛 사당을 가로지른다 | solo agility | 5 | `[{reward, jadeHairpin, roller}]` `[{sideEffect, erosion, all, +10}]` | `[{penalty, erosion, roller, +20}]` `[{penalty, whisper, randomSeat, shrineFail, truthful: false}]` |

**변이 검산 (§6.2)**

| 선택지 | 흉 | 길 |
|---|---|---|
| `branch-a` | 시간 -20분 | 시간 -10분 |
| `branch-b` | 기준 6, 실패 +30% | 옥비녀는 증가 불가 → 실패 **+10%** |

**강제 성공 검산 (§3.2 표):** `reward`(옥비녀) 제거, `sideEffect`(전원 +10%) 유지 → "옥비녀 없음, 전원 +10% 적용" ✔

### 3.4 랜덤 이벤트 풀 01~14

공통: `phase: PHASE_2` · `variantApplied: true` · `environmentErosion: true` · 배경 `BG_DANGSAN_FOREST`(07은 `BG_BLOODY_SHRINE`)
효과 표기는 `{분류, 종류, 대상, 값}`이고, 잠식 값은 %다.

| 이벤트 | 선택지 | 판정/기준 | 성공 | 실패 |
|---|---|---|---|---|
| `p2-01` 울부짖는 아귀탈 (탈 `MASK_COMMON_A`) | `a` 탐욕 | solo agility 4 | `{reward, talisman, roller, 1}` | `{penalty, erosion, roller, +15}` |
| | `b` 돌파 | solo strength 4 | `[]` | `{penalty, erosion, roller, +20}` |
| | `c` 우회 | 없음 | `resolve: {penalty, timeDelta, -5분}` | — |
| `p2-02` 핏물 고인 우물 | `a` 의심 | hidden knowledge 4 | `{reward, whisper, roller, eventWhisper, truthful: true}` | `{penalty, whisper, roller, eventWhisper, truthful: false}` |
| | `b` 신뢰 | 없음 | `resolve: {penalty, timeDelta, -5분}` | — |
| `p2-03` 목을 매단 광대 (탈 `MASK_CLOWN`) | `a` 탐색 | solo agility 4 | `{reward, talisman, roller, 1}` | `{penalty, erosion, roller, +20}` |
| | `b` 합심 | coop 5 | `{reward, erosion, all, -5}` | `{penalty, erosion, all, +10}` |
| `p2-04` 길을 막는 상여 | `a` 돌파 | solo strength 4 | `[]` | `{penalty, erosion, roller, +20}` |
| | `b` 예의 | solo knowledge 4 | `{reward, talisman, roller, 1}` | `{penalty, erosion, roller, +15}` |
| | `c` 우회 | 없음 | `resolve: {penalty, timeDelta, -10분}` | — |
| `p2-05` 속삭이는 도깨비불 | `a` 도청 | hidden agility 4 | `{reward, whisper, roller, eventWhisper, truthful: true}` | `{penalty, whisper, roller, eventWhisper, truthful: false}` |
| | `b` 무시 | 없음 | `resolve: {penalty, timeDelta, -5분}` | — |
| `p2-06` 끊어진 금줄 | `a` 봉인 | coop 5 | `{reward, erosion, all, -10}` | `{penalty, erosion, all, +15}` |
| | `b` 회피 | solo agility 4 | `[]` | `{penalty, erosion, roller, +20}` |
| `p2-07` 버려진 성황당 (배경 `BG_BLOODY_SHRINE`) | `a` 정화 | solo knowledge 5 | `{reward, erosion, all, -15}` | `{penalty, erosion, roller, +25}` |
| | `b` 탐색 | solo agility 4 | `{reward, talisman, roller, 1}` | `{penalty, erosion, roller, +15}` |
| `p2-08` 환각 속의 어머니 | `a` 통찰 | solo knowledge 4 | `{reward, erosion, roller, -10}` | `{penalty, erosion, roller, +20}` |
| | `b` 절단 | solo strength 4 | `[]` | `{penalty, erosion, roller, +15}` |
| `p2-09` 목 없는 벅수 | `a` 위로 | coop 5 | `{reward, talisman, coopTopRoller, 1}` | `{penalty, erosion, all, +15}` |
| | `b` 차단 | solo knowledge 4 | `[]` | `{penalty, erosion, roller, +20}` |
| `p2-10` 춤추는 무당탈 (탈 `MASK_COMMON_B`) | `a` 동조 | solo agility 4 | `{reward, erosion, roller, -10}` | `{penalty, erosion, roller, +20}` |
| | `b` 파괴 | solo strength 4 | `[]` | `{penalty, erosion, roller, +15}` |
| `p2-11` 짙어지는 핏빛 안개 | `a` 탈출 | solo strength 4 | `[]` | `{penalty, erosion, roller, +20}` `{penalty, timeDelta, -5분}` |
| | `b` 은거 | 없음 | `resolve: {penalty, timeDelta, -15분}` | — |
| `p2-12` 두 갈래의 짐승 길 | `a` 추적 | solo agility 4 | `[]` | `{penalty, erosion, roller, +15}` |
| | `b` 점술 | solo knowledge 4 | `{reward, talisman, roller, 1}` | `{penalty, erosion, roller, +20}` |
| `p2-13` 원귀의 손아귀 | `a` 완력 | solo strength 4 | `[]` | `{penalty, erosion, roller, +20}` |
| | `b` 구출 | coop 5 | `{reward, erosion, all, -5}` | `{penalty, erosion, all, +10}` |
| `p2-14` 찢어진 탈 조각 | `a` 봉인 | **item** (판정 없음) | `submit: {reward, erosion, submitter, -15}` | `fail: {penalty, erosion, randomSeat, +10}` |
| | `b` 사이코메트리 | hidden knowledge 4 | `{reward, whisper, roller, eventWhisper, truthful: true}` | `{penalty, whisper, roller, eventWhisper, truthful: false}` |

**주의할 검산**

- `p2-11a`의 시간 페널티는 **판정 선택지의 실패 효과**다. 룰북 §6.2 "실패 시 시간 페널티(11A)는 불변"에 따라 흉·길 가감 대상이 아니다. M1 구현의 `shiftTimePenalty`는 판정 없는 선택지에만 적용되므로 **코드 변경 없이 만족한다**
- `p2-13`의 발목 대상은 이벤트 진입 시 무작위로 뽑아 `grabbedSeat`에 저장하고 Display에 공개한다. 효과 대상으로는 쓰지 않는다 (10절 8번)
- `p2-14`는 `variantApplied` 대상이지만 **A만 변이 미적용**이다. 룰북 §6.3은 "14A 선택지"를 예외로 적었으므로, 변이는 선택지 단위로 끄는 플래그(`Choice.variantExempt`)를 둔다
- 회복(`erosion` 음수)은 길 변이에서 +5%p 되고, 배신자에게는 적용하지 않는다 (§13.4, §4.4)

### 3.5 보스 `p2-15` (슬롯 7 고정, 탈 `MASK_BOSS`)

`isBoss: true` · `environmentErosion: true` · `variantApplied: true`

| 선택지 | 판정 | 기준 | 성공 | 실패 |
|---|---|---|---|---|
| `p2-15-a` 총력전 | coop | **6** (`coopBossThreshold`) | `{reward, talisman, coopTopRoller, 2}` | `{penalty, erosion, all, +25}` |
| `p2-15-b` 희생 | solo strength | 5 | `{reward, erosion, allExceptRoller, -10}` | `{penalty, erosion, roller, +30}` |

- B의 판정자는 룰북 §13.5에서 "항상 첫째 좌석"이고, 속성이 근력/보호라 `rollerSeatFor`가 이미 첫째를 돌려준다. **별도 필드를 만들지 않는다**
- A에 첫째 강제 성공을 쓰면 `reward`(부적 2개)가 제거되고 통과만 남는다 (§3.2 표) ✔
- 실패 시 "추격받으며 통과"는 서사이므로 효과가 없다 (10절 10번)
- 첫째 봇은 **보스 실패 시에만** 강제 성공을 쓴다 → `shouldBotForceSuccess(event.isBoss, judgment)`로 바뀐다

### 3.6 슬롯 배치 (룰북 §13.3)

```
eventOrder(Phase 2) = [ 'branch', s1, s2, s3, s4, s5, s6, 'p2-15', s8 ]
  s1..s6, s8 ← PHASE2_POOL(01~14)에서 7개 비복원 추출
```

- 추출은 `PHASE2_ENTRY` 진입 시 1회, 주입된 rng로 수행하고 `progress.eventOrder`에 확정 저장한다
- 환경 잠식은 `environmentErosion: true`인 8개 이벤트에만 적용한다. `branch`는 제외 (§4.2)

---

## 4. 배신자·잠식 티어·가짜 정보의 상태 저장 방식

원칙: **가짜 정보는 발생 시점에 확정해 상태에 저장한다** (아키 §2 원칙 4). 전송할 때마다 새로 굴리면 재접속 시 값이 바뀌어 가짜가 들킨다.

### 4.1 배신자 (룰북 §10)

| 항목 | 저장 위치 | 처리 |
|---|---|---|
| 전환 | `seat.isTraitor` | 잠식도가 100%에 **도달하는 순간** 검사. 검사 지점은 잠식을 바꾼 직후 한 곳(`applySeatErosion`)으로 모은다 |
| 전환 연출 | 상태에 남기지 않고 cue | 붉은 메시지 cue 1건 (3초). 진짜·가짜가 **같은 cue 형식**을 쓴다 (아키 §7.2) |
| 1인 플레이 예외 | `phase3.soloPlayTargetIsSelf`와 무관 | 인간이 1명이면 전환하지 않고 §11의 봇 100% 방해 효과를 본인에게 적용한다 |
| 회복 제외 | `isTraitor` | `applySeatErosion`이 음수 델타를 무시한다. 로그·알림에 남기지 않는다 (§4.4) |
| 정보 우위 | 투영에서 분기 | 상태에는 아무것도 더 넣지 않는다. `projectSeat`가 `isTraitor`면 진짜 변이를 넣는다 |
| 전원 배신자 | 파생 계산 | 인간 좌석이 2명 이상이고 전원 `isTraitor`면 즉시 강제 잠식 엔딩 (§10.3) |
| 승패 | `ending.traitorWon` | 엔딩표(§15)에서 읽어 저장한다 |

- 봇은 배신자가 되지 않는다. 100%에 도달하면 `botSabotageUsed`로 방해 1회만 쓴다 (§11)

### 4.2 잠식 티어 (룰북 §4.3)

티어는 **저장하지 않고 잠식도에서 파생**한다(`tierOf(percent)`). 티어가 만들어내는 **결과물만** 저장한다.

| 결과물 | 저장 위치 | 확정 시점 | 진실 여부 |
|---|---|---|---|
| 30% 티어 환청 | `seat.whispers` | 랜덤 이벤트 **시작 시**. 확률 50%, 진실 30% | 생성 시 굴려 문장까지 확정 |
| 60% 티어 환청 | 같음 | 같음. 확률 100% | 같음 |
| 가짜 흉/평/길 라벨 | `currentEvent.fakeLabels[seat]` | 이벤트 진입 시. 확률 30% | 선택지별 라벨을 통째로 확정 저장 |
| 가짜 붉은 메시지 | cue 1건 + `currentEvent`에 발동 좌석 기록 | 이벤트 시작 시. 확률 20% | 진짜와 같은 형식 |

- 환청 내용은 `{ aboutSeat, tier }`를 `ReceivedWhisper.payload`에 함께 저장한다. 문장을 다시 파싱하지 않기 위해서다 (M1의 `t2Variant`와 같은 방식)
- 거짓이면 실제 구간을 제외한 나머지 구간 중 무작위 1개를 고른다 (T2 귓속말과 같은 규칙)
- 셋째의 절대 시야는 **가짜 라벨을 무시하고 항상 진짜**를 준다 (§3.4)

### 4.3 귓속말 5종 (룰북 §16)

| 종류 | 예약 시점 | 발송 시점 | 진실 여부 |
|---|---|---|---|
| `t2Variant` | T2-2 판정 직후 | 이장 변이 결정 직후 | 판정 성공 = 진실 (M1 구현 유지) |
| `eventWhisper` | 02A·05A·14B 판정 직후 | 같은 이벤트 `RESOLUTION` | 판정 성공 = 진실 |
| `tierHallucination` | — | 랜덤 이벤트 시작 시 즉시 | 30% 티어는 진실 30%, 60% 티어도 같은 비율 |
| `shrineFail` | 분기 B 실패 시 | **다음 이벤트 시작 시** | 거짓 100% (§13.2) |
| `entryWarning` | — | Phase 2 진입 시 즉시 | 정보 없음 |

- 예약이 필요한 것(`t2Variant`, `shrineFail`)만 `pendingWhispers`를 쓴다. 나머지는 발생 즉시 생성·저장한다
- Display에는 항상 "누군가에게 속삭임이 전달되었다"만 남긴다 (§16, §17)

---

## 5. Phase 3와 엔딩

### 5.1 판정 순서 0~4 (룰북 §14.1) — `P3_TARGETING` 단계의 진입 처리

```
0. 타겟 지정
   후보 = 잠식도 ≥ 30%인 좌석(봇 포함)
   최고값 1명. 동점 우선순위: 인간 배신자 > 봇 > 기타 인간, 같은 순위 안에서만 rng
   타겟이 옥비녀 보유자면 → 타겟 제외 좌석 중 잠식도 최저 1명에게 이동 (동점 rng)
1. 인간이 2명 이상이고 전원 배신자 → ENDING(강제 잠식)
2. 타겟 없음 → ENDING(무사귀환). 옥비녀는 쓰지 않는다
3. 옥비녀 보유자 존재 → route=PURIFY, 투표 없이 즉시 ROLL_WAIT (시계 절삭 없음)
4. 그 외 → route 미정, 시계 10분 절삭 후 P3_VOTING
```

- 0번은 1~4번 **전에** 실행한다. 2번(타겟 없음)이면 옥비녀 이동도 일어나지 않아야 하므로, 이동은 "타겟이 있고 그 타겟이 보유자일 때"로 한정한다
- 타겟과 옥비녀 이동은 Display에 공개한다 (§17)
- `phase3.route`, `phase3.targetSeat`, `phase3.jadeHairpinMovedTo`를 상태에 남긴다

### 5.2 대립 판정 (룰북 §14.3, §14.4)

`JudgmentSpec`에 `contest` 종류를 추가한다. 판정 계산은 기존 경로를 그대로 쓰고 **비교 방식만** 갈라진다.

| 상황 | 팀 측 값 | 성공 조건 |
|---|---|---|
| B-1, 타겟이 인간 배신자 | 옥비녀 보유자 최종값 | 팀 값 **>** 배신자 D6 |
| B-1, 타겟이 봇 또는 배신자 아닌 인간 | 같음 | 팀 값 ≥ 4 (`thresholdBase`) |
| A-2, 타겟이 인간 배신자 | 타겟 제외 전원의 최고값 | 팀 값 **>** 배신자 D6 |
| A-2, 그 외 | 같음 | 팀 값 ≥ 5 (`thresholdHard`) |

- **동점은 배신자 승**이므로 `>`이고 `≥`가 아니다. 테스트로 고정한다
- 배신자 측 주사위는 `judgment.opponentDie`에 담고 `ROLL_WAIT` 진입 즉시 서버가 굴린다. 재굴림·부적 대상이 아니다
- 직업 보정 없음. 남은 버프/디버프는 팀 측 값에 적용 (§14.2)
- 개입 창은 팀 측이 졌을 때만 열리고 **강제 성공은 사용 불가** → `canForceSuccess`에 `phase === PHASE_3` 차단을 추가한다
- 타겟이 봇이거나 배신자가 아니면 고정 기준이므로 `opponentDie`는 `null`이다

### 5.3 A 루트 투표 (룰북 §14.4)

| 항목 | 처리 |
|---|---|
| 시계 | 진입 시 남은 시간 > 10분이면 10분으로 절삭. 10분 미만이면 그대로 |
| 마감 | **투표 마감 = 시계 0.** 단계 마감 시각을 `clock.deadlineAt`으로 둔다 |
| 조기 마감 | 타겟 본인을 포함한 인간 전원이 투표하면 즉시 마감 |
| 유효표 0 | 시계 0 시점에 0표면 **강제 잠식 엔딩** (기권 무작위 채택 규칙을 쓰지 않는다) |
| 동률 | 랜덤 |

### 5.4 1인 플레이 규칙 (룰북 §14.5)

인간이 1명이고 그 좌석이 타겟이면 `phase3.soloPlayTargetIsSelf = true`로 두고 다음을 적용한다.

| 항목 | 처리 |
|---|---|
| 타겟 성격 | 배신자 모드가 없으므로 **배신자가 아닌 인간 타겟**으로 본다 → 고정 기준 경로 |
| B-1 | 옥비녀가 본인에게 있으면 잠식 최저 봇에게 이동. 봇이 굴리고 기준 4. 실패 시 본인은 팀 측으로 개입 가능(부적, 둘째면 재굴림) |
| A-1 | **선택지에서 제외**한다. 투영 단계가 아니라 이벤트 구성 단계에서 뺀다 |
| A-2 | 선택지 1개로 투표를 유지한다. 텍스트를 §14.5의 전용 문장으로 교체 |
| A-2 굴림 | 타겟 제외 전원 = 봇 2명. 기준 5 |
| 개입 | 본인 주사위가 없으므로 둘째 재굴림은 자동으로 불가(재굴림 대상 주사위가 없음). 부적은 가능 |
| 유효표 0 | 누르지 않으면 강제 잠식 엔딩 |
| 엔딩 | A-2 성공은 "탈출: 결별" 대신 전용 내레이션 (`ending.narrationKey`) |

### 5.5 엔딩 (룰북 §15) — `ENDINGS`

| `ENDING_ID` | 조건 | 배신자 | 연출 에셋 |
|---|---|---|---|
| `PURIFY` 진엔딩: 정화 | B-1 성공 | 패배 | 옥비녀, 피눈물 장승 |
| `SAFE_RETURN` 굿엔딩: 무사귀환 | Phase 3 진입 시 타겟 없음 | 존재 불가 | 피눈물 장승 |
| `ESCAPE_PARTING` 탈출: 결별 | A-2 성공 | 패배 | 피눈물 장승 |
| `TRAGIC_ESCAPE` 비극적 탈출 | A-1 채택 | 패배 | 요괴화 탈(버린 형제가 배신자일 때) |
| `ANNIHILATION` 전멸 | A-2 실패 | 승리 | 요괴화 탈 |
| `ETERNAL_MAZE` 영원한 미로 | B-1 실패 | 승리 | 요괴화 탈 |
| `FORCED_EROSION` 강제 잠식 | 타임오버 / Phase 3 유효표 0 / 인간 전원 배신자 | 승리 | 요괴화 탈, 노이즈 |

### 5.6 타임오버 (룰북 §2.1, §14.2)

- Phase 1~2: 시계가 0이 되면 **즉시** 강제 잠식 엔딩. 진행 중인 판정·개입 창을 중단한다
- 검사 지점은 타이머 만료 처리의 **맨 앞** 한 곳으로 모은다(`rules/clock.ts`). 단계마다 흩어 놓지 않는다
- 시간 페널티로 시계가 0 아래로 내려갈 수 있다. `RESOLUTION`에서 효과를 적용한 직후에도 검사한다
- Phase 3는 예외다. 시계가 0을 지나도 판정과 개입 창을 끝까지 진행한다
- M1의 "로그만 남기고 진행"은 제거한다

---

## 6. 단계 전이표 변경분

M1 전이표(`m1-plan.md` 5절)는 그대로 두고, 아래만 새로 생기거나 바뀐다.

```
… RESOLUTION(Phase 1 마지막) → PHASE2_ENTRY
PHASE2_ENTRY → EVENT_INTRO(branch) → … → EVENT_INTRO(슬롯 8) → RESOLUTION → P3_TARGETING
P3_TARGETING → ENDING | ROLL_WAIT(B-1) | P3_VOTING
P3_VOTING → ENDING(A-1) | ROLL_WAIT(A-2)
14A:  VOTING → TALISMAN_WINDOW(8초) → RESOLUTION
모든 타이머 만료 앞: 시계 0 검사 → ENDING(강제 잠식)   ※ Phase 3 제외
```

| 단계 | 진입 처리 | 받는 명령 | 타이머 만료 |
|---|---|---|---|
| `PHASE2_ENTRY` | 슬롯 배치 확정, 진입 환청 적용(3.2) | 없음 | `EVENT_INTRO`(첫 이벤트 = `branch`) |
| `TALISMAN_WINDOW` | 8초 고정 (`talismanWindowSeconds`) | `talisman.submit`(보유자, 선착순 1개 → 즉시 종료) | 미제출이면 무작위 1명 +10%, `RESOLUTION` |
| `P3_TARGETING` | 5.1의 0~4번 | 없음 | 즉시 전이(타이머 없음) |
| `P3_VOTING` | 시계 10분 절삭, 마감 = 시계 0 | `vote.submit`(타겟 포함 인간 전원) | 유효표 0이면 강제 잠식, 아니면 채택 |
| `ENDING` | 엔딩 확정, 승패 계산 | 없음 | 없음 (종료 상태) |

- `EVENT_INTRO` 진입 처리에 **티어 환청 발송 · 가짜 라벨 확정 · 가짜 붉은 메시지 · 13번 발목 대상**이 추가된다 (랜덤 이벤트에 한정)
- `RESOLUTION`에 **환경 잠식 · 부적 상한 검사 · 배신자 전환 검사 · Phase 전환**이 추가된다
- `VOTING`이 `talisman.transfer` / `talisman.discard`를 받는다 (10절 3번)

---

## 7. 투영 함수와 은닉 테스트

### 7.1 투영 타입 (shared)

```
DisplaySnapshot = {
  stateVersion, phase, step, stepDeadlineAt, clockDeadlineAt,
  background, mask,
  narration, choices: { id, text, judgmentKind, attribute, hiddenCost }[],
  vote: { participantCount } | { counts },        // 마감 전/후
  dice: { seat, value }[] | 'done',               // 비공개 판정은 'done'
  judgment: { finalValue, threshold, succeeded } | null,
  notices: { kind, text }[],                      // 익명 디버프·저주 포함
  phase3: { targetSeat, jadeHairpinMovedTo } | null,
  ending: { id } | null,
}

SeatSnapshot = DisplaySnapshot의 공개 항목
  + { erosionPercent, talismanCount, hasJadeHairpin, talismanOverflow,
      whispers: { kind, text }[], myVote, variantLabels: Record<choiceId, VariantKind> | null }
```

- **화이트리스트로 새 객체를 만든다.** 상태를 복사한 뒤 지우는 방식은 쓰지 않는다 (아키 §2 원칙 3)
- `variantLabels`는 배신자·셋째(능력 사용)면 진짜, 60% 티어면 확정 저장된 가짜, 그 외에는 `null`
- **`isTraitor`는 어떤 스냅샷에도 넣지 않는다.** 전환은 cue로만 알린다 (아키 §7.3)
- 배신자 좌석과 일반 좌석의 스냅샷은 **키 목록이 같아야** 한다. 구조 차이로 정체가 드러나면 안 된다

### 7.2 은닉 테스트 목록

| # | 검증 | 근거 |
|---|---|---|
| 1 | Display 투영에 잠식도 필드가 없다 | §4.1, §17 |
| 2 | Display 투영에 인벤토리·귓속말·변이 필드가 없다 | §17 |
| 3 | 좌석 투영에 **다른 좌석의** 잠식도·인벤토리가 없다 | §17 |
| 4 | 좌석 투영에 다른 좌석이 받은 귓속말이 없다 | §16 |
| 5 | 어떤 투영에도 `isTraitor`가 없다 | §10.2, 아키 §7.3 |
| 6 | 배신자 좌석과 일반 좌석 투영의 **키 목록이 완전히 같다** | 아키 §7.3 |
| 7 | 비공개 판정은 Display·판정자 모두 주사위와 성패를 받지 못한다 | §5.4 |
| 8 | 비공개 판정의 **대가 표기는** 모든 투영에 남는다 (수치 비공개의 유일한 예외) | §5.4 |
| 9 | 투표 마감 전에는 참여 인원 수만, 마감 후에는 득표 수만 나가고 **투표자는 끝까지 나가지 않는다** | §8, 아키 §8 |
| 10 | 0~29% 좌석의 `variantLabels`는 `null` | §6.4 |
| 11 | 60~99% 좌석의 가짜 라벨은 **같은 상태에서 두 번 투영해도 같다** (확정 저장 검증) | 아키 §2 원칙 4 |
| 12 | 배신자·셋째(능력 사용)의 `variantLabels`는 실제 변이와 일치한다 | §3.4, §10.2 |
| 13 | 셋째가 60% 이상이어도 능력 사용 시 **진짜**를 본다 | §3.4 |
| 14 | 진짜·가짜 붉은 메시지 cue의 **형식과 표시 시간이 같다** | §10.1, 아키 §7.2 |
| 15 | 시나리오 수치(성공 기준·보상·페널티)가 투영에 들어가지 않는다 | 아키 §2 원칙 2 |
| 16 | Phase 3 타겟·옥비녀 이동은 Display에 공개된다 | §17 |
| 17 | 익명 디버프·익명 저주에 출처 좌석이 들어가지 않는다 | §5.5, §13.5 |
| 18 | 상태에 필드를 새로 추가해도 투영이 자동으로 커지지 않는다 (키 목록 고정 테스트) | 아키 §2 원칙 3 |

---

## 8. 봇 자동 대전 CLI

`npm run sim:bots -w tal-brothers-server -- --games 300 --seed 1 --humans 0`

### 8.1 수집 방법

- 한 판을 `playGame`으로 끝까지 돌리고, **판마다 `MatchSummary` 1건**을 만든다
- 원자료는 **상태 스냅샷 + 엔진 로그의 구조화된 `data`**에서만 읽는다. 로그 문장을 파싱하지 않는다
- 이를 위해 추가하는 로그 코드: `PHASE_ENTERED`, `ENVIRONMENT_EROSION`, `TRAITOR_TURNED`, `TALISMAN_GAINED`/`TALISMAN_SPENT`, `TARGET_SELECTED`, `CONTEST_RESOLVED`, `ENDING_DECIDED`, `CLOCK_TIMEOUT`
- `PHASE_ENTERED` 시점에 좌석 상태를 통째로 찍어 **Phase 2 종료 시 잠식도**를 뽑는다
- 시드는 `--seed`부터 1씩 올려 판마다 다르게 준다. 같은 `--seed`·`--games`면 결과가 완전히 재현된다

```
MatchSummary = {
  seed, humans,
  endingId, traitorWon,
  erosionAtPhase2End: Record<BrotherRole, number>,
  traitorCount, traitorTurnedAt: { seat, eventId }[],
  clockRemainingMs, timedOut,
  eventsPlayed: string[],                 // 슬롯 배치 검증용
  judgments: { kind, succeeded, forced, interventions }[],
  talisman: { gained, spentForRoll, spentForHeal, overflowDiscarded },
  variants: Record<VariantKind, number>,
}
```

### 8.2 출력 지표

| 지표 | 형태 | 왜 보는가 |
|---|---|---|
| Phase 2 종료 시 잠식도 | 평균·중앙값·10% 구간 히스토그램 | **최우선 검증 대상.** 룰북 §19 주석의 "50~70% 안착" 확인 |
| 배신자 발생 수 | 0/1/2/3명 비율, 판당 평균 | "판마다 0~1명" 확인 |
| 배신자 발생 시점 | 이벤트 슬롯별 분포 | 너무 이르면 Phase 2 중반이 무너진다 |
| 엔딩 분포 | 7종 비율 | 특정 엔딩 쏠림 확인 |
| 타임오버 비율·잔여 시간 | 비율, 분 단위 분포 | 게임 시계 100분이 맞는지 |
| 판정 성공률 | 유형별(개인/협동/비공개/대립), 변이별 | 기준 4~6과 변이 폭 확인 |
| 개입 사용률 | 수단별 사용 수, 성공 전환율 | 개입 창 4초가 의미 있는지 |
| 부적 경제 | 획득·판정 사용·회복 사용·초과 폐기 수 | 상한 2개와 회복 -10%가 맞는지 |
| 변이 실제 비율 | 흉/평/길 | 30/50/20 난수 검산 |

- 출력은 한국어 표 1장 + `--json` 옵션 시 `MatchSummary[]` 원자료 덤프
- **인간 0명 구성은 투표가 항상 3분 만료**라 시계 소모가 최대가 된다. 타임오버 비율은 상한으로 읽고, 조기 마감이 섞인 값은 `--humans 1~3`(M1 인간 정책 재사용)으로 따로 본다 (10절 12번)

---

## 9. 작업 단위별 테스트 목록

### M2-1 — 테스트 파일 없음

`typecheck -w tal-brothers-shared` 통과로 확인한다.

### M2-2 — `test/scenario/phase2Events.test.ts`, `phase3Scene.test.ts`

| # | 검증 | 근거 |
|---|---|---|
| 1 | 풀 01~14가 14개, 보스 1개, 분기 1개. id 중복 없음 | §13.5 |
| 2 | 이벤트 내 선택지 id 중복 없음, 모든 효과에 분류가 있음 | 아키 §5.4 |
| 3 | `solo`/`hidden`에 속성 태그 존재, `coop`에는 없음 | §5.2 |
| 4 | 협동 기준이 일반 5 / 보스 6 | §5.3 |
| 5 | 개인 기준이 4 또는 5 | §19 |
| 6 | 풀의 모든 이벤트가 `environmentErosion: true`, `branch`는 false | §4.2 |
| 7 | 변이 적용 범위가 §6.3과 일치 (14A 선택지만 예외) | §6.3 |
| 8 | 옥비녀 보상은 `branch-b` 성공에만 있고 `isBoostableReward`가 false | §6.2, §9.3 |
| 9 | 모든 에셋 키가 `ASSET_KEY` 값이고 §18 매핑과 일치 | §18 |
| 10 | 보스 A·분기 B의 강제 성공 결과가 §3.2 표와 일치 | §3.2 |
| 11 | 엔딩 7종이 모두 정의되고 배신자 승패가 §15와 일치 | §15 |
| 12 | 잠식 효과 값이 전부 5% 단위 | §4.1 |

### M2-3 — `test/engine/rules/`

**`erosion.test.ts`(수정)**

| # | 검증 | 근거 |
|---|---|---|
| 1 | 티어 경계 0/29/30/59/60/99/100이 정확히 갈린다 | §4.3 |
| 2 | 배신자는 회복이 적용되지 않고 100%로 고정된다 | §4.4 |
| 3 | 배신자에게도 상승은 적용되지만 100%를 넘지 않는다 | §4.1 |

**`traitor.test.ts`(생성)**

| # | 검증 | 근거 |
|---|---|---|
| 1 | 인간이 100%에 도달하면 즉시 배신자가 된다 | §10.1 |
| 2 | 1인 플레이는 배신자가 되지 않고 방해 효과가 본인에게 적용된다 | §10.1 |
| 3 | 봇은 100%여도 배신자가 되지 않는다 | §11 |
| 4 | 인간 2명 이상이 전원 배신자가 되면 강제 잠식 엔딩 | §10.3 |
| 5 | 배신자도 협동 판정에 참여하고 부적·능력을 쓸 수 있다 | §10.2 |
| 6 | 배신자 전환 cue가 가짜 붉은 메시지 cue와 형식이 같다 | §10.1 |

**`whisper.test.ts`(수정)**

| # | 검증 | 근거 |
|---|---|---|
| 1 | 티어 환청이 30% 미만에는 발동하지 않는다 | §4.3 |
| 2 | 60% 이상은 확률 100%로 발동한다 | §4.3 |
| 3 | 거짓 환청은 대상의 실제 구간과 다른 구간을 말한다 | §16 |
| 4 | 환청 대상은 **자기 자신이 아니다** | §16 |
| 5 | 분기 B 실패 귓속말은 다음 이벤트 시작 시, 거짓 100% | §13.2 |
| 6 | 진입 경고는 부적 보유자에게만 가고 부적을 소모하지 않는다 | §13.1 |

**`variant.test.ts`(수정)**

| # | 검증 | 근거 |
|---|---|---|
| 1 | 옥비녀 보상은 증가하지 않고 실패 페널티 -10%p로 대체된다 (M1의 `it.todo` 해제) | §6.2 |
| 2 | 가짜 라벨은 30% 확률로 확정 저장되고 재계산되지 않는다 | §4.3 |
| 3 | `p2-11a`의 실패 시간 페널티는 흉·길에서 변하지 않는다 | §6.2 |
| 4 | 증가 가능한 보상이 여러 개면 전부 한 단계씩 오른다 | §6.2 |

**`target.test.ts`(생성)**

| # | 검증 | 근거 |
|---|---|---|
| 1 | 30% 미만만 있으면 타겟이 없다 | §14.1 |
| 2 | 최고 잠식도 1명이 타겟이 된다 | §14.1 |
| 3 | 동점 우선순위 인간 배신자 > 봇 > 기타 인간 | §14.1 |
| 4 | 같은 순위 동점은 rng로 고른다 | §14.1 |
| 5 | 타겟이 옥비녀 보유자면 잠식 최저 좌석으로 이동한다 | §14.1 |
| 6 | 타겟이 없으면 옥비녀는 이동하지 않는다 | §14.1 |

**`slots.test.ts`(생성)**

| # | 검증 | 근거 |
|---|---|---|
| 1 | 랜덤 슬롯 8칸 중 7번이 보스 고정 | §13.3 |
| 2 | 나머지 7칸이 풀에서 중복 없이 뽑힌다 | §13.3 |
| 3 | 같은 시드면 같은 배치 | 아키 §5.5 |

### M2-4 — `test/engine/steps/`

**`phase2Step.test.ts`**

| # | 검증 | 근거 |
|---|---|---|
| 1 | 진입 시 부적 미보유자만 +20%, 보유자는 경고 귓속말만 | §13.1 |
| 2 | 미보유자 1명당 팀 -1, 하한 -2 | §13.1, §5.5 |
| 3 | 랜덤 이벤트 8개가 끝날 때마다 전원 +5%, 분기에는 적용되지 않는다 | §4.2 |
| 4 | 환경 잠식은 판정 결과·강제 성공과 무관하게 적용된다 | §4.2 |
| 5 | 부적 상한 2 초과 획득 시 초과분이 인벤토리에 들어가지 않는다 | §9.1 |
| 6 | 양도는 받는 좌석의 상한도 검사한다 | §9.1 |
| 7 | 13번 발목 대상이 무작위 1명으로 정해지고 Display에 공개된다 | §13.5 |
| 8 | 협동 보상은 최종 최고값 주사위 주인에게 간다 (부적 +1로 갱신된 경우 포함) | §5.3 |
| 9 | "전원 회복"은 배신자를 건너뛴다 | §13.4 |

**`talismanWindowStep.test.ts`**

| # | 검증 | 근거 |
|---|---|---|
| 1 | 14A는 부적 보유자가 없어도 선택지에 표시된다 | §13.5 |
| 2 | 제출 창은 8초 고정이고 제출 즉시 종료된다 | §13.5 |
| 3 | 선착순 1개만 적용, 나머지는 소모되지 않는다 | §13.5 |
| 4 | 제출자 -15% | §13.5 |
| 5 | 미제출 시 무작위 1명(봇 포함) +10%, Display는 익명 | §13.5 |
| 6 | 14A에는 개입 창이 없고 변이가 적용되지 않는다 | §13.5, §6.3 |
| 7 | 14A는 버프/디버프를 소비하지 않고 다음 판정으로 이월한다 | §5.5 |

**`botPolicy.test.ts`(수정)**

| # | 검증 | 근거 |
|---|---|---|
| 1 | 봇 100% 방해는 게임당 1회, 두 효과 중 하나가 발동한다 | §11 |
| 2 | 방해 디버프는 하한 -2를 넘지 않는다 | §11, §5.5 |
| 3 | 방해로 부적이 소멸하면 보유자 1명의 1개만 사라진다 | §11 |
| 4 | 첫째 봇은 보스 실패 시에만 강제 성공을 쓴다 | §11 |
| 5 | 봇이 Phase 3 팀 측 주사위를 굴린다 | §11, §14.5 |

### M2-5 — `test/engine/steps/phase3Step.test.ts`, `endingStep.test.ts`

| # | 검증 | 근거 |
|---|---|---|
| 1 | 판정 순서 0~4가 표대로 갈린다 (4가지 경로 전부) | §14.1 |
| 2 | 타겟 지정이 0번에서 먼저 일어난다 | §14.1 |
| 3 | B-1은 투표 없이 즉시 판정하고 시계를 절삭하지 않는다 | §14.3 |
| 4 | A 루트는 10분 초과분만 절삭한다 (9분이면 그대로) | §14.4 |
| 5 | 대립 판정 동점은 배신자 승 | §14.3, §14.4 |
| 6 | 고정 기준 경로는 B-1 4 이상, A-2 5 이상 | §14.3, §14.4 |
| 7 | Phase 3에서 강제 성공이 거절된다 | §14.2 |
| 8 | 개입 창은 팀 측이 졌을 때만, 팀 측 주사위에만 작동한다 | §14.2 |
| 9 | 남은 버프/디버프가 팀 측 값에 적용된다 | §14.2 |
| 10 | 유효표 0이면 강제 잠식 엔딩 | §14.4 |
| 11 | 1인 플레이 본인 타겟: A-1이 선택지에서 빠지고 A-2 텍스트가 교체된다 | §14.5 |
| 12 | 1인 플레이 본인 타겟: 옥비녀가 잠식 최저 봇에게 이동하고 기준 4 | §14.5 |
| 13 | 1인 플레이 A-2 성공은 전용 내레이션을 쓴다 | §14.5 |
| 14 | 엔딩 7종이 조건대로 결정되고 배신자 승패가 §15와 일치 | §15 |
| 15 | Phase 1~2 타임오버는 진행 중 판정·개입 창을 중단한다 | §2.1 |
| 16 | Phase 3는 시계 0을 지나도 판정을 끝까지 진행한다 | §14.2 |
| 17 | 시간 페널티로 시계가 0 아래가 되면 그 자리에서 타임오버 | §2.1 |

### M2-6 — `test/engine/projection/`

7.2의 18개 항목.

### M2-7 — `test/engine/fullGameFlow.test.ts`

| # | 검증 | 근거 |
|---|---|---|
| 1 | 인간 0·1·2·3명 구성이 모두 엔딩에 도달한다 | 로드맵 M2 |
| 2 | 같은 시드·구성은 최종 상태가 완전히 같다 | 아키 §5.5 |
| 3 | 방문한 단계가 6절 전이표를 벗어나지 않는다 | 아키 §5.3 |
| 4 | 이벤트 수가 Phase 1 4개 + Phase 2 9개 + Phase 3 1개 | §2.1 |
| 5 | 잠식도가 0~100 범위에서 5% 단위를 유지한다 | §4.1 |
| 6 | 부적 보유 수가 어떤 시점에도 상한 2를 넘지 않는다 | §9.1 |
| 7 | 100판을 돌려도 예외 없이 엔딩까지 간다 (경로 커버리지) | 로드맵 M2 |

---

## 10. 해석이 필요한 항목

> 룰북·아키텍처에 없어 임의로 정할 수 없는 항목이다. 가정대로 진행해도 되는지 확인을 받은 뒤 M2를 시작한다.
> 확인 전까지 해당 부분에 의존하는 테스트는 `it.todo`로 남긴다.

| # | 항목 | 문서 상태 | 가정 | 영향 |
|---|---|---|---|---|
| 1 | Phase 2 진입 환청을 단계로 둘지 이벤트로 둘지 | 아키 §5.3 단계 목록에 없고, 룰북 §2.1은 이벤트 수에 세지 않았다 | `PHASE2_ENTRY` 단계를 새로 만든다. 선택지가 없고 좌석마다 결과가 달라 정적 효과 목록으로 표현할 수 없다 | 낮음 |
| 2 | 부적 보유 상한 초과 처리 창의 시간 | 룰북 §9.1은 "양도하거나 버림"만 적고 시간 설정값이 없다 | 초과분을 `talismanOverflow`에 두고 **다음 투표 시간 중**에 `talisman.transfer`/`discard`로 처리한다(부적 회복과 같은 시간대). 처리하지 않은 채 Phase 3에 들어가면 버린다 | **중간** — 새 단계와 새 설정값이 필요한지 갈린다 |
| 3 | 14A 미제출 시 "무작위 1명"에 배신자·타겟이 포함되는지 | §13.5는 "봇 포함"만 명시 | 좌석 전원(배신자 포함)을 모집단으로 한다. 배신자는 100% 고정이라 실효가 없다 | 낮음 |
| 4 | 티어 환청 대상이 배신자일 때의 구간 표기 | §16은 "잠식 구간"이라고만 적었다 | 배신자는 100% 구간으로 말한다. 진실/거짓 규칙은 그대로 | 낮음 |
| 5 | 같은 이벤트에서 환청이 여러 건 겹칠 때 | §4.3은 티어별 확률만 적었다 | 좌석당 이벤트당 티어 환청 1건으로 제한한다. 이벤트 귓속말(02A 등)과는 겹칠 수 있다 | 낮음 |
| 6 | 가짜 붉은 메시지의 발동 시점 | §19는 "이벤트당 20%"라고만 적었다 | 랜덤 이벤트 **시작 시** 60~99% 좌석마다 굴린다 | 낮음 |
| 7 | 가짜 라벨이 붙는 범위 | §6.4는 "이벤트마다 30% 확률로 가짜 라벨 표시" | 좌석마다 굴리고, 걸리면 **그 이벤트의 모든 선택지 라벨**을 가짜로 만든다(선택지마다 따로 굴리지 않는다) | **중간** — 심리전 체감이 달라진다 |
| 8 | 13번 발목 대상의 기계적 효과 | §13.5는 Display 표시만 적었다 | 연출 전용. 판정자·효과 대상과 무관하다 | 낮음 |
| 9 | 보스 실패 "추격받으며 통과" | §13.5 | 서사 전용. 추가 효과 없음 | 낮음 |
| 10 | 봇 100% 방해의 발동 시점 | §11은 "게임당 1회, 랜덤"만 적었다 | 봇이 100%에 도달한 직후 즉시 발동한다. 디버프는 다음 판정에, 부적 소멸은 그 자리에서 | 낮음 |
| 11 | Phase 2 도중 인간이 0명이 되는 경우(전원 배신자)는 강제 잠식인데, 1인 플레이는 예외라 게임이 계속된다 | §10.1과 §10.3이 각각 규정 | 인간 2명 이상일 때만 "전원 배신자" 검사를 한다 | 낮음 |
| 12 | 봇 자동 대전(인간 0명)의 투표 마감 | §8의 조기 마감은 "연결된 인간 전원"이라 인간 0명이면 판정 자체가 성립하지 않는다 | 룰 그대로 3분을 흘린다. 시계 지표는 상한으로 읽고, 조기 마감이 섞인 값은 `--humans 1~3`으로 따로 본다 | **중간** — 타임오버 비율 해석이 갈린다 |
| 13 | 세이브 재현을 위한 난수 상태 | 아키 §5.1은 rng를 주입으로만 규정 (M1 계획 7절 9번에서 이월) | M2도 시뮬레이터가 rng 인스턴스를 유지한다. 시드+카운터를 상태에 넣는 문제는 M5(세이브)에서 결정한다 | 낮음 (M2 범위 밖) |

---

## 11. 진행 순서와 확인 방법

1. **10절 항목 확인** → 답을 받은 뒤 착수. 가정이 바뀌면 이 계획서를 먼저 고친다
2. **M2-1** → `typecheck -w tal-brothers-shared`, `typecheck -w tal-brothers-server`
3. **M2-2** → 시나리오 무결성 테스트
4. **M2-3** → 규칙 테스트 5종
5. **M2-4** → Phase 2 단계 테스트. `sim:game`으로 Phase 2까지 눈으로 확인
6. **M2-5** → Phase 3·엔딩 테스트. `sim:game`으로 엔딩까지 확인
7. **M2-6** → 은닉 테스트 18종
8. **M2-7** → `sim:bots -- --games 300`으로 8.2 지표 출력. 룰북 §19 조정 여부를 보고
9. 마지막에 `docs/roadmap.md`의 M2 체크리스트와 진행 상태 표를 갱신하고, 계획과 달라진 결정은 `docs/m2-notes.md`에 남긴다

각 작업 단위가 끝날 때마다 변경 파일 목록, 테스트·타입 체크 결과 요약, 로드맵 갱신 내용을 보고한다.
