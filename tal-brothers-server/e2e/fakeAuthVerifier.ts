import type { AuthUser, AuthVerifier } from '../src/infra/authVerifier'

/**
 * 가짜 토큰 검증 — 통합 테스트 전용 (m4-plan 11.1 1번).
 *
 * 토큰 형식은 `e2e.<userId>.<base64url(표시 이름)>`이다. 그 밖의 토큰은 모두 거절한다.
 * 이 파일은 `src/` 밖에 있고 `e2e/e2eServer.ts`만 import한다. **운영 진입점(`src/index.ts`)에는 우회 경로가 없다.**
 */

export const E2E_TOKEN_PREFIX = 'e2e'

export function e2eToken(userId: string, displayName: string): string {
  const name = Buffer.from(displayName, 'utf8').toString('base64url')
  return `${E2E_TOKEN_PREFIX}.${userId}.${name}`
}

export function createFakeAuthVerifier(): AuthVerifier {
  return {
    async verify(token): Promise<AuthUser | null> {
      const parts = token.split('.')
      if (parts.length !== 3 || parts[0] !== E2E_TOKEN_PREFIX) return null

      const userId = parts[1] ?? ''
      if (userId === '') return null

      const displayName = Buffer.from(parts[2] ?? '', 'base64url').toString('utf8')
      return {
        userId,
        displayName: displayName === '' ? null : displayName,
        email: null,
      }
    },
  }
}
