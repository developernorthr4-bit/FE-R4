<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { categorical } from '../lib/palette'
import type { MapSite } from '../services/sites.api'
import { useThemeStore } from '../stores/theme'

/**
 * แผนที่สถานี
 *
 * 7,300 หมุดวางตรง ๆ ไม่ได้ เบราว์เซอร์จะหนืด — ใช้ markercluster จับกลุ่ม
 * หมุดที่อยู่ใกล้กันเป็นวงกลมตัวเลข แล้วแตกออกเมื่อซูมเข้า
 *
 * ใช้ CircleMarker ไม่ใช่ Marker รูปหมุด เพราะ CircleMarker วาดเป็น SVG
 * เปลี่ยนสีตามค่ายได้ตรง ๆ และเบากว่าการโหลดไอคอน 7,300 ใบ
 */
const props = defineProps<{
  sites: MapSite[]
  operatorSlot: Map<number, number>
  selectedId: string | null
}>()
const emit = defineEmits<{ select: [id: string] }>()

const theme = useThemeStore()
const el = ref<HTMLElement | null>(null)

// shallowRef เพราะออบเจกต์ของ Leaflet ไม่ควรถูก Vue ทำ reactive ลึก
// (มันมีอ้างอิงวนกันเองเยอะ ทำ deep proxy แล้วช้าและพังได้)
const map = shallowRef<L.Map | null>(null)
const cluster = shallowRef<L.MarkerClusterGroup | null>(null)
const markerById = new Map<string, L.CircleMarker>()

/** กรอบภาคเหนือคร่าว ๆ ใช้เป็นมุมมองเริ่มต้นก่อนข้อมูลมาถึง */
const NORTH_BOUNDS = L.latLngBounds([15.0, 97.3], [20.5, 101.8])

function colorOf(s: MapSite): string {
  const slot = s.o === null ? null : props.operatorSlot.get(s.o) ?? null
  return categorical(slot, theme.resolved === 'dark')
}

function styleOf(s: MapSite, selected: boolean) {
  return {
    radius: selected ? 8 : 5,
    color: selected ? '#ffffff' : colorOf(s),
    weight: selected ? 3 : 1,
    fillColor: colorOf(s),
    // สถานีที่ยังไม่มีข้อมูลความถี่ปล่อยให้จางกว่า — เห็นได้ว่าตรงไหนข้อมูลยังขาด
    fillOpacity: s.b === 0 ? 0.35 : 0.9,
    opacity: s.b === 0 ? 0.5 : 1,
  }
}

function draw() {
  const m = map.value
  if (!m) return

  cluster.value?.clearLayers()
  markerById.clear()

  const group = cluster.value!
  const points: L.LatLng[] = []

  for (const s of props.sites) {
    if (s.lat === null || s.lng === null) continue
    const marker = L.circleMarker([s.lat, s.lng], styleOf(s, s.i === props.selectedId))
    marker.bindTooltip(s.c, { direction: 'top', offset: [0, -4] })
    marker.on('click', () => emit('select', s.i))
    markerById.set(s.i, marker)
    group.addLayer(marker)
    points.push(L.latLng(s.lat, s.lng))
  }

  if (points.length > 0) m.fitBounds(L.latLngBounds(points).pad(0.05))
}

onMounted(() => {
  if (!el.value) return

  const m = L.map(el.value, { zoomControl: true, preferCanvas: true })
  m.fitBounds(NORTH_BOUNDS)

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(m)

  const group = L.markerClusterGroup({
    // เกิน 13 ก็แตกกลุ่มหมด ระดับนั้นเห็นสถานีรายตัวมีความหมายกว่ากลุ่ม
    disableClusteringAtZoom: 13,
    chunkedLoading: true,
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: false,
  })
  m.addLayer(group)

  map.value = m
  cluster.value = group
  draw()
})

onBeforeUnmount(() => {
  map.value?.remove()
  map.value = null
})

// วาดใหม่เมื่อรายการที่กรองแล้วเปลี่ยน หรือเมื่อสลับธีม (สีหมุดอิงธีม)
watch(() => props.sites, draw)
watch(() => theme.resolved, draw)

/** เปลี่ยนสถานีที่เลือก — แต่งเฉพาะ 2 หมุดที่เกี่ยว ไม่วาดใหม่ทั้งแผนที่ */
watch(() => props.selectedId, (now, before) => {
  if (before) {
    const s = props.sites.find((x) => x.i === before)
    const mk = markerById.get(before)
    if (s && mk) mk.setStyle(styleOf(s, false))
  }
  if (now) {
    const s = props.sites.find((x) => x.i === now)
    const mk = markerById.get(now)
    if (s && mk) {
      mk.setStyle(styleOf(s, true))
      // ถ้าหมุดถูกยุบอยู่ในกลุ่ม ให้แตกกลุ่มออกมาแล้วเลื่อนไปหา
      cluster.value?.zoomToShowLayer(mk, () => mk.bringToFront())
    }
  }
})
</script>

<template>
  <div ref="el" class="h-full w-full rounded-box" />
</template>

<style>
/* พื้นแผนที่ให้เข้ากับธีม ไม่งั้นตอนโหลด tile จะเห็นสี่เหลี่ยมเทาสว่างในโหมดมืด */
.leaflet-container {
  background: var(--color-base-200);
  font-family: inherit;
}

/*
  โหมดมืด: ลดความสว่างของ tile ลง ไม่งั้นแผนที่ขาวจ้าตัดกับ UI ที่มืดจนแสบตา
  ใช้ filter เพราะ OSM ไม่มีชุด tile โทนมืดให้ฟรี
*/
:root[data-theme='dark'] .leaflet-tile-pane {
  filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.9);
}
</style>
