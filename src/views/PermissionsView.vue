<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import PageToggleTable from '../components/PageToggleTable.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import { errorMessage } from '../lib/api'
import { decidePage, type PageDef } from '../lib/pages'
import { ROLE_LABEL, STATUS_BADGE, STATUS_LABEL } from '../lib/roles'
import {
  createPermissionGroup, deletePermissionGroup, getPermissionGroups, getPermissionPages,
  getPermissionUsers, setUserPermissions, updatePermissionGroup,
  type PageMap, type PermissionGroup, type PermissionUser,
} from '../services/permissions.api'

/**
 * สิทธิ์รายหน้า (Permission Manager) — dev เท่านั้น
 *
 * ชั้นนี้ "ปิด" ได้อย่างเดียว เปิดได้ไม่เกินเพดาน role · สิทธิ์แก้ข้อมูลยังเป็นของ role + จังหวัด
 * ลำดับตัดสิน: dev → เพดาน role → ตั้งรายคน → กลุ่ม → ตาม role (เหมือน BE src/auth/pages.ts)
 *
 * พรีวิว "ผลจริง" ในตัวปรับรายคนคำนวณฝั่งหน้าจอระหว่างกด หลังบันทึกโหลดผลจาก BE มาทับเสมอ
 */

const tab = ref<'groups' | 'users'>('groups')
const pages = ref<PageDef[]>([])
const groups = ref<PermissionGroup[]>([])
const users = ref<PermissionUser[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

async function loadAll() {
  error.value = null
  try {
    const [p, g, u] = await Promise.all([getPermissionPages(), getPermissionGroups(), getPermissionUsers()])
    pages.value = p
    groups.value = g
    users.value = u
  } catch (err) {
    error.value = errorMessage(err, 'โหลดข้อมูลสิทธิ์ไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)

function flash(msg: string) {
  notice.value = msg
  setTimeout(() => { if (notice.value === msg) notice.value = null }, 4000)
}

const groupName = (id: number | null) => groups.value.find((g) => g.id === id)?.name ?? null

function summarize(map: PageMap): string {
  const v = Object.values(map)
  const off = v.filter((x) => !x).length
  const on = v.filter((x) => x).length
  if (!off && !on) return 'ไม่ได้ตั้งค่า (ทุกหน้าตาม role)'
  return [off ? `ปิด ${off} หน้า` : '', on ? `เปิด ${on} หน้า` : ''].filter(Boolean).join(' · ')
}

// ─────────────────────────────────────────────────────────────────────────────
// กลุ่ม
// ─────────────────────────────────────────────────────────────────────────────

/** null = ไม่ได้แก้ · id = 0 คือกลุ่มใหม่ */
const groupDraft = ref<{ id: number; name: string; description: string; pages: PageMap } | null>(null)
const groupBusy = ref(false)
const groupError = ref<string | null>(null)
const confirmDeleteId = ref<number | null>(null)

function newGroup() {
  groupError.value = null
  groupDraft.value = { id: 0, name: '', description: '', pages: {} }
}

function editGroup(g: PermissionGroup) {
  groupError.value = null
  confirmDeleteId.value = null
  groupDraft.value = { id: g.id, name: g.name, description: g.description ?? '', pages: { ...g.pages } }
}

async function saveGroup() {
  const d = groupDraft.value
  if (!d) return
  groupBusy.value = true
  groupError.value = null
  try {
    const body = { name: d.name, description: d.description.trim() || null, pages: d.pages }
    if (d.id === 0) await createPermissionGroup(body)
    else await updatePermissionGroup(d.id, body)
    flash(d.id === 0 ? `สร้างกลุ่ม "${d.name}" แล้ว` : `บันทึกกลุ่ม "${d.name}" แล้ว — มีผลกับสมาชิกทันที`)
    groupDraft.value = null
    await loadAll()
  } catch (err) {
    groupError.value = errorMessage(err, 'บันทึกกลุ่มไม่สำเร็จ')
  } finally {
    groupBusy.value = false
  }
}

async function removeGroup(g: PermissionGroup) {
  groupBusy.value = true
  try {
    await deletePermissionGroup(g.id)
    flash(`ลบกลุ่ม "${g.name}" แล้ว${g.memberCount ? ` — สมาชิก ${g.memberCount} คนกลับไปใช้สิทธิ์ตาม role` : ''}`)
    confirmDeleteId.value = null
    if (groupDraft.value?.id === g.id) groupDraft.value = null
    await loadAll()
  } catch (err) {
    error.value = errorMessage(err, 'ลบกลุ่มไม่สำเร็จ')
  } finally {
    groupBusy.value = false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ผู้ใช้
// ─────────────────────────────────────────────────────────────────────────────

const q = ref('')
/** '' = ทุกคน · 'none' = ไม่อยู่กลุ่ม · ตัวเลข = id กลุ่ม */
const groupFilter = ref('')

const filteredUsers = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return users.value.filter((u) => {
    if (groupFilter.value === 'none' && u.groupId !== null) return false
    if (groupFilter.value && groupFilter.value !== 'none' && u.groupId !== Number(groupFilter.value)) return false
    if (!needle) return true
    return u.username.toLowerCase().includes(needle) || (u.fullName ?? '').toLowerCase().includes(needle)
  })
})

const allowedCount = (u: PermissionUser) => Object.values(u.effective).filter((e) => e.allow).length

const editingUserId = ref<string | null>(null)
const userDraft = ref<{ groupId: number | null; overrides: PageMap }>({ groupId: null, overrides: {} })
const userBusy = ref(false)
const userError = ref<string | null>(null)

function toggleUser(u: PermissionUser) {
  userError.value = null
  if (editingUserId.value === u.id) {
    editingUserId.value = null
    return
  }
  editingUserId.value = u.id
  userDraft.value = { groupId: u.groupId, overrides: { ...u.overrides } }
}

/** ผลจริงระหว่างแก้ — กติกาเดียวกับ BE (decidePage) ใช้กลุ่มที่เลือกค้างไว้ในร่าง */
const draftEffective = computed(() => {
  const u = users.value.find((x) => x.id === editingUserId.value)
  if (!u) return {}
  const g = groups.value.find((x) => x.id === userDraft.value.groupId)?.pages ?? {}
  return Object.fromEntries(pages.value.map((p) => [p.key, decidePage(u.role, p, g, userDraft.value.overrides)]))
})

const userDirty = computed(() => {
  const u = users.value.find((x) => x.id === editingUserId.value)
  if (!u) return false
  return u.groupId !== userDraft.value.groupId
    || JSON.stringify(sortKeys(u.overrides)) !== JSON.stringify(sortKeys(userDraft.value.overrides))
})

function sortKeys(m: PageMap): PageMap {
  return Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)))
}

async function saveUser(u: PermissionUser) {
  userBusy.value = true
  userError.value = null
  try {
    await setUserPermissions(u.id, userDraft.value)
    flash(`บันทึกสิทธิ์ของ ${u.fullName ?? u.username} แล้ว — มีผลทันที`)
    editingUserId.value = null
    await loadAll()
  } catch (err) {
    userError.value = errorMessage(err, 'บันทึกสิทธิ์ไม่สำเร็จ')
  } finally {
    userBusy.value = false
  }
}
</script>

<template>
  <AppLayout>
    <PageHeader
      title="สิทธิ์รายหน้า"
      description="กำหนดว่าใครเข้าหน้าไหนได้ — ปิดหน้าได้ เปิดได้ไม่เกินสิทธิ์ของ role · การแก้ข้อมูลยังคุมด้วย role และจังหวัดเหมือนเดิม"
    >
      <template #actions>
        <RouterLink to="/settings" class="btn btn-ghost btn-sm">← ตั้งค่าระบบ</RouterLink>
      </template>
    </PageHeader>

    <div v-if="error" role="alert" class="alert alert-error mb-4 text-sm">{{ error }}</div>
    <div v-if="notice" role="status" class="alert alert-success mb-4 text-sm">{{ notice }}</div>

    <div role="tablist" class="tabs-boxed tabs mb-4 w-fit">
      <button type="button" role="tab" class="tab" :class="{ 'tab-active': tab === 'groups' }" @click="tab = 'groups'">
        กลุ่ม ({{ groups.length }})
      </button>
      <button type="button" role="tab" class="tab" :class="{ 'tab-active': tab === 'users' }" @click="tab = 'users'">
        ผู้ใช้ ({{ users.length }})
      </button>
    </div>

    <div v-if="loading" class="mt-10 flex justify-center">
      <span class="loading loading-spinner loading-lg opacity-60" />
    </div>

    <!-- ── กลุ่ม ─────────────────────────────────────────────────────────── -->
    <section v-else-if="tab === 'groups'" class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm text-base-content/70">
          ตั้งเป็นกลุ่มแล้วเอาผู้ใช้เข้ากลุ่มที่แท็บผู้ใช้ · หน้าที่ไม่ได้ตั้ง = เข้าได้ตาม role เหมือนเดิม
        </p>
        <button v-if="!groupDraft" type="button" class="btn btn-primary btn-sm" @click="newGroup">+ สร้างกลุ่ม</button>
      </div>

      <!-- ตัวแก้กลุ่ม -->
      <div v-if="groupDraft" class="card border border-primary/40 bg-base-100">
        <div class="card-body gap-4 p-4">
          <h2 class="font-semibold">{{ groupDraft.id === 0 ? 'สร้างกลุ่มใหม่' : `แก้กลุ่ม "${groupDraft.name}"` }}</h2>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="form-control">
              <span class="label-text mb-1 text-sm font-medium">ชื่อกลุ่ม</span>
              <input v-model="groupDraft.name" type="text" maxlength="64" class="input input-bordered input-sm" :disabled="groupBusy">
            </label>
            <label class="form-control">
              <span class="label-text mb-1 text-sm font-medium">คำอธิบาย (ไม่บังคับ)</span>
              <input v-model="groupDraft.description" type="text" class="input input-bordered input-sm" :disabled="groupBusy">
            </label>
          </div>
          <p class="text-xs text-base-content/60">
            "เปิด" ไม่ทำให้ใครเข้าหน้าที่เกิน role ของตัวเองได้ — เช่น เปิด OLT Bot ให้กลุ่ม สมาชิกที่เป็น viewer ก็ยังเข้าไม่ได้
          </p>
          <PageToggleTable v-model="groupDraft.pages" :pages="pages" unset-label="ตาม role" :disabled="groupBusy" />
          <div v-if="groupError" role="alert" class="alert alert-error text-sm">{{ groupError }}</div>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn btn-ghost btn-sm" :disabled="groupBusy" @click="groupDraft = null">ยกเลิก</button>
            <BaseButton size="sm" :loading="groupBusy" :disabled="!groupDraft.name.trim()" @click="saveGroup">บันทึกกลุ่ม</BaseButton>
          </div>
        </div>
      </div>

      <div v-if="!groups.length && !groupDraft" class="card border border-base-300 bg-base-100">
        <div class="card-body text-sm text-base-content/70">ยังไม่มีกลุ่ม — ทุกคนเข้าหน้าได้ตาม role</div>
      </div>

      <div v-for="g in groups" :key="g.id" class="card border border-base-300 bg-base-100">
        <div class="card-body flex-row flex-wrap items-center justify-between gap-3 p-4">
          <div class="min-w-0">
            <p class="font-medium">{{ g.name }} <span class="badge badge-ghost badge-sm">{{ g.memberCount }} คน</span></p>
            <p v-if="g.description" class="text-sm text-base-content/70">{{ g.description }}</p>
            <p class="text-xs text-base-content/60">{{ summarize(g.pages) }}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn btn-ghost btn-sm" :disabled="groupBusy" @click="editGroup(g)">แก้ไข</button>
            <template v-if="confirmDeleteId === g.id">
              <span class="self-center text-xs text-error">
                {{ g.memberCount ? `สมาชิก ${g.memberCount} คนจะกลับไปใช้สิทธิ์ตาม role` : 'ยืนยันลบ?' }}
              </span>
              <button type="button" class="btn btn-error btn-sm" :disabled="groupBusy" @click="removeGroup(g)">ลบเลย</button>
              <button type="button" class="btn btn-ghost btn-sm" :disabled="groupBusy" @click="confirmDeleteId = null">ไม่ลบ</button>
            </template>
            <button v-else type="button" class="btn btn-ghost btn-sm text-error" :disabled="groupBusy" @click="confirmDeleteId = g.id">ลบ</button>
          </div>
        </div>
      </div>
    </section>

    <!-- ── ผู้ใช้ ────────────────────────────────────────────────────────── -->
    <section v-else class="flex flex-col gap-3">
      <div class="flex flex-wrap items-end gap-2">
        <input v-model="q" type="search" placeholder="ค้นชื่อ / ชื่อผู้ใช้" class="input input-bordered input-sm w-56">
        <select v-model="groupFilter" class="select select-bordered select-sm">
          <option value="">ทุกกลุ่ม</option>
          <option value="none">ไม่อยู่กลุ่มไหน</option>
          <option v-for="g in groups" :key="g.id" :value="String(g.id)">{{ g.name }}</option>
        </select>
        <span class="text-xs text-base-content/60">{{ filteredUsers.length }} คน · กดที่แถวเพื่อตั้งค่า</span>
      </div>

      <div v-for="u in filteredUsers" :key="u.id" class="card border bg-base-100" :class="editingUserId === u.id ? 'border-primary/40' : 'border-base-300'">
        <button
          type="button"
          class="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left"
          :disabled="!u.manageable"
          @click="toggleUser(u)"
        >
          <span class="min-w-0">
            <span class="font-medium">{{ u.fullName ?? u.username }}</span>
            <span class="ml-1 text-xs text-base-content/60">{{ u.username }}</span>
            <span class="ml-2 badge badge-ghost badge-sm">{{ ROLE_LABEL[u.role] }}</span>
            <span v-if="u.status !== 'active'" class="ml-1 badge badge-sm" :class="STATUS_BADGE[u.status]">{{ STATUS_LABEL[u.status] }}</span>
          </span>
          <span class="flex items-center gap-3 text-xs text-base-content/70">
            <span>{{ groupName(u.groupId) ?? 'ไม่อยู่กลุ่ม' }}</span>
            <span v-if="Object.keys(u.overrides).length">· ตั้งรายคน {{ Object.keys(u.overrides).length }}</span>
            <span class="tabular-nums">· เข้าได้ {{ allowedCount(u) }}/{{ pages.length }} หน้า</span>
            <span v-if="!u.manageable" class="badge badge-ghost badge-sm">แก้ไม่ได้</span>
            <span v-else aria-hidden="true">{{ editingUserId === u.id ? '▴' : '▾' }}</span>
          </span>
        </button>

        <div v-if="editingUserId === u.id" class="flex flex-col gap-4 border-t border-base-300 p-4">
          <label class="form-control w-full max-w-xs">
            <span class="label-text mb-1 text-sm font-medium">กลุ่มสิทธิ์</span>
            <select v-model="userDraft.groupId" class="select select-bordered select-sm" :disabled="userBusy">
              <option :value="null">ไม่อยู่กลุ่ม (ตาม role)</option>
              <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
            </select>
          </label>
          <p class="text-xs text-base-content/60">
            ตั้งรายคนชนะค่าของกลุ่มเสมอ · หน้าที่เกินสิทธิ์ของ {{ ROLE_LABEL[u.role] }} กดไม่ได้ ·
            คอลัมน์ขวาคือผลจริงถ้าบันทึกตอนนี้
          </p>
          <PageToggleTable
            v-model="userDraft.overrides" :pages="pages" unset-label="ตามกลุ่ม"
            :role="u.role" :effective="draftEffective" :disabled="userBusy"
          />
          <div v-if="userError" role="alert" class="alert alert-error text-sm">{{ userError }}</div>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn btn-ghost btn-sm" :disabled="userBusy" @click="editingUserId = null">ยกเลิก</button>
            <BaseButton size="sm" :loading="userBusy" :disabled="!userDirty" @click="saveUser(u)">บันทึกสิทธิ์</BaseButton>
          </div>
        </div>
      </div>
    </section>
  </AppLayout>
</template>
