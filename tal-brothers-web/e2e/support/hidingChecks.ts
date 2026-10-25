import { CUE_KIND, JUDGMENT_KIND, SERVER_MESSAGE_TYPE } from 'tal-brothers-shared'
import type { BrotherRole } from 'tal-brothers-shared'

import type { Device, FrameRecord } from './harness'

/**
 * 화면 기준 은닉 검사 (m4-plan 6.3을 자동화한 것, 11.4).
 *
 * 투영은 서버 테스트가 이미 고정했다 (M2-6). 여기서 막는 것은 **web이 받은 값을 엉뚱한 화면에 그리는 것**과
 * Display 소켓으로 비공개 값이 흘러가는 것이다. 위반은 예외로 던지지 않고 모아서 돌려준다 —
 * 한 판에서 나온 위반을 한꺼번에 보고하기 위해서다.
 */

export type Violation = {
  device: string
  where: string
  detail: string
}

/** Display에 있으면 안 되는 화면 요소 (m4-plan 11.4 `data-testid` 표) */
export const PRIVATE_TEST_IDS = [
  'erosion-gauge',
  'inventory',
  'variant-label',
  'true-sight',
  'whisper',
  'red-message',
  'talisman-panel',
] as const

/**
 * Controller 화면에 나올 수 있는 요소 전부 (m4-plan 11.4).
 *
 * 배신자 화면이 일반 화면과 같아야 한다(룰북 §17)는 것을 **허용 목록**으로 본다. 배신자 Controller에 이 목록 밖의
 * 요소가 나오면 배신자 전용 화면이 생긴 것이다. 단계마다 표본을 떠서 좌석끼리 비교하면 찍는 순간에 따라
 * 흔들리므로(투표 단계가 짧으면 일반 좌석의 투표 화면이 안 찍힌다) 이렇게 고정한다.
 * Controller에 새 요소를 더하면 이 목록에도 더한다 — 일반 좌석에도 나오는 요소인지 그때 판단한다
 */
export const CONTROLLER_TEST_IDS = [
  'erosion-gauge',
  'inventory',
  'variant-label',
  'vote-choice',
  'roll-button',
  'intervention-reroll',
  'intervention-talisman',
  'intervention-force',
  'ability-true-sight',
  'true-sight',
  'true-sight-close',
  'talisman-panel',
  'talisman-heal',
  'talisman-transfer',
  'talisman-discard',
  'talisman-submit',
  'whisper',
  'cue-toast',
  'red-message',
  'reconnect-notice',
  'ending-summary',
  'noise',
  'asset-preload',
] as const

/** Display 스냅샷 어디에도 있으면 안 되는 키 (아키텍처 §7.3) */
export const PRIVATE_SNAPSHOT_KEYS = [
  'erosionPercent',
  'talismanCount',
  'talismanOverflow',
  'tutorialTalismanCount',
  'hasJadeHairpin',
  'whispers',
  'variantLabels',
  'myVote',
  'botTakeover',
  'isTraitor',
  'userId',
] as const

/** Display로 오면 안 되는 cue (룰북 §16, §10.1, §3.4) */
export const DISPLAY_FORBIDDEN_CUES: string[] = [
  CUE_KIND.WHISPER_RECEIVED,
  CUE_KIND.RED_MESSAGE,
  CUE_KIND.TRUE_SIGHT_RESULT,
]

/** 붉은 메시지 문구의 일부 (룰북 §10.1). Display에 나오면 안 된다 */
const RED_MESSAGE_FRAGMENT = '형제들을 파멸로'

/**
 * 비공개 판정의 대가 표기는 수치 비공개 원칙의 **유일한 예외**다 (룰북 §5.4).
 * `대가 +10%`와 룰북 표기 `대가: 잠식도 10% 상승`을 모두 허용한다
 */
const HIDDEN_COST_PATTERN = /대가\s*:?\s*\+?\s*(잠식도\s*)?\d+%(\s*상승)?/g

function collectKeys(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys)
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key)
      collectKeys(child, keys)
    }
  }
}

function snapshotsOf(frames: FrameRecord[]): Record<string, unknown>[] {
  return frames
    .filter((frame) => frame.message.t === SERVER_MESSAGE_TYPE.SNAPSHOT)
    .map((frame) => frame.message['snapshot'] as Record<string, unknown>)
}

function cuesOf(frames: FrameRecord[]): { kind: string; text: string; data?: Record<string, unknown> }[] {
  return frames
    .filter((frame) => frame.message.t === SERVER_MESSAGE_TYPE.CUE)
    .flatMap((frame) => frame.message['cues'] as { kind: string; text: string }[])
}

/** 좌석이 받은 귓속말 문장 전부 — 스냅샷의 `whispers`와 `whisperReceived` cue */
export function whisperTextsOf(device: Device): string[] {
  const texts = new Set<string>()
  for (const snapshot of snapshotsOf(device.frames)) {
    const whispers = snapshot['whispers'] as { text: string }[] | undefined
    for (const whisper of whispers ?? []) texts.add(whisper.text)
  }
  for (const cue of cuesOf(device.frames)) {
    if (cue.kind === CUE_KIND.WHISPER_RECEIVED) texts.add(cue.text)
  }
  return [...texts]
}

/** `step`은 DOM을 읽은 **그 순간**의 단계다. 체크포인트를 잡은 뒤 단계가 넘어갔을 수 있다 */
type DomReading = { text: string; testIds: string[]; step: string }

async function readDom(device: Device): Promise<DomReading | null> {
  return device.page
    .evaluate(() => ({
      step: document.querySelector('[data-step]')?.getAttribute('data-step') ?? '',
      text: document.body.innerText,
      testIds: [...document.querySelectorAll('[data-testid]')].map(
        (element) => element.getAttribute('data-testid') ?? '',
      ),
    }))
    .catch(() => null)
}

/** Display 화면 — 단계마다 부른다 */
export async function checkDisplayDom(
  display: Device,
  context: { where: string; step: string; whisperTexts: string[] },
): Promise<Violation[]> {
  const reading = await readDom(display)
  if (reading === null) return []
  const violations: Violation[] = []
  const add = (detail: string): void => {
    violations.push({ device: display.label, where: context.where, detail })
  }

  for (const id of reading.testIds) {
    if ((PRIVATE_TEST_IDS as readonly string[]).includes(id)) add(`비공개 요소 ${id}가 Display에 있다`)
  }

  const withoutCost = reading.text.replace(HIDDEN_COST_PATTERN, '')
  const percent = withoutCost.indexOf('%')
  if (percent >= 0) {
    add(`Display에 %가 있다: "${withoutCost.slice(Math.max(0, percent - 20), percent + 5)}"`)
  }

  for (const whisper of context.whisperTexts) {
    if (whisper.length > 0 && reading.text.includes(whisper)) add(`귓속말 내용이 Display에 있다: "${whisper}"`)
  }
  if (reading.text.includes('봇 대행')) add('"봇 대행" 표기가 있다 (룰북 §17)')
  if (reading.text.includes(RED_MESSAGE_FRAGMENT)) add('붉은 메시지 문구가 Display에 있다')
  if (reading.step !== 'ending' && reading.text.includes('배신자')) {
    add('엔딩 전에 배신자 표기가 있다 (룰북 §17)')
  }
  return violations
}

/** Display가 받은 ws 메시지 전부 — 판이 끝난 뒤 한 번 부른다 */
export function checkDisplayFrames(display: Device): Violation[] {
  const violations: Violation[] = []
  const add = (where: string, detail: string): void => {
    violations.push({ device: display.label, where, detail })
  }

  for (const [index, snapshot] of snapshotsOf(display.frames).entries()) {
    const keys = new Set<string>()
    collectKeys(snapshot, keys)
    for (const key of PRIVATE_SNAPSHOT_KEYS) {
      if (keys.has(key)) add(`스냅샷 #${index}`, `비공개 키 ${key}가 Display 스냅샷에 있다`)
    }
    if (snapshot['seat'] !== undefined) add(`스냅샷 #${index}`, '좌석 스냅샷이 Display로 왔다')

    const judgment = snapshot['judgment'] as Record<string, unknown> | null | undefined
    if (judgment?.['kind'] === JUDGMENT_KIND.HIDDEN) {
      for (const field of ['dice', 'finalValue', 'threshold', 'succeeded']) {
        if (judgment[field] !== null) add(`스냅샷 #${index}`, `비공개 판정의 ${field}가 Display에 있다`)
      }
    }
  }

  for (const cue of cuesOf(display.frames)) {
    if (DISPLAY_FORBIDDEN_CUES.includes(cue.kind)) add('cue', `Display로 ${cue.kind} cue가 왔다`)
  }
  return violations
}

/** Controller 화면 — 단계마다 부른다. `othersWhispers`는 다른 좌석이 받은 문장이다 */
export async function checkControllerDom(
  device: Device,
  context: { where: string; ownWhispers: string[]; othersWhispers: string[] },
): Promise<Violation[]> {
  const reading = await readDom(device)
  if (reading === null) return []
  const violations: Violation[] = []
  for (const whisper of context.othersWhispers) {
    // 같은 문장을 나도 받았다면 내 것이다
    if (context.ownWhispers.includes(whisper)) continue
    if (whisper.length > 0 && reading.text.includes(whisper)) {
      violations.push({ device: device.label, where: context.where, detail: `다른 좌석의 귓속말이 보인다: "${whisper}"` })
    }
  }
  if (reading.text.includes('연결 끊김')) {
    violations.push({ device: device.label, where: context.where, detail: 'Controller에 연결 끊김 표기가 있다 (룰북 §17)' })
  }
  if (reading.text.includes('봇 대행')) {
    violations.push({ device: device.label, where: context.where, detail: '"봇 대행" 표기가 있다 (룰북 §17)' })
  }
  return violations
}

/** Controller가 받은 ws 메시지 전부 — 언제나 자기 좌석의 스냅샷만 와야 한다 */
export function checkControllerFrames(device: Device, seat: BrotherRole): Violation[] {
  const violations: Violation[] = []
  for (const [index, snapshot] of snapshotsOf(device.frames).entries()) {
    const owner = snapshot['seat']
    if (owner !== undefined && owner !== seat) {
      violations.push({ device: device.label, where: `스냅샷 #${index}`, detail: `다른 좌석(${String(owner)})의 스냅샷이 왔다` })
    }
    if (snapshot['seatConnections'] !== undefined) {
      violations.push({ device: device.label, where: `스냅샷 #${index}`, detail: '좌석별 연결 상태가 Controller로 왔다' })
    }
  }
  return violations
}

/** 저장소에 스냅샷을 두지 않는다 (m4-plan 6.3). 허용 목록 밖의 키를 찾는다 */
export const ALLOWED_STORAGE_PREFIXES = ['tal:deviceRole:', 'tal:e2e:']

export async function checkStorage(device: Device): Promise<Violation[]> {
  const keys = await device.page
    .evaluate(() => [
      ...Object.keys(window.localStorage).map((key) => `local:${key}`),
      ...Object.keys(window.sessionStorage).map((key) => `session:${key}`),
    ])
    .catch(() => [] as string[])
  return keys
    .filter((entry) => !ALLOWED_STORAGE_PREFIXES.some((prefix) => entry.split(':').slice(1).join(':').startsWith(prefix)))
    .map((entry) => ({ device: device.label, where: 'storage', detail: `허용되지 않은 저장소 키 ${entry}` }))
}

/** 화면에 나온 testid 목록 — 배신자 화면이 일반 화면과 같은지 비교하는 데 쓴다 */
export async function testIdsOf(device: Device): Promise<string[]> {
  const reading = await readDom(device)
  return reading === null ? [] : [...new Set(reading.testIds)]
}
