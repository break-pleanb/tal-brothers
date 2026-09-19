import { describe, expect, it } from 'vitest'
import { BROTHER_ROLE, CLIENT_FRAME_TYPE, COMMAND_TYPE, DEVICE_ROLE } from 'tal-brothers-shared'

import { decodeClientFrame, decodeCommand } from '../../src/transport/ws/commandCodec'

/** 프레임 검증 1겹 (M3 계획 3.3, 9.1 M3-4 3번) */

describe('프레임 읽기', () => {
  it('hello 프레임을 읽는다', () => {
    const result = decodeClientFrame(
      JSON.stringify({
        t: CLIENT_FRAME_TYPE.HELLO,
        token: 'token-1',
        roomCode: 'ABCDEF',
        deviceRole: DEVICE_ROLE.DISPLAY,
      }),
    )

    expect(result.kind).toBe('frame')
    if (result.kind !== 'frame') return
    expect(result.frame).toEqual({
      t: CLIENT_FRAME_TYPE.HELLO,
      token: 'token-1',
      roomCode: 'ABCDEF',
      deviceRole: DEVICE_ROLE.DISPLAY,
    })
  })

  it('깨진 JSON과 모르는 프레임 종류는 프레임을 읽지 못한 것으로 본다', () => {
    expect(decodeClientFrame('{{{').kind).toBe('badFrame')
    expect(decodeClientFrame('"문자열"').kind).toBe('badFrame')
    expect(decodeClientFrame(JSON.stringify({ t: 'nope' })).kind).toBe('badFrame')
  })

  it('hello 본문이 어긋나면 읽지 않는다', () => {
    const noToken = decodeClientFrame(
      JSON.stringify({ t: CLIENT_FRAME_TYPE.HELLO, roomCode: 'ABCDEF', deviceRole: 'display' }),
    )
    const badRole = decodeClientFrame(
      JSON.stringify({
        t: CLIENT_FRAME_TYPE.HELLO,
        token: 'x',
        roomCode: 'ABCDEF',
        deviceRole: 'tablet',
      }),
    )

    expect(noToken.kind).toBe('badFrame')
    expect(badRole.kind).toBe('badFrame')
  })

  it('command 프레임의 seq가 없으면 읽지 못한다', () => {
    const result = decodeClientFrame(
      JSON.stringify({
        t: CLIENT_FRAME_TYPE.COMMAND,
        command: { type: COMMAND_TYPE.ROLL_REQUEST },
      }),
    )
    expect(result.kind).toBe('badFrame')
  })

  it('resync는 haveVersion이 정수여야 한다', () => {
    const good = decodeClientFrame(
      JSON.stringify({ t: CLIENT_FRAME_TYPE.RESYNC, haveVersion: 12 }),
    )
    const bad = decodeClientFrame(
      JSON.stringify({ t: CLIENT_FRAME_TYPE.RESYNC, haveVersion: '12' }),
    )

    expect(good.kind).toBe('frame')
    expect(bad.kind).toBe('badFrame')
  })
})

describe('명령 읽기', () => {
  it('본문이 없는 명령을 그대로 읽는다', () => {
    expect(decodeCommand({ type: COMMAND_TYPE.ROLL_REQUEST })).toEqual({
      type: COMMAND_TYPE.ROLL_REQUEST,
    })
  })

  it('필드가 있는 명령은 타입까지 본다', () => {
    expect(decodeCommand({ type: COMMAND_TYPE.VOTE_SUBMIT, choiceId: 't1-a' })).toEqual({
      type: COMMAND_TYPE.VOTE_SUBMIT,
      choiceId: 't1-a',
    })
    expect(decodeCommand({ type: COMMAND_TYPE.VOTE_SUBMIT, choiceId: 7 })).toBeNull()
    expect(decodeCommand({ type: COMMAND_TYPE.LOBBY_PICK_SEAT, seat: 'fourth' })).toBeNull()
    expect(
      decodeCommand({ type: COMMAND_TYPE.LOBBY_TOGGLE_BOT, seat: BROTHER_ROLE.FIRST }),
    ).toBeNull()
  })

  it('모르는 종류와 객체가 아닌 값은 읽지 않는다', () => {
    expect(decodeCommand({ type: 'game.hack' })).toBeNull()
    expect(decodeCommand(null)).toBeNull()
    expect(decodeCommand([])).toBeNull()
  })

  it('command 프레임 안의 명령이 어긋나면 seq를 남겨 거절할 수 있게 한다', () => {
    const result = decodeClientFrame(
      JSON.stringify({ t: CLIENT_FRAME_TYPE.COMMAND, seq: 9, command: { type: 'game.hack' } }),
    )

    expect(result.kind).toBe('badCommand')
    if (result.kind !== 'badCommand') return
    expect(result.seq).toBe(9)
  })

  it('알려진 필드만 남긴다 — 넘어온 잉여 필드는 버린다', () => {
    const decoded = decodeCommand({
      type: COMMAND_TYPE.VOTE_SUBMIT,
      choiceId: 't1-a',
      erosionPercent: 0,
    })
    expect(decoded).toEqual({ type: COMMAND_TYPE.VOTE_SUBMIT, choiceId: 't1-a' })
  })
})
