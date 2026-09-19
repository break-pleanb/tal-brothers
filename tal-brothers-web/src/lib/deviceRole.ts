import { DEVICE_ROLE } from 'tal-brothers-shared'
import type { DeviceRole } from 'tal-brothers-shared'

/**
 * 이 기기가 Display인지 Controller인지 (M3 계획 10절 14번, 아키텍처 §1).
 *
 * **화면 폭으로 가르지 않는다.** 방을 만든 기기가 중계 화면(Display)이고,
 * 초대 링크로 들어온 기기는 조작 기기(Controller)다. 호스트도 폰으로는 Controller다.
 *
 * 기기마다 다른 판단이므로 계정이 아니라 **브라우저 저장소**에 남긴다.
 */

const KEY_PREFIX = 'tal:deviceRole:'

function keyOf(roomCode: string): string {
  return `${KEY_PREFIX}${roomCode.toUpperCase()}`
}

export function rememberDeviceRole(roomCode: string, role: DeviceRole): void {
  try {
    localStorage.setItem(keyOf(roomCode), role)
  } catch {
    // 저장소가 막혀 있어도 아래 기본 규칙으로 판단한다
  }
}

function storedDeviceRole(roomCode: string): DeviceRole | null {
  try {
    const value = localStorage.getItem(keyOf(roomCode))
    return value === DEVICE_ROLE.DISPLAY || value === DEVICE_ROLE.CONTROLLER ? value : null
  } catch {
    return null
  }
}

/**
 * 이 기기의 역할.
 *
 * 방을 만든 기기와 초대 링크로 참가한 기기가 각각 자기 역할을 기억해 둔다.
 * 기억이 없으면 **조작 기기로 본다.** 잘못 짚어도 좌석을 고르는 화면이 뜰 뿐이고,
 * 반대로 Display를 잘못 짚으면 호스트가 아닌 계정은 서버가 접속 자체를 거절한다 (M3 계획 3.2)
 */
export function resolveDeviceRole(roomCode: string): DeviceRole {
  return storedDeviceRole(roomCode) ?? DEVICE_ROLE.CONTROLLER
}

/**
 * 이 기기가 폰처럼 보이는지 (M4 계획 3.4).
 *
 * **화면 폭으로 가르지 않는다.** 창을 좁혀도 PC는 PC다.
 * 손가락으로 누르는 기기인지(`pointer: coarse`)와 터치 점 개수로 본다.
 * 틀리게 짚어도 안내만 뜨고 조작은 막지 않는다 (9절 6번).
 */
export function looksLikePhone(): boolean {
  if (typeof window === 'undefined') return true
  const coarse = window.matchMedia?.('(pointer: coarse)').matches === true
  const touch = navigator.maxTouchPoints > 0
  return coarse && touch
}
