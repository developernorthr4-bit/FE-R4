import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import './index.css'
import { setUnauthorizedHandler } from './lib/api'
import router from './router'
import { useAuthStore } from './stores/auth'
import { useThemeStore } from './stores/theme'

const app = createApp(App)
app.use(createPinia())

// ตั้งธีมก่อน mount — inline script ใน index.html ปั๊ม data-theme ให้แล้ว
// ตรงนี้แค่ทำให้ store ตรงกับ DOM และเริ่มฟังการสลับโหมดของ OS
useThemeStore().init()

/**
 * เซสชันหมดอายุระหว่างเปิดหน้าค้างไว้ — ต้องพาออกไปเอง
 *
 * ต้องลงทะเบียนที่นี่ ไม่ใช่ในสโตร์ เพราะ router/index.ts import สโตร์อยู่แล้ว
 * ถ้าสโตร์ import router กลับมาจะกลายเป็นวงกลม
 *
 * เช็ค requiresAuth ก่อนย้ายหน้า เพราะถ้าอยู่หน้า login อยู่แล้วไม่ต้องทำอะไร
 * และ from= ทำให้ล็อกอินเสร็จแล้วกลับมาที่หน้าเดิมได้ ไม่ต้องเดินเมนูใหม่
 */
setUnauthorizedHandler((reason) => {
  useAuthStore().markSignedOut(reason)

  const current = router.currentRoute.value
  if (!current.meta.requiresAuth) return
  router.replace({
    name: 'login',
    query: current.path === '/dashboard' ? {} : { from: current.fullPath },
  })
})

app.use(router)
app.mount('#app')
