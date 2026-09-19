/**
 * 인앱 브라우저 감지 (아키텍처 §10).
 *
 * Google이 인앱 브라우저의 OAuth를 막는다. 카카오톡으로 받은 초대 링크를 그대로 열면
 * 로그인 화면에서 막히므로, 초대 페이지에서 외부 브라우저로 열도록 안내한다.
 */

const IN_APP_PATTERNS: ReadonlyArray<{ id: string; label: string; pattern: RegExp }> = [
  { id: 'kakaotalk', label: '카카오톡', pattern: /KAKAOTALK/i },
  { id: 'instagram', label: '인스타그램', pattern: /Instagram/i },
  { id: 'facebook', label: '페이스북', pattern: /\bFBAN\b|\bFBAV\b/i },
  { id: 'line', label: '라인', pattern: /\bLine\//i },
  { id: 'naver', label: '네이버', pattern: /NAVER\(inapp/i },
  { id: 'daum', label: '다음', pattern: /DaumApps/i },
]

export type InAppBrowser = {
  id: string
  label: string
}

/** 인앱 브라우저면 어떤 앱인지, 아니면 null */
export function detectInAppBrowser(userAgent: string = navigator.userAgent): InAppBrowser | null {
  const found = IN_APP_PATTERNS.find((entry) => entry.pattern.test(userAgent))
  return found === undefined ? null : { id: found.id, label: found.label }
}
