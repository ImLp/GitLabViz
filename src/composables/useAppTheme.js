import { ref, watch, onMounted, onUnmounted } from 'vue'

// hour ∈ [start..end) in local time, with wrap-around when start > end (overnight).
const hourInRange = (hour, start, end) => {
  if (start === end) return false
  if (start < end) return hour >= start && hour < end
  return hour >= start || hour < end
}

export function useAppTheme ({ settings, vuetifyTheme }) {
  const systemPrefersDark = ref(false)
  let systemMql = null
  let onMqlChange = null
  let scheduleTimer = null

  const getEffectiveThemeName = () => {
    const ui = settings.uiState && settings.uiState.ui
    const pref = (ui && ui.theme) ? ui.theme : 'system'
    if (pref === 'dark') return 'dark'
    if (pref === 'light') return 'light'
    if (pref === 'schedule') {
      const sch = (ui && ui.themeSchedule) || { lightStart: 7, lightEnd: 19 }
      const h = new Date().getHours()
      return hourInRange(h, Number(sch.lightStart) || 0, Number(sch.lightEnd) || 0) ? 'light' : 'dark'
    }
    return systemPrefersDark.value ? 'dark' : 'light'
  }

  const applyTheme = () => {
    const name = getEffectiveThemeName()
    if (vuetifyTheme && typeof vuetifyTheme.change === 'function') vuetifyTheme.change(name)
    else vuetifyTheme.global.name.value = name
    document.documentElement.dataset.theme = name
    window.dispatchEvent(new CustomEvent('app-theme-changed', { detail: { theme: name } }))
  }

  onMounted(() => {
    systemMql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
    systemPrefersDark.value = !!(systemMql && systemMql.matches)

    if (systemMql && systemMql.addEventListener) {
      onMqlChange = (e) => { systemPrefersDark.value = !!e.matches }
      systemMql.addEventListener('change', onMqlChange)
    }

    applyTheme()
    watch(() => settings.uiState.ui.theme, () => applyTheme())
    watch(() => settings.uiState.ui.themeSchedule, () => applyTheme(), { deep: true })
    watch(systemPrefersDark, () => applyTheme())
    // 60s tick re-applies when crossing the schedule boundary. No-op when the
    // computed theme name didn't change (Vuetify just re-sets the same class).
    scheduleTimer = setInterval(applyTheme, 60 * 1000)
  })

  onUnmounted(() => {
    try {
      if (systemMql && onMqlChange && systemMql.removeEventListener) {
        systemMql.removeEventListener('change', onMqlChange)
      }
    } catch {}
    systemMql = null
    onMqlChange = null
    if (scheduleTimer) { clearInterval(scheduleTimer); scheduleTimer = null }
  })

  return { systemPrefersDark, getEffectiveThemeName, applyTheme }
}

