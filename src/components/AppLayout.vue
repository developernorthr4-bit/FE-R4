<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ROLE_LABEL, type Role } from '../lib/roles'
import { useAuthStore } from '../stores/auth'
import ThemeToggle from './ThemeToggle.vue'
import BaseButton from './ui/BaseButton.vue'

/**
 * โครงหน้าจอร่วมของทุกหน้าหลังล็อกอิน
 *
 * เพิ่มเมนูใหม่ = แก้ NAV ที่เดียว
 * เมนูที่ role ไม่ถึงจะไม่ถูกเรนเดอร์ แต่นั่นเป็นแค่การซ่อน —
 * router.beforeEach กันที่ route และ BE กันอีกชั้น
 */
const auth = useAuthStore()
const router = useRouter()
const busy = ref(false)

/**
 * exact = ไฮไลต์เฉพาะตอนอยู่ path นี้เป๊ะ ๆ
 *
 * ต้องมีเพราะ RouterLink ถือว่า /sites ยังใช้งานอยู่เมื่ออยู่ที่ /sites/manage
 * (เทียบแบบ prefix) แล้วเมนูจะสว่างพร้อมกันสองอัน
 * ส่วน /events ไม่ต้อง exact — อยู่ที่ /events/new แล้วเมนู Network Event
 * สว่างอยู่ถือว่าถูกต้อง เพราะเป็นหน้าลูกของมันจริง ๆ ไม่ใช่คนละงาน
 */
const NAV: { to: string; label: string; min?: Role; exact?: boolean }[] = [
  { to: '/dashboard', label: 'แดชบอร์ด' },
  { to: '/events', label: 'Network Event' },
  { to: '/sites', label: 'แผนที่สถานี', exact: true },
  { to: '/sites/manage', label: 'จัดการสถานี', min: 'editor' },
  { to: '/users', label: 'จัดการผู้ใช้', min: 'admin' },
  { to: '/settings', label: 'ตั้งค่าระบบ', min: 'dev' },
]

const ACTIVE = 'btn-active font-medium'

const items = computed(() => NAV.filter((n) => !n.min || auth.can(n.min)))

async function handleLogout() {
  busy.value = true
  await auth.logout()
  router.replace({ name: 'login' })
}
</script>

<template>
  <div class="flex min-h-full flex-col">
    <header class="sticky top-0 z-40 border-b border-base-300 bg-base-100">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <span class="font-semibold tracking-tight">R4</span>

        <nav class="flex flex-1 flex-wrap items-center gap-1">
          <RouterLink
            v-for="n in items"
            :key="n.to"
            :to="n.to"
            class="btn btn-sm btn-ghost font-normal"
            :active-class="n.exact ? '' : ACTIVE"
            :exact-active-class="n.exact ? ACTIVE : ''"
          >
            {{ n.label }}
          </RouterLink>
        </nav>

        <div class="flex items-center gap-2">
          <span class="hidden text-sm opacity-70 sm:inline">
            {{ auth.user?.fullName ?? auth.user?.username }}
            <template v-if="auth.user"> · {{ ROLE_LABEL[auth.user.role] }}</template>
          </span>
          <ThemeToggle />
          <BaseButton variant="ghost" size="sm" :loading="busy" @click="handleLogout">
            ออกจากระบบ
          </BaseButton>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <slot />
    </main>
  </div>
</template>
