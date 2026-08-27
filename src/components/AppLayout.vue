<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { accessibleModules, NAV_MODULES } from '../lib/modules'
import { ROLE_LABEL } from '../lib/roles'
import { useAuthStore } from '../stores/auth'
import ThemeToggle from './ThemeToggle.vue'
import BaseButton from './ui/BaseButton.vue'

/**
 * โครงหน้าจอร่วมของทุกหน้าหลังล็อกอิน
 *
 * แถบนี้ตั้งใจให้ "ไม่ยาวขึ้น" ตามจำนวนงาน — ขึ้นเฉพาะโมดูลที่ปักหมุดไว้
 * (nav: true ใน lib/modules.ts) ส่วนงานที่เหลือเข้าจากการ์ดบนหน้าหลัก
 * เพิ่มงานใหม่จึงไม่ต้องแก้ไฟล์นี้เลย แก้ที่ทะเบียนโมดูลที่เดียว
 *
 * โมดูลที่ role ไม่ถึงจะไม่ถูกเรนเดอร์ แต่นั่นเป็นแค่การซ่อน —
 * router.beforeEach กันที่ route และ BE กันอีกชั้น
 */
const auth = useAuthStore()
const router = useRouter()
const busy = ref(false)

const ACTIVE = 'btn-active font-medium'

const items = computed(() => accessibleModules(NAV_MODULES, auth.can))

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
        <!--
          ชื่อระบบเป็นลิงก์กลับหน้าหลัก ไม่ใช่ข้อความเฉย ๆ
          เพราะงานส่วนใหญ่ไม่ได้ปักหมุดบนแถบนี้ ถ้ากลับหน้าหลักไม่ได้
          ทางเดียวที่เหลือคือกดปุ่ม back ของเบราว์เซอร์
        -->
        <RouterLink
          to="/home"
          class="btn btn-ghost btn-sm px-2 font-semibold tracking-tight"
          :exact-active-class="ACTIVE"
        >
          R4
        </RouterLink>

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
