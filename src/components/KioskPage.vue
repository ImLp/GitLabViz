<template>
  <div class="kiosk" tabindex="0" ref="root">
    <header class="kiosk-head">
      <div class="kiosk-head-left">
        <span class="kiosk-tag">KIOSK</span>
        <span class="kiosk-mode-label">{{ currentModeLabel }}</span>
      </div>
      <div class="kiosk-head-right">
        <span class="kiosk-clock">{{ clock }}</span>
        <span class="kiosk-refresh-eta" :title="lastRefreshTitle">
          <v-icon icon="mdi-refresh" size="small" :class="{ spinning: loading }" />
          {{ refreshLabel }}
        </span>
        <button class="kiosk-icon-btn" title="Previous (←)" @click="prevMode">‹</button>
        <button class="kiosk-icon-btn" title="Next (→)" @click="nextMode">›</button>
        <button class="kiosk-icon-btn" :title="paused ? 'Resume cycling (Space)' : 'Pause cycling (Space)'" @click="paused = !paused">
          <v-icon :icon="paused ? 'mdi-play' : 'mdi-pause'" size="small" />
        </button>
        <button class="kiosk-icon-btn" title="Exit kiosk (Esc)" @click="$emit('close')">×</button>
      </div>
    </header>

    <main class="kiosk-body" :class="`mode-${currentMode}`">
      <!-- Today's pulse -->
      <section v-if="currentMode === 'today'" class="k-today">
        <div class="k-stat k-stat-pos">
          <div class="k-stat-num">{{ today.opened }}</div>
          <div class="k-stat-lbl">Opened today</div>
        </div>
        <div class="k-stat k-stat-neg">
          <div class="k-stat-num">{{ today.closed }}</div>
          <div class="k-stat-lbl">Closed today</div>
        </div>
        <div class="k-stat" :class="today.net > 0 ? 'k-stat-warn' : 'k-stat-pos'">
          <div class="k-stat-num">{{ today.net >= 0 ? '+' : '' }}{{ today.net }}</div>
          <div class="k-stat-lbl">Net change</div>
        </div>
        <div class="k-stat">
          <div class="k-stat-num">{{ today.updated }}</div>
          <div class="k-stat-lbl">Updated today</div>
        </div>
        <div class="k-stat">
          <div class="k-stat-num">{{ totals.open }}</div>
          <div class="k-stat-lbl">Open total</div>
        </div>
        <div class="k-stat">
          <div class="k-stat-num">{{ totals.closed }}</div>
          <div class="k-stat-lbl">Closed total</div>
        </div>
      </section>

      <!-- Velocity (7-day created vs closed) -->
      <section v-else-if="currentMode === 'velocity'" class="k-velocity">
        <div class="k-section-title">Last 7 days · created vs closed</div>
        <div class="k-velocity-chart">
          <div v-for="b in velocity.buckets" :key="b.label" class="k-vel-col">
            <div class="k-vel-bars" :style="{ height: velocity.barAreaPx + 'px' }">
              <div class="k-vel-bar k-vel-created" :style="{ height: (b.created / velocity.max * 100) + '%' }" :title="`${b.created} created`">
                <span v-if="b.created" class="k-vel-num">{{ b.created }}</span>
              </div>
              <div class="k-vel-bar k-vel-closed" :style="{ height: (b.closed / velocity.max * 100) + '%' }" :title="`${b.closed} closed`">
                <span v-if="b.closed" class="k-vel-num">{{ b.closed }}</span>
              </div>
            </div>
            <div class="k-vel-lbl">{{ b.label }}</div>
          </div>
        </div>
        <div class="k-legend">
          <span><i class="k-swatch k-vel-created" /> Created</span>
          <span><i class="k-swatch k-vel-closed" /> Closed</span>
          <span class="k-legend-spacer" />
          <span>Σ created {{ velocity.totalCreated }} · Σ closed {{ velocity.totalClosed }}</span>
        </div>
      </section>

      <!-- Workload by assignee -->
      <section v-else-if="currentMode === 'workload'" class="k-workload">
        <div class="k-section-title">
          Active workload by assignee · top {{ workload.length }}
          <span class="k-section-sub">{{ workloadSubtitle }}</span>
        </div>
        <div v-if="!workload.length" class="k-empty">No active tickets in scope.</div>
        <div v-else class="k-bar-list">
          <div v-for="row in workload" :key="row.name" class="k-bar-row">
            <div class="k-bar-name" :title="row.name">{{ row.name }}</div>
            <div class="k-bar-track"><div class="k-bar-fill" :style="{ width: (row.count / workloadMax * 100) + '%' }" /></div>
            <div class="k-bar-count">{{ row.count }}</div>
          </div>
        </div>
      </section>

      <!-- Priority overview -->
      <section v-else-if="currentMode === 'priority'" class="k-priority">
        <div class="k-section-title">Open by priority</div>
        <div v-if="!priorityData.length" class="k-empty">No priorities found on open tickets.</div>
        <div v-else class="k-bar-list">
          <div v-for="row in priorityData" :key="row.label" class="k-bar-row">
            <div class="k-bar-name">{{ row.label }}</div>
            <div class="k-bar-track">
              <div class="k-bar-fill" :style="{ width: (row.count / priorityMax * 100) + '%', background: row.color }" />
            </div>
            <div class="k-bar-count">{{ row.count }}</div>
            <div class="k-bar-side">oldest {{ row.oldestDays }}d</div>
          </div>
        </div>
      </section>

      <!-- Recent activity feed -->
      <section v-else-if="currentMode === 'activity'" class="k-activity">
        <div class="k-section-title">Recent activity</div>
        <div v-if="!activityFeed.length" class="k-empty">No activity yet.</div>
        <ul v-else class="k-feed">
          <li v-for="(e, i) in activityFeed" :key="i" :class="`k-feed-${e.kind}`">
            <v-icon class="k-feed-icon" :icon="e.kind === 'opened' ? 'mdi-plus-circle' : 'mdi-check-circle'" size="small" />
            <span class="k-feed-tag">{{ e.kind === 'opened' ? 'OPENED' : 'CLOSED' }}</span>
            <span v-if="e.iid" class="k-feed-iid">#{{ e.iid }}</span>
            <span class="k-feed-title" :title="e.title">{{ e.title }}</span>
            <span class="k-feed-who" v-if="e.who" :title="e.who">
              <span class="k-feed-avatar" :style="{ background: avatarColor(e.who) }">{{ initialsOf(e.who) }}</span>
              <span class="k-feed-who-name">{{ e.who }}</span>
            </span>
            <span class="k-feed-when">{{ relTime(e.ts) }}</span>
          </li>
        </ul>
      </section>

      <!-- Risks: overdue / stale / unassigned -->
      <section v-else-if="currentMode === 'risks'" class="k-risks">
        <div class="k-risks-grid">
          <div class="k-risks-card">
            <div class="k-section-title">Overdue · {{ risks.overdue.length }}</div>
            <ul v-if="risks.overdue.length" class="k-list">
              <li v-for="(r, i) in risks.overdue" :key="i">
                <span class="k-list-title" :title="r.title">{{ r.title }}</span>
                <span class="k-list-side k-list-bad">{{ r.ageDays }}d overdue</span>
              </li>
            </ul>
            <div v-else class="k-empty">Nothing overdue.</div>
          </div>
          <div class="k-risks-card">
            <div class="k-section-title">Stale (no update &gt; 14d) · {{ risks.stale.length }}</div>
            <ul v-if="risks.stale.length" class="k-list">
              <li v-for="(r, i) in risks.stale" :key="i">
                <span class="k-list-title" :title="r.title">{{ r.title }}</span>
                <span class="k-list-side">{{ r.ageDays }}d</span>
              </li>
            </ul>
            <div v-else class="k-empty">Nothing stale.</div>
          </div>
          <div class="k-risks-card k-risks-stats">
            <div class="k-stat">
              <div class="k-stat-num">{{ risks.unassigned }}</div>
              <div class="k-stat-lbl">Unassigned · open</div>
            </div>
            <div class="k-stat">
              <div class="k-stat-num">{{ risks.noDueDate }}</div>
              <div class="k-stat-lbl">No due date · open</div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer class="kiosk-foot">
      <span
        v-for="m in activeModes"
        :key="m.id"
        class="kiosk-dot"
        :class="{ active: m.id === currentMode }"
        @click="setMode(m.id)"
        :title="m.label"
      />
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useSettingsStore } from '../composables/useSettingsStore'
import { HOTKEY_ACTIONS, getEventCombo } from '../composables/useHotkeys'
import { getAssigneeNames } from '../utils/issueFields'
import { getScopedLabelValue } from '../utils/scopedLabels'
import { currentStatusOfRaw } from '../composables/useGraphDerivedState'

const props = defineProps({
  nodes: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false },
  lastUpdated: { type: Number, default: null }, // ms epoch
  onRefresh: { type: Function, default: null }
})
const emit = defineEmits(['close'])

const { settings } = useSettingsStore()
const root = ref(null)

const ALL_MODES = [
  { id: 'today',    label: "Today's pulse" },
  { id: 'velocity', label: '7-day velocity' },
  { id: 'workload', label: 'Workload by assignee' },
  { id: 'priority', label: 'Priority overview' },
  { id: 'activity', label: 'Recent activity' },
  { id: 'risks',    label: 'Overdue, stale & unassigned' }
]

const activeModes = computed(() => {
  const enabled = settings.uiState.kiosk?.modes || {}
  const list = ALL_MODES.filter(m => enabled[m.id] !== false)
  return list.length ? list : ALL_MODES
})

const currentMode = ref(activeModes.value[0]?.id || 'today')
const currentModeLabel = computed(() => ALL_MODES.find(m => m.id === currentMode.value)?.label || currentMode.value)
const paused = ref(false)

const setMode = (id) => { currentMode.value = id }
const indexOfCurrent = () => activeModes.value.findIndex(m => m.id === currentMode.value)
const nextMode = () => {
  const list = activeModes.value
  if (!list.length) return
  const i = indexOfCurrent()
  currentMode.value = list[(i + 1 + list.length) % list.length].id
}
const prevMode = () => {
  const list = activeModes.value
  if (!list.length) return
  const i = indexOfCurrent()
  currentMode.value = list[(i - 1 + list.length) % list.length].id
}

// Keep currentMode valid if user disables it in settings.
watch(activeModes, (list) => {
  if (!list.find(m => m.id === currentMode.value)) currentMode.value = list[0]?.id || 'today'
})

// Timers
let cycleTimer = null
let refreshTimer = null
const startCycle = () => {
  if (cycleTimer) clearInterval(cycleTimer)
  const sec = Math.max(0, Number(settings.uiState.kiosk?.cycleSeconds) || 0)
  if (!sec) return
  cycleTimer = setInterval(() => { if (!paused.value) nextMode() }, sec * 1000)
}
const startRefresh = () => {
  if (refreshTimer) clearInterval(refreshTimer)
  const min = Math.max(0, Number(settings.uiState.kiosk?.refreshMinutes) || 0)
  if (!min) return
  nextRefreshAt.value = Date.now() + min * 60 * 1000
  refreshTimer = setInterval(() => {
    nextRefreshAt.value = Date.now() + min * 60 * 1000
    if (typeof props.onRefresh === 'function' && !props.loading) props.onRefresh()
  }, min * 60 * 1000)
}
watch(() => settings.uiState.kiosk?.cycleSeconds, startCycle)
watch(() => settings.uiState.kiosk?.refreshMinutes, startRefresh)

// Clock & refresh countdown — tick every second.
const nowTick = ref(Date.now())
const nextRefreshAt = ref(null)
let nowTickTimer = null

const clock = computed(() => new Date(nowTick.value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
const refreshLabel = computed(() => {
  const min = Number(settings.uiState.kiosk?.refreshMinutes) || 0
  if (!min) return 'auto-refresh off'
  if (props.loading) return 'refreshing…'
  if (!nextRefreshAt.value) return `${min}m`
  const ms = Math.max(0, nextRefreshAt.value - nowTick.value)
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`
})
const lastRefreshTitle = computed(() => {
  if (!props.lastUpdated) return 'Never refreshed'
  return `Last refreshed: ${new Date(props.lastUpdated).toLocaleString()}`
})

const toggleKioskCombo = computed(() => {
  const def = HOTKEY_ACTIONS.find(a => a.id === 'toggleKiosk')?.default || ''
  return (settings.uiState.hotkeys?.toggleKiosk ?? def).toLowerCase()
})
const handleWindowKey = (e) => {
  const t = e.target
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
  if (e.key === 'Escape')         { e.preventDefault(); emit('close'); return }
  if (e.key === 'ArrowRight')     { e.preventDefault(); nextMode(); return }
  if (e.key === 'ArrowLeft')      { e.preventDefault(); prevMode(); return }
  if (e.key === ' ')              { e.preventDefault(); paused.value = !paused.value; return }
  if (toggleKioskCombo.value && getEventCombo(e) === toggleKioskCombo.value) {
    e.preventDefault(); emit('close')
  }
}

onMounted(() => {
  startCycle()
  startRefresh()
  nowTickTimer = setInterval(() => { nowTick.value = Date.now() }, 1000)
  window.addEventListener('keydown', handleWindowKey)
  if (root.value && typeof root.value.focus === 'function') root.value.focus()
})
onUnmounted(() => {
  if (cycleTimer) clearInterval(cycleTimer)
  if (refreshTimer) clearInterval(refreshTimer)
  if (nowTickTimer) clearInterval(nowTickTimer)
  window.removeEventListener('keydown', handleWindowKey)
})

// --- Data helpers ---
const items = computed(() => Object.values(props.nodes || {}))
const safeDate = (iso) => {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : null
}
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }
const isOpen = (n) => String(n?._raw?.state || '').toLowerCase() !== 'closed'

const totals = computed(() => {
  let open = 0, closed = 0
  for (const n of items.value) {
    if (isOpen(n)) open++; else closed++
  }
  return { open, closed }
})

const today = computed(() => {
  const start = startOfToday()
  let opened = 0, closed = 0, updated = 0
  for (const n of items.value) {
    const raw = n._raw || {}
    if ((safeDate(raw.created_at) || 0) >= start) opened++
    if ((safeDate(raw.closed_at) || 0) >= start) closed++
    if ((safeDate(raw.updated_at) || 0) >= start) updated++
  }
  return { opened, closed, updated, net: opened - closed }
})

const velocity = computed(() => {
  const days = 7
  const dayMs = 24 * 60 * 60 * 1000
  const today0 = startOfToday()
  const firstDay = today0 - (days - 1) * dayMs
  const buckets = Array.from({ length: days }, (_, i) => ({
    label: i === days - 1 ? 'Today' : new Date(firstDay + i * dayMs).toLocaleDateString(undefined, { weekday: 'short' }),
    created: 0,
    closed: 0
  }))
  for (const n of items.value) {
    const raw = n._raw || {}
    const c = safeDate(raw.created_at); if (c) {
      const day = Math.floor((c - firstDay) / dayMs)
      if (day >= 0 && day < days) buckets[day].created++
    }
    const cl = safeDate(raw.closed_at); if (cl) {
      const day = Math.floor((cl - firstDay) / dayMs)
      if (day >= 0 && day < days) buckets[day].closed++
    }
  }
  const max = Math.max(1, ...buckets.flatMap(b => [b.created, b.closed]))
  return {
    buckets,
    max,
    barAreaPx: 220,
    totalCreated: buckets.reduce((s, b) => s + b.created, 0),
    totalClosed: buckets.reduce((s, b) => s + b.closed, 0)
  }
})

const workloadIdleDays = computed(() => Math.max(0, Number(settings.uiState.kiosk?.workloadIdleDays) || 0))
const isBacklog = (raw) => /backlog/i.test(currentStatusOfRaw(raw) || '')
const workload = computed(() => {
  const idleMs = workloadIdleDays.value * 24 * 60 * 60 * 1000
  const cutoff = idleMs ? Date.now() - idleMs : 0
  const counts = new Map()
  for (const n of items.value) {
    if (!isOpen(n)) continue
    const raw = n._raw || {}
    if (isBacklog(raw)) continue
    if (cutoff) {
      const upd = safeDate(raw.updated_at) || safeDate(raw.created_at) || 0
      if (upd < cutoff) continue
    }
    const names = getAssigneeNames(raw)
    if (!names.length) counts.set('(Unassigned)', (counts.get('(Unassigned)') || 0) + 1)
    else for (const name of names) counts.set(name, (counts.get(name) || 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, count]) => ({ name, count }))
})
const workloadMax = computed(() => Math.max(1, ...workload.value.map(r => r.count)))
const workloadSubtitle = computed(() => {
  const d = workloadIdleDays.value
  return d > 0
    ? `excludes Backlog status & idle > ${d}d`
    : 'excludes Backlog status'
})

const PRIORITY_COLOR = {
  blocking: '#d32f2f', critical: '#d32f2f', high: '#f57c00',
  medium: '#fbc02d', normal: '#fbc02d', low: '#7cb342', lowest: '#9e9e9e'
}
const priorityData = computed(() => {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const groups = new Map()
  for (const n of items.value) {
    if (!isOpen(n)) continue
    const raw = n._raw || {}
    const p = getScopedLabelValue(raw.labels, 'Priority') || '(No priority)'
    if (!groups.has(p)) groups.set(p, { label: p, count: 0, oldestDays: 0 })
    const g = groups.get(p)
    g.count++
    const c = safeDate(raw.created_at)
    if (c) g.oldestDays = Math.max(g.oldestDays, Math.floor((now - c) / day))
  }
  const order = ['blocking', 'critical', 'high', 'medium', 'normal', 'low', 'lowest']
  const rank = (label) => {
    const k = String(label).toLowerCase()
    for (let i = 0; i < order.length; i++) if (k.includes(order[i])) return i
    return order.length + 1
  }
  return [...groups.values()]
    .map(g => ({ ...g, color: PRIORITY_COLOR[String(g.label).toLowerCase().replace(/^.*?(blocking|critical|high|medium|normal|low|lowest).*$/, '$1')] || '#1e88e5' }))
    .sort((a, b) => (rank(a.label) - rank(b.label)) || (b.count - a.count))
})
const priorityMax = computed(() => Math.max(1, ...priorityData.value.map(r => r.count)))

const activityFeed = computed(() => {
  const ev = []
  for (const n of items.value) {
    const raw = n._raw || {}
    const title = raw.title || n.name || (raw.iid ? `#${raw.iid}` : '(untitled)')
    const iid = raw.iid != null ? String(raw.iid) : ''
    const c = safeDate(raw.created_at)
    const cl = safeDate(raw.closed_at)
    if (c) ev.push({ ts: c, kind: 'opened', title, iid, who: raw.author?.name || '' })
    if (cl) ev.push({ ts: cl, kind: 'closed', title, iid, who: raw.closed_by?.name || '' })
  }
  ev.sort((a, b) => b.ts - a.ts)
  return ev.slice(0, 22)
})

// Stable per-name color (hashed → HSL) so the same person keeps the same avatar tone
// across renders without us maintaining a palette map.
const initialsOf = (name) => {
  const s = String(name || '').trim()
  if (!s) return '?'
  return s.split(/\s+/).filter(Boolean).map(p => p.charAt(0).toUpperCase()).slice(0, 2).join('')
}
const avatarColor = (name) => {
  const s = String(name || '')
  if (!s) return 'hsl(0, 0%, 35%)'
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return `hsl(${Math.abs(h) % 360}, 42%, 42%)`
}

const risks = computed(() => {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const overdue = []
  const stale = []
  let unassigned = 0
  let noDueDate = 0
  for (const n of items.value) {
    if (!isOpen(n)) continue
    const raw = n._raw || {}
    const due = safeDate(raw.due_date)
    if (due && due < now) overdue.push({ title: raw.title || n.name, ageDays: Math.max(1, Math.floor((now - due) / day)) })
    else if (!due) noDueDate++
    const upd = safeDate(raw.updated_at)
    if (upd && (now - upd) > 14 * day) stale.push({ title: raw.title || n.name, ageDays: Math.floor((now - upd) / day) })
    if (!getAssigneeNames(raw).length) unassigned++
  }
  overdue.sort((a, b) => b.ageDays - a.ageDays)
  stale.sort((a, b) => b.ageDays - a.ageDays)
  return { overdue: overdue.slice(0, 10), stale: stale.slice(0, 10), unassigned, noDueDate }
})

const relTime = (ts) => {
  const diff = Math.max(0, nowTick.value - ts)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}
</script>

<style scoped>
.kiosk {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  background: rgb(var(--v-theme-background));
  color: rgb(var(--v-theme-on-background));
  outline: none;
}

.kiosk-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(127, 127, 127, 0.2);
  flex-shrink: 0;
}
.kiosk-head-left, .kiosk-head-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.kiosk-tag {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}
.kiosk-mode-label {
  font-size: clamp(16px, 1.6vw, 22px);
  font-weight: 600;
  opacity: 0.9;
}
.kiosk-clock { font-variant-numeric: tabular-nums; opacity: 0.85; font-size: 14px; }
.kiosk-refresh-eta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(127, 127, 127, 0.12);
  font-variant-numeric: tabular-nums;
}
.kiosk-icon-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(127, 127, 127, 0.3);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}
.kiosk-icon-btn:hover { background: rgba(127, 127, 127, 0.15); }

.spinning { animation: spin 1.2s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.kiosk-body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 24px 32px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.kiosk-foot {
  display: flex;
  justify-content: center;
  gap: 10px;
  padding: 10px;
  border-top: 1px solid rgba(127, 127, 127, 0.18);
}
.kiosk-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(127, 127, 127, 0.4);
  cursor: pointer;
  transition: background 0.2s;
}
.kiosk-dot.active { background: rgb(var(--v-theme-primary)); }

.k-section-title {
  font-size: clamp(14px, 1.4vw, 20px);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.7;
  margin-bottom: 16px;
}
.k-section-sub {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: none;
  opacity: 0.7;
  margin-left: 10px;
}

.k-empty {
  opacity: 0.5;
  font-style: italic;
  font-size: clamp(16px, 1.6vw, 22px);
}

/* Today */
.k-today {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  flex: 1;
}
.k-stat {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 24px;
  border-radius: 14px;
  border: 1px solid rgba(127, 127, 127, 0.2);
  background: rgba(127, 127, 127, 0.05);
}
.k-stat-num {
  font-size: clamp(48px, 9vw, 160px);
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.k-stat-lbl {
  font-size: clamp(14px, 1.4vw, 22px);
  opacity: 0.7;
  margin-top: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.k-stat-pos .k-stat-num { color: #4caf50; }
.k-stat-neg .k-stat-num { color: #ef5350; }
.k-stat-warn .k-stat-num { color: #ffb300; }

/* Velocity */
.k-velocity { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.k-velocity-chart {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 12px;
  flex: 1;
  align-items: end;
}
.k-vel-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.k-vel-bars {
  width: 100%;
  display: flex;
  align-items: end;
  gap: 4px;
  justify-content: center;
}
.k-vel-bar {
  width: 30%;
  min-height: 2px;
  border-radius: 4px 4px 0 0;
  position: relative;
  transition: height 0.4s ease;
}
.k-vel-created { background: #66bb6a; }
.k-vel-closed { background: #9e9e9e; }
.k-vel-num {
  position: absolute;
  top: -22px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.k-vel-lbl { font-size: 13px; opacity: 0.7; }
.k-legend {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-top: 16px;
  font-size: 13px;
  opacity: 0.8;
}
.k-legend-spacer { flex: 1; }
.k-legend i.k-swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 4px;
  border-radius: 3px;
  vertical-align: middle;
}
.k-swatch.k-vel-created { background: #66bb6a; }
.k-swatch.k-vel-closed { background: #9e9e9e; }

/* Bar lists (workload, priority) */
.k-bar-list { display: flex; flex-direction: column; gap: 10px; overflow: auto; }
.k-bar-row {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) 3fr auto auto;
  gap: 16px;
  align-items: center;
}
.k-bar-name {
  font-size: clamp(14px, 1.4vw, 20px);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.k-bar-track {
  height: 18px;
  background: rgba(127, 127, 127, 0.15);
  border-radius: 9px;
  overflow: hidden;
}
.k-bar-fill {
  height: 100%;
  background: rgb(var(--v-theme-primary));
  border-radius: 9px;
  transition: width 0.4s ease;
}
.k-bar-count {
  font-size: clamp(18px, 1.8vw, 28px);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  min-width: 50px;
  text-align: right;
}
.k-bar-side { font-size: 12px; opacity: 0.6; min-width: 70px; text-align: right; }

/* Activity feed */
.k-feed { list-style: none; padding: 0; margin: 0; overflow: auto; display: flex; flex-direction: column; gap: 5px; flex: 1; }
.k-feed li {
  display: grid;
  grid-template-columns: 22px 70px 56px minmax(0, 1fr) auto auto;
  gap: 10px;
  padding: 7px 12px;
  border-radius: 8px;
  background: rgba(127, 127, 127, 0.06);
  border-left: 3px solid transparent;
  align-items: center;
}
.k-feed-opened { border-left-color: #66bb6a; }
.k-feed-closed { border-left-color: #5c6bc0; }
.k-feed-icon { opacity: 0.9; }
.k-feed-opened .k-feed-icon { color: #66bb6a; }
.k-feed-closed .k-feed-icon { color: #7986cb; }
.k-feed-tag {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  padding: 2px 6px;
  border-radius: 4px;
  text-align: center;
}
.k-feed-opened .k-feed-tag { background: rgba(76, 175, 80, 0.18); color: #66bb6a; }
.k-feed-closed .k-feed-tag { background: rgba(92, 107, 192, 0.18); color: #7986cb; }
.k-feed-iid {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  opacity: 0.65;
  text-align: right;
}
.k-feed-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: clamp(14px, 1.3vw, 18px); }
.k-feed-who {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  opacity: 0.85;
  max-width: 160px;
}
.k-feed-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
.k-feed-who-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.k-feed-when { font-size: 12px; opacity: 0.65; font-variant-numeric: tabular-nums; }
@media (max-width: 900px) {
  .k-feed li { grid-template-columns: 22px auto minmax(0, 1fr) auto; }
  .k-feed-iid, .k-feed-who { display: none; }
}

/* Risks */
.k-risks { flex: 1; min-height: 0; }
.k-risks-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 18px;
  height: 100%;
}
.k-risks-card {
  border: 1px solid rgba(127, 127, 127, 0.2);
  border-radius: 10px;
  padding: 16px;
  background: rgba(127, 127, 127, 0.04);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.k-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; overflow: auto; }
.k-list li { display: flex; gap: 12px; align-items: center; }
.k-list-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.k-list-side { font-size: 12px; opacity: 0.6; font-variant-numeric: tabular-nums; }
.k-list-bad { color: #ef5350; opacity: 1; }
.k-risks-stats { display: flex; flex-direction: column; gap: 16px; justify-content: center; }
.k-risks-stats .k-stat { padding: 14px; }
.k-risks-stats .k-stat-num { font-size: clamp(36px, 6vw, 90px); }

@media (max-width: 900px) {
  .k-today { grid-template-columns: repeat(2, 1fr); }
  .k-risks-grid { grid-template-columns: 1fr; }
}
</style>
