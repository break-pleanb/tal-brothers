/** 라우트 이름 (아키텍처 §9.2). 경로 문자열을 화면에 흩뿌리지 않는다 */
export const ROUTE_NAME = {
  LANDING: 'landing',
  AUTH_CALLBACK: 'authCallback',
  MAIN_MENU: 'mainMenu',
  JOIN: 'join',
  LOBBY: 'lobby',
  DISPLAY: 'display',
  PLAY: 'play',
  NOT_FOUND: 'notFound',
} as const

export type RouteName = (typeof ROUTE_NAME)[keyof typeof ROUTE_NAME]
