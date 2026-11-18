import L from 'leaflet'
import { ref, shallowRef, watch, type Ref } from 'vue'
import {
  getSurveyMapPoints, SEVERITY_LABEL, type SurveyMapPoint, type SurveySeverity,
} from '@/services/surveys.api'

/** ชั้น "จุดปัญหาที่เคยบันทึก" ของ OnlineNetworkMap — gIssues หน้าแม่สร้างใน onMounted */
export function useSurveyIssuesLayer(ctx: {
  map: Ref<L.Map | null>
  renderer: Ref<L.Canvas | null>
  /** props ของหน้าแม่ — embed = อยู่ใน WebView ของแอป (popup ไม่มีลิงก์เปิดงาน) */
  props: { embed?: boolean }
}) {
  const { map, renderer, props } = ctx

  /**
   * ชั้นเสริม ปิดเป็นค่าเริ่มต้น — แผนที่นี้มีงานหลักคือโครงข่าย จุดปัญหาเป็นของที่เปิดดูเป็นครั้ง
   * ใช้ endpoint เดียวกับแผนที่สำรวจ (`/surveys/points/map` เพดาน 2,000 จุด/กรอบ)
   * ล้มก็เงียบ — แผนที่หลักต้องใช้ได้ต่อแม้ชั้นนี้มีปัญหา
   */
  const gIssues = shallowRef<L.LayerGroup | null>(null)
  const issuesOn = ref(false)
  const issues = ref<SurveyMapPoint[]>([])
  const issuesCapped = ref(false)
  const issuesResolved = ref(false)
  const SEV_COLOR: Record<SurveySeverity, string> = { low: '#64748b', medium: '#f59e0b', high: '#dc2626' }

  async function loadIssues() {
    const m = map.value
    if (!m) return
    if (!issuesOn.value) { gIssues.value?.clearLayers(); issues.value = []; return }
    const b = m.getBounds().pad(0.15)
    try {
      const r = await getSurveyMapPoints({
        bbox: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()],
        resolved: issuesResolved.value,
      })
      issues.value = r.points
      issuesCapped.value = r.capped
      drawIssues()
    } catch {
      // ชั้นเสริม ไม่มีก็ยังใช้แผนที่ได้
    }
  }

  /** popup เป็น DOM ของ Leaflet ไม่ใช่ Vue จึงประกอบ HTML เอง — escape ทุกช่องที่มาจากผู้ใช้ */
  function drawIssues() {
    const g = gIssues.value
    if (!g) return
    g.clearLayers()
    if (!issuesOn.value) return
    const rend = renderer.value ?? undefined
    const esc = (v: string | null) => (v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] ?? ch))
    for (const pt of issues.value) {
      const link = props.embed ? '' : `<a class="link link-primary" href="/surveys/${pt.surveyId}">เปิดงาน ${esc(pt.surveyNo)}</a>`
      L.circleMarker([pt.lat, pt.lng], {
        radius: 7, color: '#ffffff', weight: 2,
        fillColor: SEV_COLOR[pt.severity], fillOpacity: pt.resolved ? 0.45 : 0.95, renderer: rend,
      })
        .bindPopup(`<div class="text-xs leading-relaxed">
          <b>${esc(pt.type)}</b> · ${SEVERITY_LABEL[pt.severity]}${pt.resolved ? ' · แก้ไขแล้ว' : ''}<br>
          ${esc(pt.surveyNo)} · ${esc(pt.surveyDate)} · ${esc(pt.targetCode)}<br>
          ${pt.note ? `<span class="opacity-80">${esc(pt.note)}</span><br>` : ''}
          ${pt.photos ? `📷 ${pt.photos} รูป · ` : ''}${link}
        </div>`)
        .addTo(g)
    }
  }

  watch([issuesOn, issuesResolved], () => void loadIssues())

  return {
    gIssues,
    issuesOn,
    issues,
    issuesCapped,
    issuesResolved,
    SEV_COLOR,
    loadIssues,
    drawIssues,
  }
}
