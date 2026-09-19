import type { LocationQueryValue } from 'vue-router'

/**
 * 로그인 후 돌아갈 경로 (M3 계획 6.1).
 *
 * **오리진에 묶이지 않는 앱 안의 경로만** 받는다. `//evil.com`이나 `https://…` 같은 값은 버린다.
 * 이 값은 쿼리스트링으로 오가므로, OAuth가 다른 오리진으로 되돌려도 그대로 살아남는다.
 */

export const NEXT_QUERY_KEY = 'next'

export function safeNextPath(
  value: LocationQueryValue | LocationQueryValue[] | undefined,
): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string' || raw.length === 0) return null

  // 앱 안의 절대 경로만 허용한다. `//host`는 프로토콜 상대 주소라 막는다
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  return raw
}
