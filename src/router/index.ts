import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useFlashStore } from '../stores/flash'
import type { Role } from '../lib/roles'

declare module 'vue-router' {
  interface RouteMeta {
    /** ต้องล็อกอินก่อน */
    requiresAuth?: boolean
    /** บทบาทขั้นต่ำ — ตรวจด้วย ROLE_LEVEL ไม่ใช่เทียบชื่อตรง ๆ */
    minRole?: Role
    /** ล็อกอินอยู่แล้วห้ามเข้า (หน้า login / register) */
    guestOnly?: boolean
    /**
     * สร้างหน้าใหม่ทั้งหน้าเมื่อ path เปลี่ยน (ดู App.vue)
     * ใช้กับหน้าที่โหลดข้อมูลครั้งเดียวตอน mount แล้วมีลิงก์ไปหน้าเดียวกันของ id อื่น
     * ไม่งั้น Vue Router ใช้หน้าเดิมต่อ — URL เปลี่ยนแต่ข้อมูลค้างของเดิม
     */
    remountOnParams?: boolean
    /**
     * สิทธิ์รายหน้า (Permission Manager) — key ใน lib/pages.ts / BE PAGES
     * หลาย key = เข้าได้ถ้ามีหน้าใดหน้าหนึ่ง (เช่น ฟอร์มตรวจ CM เปิดได้จากตาราง แผนที่ และแผนของฉัน)
     * ไม่ตั้ง = ไม่คุมด้วยสิทธิ์รายหน้า (หน้าหลัก, settings ที่เป็นของ dev อยู่แล้ว)
     */
    page?: string | readonly string[]
  }
}

const router = createRouter({
  history: createWebHistory(),
  /*
   * ย้อนกลับ = กลับตำแหน่งเดิม · ไปหน้าอื่น = บนสุด · เปลี่ยนแค่ query/hash (ตัวกรอง) = อยู่ที่เดิม
   * ไม่งั้นกดลิงก์สถานีจากการ์ดวงกลางหน้า หน้าใหม่จะค้างอยู่กลางหน้า
   */
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.path !== from.path) return { top: 0 }
    return false
  },
  routes: [
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { guestOnly: true } },
    { path: '/register', name: 'register', component: () => import('../views/RegisterView.vue'), meta: { guestOnly: true } },
    { path: '/reset-password', name: 'reset-password', component: () => import('../views/ResetPasswordView.vue') },

    { path: '/home', name: 'home', component: () => import('../views/Home.vue'), meta: { requiresAuth: true } },

    { path: '/dashboard', name: 'dashboard', component: () => import('../views/DashboardView.vue'), meta: { requiresAuth: true, page: 'dashboard' } },

    // ทะเบียนตู้/แบตเตอรี่ + ผลตรวจ PM — อ่านได้ทุก role เหมือนแดชบอร์ด
    { path: '/maintenance', name: 'maintenance', component: () => import('../views/MaintenanceView.vue'), meta: { requiresAuth: true, page: 'maintenance' } },

    // /events/new ต้องมาก่อน /events/:id ไม่งั้น "new" จะถูกจับเป็น id
    { path: '/events', name: 'events', component: () => import('../views/EventsView.vue'), meta: { requiresAuth: true, page: 'events' } },
    { path: '/events/new', name: 'event-new', component: () => import('../views/EventFormView.vue'), meta: { requiresAuth: true, page: 'events' } },
    { path: '/events/:id', name: 'event-detail', component: () => import('../views/EventFormView.vue'), props: true, meta: { requiresAuth: true, page: 'events' } },

    // /sites เป็นแผนที่ภาพรวม · /sites/manage เป็นตารางไว้แก้ทีละแถว
    // manage กับ new ต้องมาก่อน :id/edit ไม่งั้นคำว่า "manage" จะถูกจับเป็น id
    { path: '/sites', name: 'sites', component: () => import('../views/SitesView.vue'), meta: { requiresAuth: true, page: 'sites' } },
    // ไม่มี minRole โดยตั้งใจ — viewer เปิดดูตู้/อุปกรณ์/แบตรายสถานีได้ ปุ่มเขียนถูกซ่อน
    // ตามบทบาทในตัวหน้าเอง และ BE ตรวจซ้ำทุก endpoint อยู่แล้ว (GET /sites ก็เปิดให้
    // ทุกคนที่ล็อกอินมาตั้งแต่ต้น การลดด่านตรงนี้จึงไม่ได้เปิดข้อมูลอะไรใหม่)
    { path: '/sites/manage', name: 'sites-manage', component: () => import('../views/SitesManageView.vue'), meta: { requiresAuth: true, page: 'sites-manage' } },
    // นำเข้าเกรดสถานี — แก้ข้อมูลทั้งตาราง จึงจำกัดที่ admin
    { path: '/sites/grades', name: 'site-grades', component: () => import('../views/SiteGradeImportView.vue'), meta: { requiresAuth: true, page: 'site-grades', minRole: 'admin' } },
    // ชั่วโมงสำรองไฟตามเกรด (สูตรที่ BE src/backup/calc.ts) — อ่านอย่างเดียว ทุก role
    { path: '/sites/backup', name: 'site-backup', component: () => import('../views/BackupReportView.vue'), meta: { requiresAuth: true, page: 'site-backup' } },
    { path: '/sites/new', name: 'site-new', component: () => import('../views/SiteFormView.vue'), meta: { requiresAuth: true, page: 'sites-manage', minRole: 'editor' } },
    // ไม่มี minRole เหมือน /sites/manage — viewer เปิดดูข้อมูลสถานีกับตู้/อุปกรณ์/แบตได้
    // ฟอร์มปิดปุ่มบันทึกเองผ่าน canSave และขึ้นข้อความบอกเหตุผลอยู่แล้ว
    // ต่างจาก /sites/new ที่ยังต้องเป็น editor เพราะเปิดมาเพื่อ "สร้าง" อย่างเดียว
    { path: '/sites/:id/edit', name: 'site-edit', component: () => import('../views/SiteFormView.vue'), props: true, meta: { requiresAuth: true, page: ['sites', 'sites-manage'], remountOnParams: true } },

    // วงสื่อสัญญาณ — อ่านอย่างเดียว เปิดให้ทุก role เหมือน /sites (BE ไม่มี endpoint เขียนเลย)
    { path: '/rings', name: 'rings', component: () => import('../views/RingsView.vue'), meta: { requiresAuth: true, page: 'rings' } },
    { path: '/rings/:id', name: 'ring-detail', component: () => import('../views/RingDetailView.vue'), meta: { requiresAuth: true, page: 'rings' } },

    // งาน online — อ่านอย่างเดียวทั้งคู่ จึงเปิดให้ทุก role เหมือน /sites
    { path: '/online/map', name: 'online-map', component: () => import('../views/OnlineMapView.vue'), meta: { requiresAuth: true, page: 'online-map' } },
    { path: '/online/orphans', name: 'online-orphans', component: () => import('../views/OnlineOrphansView.vue'), meta: { requiresAuth: true, page: 'online-orphans' } },
    // เวอร์ชันแผนที่ล้วนสำหรับ WebView ของแอปมือถือ (MB-R4)
    { path: '/embed/online-map', name: 'embed-online-map', component: () => import('../views/EmbedOnlineMapView.vue'), meta: { requiresAuth: true, page: 'online-map' } },
    // แผนที่สำรวจ — ปลายทาง → สายโซ่ + เคเบิล + เส้นทางขับรถ
    { path: '/survey', name: 'survey', component: () => import('../views/SurveyView.vue'), meta: { requiresAuth: true, page: 'survey-map' } },
    { path: '/embed/survey', name: 'embed-survey', component: () => import('../views/EmbedSurveyView.vue'), meta: { requiresAuth: true, page: 'survey-map' } },
    // งานสำรวจ — สิ่งที่เจอหน้างาน (จุดปัญหา + รูป)
    { path: '/surveys', name: 'surveys', component: () => import('../views/SurveysView.vue'), meta: { requiresAuth: true, page: 'surveys' } },
    { path: '/surveys/new', name: 'survey-new', component: () => import('../views/SurveyFormView.vue'), meta: { requiresAuth: true, page: 'surveys' } },
    { path: '/surveys/:id', name: 'survey-detail', component: () => import('../views/SurveyFormView.vue'), meta: { requiresAuth: true, page: 'surveys' } },
    // หน้าพิมพ์ (Ctrl+P → PDF) — ไม่มี AppLayout เมนูจะได้ไม่ติดไปในกระดาษ
    { path: '/surveys/:id/print', name: 'survey-print', component: () => import('../views/SurveyPrintView.vue'), meta: { requiresAuth: true, page: 'surveys' } },
    // จุดซ่อม CM จากไฟล์ NOC + ผลตรวจของทีม Audit
    { path: '/faults', name: 'faults', component: () => import('../views/FaultsView.vue'), meta: { requiresAuth: true, page: 'faults' } },
    { path: '/faults/import', name: 'fault-import', component: () => import('../views/FaultImportView.vue'), meta: { requiresAuth: true, page: 'faults', minRole: 'editor' } },
    { path: '/faults/map', name: 'faults-map', component: () => import('../views/FaultsMapView.vue'), meta: { requiresAuth: true, page: 'faults-map' } },
    { path: '/faults/plan', name: 'faults-plan', component: () => import('../views/FaultPlanView.vue'), meta: { requiresAuth: true, page: 'faults-plan' } },
    // archive ลบข้อมูลถาวร — admin เท่านั้น
    { path: '/faults/archive', name: 'faults-archive', component: () => import('../views/FaultArchiveView.vue'), meta: { requiresAuth: true, page: 'faults', minRole: 'admin' } },
    { path: '/embed/faults-map', name: 'embed-faults-map', component: () => import('../views/EmbedFaultsMapView.vue'), meta: { requiresAuth: true, page: 'faults-map' } },
    { path: '/faults/:id', name: 'fault-audit', component: () => import('../views/FaultAuditView.vue'), meta: { requiresAuth: true, page: ['faults', 'faults-map', 'faults-plan'] } },

    { path: '/users', name: 'users', component: () => import('../views/UsersView.vue'), meta: { requiresAuth: true, page: 'users', minRole: 'admin' } },

    // OLT Bot — ต้อง editor ขึ้นไป ต่างจาก /sites/manage ที่เปิดให้ viewer ดูได้
    // เพราะหน้านี้ไม่ได้แค่แสดงข้อมูล แต่ยิงคำขอออกไปหาระบบภายนอกในนามคนกด
    // (BE กันด้วย requireRole เหมือนกัน ตรงนี้เป็นแค่การไม่พาเข้าไปเจอหน้าที่ใช้ไม่ได้)
    { path: '/olt-bot', name: 'olt-bot', component: () => import('../views/OltBotView.vue'), meta: { requiresAuth: true, page: 'olt-bot', minRole: 'editor' } },

    // ตั้งค่าระบบ (สวิตช์ audit_log) — dev เท่านั้น เพราะเป็นอำนาจคนละชั้นกับการแก้ข้อมูล
    // /settings/audit ต้องมาก่อน /settings ไม่ได้ เพราะสองเส้นทางนี้ไม่คลุมกัน (ไม่มี :param)
    { path: '/settings', name: 'settings', component: () => import('../views/SettingsView.vue'), meta: { requiresAuth: true, minRole: 'dev' } },
    { path: '/settings/audit', name: 'settings-audit', component: () => import('../views/AuditLogView.vue'), meta: { requiresAuth: true, minRole: 'dev' } },
    // เกณฑ์ชั่วโมงสำรองไฟ — dev เท่านั้น ตรงกับ BE PUT /backup/rules (requireRole('dev'))
    { path: '/settings/backup', name: 'settings-backup', component: () => import('../views/BackupSettingsView.vue'), meta: { requiresAuth: true, minRole: 'dev' } },
    // สิทธิ์รายหน้า (Permission Manager) — dev เท่านั้น ตรงกับ BE /permissions (requireRole('dev'))
    { path: '/settings/permissions', name: 'settings-permissions', component: () => import('../views/PermissionsView.vue'), meta: { requiresAuth: true, minRole: 'dev' } },

    // หน้า embed ที่ไม่มีสิทธิ์ — ข้อความล้วน ไม่มี AppLayout เพราะเปิดอยู่ใน WebView ของแอป
    { path: '/embed/denied', name: 'embed-denied', component: () => import('../views/EmbedDeniedView.vue'), meta: { requiresAuth: true } },

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

  // สิทธิ์รายหน้าเปลี่ยนได้ทุกเมื่อ — ดึงใหม่ก่อนตัดสิน (เว้นห่าง 60 วิ ไม่ยิงทุกการคลิก)
  if (to.meta.page) {
    await auth.refreshMe()
    if (!auth.canPage(to.meta.page)) {
      if (to.path.startsWith('/embed/')) return { name: 'embed-denied' }
      useFlashStore().set('ไม่มีสิทธิ์เข้าหน้านี้ — ติดต่อผู้ดูแลระบบถ้าต้องใช้งาน')
      return { name: 'home' }
    }
  }

  return true
})

export default router
