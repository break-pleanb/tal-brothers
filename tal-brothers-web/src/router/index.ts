import { createRouter, createWebHistory } from 'vue-router'

import { authGuard } from './guards'
import { routes } from './routes'

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(authGuard)
