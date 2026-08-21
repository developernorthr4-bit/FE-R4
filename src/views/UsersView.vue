<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import ProvincePicker from '../components/ProvincePicker.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseSelect from '../components/ui/BaseSelect.vue'
import { errorMessage } from '../lib/api'
import { ROLE_LABEL, STATUS_BADGE, STATUS_LABEL, type Role, type UserStatus } from '../lib/roles'
import { loadProvinces, type Province } from '../services/provinces.api'
import {
  activateUser, approveUser, createResetLink, listUsers, patchUser, rejectUser, suspendUser,
  type AdminUser,
} from '../services/users.api'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

const FILTERS: { value: UserStatus | 'all'; label: string }[] = [
  { value: 'pending', label: 'รออนุมัติ' },
  { value: 'active', label: 'ใช้งานอยู่' },
  { value: 'suspended', label: 'ถูกระงับ' },
  { value: 'all', label: 'ทั้งหมด' },
]

const filter = ref<UserStatus | 'all'>('pending')
const rows = ref<AdminUser[]>([])
const assignable = ref<Role[]>([])
const provinces = ref<Province[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const resetLink = ref<{ username: string; url: string } | null>(null)

// ── กล่องแก้ไข/อนุมัติ ──
const editing = ref<AdminUser | null>(null)
const editRole = ref<Role>('viewer')
const editScope = ref<number[]>([])
const editAll = ref(false)
const editBusy = ref(false)
const approving = computed(() => editing.value?.status === 'pending')

const provinceName = computed(() => new Map(provinces.value.map((p) => [p.id, p.nameTh])))

function scopeLabel(scope: number[] | null): string {
  if (scope === null) return 'ทุกจังหวัด'
  if (!scope.length) return '—'
  return scope.map((id) => provinceName.value.get(id) ?? `#${id}`).join(', ')
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const data = await listUsers(filter.value)
    rows.value = data.users
    assignable.value = data.assignableRoles
  } catch (err) {
    error.value = errorMessage(err, 'โหลดรายชื่อผู้ใช้ไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  provinces.value = await loadProvinces().catch(() => [])
})
watch(filter, load, { immediate: true })

/** เรียก endpoint แล้วรีเฟรชรายการ — รวมการจัดการ error ไว้ที่เดียว */
async function act(fn: () => Promise<unknown>, okMessage: string) {
  error.value = null
  notice.value = null
  try {
    await fn()
    notice.value = okMessage
    await load()
  } catch (err) {
    error.value = errorMessage(err, 'ทำรายการไม่สำเร็จ')
  }
}

function openEdit(u: AdminUser) {
  editing.value = u
  editRole.value = u.role
  editAll.value = u.provinceScope === null
  editScope.value = u.provinceScope ?? []
}

async function saveEdit() {
  if (!editing.value) return
  const target = editing.value
  editBusy.value = true
  try {
    const scope = editAll.value ? null : editScope.value
    if (target.status === 'pending') {
      await approveUser(target.id, editRole.value, scope)
      notice.value = `อนุมัติ ${target.username} แล้ว`
    } else {
      await patchUser(target.id, { role: editRole.value, provinceScope: scope })
      notice.value = `บันทึกการแก้ไข ${target.username} แล้ว`
    }
    editing.value = null
    await load()
  } catch (err) {
    error.value = errorMessage(err, 'บันทึกไม่สำเร็จ')
    editing.value = null
  } finally {
    editBusy.value = false
  }
}

async function copyLink() {
  if (!resetLink.value) return
  await navigator.clipboard?.writeText(resetLink.value.url)
  notice.value = 'คัดลอกลิงก์แล้ว'
}
</script>

<template>
  <AppLayout>
    <PageHeader title="จัดการผู้ใช้" description="อนุมัติผู้สมัคร กำหนดบทบาทและจังหวัดที่ดูแล" />

    <div class="join">
      <button
        v-for="f in FILTERS"
        :key="f.value"
        type="button"
        class="btn btn-sm join-item"
        :class="filter === f.value ? 'btn-active' : ''"
        @click="filter = f.value"
      >
        {{ f.label }}
      </button>
    </div>

    <div v-if="notice" role="status" class="alert alert-success mt-4 text-sm">
      <span>{{ notice }}</span>
    </div>
    <div v-if="error" role="alert" class="alert alert-error mt-4 text-sm">
      <span>{{ error }}</span>
    </div>

    <div v-if="resetLink" class="card mt-4 border border-base-300 bg-base-100">
      <div class="card-body gap-2 p-4">
        <p class="text-sm font-medium">ลิงก์ตั้งรหัสผ่านใหม่ของ {{ resetLink.username }}</p>
        <p class="text-xs opacity-60">
          ใช้ได้ครั้งเดียว หมดอายุใน 30 นาที — คัดลอกส่งให้เจ้าตัวทางช่องทางที่ติดต่อกันอยู่
          ลิงก์นี้แสดงครั้งเดียว ปิดแล้วต้องกดสร้างใหม่
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <code class="flex-1 overflow-x-auto rounded-field bg-base-200 px-2 py-1.5 text-xs whitespace-nowrap">
            {{ resetLink.url }}
          </code>
          <button type="button" class="btn btn-sm btn-ghost" @click="copyLink">คัดลอก</button>
          <button type="button" class="btn btn-sm btn-ghost" @click="resetLink = null">ปิด</button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="mt-10 flex justify-center">
      <span class="loading loading-spinner loading-lg opacity-60" />
    </div>

    <div v-else-if="!rows.length" class="card mt-4 border border-base-300 bg-base-100">
      <div class="card-body text-sm opacity-70">
        {{ filter === 'pending' ? 'ไม่มีคำขอรออนุมัติ' : 'ไม่มีผู้ใช้ในสถานะนี้' }}
      </div>
    </div>

    <div v-else class="mt-4 flex flex-col gap-3">
      <div v-for="u in rows" :key="u.id" class="card border border-base-300 bg-base-100">
        <div class="card-body p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium">{{ u.fullName ?? u.username }}</span>
                <span class="badge badge-sm" :class="STATUS_BADGE[u.status]">
                  {{ STATUS_LABEL[u.status] }}
                </span>
                <span class="badge badge-sm badge-ghost">{{ ROLE_LABEL[u.role] }}</span>
                <span v-if="u.id === auth.user?.id" class="badge badge-sm badge-ghost">คุณเอง</span>
              </div>

              <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt class="opacity-70">ชื่อผู้ใช้</dt>
                <dd>{{ u.username }}</dd>
                <dt class="opacity-70">อีเมล</dt>
                <dd class="break-all">{{ u.email }}</dd>
                <dt class="opacity-70">เบอร์โทร</dt>
                <dd>{{ u.phone ?? '—' }}</dd>
                <dt class="opacity-70">หน่วยงาน</dt>
                <dd>{{ u.company ?? '—' }}</dd>
                <dt class="opacity-70">จังหวัดที่ดูแล</dt>
                <dd>{{ scopeLabel(u.provinceScope) }}</dd>
                <dt class="opacity-70">{{ u.status === 'pending' ? 'สมัครเมื่อ' : 'เข้าใช้ล่าสุด' }}</dt>
                <dd>{{ fmtDate(u.status === 'pending' ? u.createdAt : u.lastLoginAt) }}</dd>
              </dl>
            </div>

            <div v-if="u.manageable" class="flex flex-wrap gap-2">
              <template v-if="u.status === 'pending'">
                <button type="button" class="btn btn-sm btn-primary" @click="openEdit(u)">
                  ตรวจและอนุมัติ
                </button>
                <button
                  type="button" class="btn btn-sm btn-ghost text-error"
                  @click="act(() => rejectUser(u.id), 'ลบคำขอแล้ว')"
                >
                  ปฏิเสธ
                </button>
              </template>
              <template v-else>
                <button type="button" class="btn btn-sm btn-ghost" @click="openEdit(u)">แก้ไข</button>
                <button
                  type="button" class="btn btn-sm btn-ghost"
                  @click="act(
                    () => createResetLink(u.id).then((r) => { resetLink = { username: u.username, url: r.url } }),
                    'สร้างลิงก์แล้ว',
                  )"
                >
                  ลิงก์รีเซ็ตรหัส
                </button>
                <button
                  v-if="u.status === 'active'" type="button" class="btn btn-sm btn-ghost"
                  @click="act(() => suspendUser(u.id), 'ระงับการใช้งานแล้ว')"
                >
                  ระงับ
                </button>
                <button
                  v-else type="button" class="btn btn-sm btn-ghost"
                  @click="act(() => activateUser(u.id), 'คืนสิทธิ์แล้ว')"
                >
                  คืนสิทธิ์
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!--
      กล่องอนุมัติ/แก้ไข
      ตัวเลือกบทบาทมาจาก assignableRoles ที่ BE ส่งมา ไม่ได้ hardcode ฝั่งนี้
    -->
    <div v-if="editing" class="modal modal-open" @click.self="editing = null">
      <div class="modal-box max-w-lg">
        <h3 class="text-lg font-semibold">{{ approving ? 'ตรวจและอนุมัติ' : 'แก้ไขผู้ใช้' }}</h3>
        <p class="mt-1 text-sm opacity-70">
          {{ editing.fullName ?? editing.username }} · {{ editing.email }}
          <template v-if="editing.phone"> · {{ editing.phone }}</template>
        </p>

        <p v-if="approving" class="mt-3 text-xs opacity-60">
          จังหวัดด้านล่างคือค่าที่ผู้สมัครติ๊กมาเอง ถือเป็นคำขอ — แก้ให้ตรงกับความจริงก่อนอนุมัติได้
        </p>

        <div class="mt-4 flex flex-col gap-4">
          <BaseSelect v-model="editRole" label="บทบาท" :disabled="editBusy">
            <option v-for="r in assignable" :key="r" :value="r">{{ ROLE_LABEL[r] }}</option>
            <!-- role ปัจจุบันอาจสูงกว่าที่เราแต่งตั้งได้ ต้องมีให้เห็นไม่งั้น select จะว่าง -->
            <option v-if="!assignable.includes(editing.role)" :value="editing.role" disabled>
              {{ ROLE_LABEL[editing.role] }} (แก้ไม่ได้)
            </option>
          </BaseSelect>

          <div class="form-control">
            <label class="label"><span class="label-text font-medium">จังหวัดที่ดูแล</span></label>
            <ProvincePicker
              v-model:selected="editScope" v-model:all="editAll" allow-all :disabled="editBusy"
            />
          </div>
        </div>

        <div class="modal-action">
          <button type="button" class="btn btn-ghost" :disabled="editBusy" @click="editing = null">
            ยกเลิก
          </button>
          <BaseButton :loading="editBusy" @click="saveEdit">
            {{ approving ? 'อนุมัติ' : 'บันทึก' }}
          </BaseButton>
        </div>
      </div>
    </div>
  </AppLayout>
</template>
