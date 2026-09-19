/**
 * 토큰 검증 (아키텍처 §10, M3 계획 10절 4번).
 *
 * 구현은 `supabase.auth.getUser(token)`이다. 의존성이 늘지 않고 프로젝트의 JWT 서명 키 설정에
 * 영향받지 않으며, 연결당 1회만 부른다.
 *
 * 세션·REST는 이 **인터페이스만** 알고, 테스트는 가짜를 넣어 실제 Supabase를 부르지 않는다.
 */

export type AuthUser = {
  userId: string
  /** 로비에 보여줄 이름. 프로필이 없으면 null */
  displayName: string | null
  email: string | null
}

export type AuthVerifier = {
  /** 토큰이 유효하면 사용자, 아니면 null */
  verify(token: string): Promise<AuthUser | null>
}
