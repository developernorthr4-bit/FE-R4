<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ThemeToggle from '../components/ThemeToggle.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseField from '../components/ui/BaseField.vue'
import { errorMessage } from '../lib/api'
import { checkResetToken, resetPassword } from '../services/auth.api'

/**
 * ตั้งรหัสผ่านใหม่จากลิงก์ที่ผู้ดูแลส่งให้
 *
 * ตรวจ token ก่อนโชว์ฟอร์ม (GET) แล้วค่อยกินทิ้งตอนกดยืนยัน (POST)
 * ถ้าไม่ตรวจก่อน ผู้ใช้จะกรอกรหัสยาว ๆ เสร็จแล้วเพิ่งรู้ว่าลิงก์หมดอายุ
 */
const route = useRoute()
const router = useRouter()
const token = String(route.query.token ?? '')

const phase = ref<'checking' | 'valid' | 'invalid'>('checking')
const username = ref<string | null>(null)
const invalidMessage = ref('')

const password = ref('')
const confirm = ref('')
const error = ref<string | null>(null)
const done = ref<string | null>(null)
const submitting = ref(false)

onMounted(async () => {
  if (!token) {
    phase.value = 'invalid'
    invalidMessage.value = 'ลิงก์ไม่ถูกต้อง — ไม่พบ token'
    return
  }
  try {
    const res = await checkResetToken(token)
    username.value = res.username
    phase.value = 'valid'
  } catch (err) {
    invalidMessage.value = errorMessage(err, 'ลิงก์นี้ใช้ไม่ได้แล้ว')
    phase.value = 'invalid'
  }
})

async function handleSubmit() {
  error.value = null
  if (password.value !== confirm.value) {
    error.value = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'
    return
  }
  submitting.value = true
  try {
    done.value = await resetPassword(token, password.value)
  } catch (err) {
    error.value = errorMessage(err, 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ')
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
          <h1 class="text-2xl font-semibold tracking-tight">ตั้งรหัสผ่านใหม่</h1>
          <p v-if="phase === 'valid' && username" class="mt-1.5 text-sm opacity-70">
            สำหรับบัญชี {{ username }}
          </p>
        </div>
        <ThemeToggle />
      </div>

      <div class="card border border-base-300 bg-base-100">
        <div class="card-body gap-4">
          <p v-if="phase === 'checking'" class="flex items-center gap-2 text-sm opacity-70">
            <span class="loading loading-spinner loading-xs" /> กำลังตรวจสอบลิงก์…
          </p>

          <template v-else-if="phase === 'invalid'">
            <div role="alert" class="alert alert-error text-sm"><span>{{ invalidMessage }}</span></div>
            <p class="text-sm opacity-70">
              ลิงก์ตั้งรหัสผ่านใช้ได้ครั้งเดียวและหมดอายุใน 30 นาที
              กรุณาติดต่อผู้ดูแลระบบเพื่อขอลิงก์ใหม่
            </p>
            <BaseButton variant="ghost" block @click="router.push('/login')">
              กลับไปหน้าเข้าสู่ระบบ
            </BaseButton>
          </template>

          <template v-else-if="done">
            <div role="status" class="alert alert-success text-sm"><span>{{ done }}</span></div>
            <BaseButton block @click="router.push('/login')">เข้าสู่ระบบ</BaseButton>
          </template>

          <form v-else novalidate class="flex flex-col gap-4" @submit.prevent="handleSubmit">
            <BaseField
              v-model="password" label="รหัสผ่านใหม่" type="password" autocomplete="new-password"
              required autofocus :disabled="submitting" hint="อย่างน้อย 8 ตัวอักษร"
            />
            <BaseField
              v-model="confirm" label="ยืนยันรหัสผ่านใหม่" type="password" autocomplete="new-password"
              required :disabled="submitting"
            />

            <div v-if="error" role="alert" class="alert alert-error text-sm"><span>{{ error }}</span></div>

            <p class="text-xs opacity-60">
              เมื่อตั้งรหัสใหม่แล้ว ระบบจะออกจากระบบทุกอุปกรณ์ที่ค้างอยู่
            </p>

            <BaseButton type="submit" :loading="submitting" block>
              {{ submitting ? 'กำลังบันทึก…' : 'ตั้งรหัสผ่านใหม่' }}
            </BaseButton>
          </form>
        </div>
      </div>

      <p class="mt-6 text-center text-sm">
        <RouterLink to="/login" class="link link-primary">กลับไปหน้าเข้าสู่ระบบ</RouterLink>
      </p>
    </div>
  </div>
</template>
