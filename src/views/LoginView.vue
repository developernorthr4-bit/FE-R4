<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ThemeToggle from '../components/ThemeToggle.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseField from '../components/ui/BaseField.vue'
import { errorMessage } from '../lib/api'
import { authStore } from '../lib/auth-store'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const identifier = ref('')
const password = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)

/**
 * มาที่หน้านี้เพราะถูกเตะออกหรือเปล่า — อ่านครั้งเดียวตอนสร้างคอมโพเนนต์
 *
 * takeSessionEndedReason() อ่านแล้วล้างทิ้งเลย ข้อความจึงขึ้นรอบเดียว
 * ถ้าผู้ใช้กดล็อกอินไม่ผ่านแล้วลองใหม่ จะไม่มีข้อความเก่าค้างมากวน
 */
const notice = ref<string | null>(authStore.takeSessionEndedReason())

async function handleSubmit() {
  notice.value = null
  error.value = null
  submitting.value = true
  try {
    await auth.login(identifier.value.trim(), password.value)
    const from = route.query.from
    await router.replace(typeof from === 'string' && from !== '/login' ? from : '/dashboard')
  } catch (err) {
    error.value = errorMessage(err, 'เข้าสู่ระบบไม่สำเร็จ')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="flex min-h-full items-center justify-center px-4 py-12">
    <div class="w-full max-w-sm">
      <div class="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">เข้าสู่ระบบ</h1>
          <p class="mt-1.5 text-sm opacity-70">ระบบติดตาม Network Event ภาคเหนือ</p>
        </div>
        <ThemeToggle />
      </div>

      <form novalidate class="card border border-base-300 bg-base-100" @submit.prevent="handleSubmit">
        <div class="card-body gap-4">
          <BaseField
            v-model="identifier"
            label="อีเมล หรือ ชื่อผู้ใช้"
            autocomplete="username"
            required
            autofocus
            :disabled="submitting"
          />
          <BaseField
            v-model="password"
            label="รหัสผ่าน"
            type="password"
            autocomplete="current-password"
            required
            :disabled="submitting"
          />

          <div v-if="notice" role="status" class="alert alert-warning text-sm">
            <span>{{ notice }}</span>
          </div>

          <div v-if="error" role="alert" class="alert alert-error text-sm">
            <span>{{ error }}</span>
          </div>

          <BaseButton type="submit" :loading="submitting" block class="mt-1">
            {{ submitting ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ' }}
          </BaseButton>
        </div>
      </form>

      <p class="mt-6 text-center text-sm opacity-70">
        ยังไม่มีบัญชี?
        <RouterLink to="/register" class="link link-primary">สมัครใช้งาน</RouterLink>
      </p>

      <!--
        ไม่มีปุ่ม "ลืมรหัสผ่าน" โดยตั้งใจ — ระบบไม่ส่งอีเมล การรีเซ็ตจึงต้องผ่านคน
        ผู้ดูแลกดสร้างลิงก์ให้จากหน้าจัดการผู้ใช้แล้วส่งให้เจ้าตัวเอง
      -->
      <p class="mt-2 text-center text-xs opacity-60">
        ลืมรหัสผ่าน? ติดต่อผู้ดูแลระบบเพื่อขอลิงก์ตั้งรหัสใหม่
      </p>
    </div>
  </div>
</template>
