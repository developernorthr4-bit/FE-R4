<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import ProvincePicker from '../components/ProvincePicker.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseField from '../components/ui/BaseField.vue'
import { errorMessage } from '../lib/api'
import { register } from '../services/auth.api'

/**
 * สมัครใช้งาน
 *
 * สมัครแล้วยังล็อกอินไม่ได้ทันที ต้องรอ dev/admin อนุมัติก่อน
 * จังหวัดที่ติ๊กที่นี่เป็นเพียงคำขอ — ผู้อนุมัติแก้ทับได้ตอนกดอนุมัติ
 * ต้องบอกผู้ใช้ให้ชัดตั้งแต่ต้น ไม่งั้นจะงงว่าทำไมกรอกครบแล้วเข้าไม่ได้
 */
const router = useRouter()

const form = reactive({
  username: '', email: '', fullName: '', phone: '', company: '', password: '', confirm: '',
})
const provinceScope = ref<number[]>([])
const error = ref<string | null>(null)
const done = ref<string | null>(null)
const submitting = ref(false)

async function handleSubmit() {
  error.value = null

  // เช็คคู่รหัสผ่านฝั่งนี้เลย BE ไม่รู้จักช่อง confirm อยู่แล้ว
  if (form.password !== form.confirm) {
    error.value = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'
    return
  }

  submitting.value = true
  try {
    done.value = await register({
      username: form.username.trim().toLowerCase(),
      email: form.email.trim().toLowerCase(),
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      company: form.company.trim() || null,
      password: form.password,
      provinceScope: provinceScope.value,
    })
  } catch (err) {
    error.value = errorMessage(err, 'สมัครไม่สำเร็จ')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div v-if="done" class="flex min-h-full items-center justify-center px-4 py-12">
    <div class="card w-full max-w-md border border-base-300 bg-base-100">
      <div class="card-body gap-4">
        <h1 class="text-xl font-semibold tracking-tight">ส่งคำขอเรียบร้อย</h1>
        <div role="status" class="alert alert-success text-sm"><span>{{ done }}</span></div>
        <p class="text-sm opacity-70">
          ผู้ดูแลระบบจะตรวจสอบและอาจโทรยืนยันตัวตนตามเบอร์ที่ให้ไว้
          เมื่ออนุมัติแล้วจึงเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านที่ตั้งไว้ได้
        </p>
        <BaseButton block @click="router.push('/login')">กลับไปหน้าเข้าสู่ระบบ</BaseButton>
      </div>
    </div>
  </div>

  <div v-else class="mx-auto w-full max-w-xl px-4 py-12">
    <div class="mb-8 flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">สมัครใช้งาน</h1>
        <p class="mt-1.5 text-sm opacity-70">ระบบติดตาม Network Event ภาคเหนือ</p>
      </div>
      <ThemeToggle />
    </div>

    <form novalidate class="card border border-base-300 bg-base-100" @submit.prevent="handleSubmit">
      <div class="card-body gap-4">
        <BaseField
          v-model="form.username" label="ชื่อผู้ใช้" autocomplete="username" required autofocus
          :disabled="submitting" hint="ใช้ a-z 0-9 . _ - เท่านั้น ยาว 3–64 ตัว"
        />
        <BaseField
          v-model="form.email" label="อีเมล" type="email" autocomplete="email" required
          :disabled="submitting"
        />
        <BaseField
          v-model="form.fullName" label="ชื่อ-นามสกุล" autocomplete="name" required
          :disabled="submitting"
        />
        <BaseField
          v-model="form.phone" label="เบอร์โทรศัพท์" type="tel" autocomplete="tel" required
          :disabled="submitting" hint="ผู้ดูแลใช้โทรยืนยันตัวตนก่อนอนุมัติ"
        />
        <BaseField
          v-model="form.company" label="หน่วยงาน / บริษัท" autocomplete="organization"
          :disabled="submitting" hint="ไม่บังคับ"
        />

        <div class="form-control">
          <label class="label"><span class="label-text font-medium">จังหวัดที่ดูแล</span></label>
          <ProvincePicker v-model:selected="provinceScope" :disabled="submitting" />
          <p class="mt-1 text-xs opacity-60">
            เลือกตามพื้นที่ที่รับผิดชอบจริง ผู้ดูแลระบบจะตรวจและปรับให้ตอนอนุมัติ
          </p>
        </div>

        <BaseField
          v-model="form.password" label="รหัสผ่าน" type="password" autocomplete="new-password"
          required :disabled="submitting" hint="อย่างน้อย 8 ตัวอักษร"
        />
        <BaseField
          v-model="form.confirm" label="ยืนยันรหัสผ่าน" type="password" autocomplete="new-password"
          required :disabled="submitting"
        />

        <div v-if="error" role="alert" class="alert alert-error text-sm"><span>{{ error }}</span></div>

        <p class="text-xs opacity-60">
          สมัครแล้วยังเข้าใช้งานไม่ได้ทันที ต้องรอผู้ดูแลระบบอนุมัติก่อน
        </p>

        <BaseButton type="submit" :loading="submitting" block class="mt-1">
          {{ submitting ? 'กำลังส่งคำขอ…' : 'ส่งคำขอสมัคร' }}
        </BaseButton>
      </div>
    </form>

    <p class="mt-6 text-center text-sm opacity-70">
      มีบัญชีอยู่แล้ว?
      <RouterLink to="/login" class="link link-primary">เข้าสู่ระบบ</RouterLink>
    </p>
  </div>
</template>
