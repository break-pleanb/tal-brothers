import type { RouteRecordRaw } from 'vue-router'

import { ROUTE_NAME } from '@/constants/routeName'

/**
 * 경로표 (아키텍처 §9.2, M3 계획 6.1).
 *
 * 레이아웃은 `meta` 분기가 아니라 **중첩 라우트의 부모 컴포넌트**로 둔다.
 * `/auth/callback`은 로딩 표시만 하므로 레이아웃 밖이다.
 */

declare module 'vue-router' {
  interface RouteMeta {
    /** 로그인이 필요한 경로. 가드가 인증 스토어 준비를 기다린 뒤 판단한다 */
    requiresAuth?: boolean
  }
}

export const routes: RouteRecordRaw[] = [
  {
    path: '/auth/callback',
    name: ROUTE_NAME.AUTH_CALLBACK,
    component: () => import('@/pages/AuthCallbackPage.vue'),
  },
  {
    // Display는 16:9 레터박스 스테이지가 뷰포트를 통째로 쓴다 (M4 계획 2.1)
    path: '/display/:roomCode',
    component: () => import('@/layouts/DisplayLayout.vue'),
    children: [
      {
        path: '',
        name: ROUTE_NAME.DISPLAY,
        component: () => import('@/pages/DisplayPage.vue'),
        meta: { requiresAuth: true },
      },
    ],
  },
  {
    // Controller는 세이프에어리어와 3단 고정 구성이 뷰포트를 통째로 쓴다 (M4 계획 3절)
    path: '/play/:roomCode',
    component: () => import('@/layouts/ControllerLayout.vue'),
    children: [
      {
        path: '',
        name: ROUTE_NAME.PLAY,
        component: () => import('@/pages/ControllerPage.vue'),
        meta: { requiresAuth: true },
      },
    ],
  },
  {
    path: '/',
    component: () => import('@/layouts/DefaultLayout.vue'),
    children: [
      {
        path: '',
        name: ROUTE_NAME.LANDING,
        component: () => import('@/pages/LandingPage.vue'),
      },
      {
        path: 'menu',
        name: ROUTE_NAME.MAIN_MENU,
        component: () => import('@/pages/MainMenuPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'join/:roomCode',
        name: ROUTE_NAME.JOIN,
        component: () => import('@/pages/JoinPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'lobby/:roomCode',
        name: ROUTE_NAME.LOBBY,
        component: () => import('@/pages/LobbyPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: ':pathMatch(.*)*',
        name: ROUTE_NAME.NOT_FOUND,
        component: () => import('@/pages/NotFoundPage.vue'),
      },
    ],
  },
]
