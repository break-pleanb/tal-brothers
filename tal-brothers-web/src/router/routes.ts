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
        path: ':pathMatch(.*)*',
        name: ROUTE_NAME.NOT_FOUND,
        component: () => import('@/pages/NotFoundPage.vue'),
      },
    ],
  },
]
