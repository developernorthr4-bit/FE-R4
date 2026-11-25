<script setup lang="ts">
import { computed } from 'vue'
import { Star } from 'lucide-vue-next'
import { splitTicketNos } from '@/lib/event-log'
import { formatDates } from '@/lib/iso-week'
import type { EventItem } from '@/services/event-log.api'

/** เหตุ 1 รายการ: ★ · วันที่ · SA/NSA · ข้อความ (เลข Ticket ที่มีในระบบกดไปดูได้) */
const props = defineProps<{ item: EventItem; knownTickets: ReadonlySet<string>; code?: string; clamp?: boolean }>()

const parts = computed(() => splitTicketNos(props.item.note, props.knownTickets))
const saLabel = computed(() => (props.item.sa === null ? null : props.item.sa === 0 ? 'SA' : `SA${props.item.sa}`))
const nsaLabel = computed(() => (props.item.nsa === null ? null : props.item.nsa === 0 ? 'NSA' : `NSA${props.item.nsa}`))
</script>

<template>
  <div class="flex gap-2 text-sm">
    <span v-if="code" class="w-10 shrink-0 font-medium">{{ code }}</span>
    <div class="min-w-0">
      <span class="mr-1.5 inline-flex flex-wrap items-center gap-1 align-middle">
        <Star v-if="item.isHighlight" class="size-3.5 fill-current text-error" aria-label="เหตุเด่น" />
        <span class="whitespace-nowrap text-base-content/70">{{ formatDates(item.dates) }}</span>
        <span v-if="item.dates.length > 1" class="badge badge-ghost badge-xs whitespace-nowrap">{{ item.dates.length }} วัน</span>
        <span v-if="saLabel" class="badge badge-xs whitespace-nowrap" :class="item.sa === 1 || item.sa === 2 ? 'badge-error' : 'badge-warning'">{{ saLabel }}</span>
        <span v-if="nsaLabel" class="badge badge-outline badge-xs whitespace-nowrap">{{ nsaLabel }}</span>
      </span>
      <span class="whitespace-pre-line" :class="clamp ? 'line-clamp-3' : ''">
        <template v-for="(p, i) in parts" :key="i">
          <RouterLink v-if="p.ticketNo" :to="`/tickets/${p.ticketNo}`" target="_blank" class="link link-primary font-mono text-xs">{{ p.text }}</RouterLink>
          <template v-else>{{ p.text }}</template>
        </template>
      </span>
    </div>
  </div>
</template>
