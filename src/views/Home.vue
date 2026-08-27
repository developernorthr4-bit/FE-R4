<script setup lang="ts">
import { computed } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import { accessibleModules, MODULE_GROUPS, MODULES } from '../lib/modules'
import { ROLE_LABEL } from '../lib/roles'
import { useAuthStore } from '../stores/auth'

/**
 * หน้าหลัก — ทางเข้าของทุกงานในระบบ
 *
 * เป็นการ์ดไม่ใช่ปุ่มบนแถบด้านบน เพราะงานจะเพิ่มขึ้นเรื่อย ๆ แถบที่ยาวขึ้นตาม
 * จำนวนงานจะอ่านไม่ออกตั้งแต่อันที่แปด ส่วนการ์ดมีที่ให้เขียนคำอธิบายได้ด้วยว่า
 * เข้าไปแล้วทำอะไรได้ ซึ่งชื่อเมนูสั้น ๆ บอกไม่ได้
 *
 * ไม่ดึงตัวเลขจริงมาโชว์บนการ์ดโดยตั้งใจ — หน้าที่ของหน้านี้คือพาไปหน้าอื่นให้เร็ว
 * ถ้าให้การ์ดโหลดสถิติของตัวเอง หน้าแรกจะยิง API หลายเส้นก่อนขึ้นจอทุกครั้ง
 * ทั้งที่ตัวเลขอยู่ที่แดชบอร์ดอยู่แล้ว
 *
 * รายการโมดูลอยู่ที่ lib/modules.ts ชุดเดียวกับแถบด้านบน — เพิ่มงานใหม่ที่นั่น
 */
const auth = useAuthStore()

/** เห็นเฉพาะโมดูลที่บทบาทตัวเองถึง — ตัวที่ไม่ถึงไม่เรนเดอร์เลย ไม่ใช่ทำจาง */
const visible = computed(() => accessibleModules(MODULES, auth.can))

/** กลุ่มที่ไม่เหลือโมดูลเลยต้องไม่โผล่เป็นหัวข้อลอย ๆ (viewer ไม่เห็นกลุ่ม "ระบบ") */
const groups = computed(() =>
  MODULE_GROUPS
    .map((g) => ({ ...g, modules: visible.value.filter((m) => m.group === g.key) }))
    .filter((g) => g.modules.length > 0),
)
</script>

<template>
  <AppLayout>
    <div class="mb-8">
      <h1 class="text-2xl font-semibold tracking-tight">
        สวัสดี {{ auth.user?.fullName ?? auth.user?.username }}
      </h1>
      <p class="mt-1 text-sm opacity-70">
        <template v-if="auth.user">{{ ROLE_LABEL[auth.user.role] }} · </template>
        เลือกงานที่ต้องการจากรายการด้านล่าง
      </p>
    </div>

    <section v-for="g in groups" :key="g.key" class="mb-8">
      <h2 class="mb-3 text-sm font-medium uppercase tracking-wide opacity-60">{{ g.label }}</h2>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <template v-for="m in g.modules" :key="m.to">
          <RouterLink
            v-if="!m.soon"
            :to="m.to"
            class="card border border-base-300 bg-base-100 transition
                   hover:border-primary hover:shadow-md"
          >
            <div class="card-body gap-1 p-5">
              <h3 class="font-semibold">{{ m.label }}</h3>
              <p class="text-sm opacity-70">{{ m.description }}</p>
            </div>
          </RouterLink>

          <!--
            โมดูลที่ยังไม่ได้ทำเป็น <div> ไม่ใช่ RouterLink ที่ปิดการทำงาน
            เพราะลิงก์ที่กดไม่ได้ยัง tab เข้าไปได้และเครื่องอ่านหน้าจอยังประกาศว่า
            เป็นลิงก์ ทั้งที่พาไปไหนไม่ได้จริง ๆ
          -->
          <div
            v-else
            class="card cursor-not-allowed border border-dashed border-base-300
                   bg-base-100 opacity-50"
          >
            <div class="card-body gap-1 p-5">
              <div class="flex items-start justify-between gap-2">
                <h3 class="font-semibold">{{ m.label }}</h3>
                <span class="badge badge-sm badge-ghost shrink-0">เร็ว ๆ นี้</span>
              </div>
              <p class="text-sm opacity-70">{{ m.description }}</p>
            </div>
          </div>
        </template>
      </div>
    </section>
  </AppLayout>
</template>
