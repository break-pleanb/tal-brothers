# M1 실행 계획 — 엔진 핵심 + Phase 1

> 근거 문서: `rulebook-v3.md`(규칙 원본) > `architecture.md`(구현 설계) > `roadmap.md`(범위)
> 이 문서는 M1-1 ~ M1-5를 한 번에 진행하기 위한 계획이며, 코드는 포함하지 않는다.
> 타입 표기는 설계 스케치이고 최종 파일 작성 시 확정한다.

## 전제

- Phase 1 = 이벤트 4개: `t1` → `t2-1` → `t2-2` → `villageChief`. 끝나면 `PHASE1_COMPLETE`에서 정지
- 모든 좌석은 연결된 상태로 간주 (연결 끊김·봇 대행·일시정지는 M3)
- 시계가 0이 되어도 로그만 남기고 계속 진행 (타임오버 엔딩은 M2)
- 배신자·가짜 라벨·환경 잠식·티어 효과·투영은 M2. 상태 타입에 필드를 미리 만들지 않고 확장 지점만 주석으로 표시한다

---

## 1. 작업 단위별 생성·수정 파일

### M1-1. shared 상수와 명령 타입

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `tal-brothers-shared/src/constants/brotherRole.ts` | 생성 | `BROTHER_ROLE` 3종 + `BrotherRole` 유니온 |
| `tal-brothers-shared/src/constants/attribute.ts` | 생성 | `ATTRIBUTE` 3종 (근력/보호, 민첩/눈치, 지식/도술) |
| `tal-brothers-shared/src/constants/judgmentKind.ts` | 생성 | `JUDGMENT_KIND` 5종 (룰북 §5.2 전체, M1 사용은 3종) |
| `tal-brothers-shared/src/constants/variantKind.ts` | 생성 | `VARIANT_KIND` 흉/평/길 |
| `tal-brothers-shared/src/constants/gamePhase.ts` | 생성 | `GAME_PHASE` 3종 |
| `tal-brothers-shared/src/constants/gameStep.ts` | 생성 | `GAME_STEP` 아키텍처 §5.3 단계 전체 + `PRACTICE_INTERVENTION` + `PHASE1_COMPLETE` |
| `tal-brothers-shared/src/constants/commandType.ts` | 생성 | `COMMAND_TYPE` 아키텍처 §7.1 전체 17종 (값 = 전송 이름) |
| `tal-brothers-shared/src/constants/assetKey.ts` | 생성 | `ASSET_KEY` 인게임 11종 (룰북 §18). `introMask`는 제외 |
| `tal-brothers-shared/src/types/command.ts` | 생성 | M1 범위 명령 7종의 판별 유니온 `Command` |
| `tal-brothers-shared/src/index.ts` | 수정 | 위 전부 re-export (`PROTOCOL_VERSION` 유지) |
| `tal-brothers-shared/package.json` | 수정 | `typecheck` 스크립트 추가 |
| `tal-brothers-shared/tsconfig.json` | 수정 | `erasableSyntaxOnly: true` 추가 (아키텍처 §11) |
| `tal-brothers-server/tsconfig.json` | 수정 | `erasableSyntaxOnly: true` 추가 (아키텍처 §11) |

> 상수 파일명 camelCase ↔ export명 SCREAMING_SNAKE_CASE 1:1. 값은 `COMMAND_TYPE`(전송 이름, 점 표기)을 제외하고 모두 camelCase 문자열로 통일한다.

### M1-2. 시나리오 데이터

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `tal-brothers-server/src/scenario/scenarioTypes.ts` | 생성 | `Effect`(분류 3종), `JudgmentSpec`, `Choice`, `ScenarioEvent` 타입 |
| `tal-brothers-server/src/scenario/gameConfig.ts` | 생성 | `GAME_CONFIG` — 룰북 §19 전체 + 아키텍처 §8 운영 설정값 |
| `tal-brothers-server/src/scenario/phase1Events.ts` | 생성 | `PHASE1_EVENTS` — 이벤트 4개. 룰북 §12 수치 그대로 |
| `tal-brothers-server/test/scenario/phase1Events.test.ts` | 생성 | 데이터 무결성 |

### M1-3. 엔진 기반과 순수 규칙

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `src/engine/engineTypes.ts` | 생성 | `EngineAction`(명령 / 타이머 만료), `EngineContext`, `DispatchResult`, `Rejection`, `Cue`, `LogEntry` |
| `src/engine/random.ts` | 생성 | `Rng` 인터페이스, 외부 의존 없는 시드 난수(32비트 정수 PRNG), `rollD6`, `pickOne`, `pickWeighted` |
| `src/engine/dispatch.ts` | 생성 | 현재 단계 → 처리기 분기. 알 수 없는 액션·단계 불일치·좌석 불일치는 거절. 성공 시 `stateVersion` +1 |
| `src/engine/state/gameState.ts` | 생성 | 상태 타입 (3절) |
| `src/engine/state/createGame.ts` | 생성 | 좌석 3개 구성, 이벤트 순서표 고정, 게임 시계 마감 시각 설정, 첫 `EVENT_INTRO` 진입 |
| `src/engine/rules/erosion.ts` | 생성 | 5% 단위 증감, 0~100 clamp, 초과분 폐기 (§4.1) |
| `src/engine/rules/modifiers.ts` | 생성 | 직업 보정(담당 속성 개인·비공개만 +1), 팀 플래그 합산, 디버프 하한 -2 (§3.1, §5.5) |
| `src/engine/rules/variant.ts` | 생성 | 변이 굴림(30/50/20), 선택지 사양에 변이 적용, 적용 제외 이벤트 처리 (§6) |
| `src/engine/rules/effects.ts` | 생성 | 효과 적용, 대상 해석, 강제 성공 시 `reward` 제거·`sideEffect` 유지 (§3.2, §5.4) |
| `src/engine/rules/whisper.ts` | 생성 | T2 귓속말 — 진실/거짓 확정, 이장 변이 결정 직후 내용 생성 (§12, §16) |
| `test/engine/rules/` 6개 파일 | 생성 | 6절 참조 |

### M1-4. 단계 처리기와 봇 정책

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `src/engine/steps/eventIntroStep.ts` | 생성 | 이벤트 진입, 튜토리얼 부적 지급(T1), 변이 결정, 보류 귓속말 발송, 다음 단계 분기(`skipVoting`) |
| `src/engine/steps/votingStep.ts` | 생성 | 투표·변경·조기 마감·기권·동률, 절대 시야, 부적 회복, 채택 선택지·판정자 확정 |
| `src/engine/steps/rollStep.ts` | 생성 | `ROLL_WAIT`(굴림 수집, 10초 자동), `ROLL_REVEAL`(최종값·성패 확정, 3초) |
| `src/engine/steps/interventionStep.ts` | 생성 | 실전 3단계 + 연습 단일 단계, 스킵 규칙, 부적 선착순 1개, 강제 성공 |
| `src/engine/steps/resolutionStep.ts` | 생성 | 비공개 대가, 효과 적용, 팀 플래그 갱신, 튜토리얼 부적 소멸, 다음 이벤트 / `PHASE1_COMPLETE` |
| `src/engine/bots/botPolicy.ts` | 생성 | 굴림, 둘째 재굴림(협동 조건부), 부적 자동 사용, 첫째 봇 미사용 |
| `test/engine/steps/` 5개 파일 | 생성 | 6절 참조 |

### M1-5. 콘솔 시뮬레이션과 전체 흐름 테스트

| 파일 | 구분 | 핵심 내용 |
|---|---|---|
| `tal-brothers-server/package.json` | 수정 | `sim:phase1` 스크립트 추가 |
| `src/sim/playPhase1.ts` | 생성 | `--seed`, `--humans(1~3)` 파싱. 가상 시계 루프, 인간 좌석 랜덤 정책, 한국어 로그 |
| `test/engine/phase1Flow.test.ts` | 생성 | 전체 흐름·재현성 |

---

## 2. shared 상수와 M1 명령 타입

### 2.1 상수 목록

| 상수 | 키 → 값 |
|---|---|
| `BROTHER_ROLE` | `FIRST: 'first'`(첫째), `SECOND: 'second'`(둘째), `THIRD: 'third'`(셋째) |
| `ATTRIBUTE` | `STRENGTH: 'strength'`(근력/보호), `AGILITY: 'agility'`(민첩/눈치), `KNOWLEDGE: 'knowledge'`(지식/도술) |
| `JUDGMENT_KIND` | `SOLO: 'solo'`, `COOP: 'coop'`, `HIDDEN: 'hidden'`, `ITEM: 'item'`, `CONTEST: 'contest'` — 룰북 §5.2. M1 사용은 solo/coop/hidden |
| `VARIANT_KIND` | `ILL: 'ill'`(흉), `PLAIN: 'plain'`(평), `BLESS: 'bless'`(길) |
| `GAME_PHASE` | `PHASE_1: 'phase1'`, `PHASE_2: 'phase2'`, `PHASE_3: 'phase3'` |

**속성 ↔ 담당 형제 매핑** (룰북 §3): strength→첫째, agility→둘째, knowledge→셋째. 이 매핑은 룰 계산이므로 shared가 아니라 server `modifiers.ts`에 둔다 (아키텍처 §3의 "shared에 룰 계산 로직 금지").

### 2.2 `GAME_STEP`

아키텍처 §5.3 단계 전체 + 연습 개입 창 + 임시 종료 단계.

| 키 | 값 | M1 사용 | 비고 |
|---|---|---|---|
| `LOBBY` | `'lobby'` | X | 상수만 정의. 처리기는 M3 |
| `EVENT_INTRO` | `'eventIntro'` | O | 30초 |
| `VOTING` | `'voting'` | O | 3분, 조기 마감 |
| `ROLL_WAIT` | `'rollWait'` | O | 10초 자동 굴림 |
| `ROLL_REVEAL` | `'rollReveal'` | O | 3초 |
| `INTERVENTION_REROLL` | `'interventionReroll'` | O | 4초 |
| `INTERVENTION_TALISMAN` | `'interventionTalisman'` | O | 4초, 스킵 금지 |
| `INTERVENTION_FORCE` | `'interventionForce'` | O | 4초 |
| `PRACTICE_INTERVENTION` | `'practiceIntervention'` | O | 단일 단계 12초 (아키 §5.3) |
| `TALISMAN_WINDOW` | `'talismanWindow'` | X | 14A, M2 |
| `RESOLUTION` | `'resolution'` | O | 즉시 전이 |
| `P3_TARGETING` | `'p3Targeting'` | X | M2 |
| `P3_VOTING` | `'p3Voting'` | X | M2 |
| `PAUSED` | `'paused'` | X | M3 |
| `ENDING` | `'ending'` | X | M2 |
| `PHASE1_COMPLETE` | `'phase1Complete'` | O | M1 임시 종료. M2에서 Phase 2 진입으로 교체 |

### 2.3 `COMMAND_TYPE` (아키텍처 §7.1 전체 17종)

| 키 | 값 | M1 타입 정의 |
|---|---|---|
| `SESSION_HELLO` | `'session.hello'` | X |
| `LOBBY_PICK_SEAT` | `'lobby.pickSeat'` | X |
| `LOBBY_TOGGLE_BOT` | `'lobby.toggleBot'` | X |
| `LOBBY_START` | `'lobby.start'` | X |
| `VOTE_SUBMIT` | `'vote.submit'` | **O** |
| `ROLL_REQUEST` | `'roll.request'` | **O** |
| `ABILITY_TRUE_SIGHT` | `'ability.trueSight'` | **O** |
| `INTERVENTION_REROLL` | `'intervention.reroll'` | **O** |
| `INTERVENTION_TALISMAN` | `'intervention.talisman'` | **O** |
| `INTERVENTION_FORCE_SUCCESS` | `'intervention.forceSuccess'` | **O** |
| `TALISMAN_HEAL` | `'talisman.heal'` | **O** |
| `TALISMAN_SUBMIT` | `'talisman.submit'` | X (14A, M2) |
| `TALISMAN_TRANSFER` | `'talisman.transfer'` | X (보유 상한, M2) |
| `TALISMAN_DISCARD` | `'talisman.discard'` | X (보유 상한, M2) |
| `HOST_SAVE` | `'host.save'` | X (M3) |
| `HOST_PAUSE` | `'host.pause'` | X (M3) |
| `HOST_RESUME` | `'host.resume'` | X (M3) |

### 2.4 `ASSET_KEY` (룰북 §18, 인게임 11종)

| 키 | 값 | 분류 | 사용처 |
|---|---|---|---|
| `BG_THATCHED_VILLAGE` | `'thatchedVillage'` | 배경 | Phase 1 전체 (T1, T2-1, T2-2, 이장) |
| `BG_DANGSAN_FOREST` | `'dangsanForest'` | 배경 | Phase 2 기본, 분기 A |
| `BG_BLOODY_SHRINE` | `'bloodyShrine'` | 배경 | 분기 B, 07 성황당 |
| `BG_BLOOD_TEAR_JANGSEUNG` | `'bloodTearJangseung'` | 배경 | Phase 3, 탈출 계열 엔딩 |
| `ITEM_JADE_HAIRPIN` | `'jadeHairpin'` | 아이템 | 어머니의 옥비녀 |
| `ITEM_TALISMAN` | `'talisman'` | 아이템 | 낡은 부적 (튜토리얼 부적 공용) |
| `MASK_CLOWN` | `'clownMask'` | 탈 | 이장, 03 |
| `MASK_COMMON_A` | `'commonMaskA'` | 탈 | 01 아귀탈 |
| `MASK_COMMON_B` | `'commonMaskB'` | 탈 | 10 무당탈 |
| `MASK_BOSS` | `'bossMask'` | 탈 | 15 백정탈 |
| `MASK_CORRUPTED` | `'corruptedMask'` | 탈 | 붉은 메시지, 배신자 승리 계열 엔딩 |

> 값은 `tal-brothers-web/src/assets/images/**` 파일명(확장자 제외)과 1:1이며, 경로 매핑은 web의 `ASSET_URL`이 담당한다 (아키텍처 §9.3).

### 2.5 M1 범위 명령 타입의 필드

좌석 식별은 명령 본문이 아니라 액션 봉투가 담는다 (아키텍처 §5.1 "플레이어 명령: 좌석과 명령 내용"). 따라서 명령에 `seat`를 두지 않는다.

| 명령 | 필드 | 설명 |
|---|---|---|
| `vote.submit` | `choiceId: string` | 마감 전 재전송으로 변경 (아키 §8) |
| `roll.request` | 없음 | 개인은 판정자, 협동은 발신 좌석의 본인 주사위 |
| `ability.trueSight` | 없음 | 셋째, VOTING 중 1회 (§3.4) |
| `intervention.reroll` | 없음 | 둘째. 개인은 유일 주사위, 협동은 본인 주사위로 자동 결정 (§3.3) |
| `intervention.talisman` | 없음 | 부적 보유자, 선착순 1개 (§7.4) |
| `intervention.forceSuccess` | 없음 | 첫째 (§3.2) |
| `talisman.heal` | 없음 | 부적 보유자, VOTING 중 (§9.1) |

```
type Command =
  | { type: 'vote.submit'; choiceId: string }
  | { type: 'roll.request' }
  | { type: 'ability.trueSight' }
  | { type: 'intervention.reroll' }
  | { type: 'intervention.talisman' }
  | { type: 'intervention.forceSuccess' }
  | { type: 'talisman.heal' }
```

---

## 3. 게임 상태 타입과 효과 모델

### 3.1 `GameState` (아키텍처 §5.2 중 M1 범위)

```
GameState = {
  meta:     { roomCode, engineVersion, scenarioVersion, stateVersion }
  clock:    { deadlineAt }                         // 게임 시계 마감 시각 (epoch ms)
  progress: { phase, eventOrder[], eventIndex, step, stepDeadlineAt | null }
  seats:    Record<BrotherRole, SeatState>
  currentEvent:    CurrentEventState | null
  currentJudgment: JudgmentState | null
  teamModifier:    number                          // 대기 중인 버프/디버프 합계 (§5.5)
  pendingWhispers: PendingWhisper[]                // 발송 예약된 귓속말
  notices:         PublicNotice[]                  // Display용 공개 알림 (§17)
}

SeatState = {
  role, isBot,
  erosionPercent,                                  // 0~100, 5% 단위 (§4.1)
  talismanCount,                                   // 낡은 부적 (보유 상한 검사는 M2)
  tutorialTalismanCount,                           // T1 종료 시 소멸 (§9.2)
  abilityUsed,                                     // 고유 능력 게임당 1회 (§3.5)
  whispers: ReceivedWhisper[]
}
// M2 확장 지점: isTraitor, fakeLabels, botSabotageUsed
// M3 확장 지점: userId, connected, disconnectedAt, botProxy

CurrentEventState = {
  eventId,
  variants: Record<choiceId, VariantKind>,         // 실제 변이. 진입 시 확정 저장 (§6.1)
  trueSightUsed,                                   // 셋째 절대 시야 (§3.4)
  votes: Partial<Record<BrotherRole, choiceId>>,
  adoptedChoiceId | null,
  rollerSeat | null                                // 협동 판정은 null
}

JudgmentState = {
  kind, threshold,                                 // 변이 적용 후 최종 성공 기준
  dice: { seat, value }[],                         // 협동은 3개
  roleBonus, teamModifierApplied, talismanBonus,
  succeeded | null,
  forcedSuccess,
  isPractice,                                      // 연습 개입 창 여부
  talismanUsedThisJudgment,                        // 판정당 1개 (§7.4)
  interventions: { step, seat, kind }[]
}

PendingWhisper  = { kind: 't2Variant', targetSeat, truthful, deliverAtEventId }
ReceivedWhisper = { kind, text, receivedAtEventId }
PublicNotice    = { kind, text }                   // 이름 공개 / 익명 여부는 kind가 결정 (§17)
```

### 3.2 `scenarioTypes.ts` 효과 모델 (아키텍처 §5.4)

```
EffectCategory = 'reward' | 'sideEffect' | 'penalty'
EffectTarget   = 'roller' | 'all' | 'coopTopRoller'      // 룰북 §4.1, §5.3

Effect =
  | { category, kind: 'erosion';      target, deltaPercent }   // + 상승 / - 회복
  | { category, kind: 'talisman';     target, count }
  | { category, kind: 'teamModifier'; delta }                  // 팀 플래그 ±1
  | { category, kind: 'timeDelta';    minutes }                // - 는 시간 소모
  | { category, kind: 'whisper';      whisperKind, truthful }
// M2 확장 지점: kind 'jadeHairpin'
```

**분류별 처리 규칙**

| 분류 | 강제 성공 (§3.2) | 흉 변이 (§6.2) | 길 변이 (§6.2) |
|---|---|---|---|
| `reward` | 제거 | 영향 없음 | `talisman` +1개 / 회복(`erosion` 음수) +5%p. **`teamModifier`는 증가 대상 아님** |
| `sideEffect` | 유지 | 영향 없음 | 영향 없음 |
| `penalty` | 해당 없음 | `erosion` +10%p, `timeDelta` +5분 | `erosion` -10%p(최소 0), `timeDelta` -5분(최소 0) |

- 길 변이는 **증가 가능한 보상이 하나라도 있으면 보상 +1단계**, 없으면(보상이 없거나 `teamModifier`·옥비녀뿐이면) **실패 잠식 페널티 -10%p**로 대체 (§6.2)
- 흉·길의 페널티 가감은 `erosion` 페널티에만 적용. `teamModifier` 페널티는 불변 (§6.2)
- 성공 기준 상한 6, 비공개 판정 길의 하한 2 (§6.2)

```
JudgmentSpec =
  | { kind: 'solo';   attribute, threshold }
  | { kind: 'coop';   threshold }
  | { kind: 'hidden'; attribute, threshold }       // 대가 +10%는 GAME_CONFIG 단일 출처

Choice =
  | { id, text, judgment: JudgmentSpec, success: Effect[], failure: Effect[] }
  | { id, text, judgment: null,         resolve: Effect[] }

ScenarioEvent = {
  id, phase, title, narration,
  backgroundAsset: AssetKey,
  maskAsset?: AssetKey,
  choices: Choice[],
  variantApplied: boolean,         // §6.3
  isTutorial: boolean,             // 성공 시 연습 창, 능력 미소모 (§12)
  skipVoting: boolean,             // 선택지 1개 (T2-1)
  grantsTutorialTalisman: boolean  // T1 (§9.2)
}
```

### 3.3 `GAME_CONFIG` (룰북 §19 + 아키텍처 §8)

| 그룹 | 항목 → 값 |
|---|---|
| 시간 | `gameClockMinutes 100`, `endingBufferMinutes 20`, `eventIntroSeconds 30`, `votingSeconds 180`, `rollRevealSeconds 3`, `practiceInterventionSeconds 12`, `interventionRerollSeconds 4`, `interventionTalismanSeconds 4`, `interventionForceSeconds 4`, `inputGraceMs 300`, `talismanWindowSeconds 8`, `redMessageSeconds 3`, `phase3TruncateMinutes 10` |
| 잠식도 | `environmentErosionPercent 5`, `phase2EntryNoTalismanPercent 20`, `hiddenJudgmentCostPercent 10`, `forceSuccessCostPercent 15`, `talismanHealPercent 10`, `phase3TargetThresholdPercent 30` |
| 판정 | `thresholdBase 4`, `thresholdHard 5`, `coopThreshold 5`, `coopBossThreshold 6`, `debuffFloor -2` |
| 아이템 | `talismanLimit 2` |
| 변이 | `variantWeights { ill 30, plain 50, bless 20 }`, `illThresholdDelta 1`, `illPenaltyDeltaPercent 10`, `illTimeDeltaMinutes 5`, `blessPenaltyDeltaPercent -10`, `blessTimeDeltaMinutes -5`, `blessTalismanStep 1`, `blessHealStepPercent 5`, `thresholdMax 6`, `hiddenThresholdMin 2` |
| 티어 | `tier30HallucinationChance 50`, `tier30TruthRatio 30`, `tier60FakeLabelChance 30`, `fakeRedMessageChance 20` |
| 운영 (아키 §8) | `autoRollSeconds 10`, `botTakeoverSeconds 30`, `autoPauseLimitMinutes 5` |

> M1에서 실제로 읽는 값은 시간·판정·변이 그룹과 `hiddenJudgmentCostPercent`, `forceSuccessCostPercent`, `talismanHealPercent`, `autoRollSeconds`이고, 나머지는 M2·M3용으로 정의만 해 둔다.

---

## 4. Phase 1 이벤트 4개를 효과 모델로 옮긴 결과

공통 배경 에셋: `BG_THATCHED_VILLAGE` (룰북 §18 "초가 마을 — Phase 1 (T1, T2, 이장)").

### 4.1 `t1` — 안개 낀 진입로 (튜토리얼)

`variantApplied: false` (§6.3) · `isTutorial: true` · `skipVoting: false` · `grantsTutorialTalisman: true` (§9.2) · 탈 에셋 없음

| 선택지 | 판정 | 속성 | 기준 | 성공 효과 | 실패 효과 | 판정자 |
|---|---|---|---|---|---|---|
| `t1-a` 힘으로 고목을 밀어낸다 | solo | strength | 4 | `[]` (통과) | `[]` (통과, 페널티 없음) | 첫째 |
| `t1-b` 틈 사이로 기어 지나간다 | solo | agility | 4 | `[]` | `[]` | 둘째 |

- `t1-a` 채택 시 판정자가 첫째 → 강제 성공 사용 불가(§3.2)이지만 **첫째 단계를 조기 스킵하지 않고 설명을 표시**한다 (§12, §7.3보다 우선)

### 4.2 `t2-1` — 빈 주막 ① 무너지는 대들보 (튜토리얼)

`variantApplied: false` · `isTutorial: true` · `skipVoting: true` (§12) · 탈 에셋 없음

| 선택지 | 판정 | 속성 | 기준 | 성공 효과 | 실패 효과 | 판정자 |
|---|---|---|---|---|---|---|
| `t2-1-a` 다 함께 대들보를 받친다 | coop | — | 5 (최고값) | `[]` | `[]` | 전원 굴림 |

- 협동 판정이므로 직업 보정 없음 (§3.1, §5.2)

### 4.3 `t2-2` — 빈 주막 ② 점괘 항아리 (튜토리얼)

`variantApplied: false` · `isTutorial: true` · `skipVoting: false` · 탈 에셋 없음

| 선택지 | 판정 | 속성 | 기준 | 성공 효과 | 실패 효과 | 판정자 |
|---|---|---|---|---|---|---|
| `t2-2-a` 항아리를 들여다본다 | hidden | knowledge | 4 | `[{reward, whisper, t2Variant, truthful: true}]` | `[{penalty, whisper, t2Variant, truthful: false}]` | 셋째 |
| `t2-2-b` 그냥 떠난다 | 없음 | — | — | `resolve: []` (페널티 없음) | — | 없음 |

- 대가 잠식 +10%는 데이터에 넣지 않고 `RESOLUTION`에서 `GAME_CONFIG.hiddenJudgmentCostPercent`로 성패 무관 적용 (§5.4)
- 비공개 판정이므로 개입 창 없음 (§7.1), 결과는 판정자에게도 공개하지 않음 (§5.4)
- 귓속말은 **진실/거짓만 이 시점에 확정 저장**하고, 내용은 이장 변이 결정 직후 생성·발송 (§12, §16)

### 4.4 `villageChief` — 이장 이벤트

`variantApplied: true` (§6.3) · `isTutorial: false` · `skipVoting: false` · 탈 에셋 `MASK_CLOWN` (기본 광대탈)

| 선택지 | 판정 | 속성 | 기준 | 성공 효과 | 실패 효과 | 판정자 |
|---|---|---|---|---|---|---|
| `chief-a` 정중히 거절하고 뒷걸음질 친다 | solo | agility | 4 | `[]` (변화 없음) | `[{penalty, erosion, roller, +15}]` `[{penalty, teamModifier, -1}]` | 둘째 |
| `chief-b` 따라가며 약점을 찾는다 | solo | knowledge | 4 | `[{sideEffect, erosion, roller, +5}]` `[{reward, talisman, roller, 1}]` | `[{penalty, erosion, roller, +20}]` | 셋째 |
| `chief-c` 무기를 꺼내 위협한다 | solo | strength | 4 | `[{reward, teamModifier, +1}]` `[{sideEffect, erosion, all, +10}]` | `[{penalty, erosion, roller, +25}]` | 첫째 |

**변이 적용 검산 (§6.2)**

| 선택지 | 흉 | 평 | 길 |
|---|---|---|---|
| `chief-a` | 기준 5, 실패 +25% / 팀 -1 | 그대로 | 증가 가능한 보상 없음 → 실패 **+5%** / 팀 -1 유지 |
| `chief-b` | 기준 5, 실패 +30% | 그대로 | 부적 **2개**, 성공 +5%, 실패 +20% |
| `chief-c` | 기준 5, 실패 +35% | 그대로 | 보상이 버프뿐 → 실패 **+15%**, 버프는 +1 유지 |

**강제 성공 검산 (§3.2 표)**

| 선택지 | 분류 기반 결과 | 룰북 §3.2 표 |
|---|---|---|
| `chief-b` | `reward`(부적) 제거, `sideEffect`(판정자 +5%) 유지 | "부적 없음, +5% 적용" ✔ |
| `chief-c` | `reward`(버프) 제거, `sideEffect`(전원 +10%) 유지 | "버프 없음, 전원 +10% 적용" ✔ |
| `chief-a` | `reward` 없음 → 실패 결과만 무효화 | 표에 없음(보상 없는 선택지) |

---

## 5. 단계 전이표

`+0.3초`는 아키텍처 §5.3의 입력 유예. 모든 마감은 상태 안의 절대 시각으로 저장한다.

### `EVENT_INTRO` (30초)

| 항목 | 내용 |
|---|---|
| 진입 처리 | ① 이벤트 로드 ② `grantsTutorialTalisman`이면 **인간 좌석 1명에게 랜덤 지급** (§9.2) ③ `variantApplied`면 선택지별 변이를 굴려 `currentEvent.variants`에 확정 저장 (§6.1) ④ 이장 변이가 확정되면 `pendingWhispers`의 T2 귓속말 내용을 생성해 발송 (§12, §16) ⑤ 마감 = now + 30초 |
| 받는 명령 | 없음 (전부 거절) |
| 타이머 만료 | `skipVoting`이면 `ROLL_WAIT`, 아니면 `VOTING` |
| 봇 처리 | 없음 |

### `VOTING` (3분)

| 항목 | 내용 |
|---|---|
| 진입 처리 | 투표 초기화, 마감 = now + 180초 |
| 받는 명령 | `vote.submit`(인간 좌석, 마감 전 변경 허용) / `ability.trueSight`(셋째, 미사용 시 1회) / `talisman.heal`(부적 보유자, -10%) |
| 조기 마감 | 연결된 인간 전원이 투표하면 즉시 마감 (아키 §8). M1은 전원 연결이므로 인간 전원 |
| 타이머 만료 | 집계 → 미투표자 기권 → **동률이면 동률 선택지 중 무작위, 전원 기권이면 전체 선택지 중 무작위** (§8) → 채택 확정 → 판정자 결정 (§3.1) → 판정 있으면 `ROLL_WAIT`, 없으면 `RESOLUTION` |
| 봇 처리 | 투표하지 않음 (§11). 조기 마감 판정에서도 제외. 봇 좌석의 `vote.submit`은 거절 |

### `ROLL_WAIT` (10초)

| 항목 | 내용 |
|---|---|
| 진입 처리 | 변이 적용 기준으로 `JudgmentState` 생성, 직업 보정·팀 플래그 반영(협동은 보정 없음), 대기 주사위 확정(개인·비공개 1개 / 협동 3개), 마감 = now + 10초 |
| 받는 명령 | `roll.request` — 개인·비공개는 판정자만, 협동은 각 좌석이 본인 주사위 1개 |
| 타이머 만료 | 미굴림 주사위 자동 굴림 (아키 §8) → `ROLL_REVEAL` |
| 봇 처리 | 진입 즉시 본인 주사위 굴림 (아키 §8) |
| 조기 전이 | 모든 주사위가 나오면 마감 전이라도 `ROLL_REVEAL` |

### `ROLL_REVEAL` (3초)

| 항목 | 내용 |
|---|---|
| 진입 처리 | 최종값 = D6(협동은 최고값) + 직업 보정 + 팀 플래그 (§5.1). 성패 확정. 적용한 팀 플래그는 소멸 예약 (§5.5). 마감 = now + 3초 |
| 받는 명령 | 없음 |
| 타이머 만료 | 비공개 → `RESOLUTION` (§7.1) / 튜토리얼 성공 → `PRACTICE_INTERVENTION` (§12) / 일반 성공 → `RESOLUTION` / 실패 → `INTERVENTION_REROLL` (§7.1) |
| 봇 처리 | 없음 |

### `INTERVENTION_REROLL` (4초)

| 항목 | 내용 |
|---|---|
| 진입 처리 | 둘째가 능력을 이미 썼으면 **조기 스킵** (§7.3). 마감 = now + 4초 |
| 받는 명령 | `intervention.reroll`(둘째). 개인은 유일 주사위, 협동은 본인 주사위 (§3.3) |
| 재판정 | 사용 즉시 재판정. 성공으로 바뀌면 **창 즉시 종료 → `RESOLUTION`** (§7.2) |
| 타이머 만료 | `INTERVENTION_TALISMAN` |
| 봇 처리 | 둘째가 봇이면 진입 즉시 — 개인 판정은 자동 재굴림, **협동은 본인 주사위가 현재 최고값일 때만** (§11) |
| 능력 소모 | 튜토리얼 이벤트에서는 인간·봇 모두 횟수 미소모 (§3.5) |

### `INTERVENTION_TALISMAN` (4초)

| 항목 | 내용 |
|---|---|
| 진입 처리 | **스킵 금지.** 보유자가 없어도 4초 대기 (§7.3) |
| 받는 명령 | `intervention.talisman`(부적 보유자 누구나). **서버 도달 선착순 1명만 적용**, 나머지는 소모 없이 거절 (§7.4) |
| 재판정 | 최종값 +1 후 재판정. 협동은 현재 최고값 주사위에 적용. 성공이면 창 즉시 종료 → `RESOLUTION` |
| 타이머 만료 | `INTERVENTION_FORCE` |
| 봇 처리 | 진입 즉시 — **실패가 확정됐고 +1로 성공이 되는 경우에만** 사용 (§11) |
| 부적 종류 | 실전 창에서는 튜토리얼 부적도 실제로 소모 (§12) |

### `INTERVENTION_FORCE` (4초)

| 항목 | 내용 |
|---|---|
| 진입 처리 | 첫째가 능력을 이미 썼거나 사용 불가 조건(본인 판정·비공개·14A·Phase 3, §3.2)이면 조기 스킵 (§7.3). **단 `isTutorial` 이벤트에서는 스킵하지 않고 설명 표시용으로 4초를 유지**한다 (§12 우선) |
| 받는 명령 | `intervention.forceSuccess`(첫째) |
| 발동 | 첫째 잠식 +15% (§3.2), 결과를 성공으로 변경, `forcedSuccess = true` → `RESOLUTION` |
| 타이머 만료 | `RESOLUTION` |
| 봇 처리 | 첫째 봇은 **보스 이벤트 실패 시에만** 사용 (§11) → Phase 1에서는 사용하지 않음 |

### `PRACTICE_INTERVENTION` (단일 12초)

| 항목 | 내용 |
|---|---|
| 진입 처리 | 튜토리얼 판정 성공 시 진입. `isPractice = true`, 마감 = now + 12초 (§12, §19) |
| 받는 명령 | `intervention.reroll` / `intervention.talisman` / `intervention.forceSuccess` — **설명 cue만 발생. 상태 변화 없음(부적·능력 횟수·잠식도 모두 불변)** (§12) |
| 타이머 만료 | `RESOLUTION` |
| 봇 처리 | 없음 |

### `RESOLUTION` (타이머 없음, 즉시 전이)

| 항목 | 내용 |
|---|---|
| 진입 처리 | ① 비공개 판정이면 판정자 잠식 +10% 고정 (§5.4) ② 채택 선택지의 성공/실패(또는 `resolve`) 효과에 변이 적용 (§6.2) ③ `forcedSuccess`면 `reward` 제거·`sideEffect` 유지 (§3.2) ④ 효과 적용 (`erosion`/`talisman`/`teamModifier`/`timeDelta`/`whisper`) ⑤ 적용된 팀 플래그 소멸, 새 플래그 저장 (§5.5) ⑥ `t2-2-a`면 귓속말 진실/거짓을 확정해 `pendingWhispers`에 예약 ⑦ `timeDelta`를 게임 시계에 반영 ⑧ `t1` 종료 시 모든 좌석의 튜토리얼 부적 소멸 (§9.2) ⑨ 이벤트 로그 확정 |
| 받는 명령 | 없음 |
| 다음 단계 | 다음 이벤트가 있으면 `EVENT_INTRO`, 없으면 `PHASE1_COMPLETE` |
| 봇 처리 | 없음 |

### `PHASE1_COMPLETE`

종료 상태. 모든 명령·타이머를 거절하고 `nextDeadline`을 내보내지 않는다. M2에서 Phase 2 진입으로 교체한다.

### 게임 시계

- `createGame`에서 `clock.deadlineAt = startedAt + 100분`
- `timeDelta` 효과는 `clock.deadlineAt`을 직접 가감 (§2.1 "시간 페널티는 남은 시간에서 즉시 차감")
- M1에서는 `now`가 `clock.deadlineAt`을 지나도 로그만 남기고 진행한다 (로드맵 M1 범위)

---

## 6. 작업 단위별 테스트 목록

### M1-1 — 테스트 파일 없음

`npm run typecheck -w tal-brothers-shared` 통과로 확인한다. `as const` 파생 유니온이 의도대로 좁혀지는지는 server 테스트에서 간접 확인된다.

### M1-2 — `test/scenario/phase1Events.test.ts`

| # | 검증 | 근거 |
|---|---|---|
| 1 | 이벤트 4개, 순서 `t1` → `t2-1` → `t2-2` → `villageChief`, id 중복 없음 | 룰북 §2.1, §12 |
| 2 | 이벤트 내 선택지 id 중복 없음 | 로드맵 M1-2 |
| 3 | `solo`/`hidden` 선택지에 속성 태그 존재, `coop`에는 없음 | 룰북 §5.2 |
| 4 | 원본 성공 기준이 4~6 범위 | 룰북 §19 |
| 5 | `variantApplied`가 `villageChief`만 true | 룰북 §6.3 |
| 6 | 튜토리얼 이벤트(`t1`, `t2-1`, `t2-2`)에 잠식 `penalty` 효과가 없음 | 룰북 §12 |
| 7 | 모든 효과에 분류가 있고, `teamModifier`는 `reward`/`penalty`만 가짐 | 아키 §5.4 |
| 8 | `skipVoting`인 이벤트는 선택지가 정확히 1개 | 룰북 §12, 아키 §5.3 |
| 9 | 모든 에셋 키가 `ASSET_KEY` 값이고, Phase 1 배경은 전부 `thatchedVillage`, 이장 탈은 `clownMask` | 룰북 §18 |
| 10 | 이장 B·C의 강제 성공 결과가 §3.2 표와 일치 (분류 기반 계산) | 룰북 §3.2 |
| 11 | `GAME_CONFIG`가 룰북 §19 전 항목 + 아키 §8 운영 3항목을 보유 | 룰북 §19, 아키 §8 |

### M1-3 — `test/engine/rules/`

**`random.test.ts`**

| # | 검증 | 근거 |
|---|---|---|
| 1 | 같은 시드 → 같은 수열, 다른 시드 → 다른 수열 | 아키 §5.5 |
| 2 | `rollD6`가 1~6만 반환하고 충분한 표본에서 6면이 모두 출현 | 룰북 §5.1 |
| 3 | `pickWeighted`가 30/50/20 가중치를 따름 | 룰북 §6.1 |

**`erosion.test.ts`**

| # | 검증 | 근거 |
|---|---|---|
| 1 | 5% 단위 증감 | 룰북 §4.1 |
| 2 | 0% 미만으로 내려가지 않음 | 룰북 §4.1 |
| 3 | 100% 초과분 폐기 | 룰북 §4.1 |

**`modifiers.test.ts`**

| # | 검증 | 근거 |
|---|---|---|
| 1 | 담당 속성 개인 판정 +1, 비담당은 0 | 룰북 §3.1 |
| 2 | 비공개 판정에도 담당 +1 적용 | 룰북 §3.1 |
| 3 | 협동 판정에는 직업 보정 없음 | 룰북 §3.1, §5.2 |
| 4 | 버프·디버프 합산, 디버프 합계 하한 -2 | 룰북 §5.5 |

**`variant.test.ts`**

| # | 검증 | 근거 |
|---|---|---|
| 1 | 흉: 성공 기준 +1, 실패 잠식 페널티 +10%p | 룰북 §6.2 |
| 2 | 성공 기준 상한 6, **기준 6에서 흉은 페널티만 가산** | 룰북 §6.2 |
| 3 | 길: 부적 보상 +1개 | 룰북 §6.2 |
| 4 | 길: 회복 보상 +5%p | 룰북 §6.2 |
| 5 | 길: 증가 가능한 보상이 없으면 실패 잠식 페널티 -10%p (최소 0) | 룰북 §6.2 |
| 6 | 길: **보상이 버프뿐인 `chief-c`는 페널티 -10%p, 버프는 +1 유지** | 룰북 §6.2 |
| 7 | 길: 옥비녀 보상은 증가하지 않고 페널티 -10%p (픽스처로 검증) | 룰북 §6.2 |
| 8 | 비공개 판정 흉 기준 +1(상한 6), 길 기준 -1(**하한 2**) | 룰북 §6.2 |
| 9 | 판정 없는 선택지: 흉 시간 +5분, 길 -5분(최소 0분) | 룰북 §6.2 |
| 10 | 페널티 가감은 잠식도에만 — `chief-a`의 팀 -1은 흉·길에서 불변 | 룰북 §6.2 |
| 11 | `variantApplied: false` 이벤트는 변이를 굴리지 않음 | 룰북 §6.3 |
| 12 | 비공개 판정 대가 +10%는 변이와 무관하게 고정 | 룰북 §6.2 |

**`effects.test.ts`**

| # | 검증 | 근거 |
|---|---|---|
| 1 | 강제 성공 — `chief-b`: 부적 없음, 판정자 +5% 적용 | 룰북 §3.2 표 |
| 2 | 강제 성공 — `chief-c`: 버프 없음, 전원 +10% 적용 | 룰북 §3.2 표 |
| 3 | 대상 `roller`는 판정자 1명에게만 적용 | 룰북 §4.1 |
| 4 | 대상 `all`은 봇 포함 3좌석 전원 | 룰북 §4.1 |
| 5 | `timeDelta`가 게임 시계 마감 시각에 반영 | 룰북 §2.1 |

**`whisper.test.ts`**

| # | 검증 | 근거 |
|---|---|---|
| 1 | `t2-2-a` 성공 → 진실, 실패 → 거짓으로 판정 직후 확정 저장 | 룰북 §12, §16 |
| 2 | 내용은 이장 변이 결정 직후 생성·발송 | 룰북 §12 |
| 3 | 진실이면 이장 선택지 1개의 실제 변이와 일치 | 룰북 §16 |
| 4 | **거짓이면 실제 변이를 제외한 나머지 두 값 중 하나** | 룰북 §12 |
| 5 | 귓속말은 수신 좌석에만 저장되고 다른 좌석에 남지 않음 | 룰북 §16, §17 |

### M1-4 — `test/engine/steps/`

**`votingStep.test.ts`**

| # | 검증 | 근거 |
|---|---|---|
| 1 | 마감 전 재전송으로 선택 변경 | 아키 §8 |
| 2 | 인간 전원 투표 시 조기 마감, 봇은 조기 마감 판정에서 제외 | 룰북 §8, §11 |
| 3 | 미투표자 기권 처리 | 룰북 §8 |
| 4 | **동률이면 동률 선택지 중 무작위** | 룰북 §8 |
| 5 | **전원 기권이면 전체 선택지 중 무작위** | 룰북 §8 |
| 6 | 1인 플레이는 본인 선택이 곧 결정 | 룰북 §8 |
| 7 | 절대 시야는 셋째만, VOTING 중에만, 1회 (튜토리얼은 미소모) | 룰북 §3.4, §3.5 |
| 8 | 부적 회복은 보유자만, VOTING 중에만, -10%, 부적 1개 소모 | 룰북 §9.1 |
| 9 | 봇 좌석의 `vote.submit`은 거절 | 룰북 §11 |

**`rollStep.test.ts`**

| # | 검증 | 근거 |
|---|---|---|
| 1 | 판정자 = 채택 선택지 속성의 담당 형제 (a→둘째, b→셋째, c→첫째) | 룰북 §3.1 |
| 2 | 판정자가 봇이어도 그 형제가 굴림 | 룰북 §3.1 |
| 3 | 10초 경과 시 자동 굴림 | 아키 §8 |
| 4 | 협동은 3좌석 모두 굴리고 최고값 사용, 보정 없음 | 룰북 §5.2, §5.3 |
| 5 | 협동에서 봇 주사위는 진입 즉시, 인간 미입력분은 10초 후 자동 | 아키 §8 |
| 6 | 비공개 판정은 개입 창 없이 `RESOLUTION`으로 직행 | 룰북 §5.4, §7.1 |
| 7 | 비공개 판정 대가 +10%는 성패와 무관하게 적용 | 룰북 §5.4 |
| 8 | 판정자가 아닌 좌석의 `roll.request`는 거절 | 아키 §7.1 |
| 9 | `ROLL_REVEAL`은 3초 뒤 전이 | 아키 §5.3, 룰북 §19 |

**`interventionStep.test.ts`**

| # | 검증 | 근거 |
|---|---|---|
| 1 | 공개 판정 실패 시에만 열리고 성공 시 열리지 않음 | 룰북 §7.1 |
| 2 | 순서 둘째 → 부적 → 첫째, 각 4초 | 룰북 §7.2, §19 |
| 3 | 개입으로 성공이 되면 창 즉시 종료 | 룰북 §7.2 |
| 4 | 둘째가 능력을 이미 썼으면 1단계 조기 스킵 | 룰북 §7.3 |
| 5 | **부적 단계는 보유자가 없어도 스킵하지 않고 4초 대기** | 룰북 §7.3 |
| 6 | 판정당 부적 1개, 선착순 1명만 적용, 미적용자 부적 미소모 | 룰북 §7.4 |
| 7 | 부적은 누구의 판정에든 사용 가능 | 룰북 §7.4 |
| 8 | 첫째 본인 판정·비공개 판정에서는 강제 성공 사용 불가 | 룰북 §3.2 |
| 9 | 강제 성공 시 첫째 잠식 +15% | 룰북 §3.2 |
| 10 | 협동 판정 재굴림은 본인 주사위 1개만 | 룰북 §3.3 |
| 11 | 협동 판정 부적 +1은 현재 최고값 주사위에 적용 | 룰북 §5.3, §7.4 |

**`tutorialStep.test.ts`**

| # | 검증 | 근거 |
|---|---|---|
| 1 | T1 진입 시 튜토리얼 부적이 인간 좌석 1명에게만 지급 (봇 제외) | 룰북 §9.2 |
| 2 | T1·T2 실패 → 실전 개입 창, 성공 → `PRACTICE_INTERVENTION` | 룰북 §12 |
| 3 | 연습 개입 창은 단일 단계 12초 | 룰북 §12, §19 |
| 4 | 연습 창의 입력은 부적·능력 횟수·잠식도를 바꾸지 않음 | 룰북 §12 |
| 5 | 실전 창에서는 튜토리얼 부적이 실제로 소모됨 | 룰북 §12 |
| 6 | 튜토리얼 중 능력 사용은 횟수 미소모 — **봇 좌석 포함** | 룰북 §3.5 |
| 7 | 튜토리얼 강제 성공에도 첫째 +15% 대가는 적용 | 룰북 §3.5, §12 |
| 8 | **`t1-a`(판정자 첫째)에서 첫째 단계를 조기 스킵하지 않음** | 룰북 §12 |
| 9 | T1 종료 시 미사용 튜토리얼 부적 소멸, 본게임 인벤토리에 남지 않음 | 룰북 §9.2 |
| 10 | T2-1은 투표 없이 `EVENT_INTRO` → `ROLL_WAIT` | 룰북 §12, 아키 §5.3 |
| 11 | 튜토리얼 판정 실패에 잠식·시간 페널티가 없음 | 룰북 §12 |

**`botPolicy.test.ts`**

| # | 검증 | 근거 |
|---|---|---|
| 1 | 봇은 투표하지 않고 굴림만 담당 | 룰북 §11 |
| 2 | 둘째 봇은 개인 판정 실패 시 1단계에서 자동 재굴림 | 룰북 §11 |
| 3 | **둘째 봇은 협동 판정에서 본인 주사위가 최고값일 때만 재굴림** | 룰북 §11 |
| 4 | 봇 부적은 실패 확정 + `+1`로 성공이 되는 경우에만 사용 | 룰북 §11 |
| 5 | +1로도 성공이 안 되면 봇은 부적을 쓰지 않음 | 룰북 §11 |
| 6 | 첫째 봇은 보스 전용이므로 Phase 1에서 강제 성공을 쓰지 않음 | 룰북 §11 |
| 7 | 셋째 봇은 절대 시야를 쓰지 않음 | 룰북 §11 |
| 8 | 봇 잠식도는 인간과 동일하게 증감 | 룰북 §11 |

### M1-5 — `test/engine/phase1Flow.test.ts`

| # | 검증 | 근거 |
|---|---|---|
| 1 | 인간 1명 구성이 `PHASE1_COMPLETE`에 도달 | 로드맵 M1 완료 기준 |
| 2 | 인간 2명 구성이 `PHASE1_COMPLETE`에 도달 | 로드맵 M1 완료 기준 |
| 3 | 인간 3명 구성이 `PHASE1_COMPLETE`에 도달 | 로드맵 M1 완료 기준 |
| 4 | 같은 시드·같은 구성 → 최종 상태 완전 일치 | 아키 §5.5 |
| 5 | 다른 시드 → 최소 한 지점 이상 다름 | 아키 §5.5 |
| 6 | 이벤트 통과 순서가 `t1` → `t2-1` → `t2-2` → `villageChief` | 룰북 §12 |
| 7 | 방문한 단계가 5절 전이표를 벗어나지 않음 (화이트리스트 검사) | 아키 §5.3 |
| 8 | 모든 좌석 잠식도가 0~100 범위, 5% 단위 유지 | 룰북 §4.1 |
| 9 | 시계가 0을 지나도 중단 없이 진행 | 로드맵 M1 범위 |
| 10 | 늦은 타이머(`step`/`stateVersion` 불일치)는 무시됨 | 아키 §5.1 |
| 11 | 거절된 명령은 `stateVersion`을 올리지 않고 상태를 바꾸지 않음 | 아키 §5.1 |

### 시뮬레이션 출력 형식 (`sim:phase1`)

이벤트마다 아래를 한국어 한 블록으로 출력한다 (로드맵 M1-5).

```
[이벤트 2/4] T2-1 빈 주막 — 무너지는 대들보
  투표      생략 (선택지 1개)
  변이      미적용
  판정      협동 · 기준 5
  주사위    첫째 3(봇) · 둘째 6 · 셋째 2 → 최고값 6
  결과      성공
  개입      연습 개입 창 (12초, 변화 없음)
  좌석      첫째 0% [부적 0] · 둘째 0% [부적 0, 튜토리얼 1] · 셋째 0% [부적 0]
  시계      남은 96분
```

---

## 7. 해석이 필요한 항목

> 1~2는 이전 보고에서 답을 받지 못한 항목, 3~9는 이번 계획을 세우며 새로 발견한 항목이다.
> 모두 "이렇게 가정하고 진행한다"로 적었으므로, 다르면 지적해 주시면 반영한다.

| # | 항목 | 문서 상태 | 가정 | 영향 |
|---|---|---|---|---|
| 1 | M1에서 `LOBBY` 단계를 처리하는가 | 아키 §5.3에 `LOBBY`가 있으나 로드맵 M1-3/M1-4 파일 목록에 `lobbyStep.ts`가 없음 | `GAME_STEP`에 상수로만 정의하고, `createGame`이 좌석 구성을 인자로 받아 곧바로 첫 `EVENT_INTRO`에서 시작한다. 로비 처리기는 M3 | 낮음 |
| 2 | 이장에서 발생한 버프/디버프의 M1 내 소비처 | 이장이 Phase 1 마지막 이벤트라 적용될 다음 판정이 없음 | `teamModifier`에 저장되어 `PHASE1_COMPLETE`까지 유지되는 것까지만 구현·테스트한다 (소비는 M2 Phase 2) | 낮음 |
| 3 | 인간/봇 좌석 배정 규칙 | 룰북·아키텍처 모두 규정 없음 | `--humans N`일 때 첫째 → 둘째 → 셋째 순으로 인간을 채우고 나머지를 봇으로 둔다 | **중간** — 랜덤 배정이면 시드 재현성 테스트 설계가 달라짐 |
| 4 | `RESOLUTION` 체류 시간 | 룰북 §19에 결과 표시 시간 설정값이 없음 | 타이머 없이 즉시 다음 `EVENT_INTRO`로 전이한다. 화면 연출 시간이 필요해지면 M4에서 설정값을 추가 | 낮음 |
| 5 | 비공개 판정 대가 +10%의 적용 위치 | §5.4는 "성패 무관 고정"만 규정 | 시나리오 데이터에 넣지 않고 `RESOLUTION`에서 `GAME_CONFIG.hiddenJudgmentCostPercent`로 일괄 적용 (설정값 단일 출처 유지) | 낮음 |
| 6 | 귓속말 효과의 분류 | 아키 §5.4는 모든 효과에 분류를 요구하나 귓속말이 어디 속하는지 명시 없음 | 성공 귓속말은 `reward`, 거짓 귓속말은 `penalty`. 비공개 판정은 강제 성공·변이 대상이 아니라 계산 결과에는 영향이 없다 | 낮음 |
| 7 | 개입으로 성공이 된 튜토리얼 판정 | §12는 "판정 성공 시 연습 개입 창", §7.2는 "성공으로 바뀌면 창 즉시 종료" | 실전 창에서 성공으로 바뀐 경우 연습 창을 추가로 열지 않고 `RESOLUTION`으로 간다 (§7.2 우선) | **중간** — 튜토리얼 흐름 분기 |
| 8 | 협동 판정에서 부적 +1의 적용 대상 | §7.4는 "판정당 1개"만 규정하고 협동은 주사위가 3개 | 현재 최고값 주사위에 +1을 적용한다 (§5.3의 보상 수령자 갱신 규정과 정합). Phase 1 협동(T2-1)에는 보상이 없어 실질 영향은 없다 | 낮음 |
| 9 | 난수 상태의 세이브 재현성 | 아키 §5.1은 rng를 컨텍스트 주입으로 규정하고 상태에 넣지 않음 | M1은 시뮬레이터가 rng 인스턴스를 유지하므로 재현 가능. 세이브/복원 후 수열을 이어가려면 시드+카운터를 상태에 넣어야 하며, 이는 M2(봇 자동 대전)·M5(세이브)에서 결정한다 | 낮음 (M1 범위 밖) |

---

## 8. 진행 순서와 확인 방법

1. **M1-1** → `npm run typecheck -w tal-brothers-shared`
2. **M1-2** → `npm run typecheck -w tal-brothers-server` + `npm run test -w tal-brothers-server` (시나리오 무결성)
3. **M1-3** → 규칙 테스트 6종 통과
4. **M1-4** → 단계·봇 테스트 5종 통과
5. **M1-5** → `npm run sim:phase1 -w tal-brothers-server -- --seed 42`와 `--humans 1|2|3` 확인 후 흐름 테스트 통과
6. 마지막에 `docs/roadmap.md`의 M1 체크리스트와 진행 상태 표를 갱신

각 작업 단위가 끝날 때마다 변경 파일 목록, 테스트·타입 체크 결과 요약, 로드맵 갱신 내용을 보고한다.
