import { describe, expect, it } from 'vitest'
import { ATTRIBUTE, BROTHER_ROLE, JUDGMENT_KIND } from 'tal-brothers-shared'

import { GAME_CONFIG } from '../../../src/scenario/gameConfig'
import {
  ATTRIBUTE_OWNER,
  addTeamModifier,
  clampTeamModifier,
  roleBonusFor,
  rollerSeatFor,
} from '../../../src/engine/rules/modifiers'

describe('판정자와 직업 보정 (룰북 §3.1)', () => {
  it('속성 담당 형제가 판정자다', () => {
    expect(rollerSeatFor(ATTRIBUTE.STRENGTH)).toBe(BROTHER_ROLE.FIRST)
    expect(rollerSeatFor(ATTRIBUTE.AGILITY)).toBe(BROTHER_ROLE.SECOND)
    expect(rollerSeatFor(ATTRIBUTE.KNOWLEDGE)).toBe(BROTHER_ROLE.THIRD)
    expect(ATTRIBUTE_OWNER[ATTRIBUTE.KNOWLEDGE]).toBe(BROTHER_ROLE.THIRD)
  })

  it('담당 속성 개인 판정에 +1, 비담당 좌석은 0', () => {
    expect(roleBonusFor(JUDGMENT_KIND.SOLO, ATTRIBUTE.STRENGTH, BROTHER_ROLE.FIRST)).toBe(1)
    expect(roleBonusFor(JUDGMENT_KIND.SOLO, ATTRIBUTE.STRENGTH, BROTHER_ROLE.SECOND)).toBe(0)
    expect(roleBonusFor(JUDGMENT_KIND.SOLO, ATTRIBUTE.KNOWLEDGE, BROTHER_ROLE.THIRD)).toBe(1)
  })

  it('비공개 판정에도 담당 +1을 적용한다', () => {
    expect(roleBonusFor(JUDGMENT_KIND.HIDDEN, ATTRIBUTE.KNOWLEDGE, BROTHER_ROLE.THIRD)).toBe(1)
    expect(roleBonusFor(JUDGMENT_KIND.HIDDEN, ATTRIBUTE.KNOWLEDGE, BROTHER_ROLE.FIRST)).toBe(0)
  })

  it('협동 판정에는 직업 보정이 없다 (룰북 §5.2)', () => {
    expect(roleBonusFor(JUDGMENT_KIND.COOP, null, BROTHER_ROLE.FIRST)).toBe(0)
    expect(roleBonusFor(JUDGMENT_KIND.COOP, ATTRIBUTE.STRENGTH, BROTHER_ROLE.FIRST)).toBe(0)
  })
})

describe('버프와 디버프 (룰북 §5.5)', () => {
  it('버프와 디버프를 합산한다', () => {
    expect(addTeamModifier(0, 1)).toBe(1)
    expect(addTeamModifier(1, -1)).toBe(0)
    expect(addTeamModifier(1, 1)).toBe(2)
  })

  it('디버프 합계에 하한 -2를 적용한다', () => {
    expect(addTeamModifier(-1, -1)).toBe(GAME_CONFIG.debuffFloor)
    expect(addTeamModifier(-2, -1)).toBe(GAME_CONFIG.debuffFloor)
    expect(clampTeamModifier(-5)).toBe(GAME_CONFIG.debuffFloor)
    expect(GAME_CONFIG.debuffFloor).toBe(-2)
  })

  it('버프에는 상한을 두지 않는다', () => {
    expect(clampTeamModifier(3)).toBe(3)
  })
})
