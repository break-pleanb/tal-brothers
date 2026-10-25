import { describe, expect, it } from 'vitest'

import { SEAT_ORDER } from '../../../src/engine/state/gameState'
import { runGame } from '../../../src/sim/playGame'
import type { GameRunOptions } from '../../../src/sim/playGame'

type StepResult = Parameters<NonNullable<GameRunOptions['onStep']>>[0]

/**
 * 화면으로 나가는 문장에 좌석 값이 섞이지 않는다 (룰북 §3.5, §7.4, §17).
 *
 * 회귀: 공개 알림 일부와 주사위 cue가 `first가 낡은 부적을 사용했다`·`first 6 · second 4`처럼
 * 좌석 값을 그대로 썼다 (m4-notes 자동 확인, M4-5b). 서버 감사 로그(`logs`)는 사람이 보는 화면이 아니라 대상이 아니다.
 * 판을 여러 번 돌려 **공개 알림·cue·귓속말의 모든 문장**을 모으고, 좌석 값이 단어로 나오지 않는지 본다.
 */

const RAW_SEAT = /\b(first|second|third)\b/

describe('화면 문장의 형제 이름', () => {
  it('공개 알림·cue·귓속말에 좌석 값이 그대로 나가지 않는다', () => {
    const texts = new Set<string>()
    const collect = (result: StepResult): void => {
      for (const notice of result.state.notices) texts.add(notice.text)
      for (const cue of result.cues) texts.add(cue.text)
      for (const seat of SEAT_ORDER) {
        for (const whisper of result.state.seats[seat].whispers) texts.add(whisper.text)
      }
    }

    for (let seed = 1; seed <= 30; seed += 1) {
      runGame({ seed, humans: 1 + (seed % 3), onStep: collect })
    }

    const leaked = [...texts].filter((text) => RAW_SEAT.test(text))
    expect(leaked).toEqual([])
    // 이름을 넣는 문장이 실제로 나왔는지 — 검사가 빈 판을 본 것이 아니다
    expect([...texts].some((text) => /^(첫째|둘째|셋째)가 /.test(text))).toBe(true)
  })
})
