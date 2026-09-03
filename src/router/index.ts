import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import type { Role } from '../lib/roles'

declare module 'vue-router' {
  interface RouteMeta {
    /** ต้องล็อกอินก่อน */
    requiresAuth?: boolean
    /** บทบาทขั้นต่ำ — ตรวจด้วย ROLE_LEVEL ไม่ใช่เทียบชื่อตรง ๆ */
    minRole?: Role
    /** ล็อกอินอยู่แล้วห้ามเข้า (หน้า login / register) */
    guestOnly?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { guestOnly: true } },
    { path: '/register', name: 'register', component: () => import('../views/RegisterView.vue'), meta: { guestOnly: true } },
    { path: '/reset-password', name: 'reset-password', component: () => import('../views/ResetPasswordView.vue') },

    { path: '/home', name: 'home', component: () => import('../views/Home.vue'), meta: { requiresAuth: true } },

    { path: '/dashboard', name: 'dashboard', component: () => import('../views/DashboardView.vue'), meta: { requiresAuth: true } },

    // ทะเบียนตู้/แบตเตอรี่ + ผลตรวจ PM — อ่านได้ทุก role เหมือนแดชบอร์ด
    { path: '/maintenance', name: 'maintenance', component: () => import('../views/MaintenanceView.vue'), meta: { requiresAuth: true } },

    // /events/new ต้องมาก่อน /events/:id ไม่งั้น "new" จะถูกจับเป็น id
    { path: '/events', name: 'events', component: () => import('../views/EventsView.vue'), meta: { requiresAuth: true } },
    { path: '/events/new', name: 'event-new', component: () => import('../views/EventFormView.vue'), meta: { requiresAuth: true } },
    { path: '/events/:id', name: 'event-detail', component: () => import('../views/EventFormView.vue'), props: true, meta: { requiresAuth: true } },

    // /sites เป็นแผนที่ภาพรวม · /sites/manage เป็นตารางไว้แก้ทีละแถว
    // manage กับ new ต้องมาก่อน :id/edit ไม่งั้นคำว่า "manage" จะถูกจับเป็น id
    { path: '/sites', name: 'sites', component: () => import('../views/SitesView.vue'), meta: { requiresAuth: true } },
    // ไม่มี minRole โดยตั้งใจ — viewer เปิดดูตู้/อุปกรณ์/แบตรายสถานีได้ ปุ่มเขียนถูกซ่อน
    // ตามบทบาทในตัวหน้าเอง และ BE ตรวจซ้ำทุก endpoint อยู่แล้ว (GET /sites ก็เปิดให้
    // ทุกคนที่ล็อกอินมาตั้งแต่ต้น การลดด่านตรงนี้จึงไม่ได้เปิดข้อมูลอะไรใหม่)
    { path: '/sites/manage', name: 'sites-manage', component: () => import('../views/SitesManageView.vue'), meta: { requiresAuth: true } },
    { path: '/sites/new', name: 'site-new', component: () => import('../views/SiteFormView.vue'), meta: { requiresAuth: true, minRole: 'editor' } },
    // ไม่มี minRole เหมือน /sites/manage — viewer เปิดดูข้อมูลสถานีกับตู้/อุปกรณ์/แบตได้
    // ฟอร์มปิดปุ่มบันทึกเองผ่าน canSave และขึ้นข้อความบอกเหตุผลอยู่แล้ว
    // ต่างจาก /sites/new ที่ยังต้องเป็น editor เพราะเปิดมาเพื่อ "สร้าง" อย่างเดียว
    { path: '/sites/:id/edit', name: 'site-edit', component: () => import('../views/SiteFormView.vue'), props: true, meta: { requiresAuth: true } },

    // OLT ที่ยังผูกสถานีไม่ได้ — อ่านอย่างเดียว จึงเปิดให้ทุก role เหมือน /sites
    { path: '/online/orphans', name: 'online-orphans', component: () => import('../views/OnlineOrphansView.vue'), meta: { requiresAuth: true } },

    { path: '/users', name: 'users', component: () => import('../views/UsersView.vue'), meta: { requiresAuth: true, minRole: 'admin' } },

    // OLT Bot — ต้อง editor ขึ้นไป ต่างจาก /sites/manage ที่เปิดให้ viewer ดูได้
    // เพราะหน้านี้ไม่ได้แค่แสดงข้อมูล แต่ยิงคำขอออกไปหาระบบภายนอกในนามคนกด
    // (BE กันด้วย requireRole เหมือนกัน ตรงนี้เป็นแค่การไม่พาเข้าไปเจอหน้าที่ใช้ไม่ได้)
    { path: '/olt-bot', name: 'olt-bot', component: () => import('../views/OltBotView.vue'), meta: { requiresAuth: true, minRole: 'editor' } },

    // ตั้งค่าระบบ (สวิตช์ audit_log) — dev เท่านั้น เพราะเป็นอำนาจคนละชั้นกับการแก้ข้อมูล
    // /settings/audit ต้องมาก่อน /settings ไม่ได้ เพราะสองเส้นทางนี้ไม่คลุมกัน (ไม่มี :param)
    { path: '/settings', name: 'settings', component: () => import('../views/SettingsView.vue'), meta: { requiresAuth: true, minRole: 'dev' } },
    { path: '/settings/audit', name: 'settings-audit', component: () => import('../views/AuditLogView.vue'), meta: { requiresAuth: true, minRole: 'dev' } },

    { path: '/', redirect: '/home' },
    { path: '/:pathMatch(.*)*', redirect: 'home' },
  ],
})

/**
 * ด่านเดียวของการเข้าหน้า — แทน <RequireAuth> / <RequireRole> ของ React
 *
 * ต้อง await bootstrap() ก่อนตัดสินใจเสมอ ไม่งั้นตอนรีเฟรชหน้าที่ต้องล็อกอิน
 * store จะยังไม่รู้ว่ามี session ค้างอยู่ แล้วเด้งไป /login ทุกครั้ง
 *
 * นี่เป็นแค่การกันหน้าจอ — BE ตรวจสิทธิ์ซ้ำทุก endpoint อยู่แล้ว
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.bootstrap()

  if (to.meta.guestOnly && auth.isAuthenticated) return { name: 'home' }
  if (!to.meta.requiresAuth) return true

  if (!auth.isAuthenticated) {
    return { name: 'login', query: to.path === '/home' ? {} : { from: to.fullPath } }
  }
  // สิทธิ์ไม่ถึงส่งกลับหน้าหลัก ไม่ใช่ /login เพราะเขาล็อกอินแล้ว
  if (to.meta.minRole && !auth.can(to.meta.minRole)) return { name: 'home' }

  return true
})

export default router
