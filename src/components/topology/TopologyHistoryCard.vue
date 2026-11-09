<script setup lang="ts">
import { ref, watch } from 'vue'
import { errorMessage } from '../../lib/api'
import { listTopologyEdits, type TopologyEdit, type TopologyEditAction } from '../../services/rings.api'

/**
 * ประวัติการแก้ Topology ด้วยมือ — ใช้ในหน้า /rings/:id (กรองตามวง)
 * reloadKey เปลี่ยน = โหลดใหม่ (หลังเปลี่ยนชื่อวง)
 */
const props = defineProps<{ ringId?: string; reloadKey?: number }>()

const ACTION_LABEL: Record<TopologyEditAction, string> = {
  add_link: 'ต่อเส้น',
  remove_link: 'ตัดเส้น',
  rename_ring: 'เปลี่ยนชื่อวง',
  add_cpe: 'เพิ่ม CPE',
  add_node: 'เพิ่มโหนด',
  deactivate_cpe: 'ปิดใช้งาน CPE',
  deactivate_node: 'ปิดใช้งานโหนด',
}

const edits = ref<TopologyEdit[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    edits.value = await listTopologyEdits({ ringId: props.ringId, limit: 100 })
  } catch (err) {
    error.value = errorMessage(err, 'โหลดประวัติไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

watch(() => [props.ringId, props.reloadKey], load, { immediate: true })

const fmt = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })

function summary(e: TopologyEdit) {
  if (e.action === 'rename_ring') return `${e.oldValue ?? '—'} → ${e.newValue ?? '—'}`
  return e.newValue ?? e.oldValue ?? e.cpeName ?? e.nodeCode ?? ''
}
</script>

<template>
  <div class="card border border-base-300 bg-base-100">
    <div class="card-body gap-2 p-4">
      <h2 class="card-title text-base">ประวัติการแก้ไขด้วยมือ</h2>
      <div v-if="error" class="alert alert-error text-sm">{{ error }}</div>
      <div v-else-if="loading" class="flex justify-center py-3">
        <span class="loading loading-spinner opacity-60" />
      </div>
      <p v-else-if="!edits.length" class="text-sm opacity-60">ยังไม่มีการแก้ไขด้วยมือ ข้อมูลทั้งหมดมาจาก Topology SVG</p>
      <ul v-else class="divide-y divide-base-200 text-sm">
        <li v-for="e in edits" :key="e.id" class="py-2" :class="{ 'opacity-50': e.revertedAt }">
          <div class="flex flex-wrap items-center gap-2">
            <span class="badge badge-sm whitespace-nowrap badge-outline">{{ ACTION_LABEL[e.action] ?? e.action }}</span>
            <span class="font-mono">{{ summary(e) }}</span>
            <span v-if="e.revertedAt" class="badge badge-sm whitespace-nowrap badge-ghost">ยกเลิกแล้ว</span>
          </div>
          <p class="mt-1 opacity-80">{{ e.reason }}</p>
          <p class="mt-0.5 text-xs opacity-60">{{ e.createdBy ?? 'ไม่ทราบผู้แก้' }} · {{ fmt(e.createdAt) }}</p>
        </li>
      </ul>
    </div>
  </div>
</template>
