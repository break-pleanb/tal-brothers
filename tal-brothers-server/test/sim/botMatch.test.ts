import { describe, expect, it } from 'vitest'
import { BROTHER_ROLE, GAME_PHASE } from 'tal-brothers-shared'

import {
  aggregate,
  countBy,
  formatAggregate,
  histogram10,
  mean,
  median,
  parseBotMatchArgs,
  runMatches,
  summarize,
} from '../../src/sim/botMatch'
import { runGame } from '../../src/sim/playGame'

/** 봇 자동 대전 집계 (M2 계획 8절) */

describe('집계 산술', () => {
  it('평균과 중앙값을 계산한다', () => {
    expect(mean([10, 20, 30])).toBe(20)
    expect(mean([])).toBe(0)
    expect(median([30, 10, 20])).toBe(20)
    expect(median([40, 10, 20, 30])).toBe(25)
    expect(median([])).toBe(0)
  })

  it('10% 구간 히스토그램은 11칸이고 100%는 마지막 칸이다', () => {
    const bins = histogram10([0, 5, 10, 55, 99, 100, 100])

    expect(bins).toHaveLength(11)
    expect(bins[0]).toBe(2)
    expect(bins[1]).toBe(1)
    expect(bins[5]).toBe(1)
    expect(bins[9]).toBe(1)
    expect(bins[10]).toBe(2)
    expect(bins.reduce((sum, value) => sum + value, 0)).toBe(7)
  })

  it('값별 개수를 센다', () => {
    expect(countBy(['a', 'b', 'a'])).toEqual({ a: 2, b: 1 })
  })
})

describe('판 요약 (M2 계획 8.1)', () => {
  it('로그와 최종 상태에서 지표를 뽑는다', () => {
    const run = runGame({ seed: 7, humans: 3 })
    const summary = summarize(run)

    expect(summary.seed).toBe(7)
    expect(summary.humans).toBe(3)
    expect(summary.endingId).toBe(run.finalState.ending?.id)
    expect(summary.traitorWon).toBe(run.finalState.ending?.traitorWon)
    expect(summary.elapsedMs).toBe(run.endedAt - run.startedAt)

    // Phase 3 장면은 상황 제시 단계를 거치지 않으므로 이벤트 목록에는 Phase 1~2만 담긴다
    expect(summary.eventsPlayed.length).toBe(
      run.events.filter((event) => event.phase !== GAME_PHASE.PHASE_3).length,
    )

    // 배신자 수는 최종 상태와 맞다
    const traitors = [BROTHER_ROLE.FIRST, BROTHER_ROLE.SECOND, BROTHER_ROLE.THIRD].filter(
      (role) => run.finalState.seats[role].isTraitor,
    )
    expect(summary.traitorCount).toBe(traitors.length)

    // 변이는 이벤트당 선택지 수만큼 굴려진다
    const totalVariants = Object.values(summary.variants).reduce((sum, value) => sum + value, 0)
    expect(totalVariants).toBeGreaterThan(0)
  })

  it('Phase 3에 도달하면 그 시점의 잠식도를 남긴다', () => {
    const summaries = runMatches(6, 1, 3)
    const reached = summaries.filter((summary) => summary.reachedPhase3)

    expect(reached.length).toBeGreaterThan(0)
    for (const summary of reached) {
      expect(summary.erosionAtPhase2End).not.toBeNull()
      for (const role of [BROTHER_ROLE.FIRST, BROTHER_ROLE.SECOND, BROTHER_ROLE.THIRD]) {
        const value = summary.erosionAtPhase2End?.[role] ?? -1
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(100)
      }
    }
  })
})

describe('여러 판 집계', () => {
  it('판수와 비율이 맞는다', () => {
    const summaries = runMatches(10, 100, 3)
    const result = aggregate(summaries)

    expect(result.games).toBe(10)
    expect(result.humans).toBe(3)

    const endingTotal = Object.values(result.endings).reduce((sum, value) => sum + value, 0)
    expect(endingTotal).toBe(10)

    const traitorTotal = Object.values(result.traitorCountDistribution).reduce(
      (sum, value) => sum + value,
      0,
    )
    expect(traitorTotal).toBe(10)

    expect(result.traitorWinRate).toBeGreaterThanOrEqual(0)
    expect(result.traitorWinRate).toBeLessThanOrEqual(1)
    expect(result.forcedTimeoutRate).toBeLessThanOrEqual(result.clockExpiredRate)

    // 잠식도 표본은 Phase 3에 도달한 판 × 좌석 3개다
    const reached = summaries.filter((summary) => summary.reachedPhase3).length
    expect(result.erosionAtPhase2End).toHaveLength(reached * 3)
  })

  it('같은 시드와 판수는 같은 결과를 낸다 (아키 §5.5)', () => {
    expect(JSON.stringify(runMatches(5, 42, 2))).toBe(JSON.stringify(runMatches(5, 42, 2)))
  })

  it('보고서에 8.2의 지표가 모두 들어간다', () => {
    const text = formatAggregate(aggregate(runMatches(5, 1, 3))).join('\n')

    for (const heading of [
      'Phase 2 종료 시 잠식도',
      '배신자',
      '엔딩 분포',
      '시계',
      '판정 성공률',
      '개입 창',
      '부적 경제',
      '변이 실제 비율',
    ]) {
      expect(text).toContain(heading)
    }
  })
})

describe('CLI 인자', () => {
  it('기본값은 100판·시드 1·인간 3명이다', () => {
    expect(parseBotMatchArgs([])).toEqual({ games: 100, seed: 1, humans: [3], json: false })
  })

  it('구성 목록과 all을 받는다', () => {
    expect(parseBotMatchArgs(['--humans', '0,3']).humans).toEqual([0, 3])
    expect(parseBotMatchArgs(['--humans', 'all']).humans).toEqual([0, 1, 2, 3])
    expect(parseBotMatchArgs(['--games', '300', '--seed', '7']).games).toBe(300)
    expect(parseBotMatchArgs(['--json']).json).toBe(true)
  })

  it('범위를 벗어난 인자는 예외를 던진다', () => {
    expect(() => parseBotMatchArgs(['--games', '0'])).toThrow()
    expect(() => parseBotMatchArgs(['--humans', '4'])).toThrow()
    expect(() => parseBotMatchArgs(['--seed', 'abc'])).toThrow()
  })
})
