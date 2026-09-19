import { createApp } from 'vue'
import { createPinia } from 'pinia'

import './style.css'
import App from './App.vue'
import { router } from './router'
import { useAuthStore } from './stores/auth'

const app = createApp(App)
app.use(createPinia())

// 라우터 가드가 기다릴 수 있도록 세션 복원을 먼저 시작한다 (M3 계획 6.2)
useAuthStore().initialize()

app.use(router)
app.mount('#app')
