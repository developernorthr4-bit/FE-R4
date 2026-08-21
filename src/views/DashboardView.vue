<script setup lang="ts">
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import { ROLE_LABEL } from '../lib/roles'
import { useAuthStore } from '../stores/auth'

/** หน้าหลังล็อกอิน — ยังไม่มีตัวเลขสรุป รอโมดูลรายงานรายสัปดาห์ */
const auth = useAuthStore()
</script>

<template>
  <AppLayout>
    <PageHeader title="แดชบอร์ด" description="ระบบติดตาม Network Event ภาคเหนือ">
      <template v-if="auth.can('editor')" #actions>
        <RouterLink to="/events/new" class="btn btn-primary">บันทึกเหตุการณ์</RouterLink>
      </template>
    </PageHeader>

    <div class="grid gap-4 sm:grid-cols-2">
      <div class="card border border-base-300 bg-base-100">
        <div class="card-body">
          <h2 class="card-title text-base">บัญชีของคุณ</h2>
          <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt class="opacity-70">ชื่อผู้ใช้</dt>
            <dd>{{ auth.user?.username }}</dd>
            <dt class="opacity-70">อีเมล</dt>
            <dd class="break-all">{{ auth.user?.email }}</dd>
            <dt class="opacity-70">บทบาท</dt>
            <dd>{{ auth.user ? ROLE_LABEL[auth.user.role] : '—' }}</dd>
            <dt class="opacity-70">จังหวัดที่ดูแล</dt>
            <dd>
              <template v-if="auth.user?.provinceScope === null">ทุกจังหวัด</template>
              <template v-else-if="auth.user?.provinceScope?.length">
                {{ auth.user.provinceScope.length }} จังหวัด
              </template>
              <template v-else>—</template>
            </dd>
          </dl>
        </div>
      </div>

      <div class="card border border-base-300 bg-base-100">
        <div class="card-body">
          <h2 class="card-title text-base">ขั้นถัดไป</h2>
          <p class="text-sm opacity-70">
            หน้านี้จะแสดงตัวเลขสรุปรายสัปดาห์เมื่อทำโมดูลรายงานเสร็จ —
            จำนวนเหตุการณ์ต่อจังหวัด สาเหตุที่พบบ่อย และระยะเวลาขัดข้องรวม
          </p>
          <div class="card-actions mt-2">
            <RouterLink to="/events" class="btn btn-ghost btn-sm">ดูรายการเหตุการณ์</RouterLink>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>
