import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import './index.css'
import router from './router'
import { useThemeStore } from './stores/theme'

const app = createApp(App)
app.use(createPinia())

// ตั้งธีมก่อน mount — inline script ใน index.html ปั๊ม data-theme ให้แล้ว
// ตรงนี้แค่ทำให้ store ตรงกับ DOM และเริ่มฟังการสลับโหมดของ OS
useThemeStore().init()

app.use(router)
app.mount('#app')
